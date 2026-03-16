/**
 * 聊天执行器 Composable
 * 负责核心的 LLM 请求执行逻辑，消除重复代码
 */

import type { ChatSession, ChatMessageNode, LlmParameters, UserProfile, ChatAgent } from "../../types";
import type { Asset } from "@/types/asset-management";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useChatSettings } from "../settings/useChatSettings";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { useContextPipelineStore } from "../../stores/contextPipelineStore";
import type { PipelineContext } from "../../types/pipeline";
import { useNodeManager } from "../session/useNodeManager";
import type { ContextPreviewData } from "../../types/context";
import { buildPreviewDataFromContext } from "../../core/context-utils/preview-builder";
import { resolveAttachmentsBatch } from "../../core/context-utils/attachment-resolver";
import { useAnchorRegistry } from "../ui/useAnchorRegistry";
import { useTranscriptionManager } from "../features/useTranscriptionManager";
import { useVcpStore } from "@/tools/vcp-connector/stores/vcpConnectorStore";
import { isSameHost } from "../useIsVcpChannel";
import { useToolCallOrchestrator } from "./useToolCallOrchestrator";

const logger = createModuleLogger("llm-chat/executor");
const errorHandler = createModuleErrorHandler("llm-chat/executor");

/**
 * 请求执行参数
 */
interface ExecuteRequestParams {
  /** 会话对象 */
  session: ChatSession;
  /** 用户消息节点 */
  userNode: ChatMessageNode;
  /** 助手响应节点 */
  assistantNode: ChatMessageNode;
  /** 到用户消息的完整路径（包含用户消息） */
  pathToUserNode: ChatMessageNode[];
  /** 是否为续写模式 */
  isContinuation?: boolean;
  /** AbortController 集合 */
  abortControllers: Map<string, AbortController>;
  /** 正在生成的节点集合 */
  generatingNodes: Set<string>;
  /** Agent 配置（可选） */
  agentConfig?: {
    profileId: string;
    modelId: string;
    parameters: LlmParameters;
  };
}

export function useChatExecutor() {
  /**
   * 执行 LLM 请求的核心逻辑
   */
  const executeRequest = async ({
    session,
    userNode: _userNode,
    assistantNode,
    pathToUserNode,
    isContinuation,
    abortControllers,
    generatingNodes,
    agentConfig: providedAgentConfig,
  }: ExecuteRequestParams): Promise<void> => {
    const agentStore = useAgentStore();

    // 获取当前 Agent 配置片段
    const agentConfigSnippet =
      providedAgentConfig ||
      (agentStore.currentAgentId
        ? agentStore.getAgentConfig(agentStore.currentAgentId, {
            parameterOverrides: session.parameterOverrides,
          })
        : null);

    const currentAgent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;

    if (!agentConfigSnippet || !currentAgent) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "执行请求失败：无法获取智能体配置",
        showToUser: false,
      });
      throw new Error("无法获取智能体配置");
    }

    const executionAgent: ChatAgent = {
      ...currentAgent,
      ...agentConfigSnippet,
    };

    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: UserProfile | null = null;
    if (currentAgent?.userProfileId) {
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) effectiveUserProfile = profile;
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) effectiveUserProfile = profile;
    }

    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfigSnippet.profileId);
    const model: LlmModelInfo | undefined = profile?.models.find((m) => m.id === agentConfigSnippet.modelId);

    assistantNode.metadata = {
      ...assistantNode.metadata,
      requestStartTime: Date.now(),
      isContinuation: isContinuation || undefined,
      profileName: profile?.name,
      providerType: profile?.type,
      modelName: model?.name || agentConfigSnippet.modelId,
    };

    const vcpStore = useVcpStore();
    const isVcpChannel =
      profile?.baseUrl && vcpStore.config.wsUrl ? isSameHost(profile.baseUrl, vcpStore.config.wsUrl) : false;

    // 委托给 Orchestrator
    const { orchestrate } = useToolCallOrchestrator();
    await orchestrate({
      session,
      assistantNode,
      pathToUserNode,
      isContinuation,
      agentConfig: agentConfigSnippet,
      executionAgent,
      effectiveUserProfile,
      abortControllers,
      generatingNodes,
      isVcpChannel,
    });
  };

  const waitForAssetsImport = async (assets: Asset[], timeout: number = 30000): Promise<boolean> => {
    const startTime = Date.now();
    const pendingAssets = assets.filter(
      (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
    );

    if (pendingAssets.length === 0) return true;

    while (Date.now() - startTime < timeout) {
      const stillPending = assets.filter(
        (asset) => asset.importStatus === "pending" || asset.importStatus === "importing"
      );
      if (stillPending.length === 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    errorHandler.handle(new Error("资产导入超时"), { userMessage: "资产导入超时", showToUser: false });
    return false;
  };

  const processUserAttachments = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    attachments: Asset[] | undefined,
    pathUserNode?: ChatMessageNode
  ): Promise<void> => {
    if (!attachments || attachments.length === 0) return;
    const allImported = await waitForAssetsImport(attachments);
    if (!allImported) throw new Error("附件导入超时，请稍后重试");
    session.nodes[userNode.id].attachments = attachments;
    if (pathUserNode) pathUserNode.attachments = attachments;
  };

  const calculateUserMessageTokens = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    content: string,
    modelId: string,
    attachments?: Asset[],
    isContinuation: boolean = false
  ): Promise<void> => {
    try {
      let combinedText = content;
      const mediaAttachments: Asset[] = [];
      const { profiles } = useLlmProfiles();
      const profile = profiles.value.find((p) => p.models.some((m) => m.id === modelId));
      const profileId = profile?.id || "";

      if (attachments && attachments.length > 0) {
        const resolvedResults = await resolveAttachmentsBatch(attachments, modelId, profileId);
        for (const result of resolvedResults) {
          if (result.type === "text" && result.content) {
            combinedText += result.content;
          } else {
            mediaAttachments.push(result.asset);
          }
        }
      }

      const tokenResult = await tokenCalculatorService.calculateMessageTokens(combinedText, modelId, mediaAttachments);
      const node = session.nodes[userNode.id];
      if (node) {
        if (!node.metadata) node.metadata = {};
        node.metadata.contentTokens = tokenResult.count;
        node.metadata.isContinuationPrefix = isContinuation || undefined;
      }
    } catch (error) {
      logger.warn("计算用户消息 token 失败", error);
    }
  };

  const saveUserProfileSnapshot = (
    userNode: ChatMessageNode,
    effectiveUserProfile: { id: string; name: string; displayName?: string; icon?: string } | null
  ): void => {
    if (!effectiveUserProfile) return;
    userNode.metadata = {
      ...userNode.metadata,
      userProfileId: effectiveUserProfile.id,
      userProfileName: effectiveUserProfile.name,
      userProfileDisplayName: effectiveUserProfile.displayName || effectiveUserProfile.name,
      userProfileIcon: effectiveUserProfile.icon,
    };
    const userProfileStore = useUserProfileStore();
    userProfileStore.updateLastUsed(effectiveUserProfile.id);
  };

  const getContextForPreview = async (
    session: ChatSession,
    targetNodeId: string,
    agentId?: string,
    parameterOverrides?: LlmParameters,
    options?: { pendingInput?: any }
  ): Promise<ContextPreviewData | null> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();
    const userProfileStore = useUserProfileStore();
    const { getProfileById } = useLlmProfiles();

    const targetNode = session.nodes[targetNodeId];
    const pathToUserNode = nodeManager.getNodePath(session, targetNodeId);

    const historicalProfileId = targetNode?.metadata?.profileId;
    const historicalModelId = targetNode?.metadata?.modelId;
    const historicalAgentId = agentId || targetNode?.metadata?.agentId;

    const currentAgentFromStore = historicalAgentId
      ? agentStore.getAgentById(historicalAgentId)
      : agentStore.currentAgentId
        ? agentStore.getAgentById(agentStore.currentAgentId)
        : null;

    if (!currentAgentFromStore) return null;

    const agentConfigSnippet = agentStore.getAgentConfig(currentAgentFromStore.id, {
      parameterOverrides,
    });

    if (!agentConfigSnippet) return null;

    const effectiveProfileId = historicalProfileId || agentConfigSnippet.profileId;
    const effectiveModelId = historicalModelId || agentConfigSnippet.modelId;

    const executionAgent: ChatAgent = {
      ...currentAgentFromStore,
      ...agentConfigSnippet,
      profileId: effectiveProfileId,
      modelId: effectiveModelId,
    };

    let effectiveUserProfile: UserProfile | null = null;
    if (currentAgentFromStore?.userProfileId) {
      const profile = userProfileStore.getProfileById(currentAgentFromStore.userProfileId);
      if (profile) effectiveUserProfile = profile;
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) effectiveUserProfile = profile;
    }

    const profile = getProfileById(effectiveProfileId);
    const model: LlmModelInfo | undefined = profile?.models.find((m) => m.id === effectiveModelId);
    const capabilities = model?.capabilities;

    const { settings } = useChatSettings();

    const pipelineContext: PipelineContext = {
      messages: [],
      session,
      userProfile: effectiveUserProfile || undefined,
      agentConfig: executionAgent,
      settings: settings.value,
      capabilities: capabilities || {},
      timestamp: targetNode?.timestamp ? new Date(targetNode.timestamp).getTime() : Date.now(),
      sharedData: new Map<string, any>(),
      logs: [],
    };

    if (targetNode) {
      pipelineContext.sharedData.set("userMessageContent", targetNode.content);
    }
    if (model) {
      pipelineContext.sharedData.set("model", model);
    }
    pipelineContext.sharedData.set("transcriptionConfig", settings.value.transcription);

    const worldbookStore = import.meta.env.SSR
      ? null
      : (await import("../../stores/worldbookStore")).useWorldbookStore();
    const allWorldbookIds = Array.from(
      new Set([
        ...(settings.value.worldbookIds || []),
        ...(effectiveUserProfile?.worldbookIds || []),
        ...(executionAgent.worldbookIds || []),
      ])
    );

    if (worldbookStore && allWorldbookIds.length > 0) {
      const loadedWorldbooks = await worldbookStore.getEntriesForAgent(allWorldbookIds);
      pipelineContext.sharedData.set("loadedWorldbooks", loadedWorldbooks);
    }

    pipelineContext.sharedData.set("pathToUserNode", pathToUserNode);
    if (options?.pendingInput) {
      pipelineContext.sharedData.set("pendingInput", options.pendingInput);
    }
    const anchorRegistry = useAnchorRegistry();
    pipelineContext.sharedData.set("anchorDefinitions", anchorRegistry.getAvailableAnchors());
    pipelineContext.sharedData.set("isPreviewMode", true);

    const transcriptionManager = useTranscriptionManager();
    const allAttachments = pathToUserNode.flatMap((node) => node.attachments || []);

    if (allAttachments.length > 0) {
      try {
        const forceAssetIds = new Set<string>();
        const config = settings.value.transcription;
        if (config.enabled && config.strategy === "smart" && config.forceTranscriptionAfter > 0) {
          for (let i = 0; i < pathToUserNode.length; i++) {
            const node = pathToUserNode[i];
            const nodeDepth = pathToUserNode.length - 1 - i;
            if (nodeDepth >= config.forceTranscriptionAfter && node.attachments) {
              for (const asset of node.attachments) {
                if (asset.type === "image" || asset.type === "audio" || asset.type === "video") {
                  forceAssetIds.add(asset.id);
                }
              }
            }
          }
        }
        const updatedAssetsMap = await transcriptionManager.ensureTranscriptions(
          allAttachments,
          effectiveModelId,
          effectiveProfileId,
          forceAssetIds.size > 0 ? forceAssetIds : undefined
        );
        pipelineContext.sharedData.set("updatedAssetsMap", updatedAssetsMap);
      } catch (error) {
        const fallbackMap = new Map<string, Asset>();
        for (const asset of allAttachments) fallbackMap.set(asset.id, asset);
        pipelineContext.sharedData.set("updatedAssetsMap", fallbackMap);
      }
    }

    const contextPipelineStore = useContextPipelineStore();
    await contextPipelineStore.executePipeline(pipelineContext);

    const basePreviewData = await buildPreviewDataFromContext(pipelineContext);

    const finalTokenPromises = pipelineContext.messages.map(async (msg) => {
      let contentText = "";
      if (typeof msg.content === "string") {
        contentText = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentText = msg.content
          .map((p) => (p.type === "text" && p.text ? p.text : ""))
          .filter(Boolean)
          .join("\n");
      }
      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        contentText,
        effectiveModelId,
        (msg as any)._attachments || []
      );
      return tokenResult.count;
    });
    const finalTokenCounts = await Promise.all(finalTokenPromises);
    const finalTotalTokenCount = finalTokenCounts.reduce((a, b) => a + b, 0);

    const postProcessingTokenDelta = (pipelineContext.sharedData.get("postProcessingTokenDelta") as number) || 0;
    const postProcessingCharDelta = (pipelineContext.sharedData.get("postProcessingCharDelta") as number) || 0;

    const previewData: ContextPreviewData = {
      ...basePreviewData,
      finalMessages: pipelineContext.messages.filter((msg): msg is any => msg.role !== "tool"),
      statistics: {
        ...basePreviewData.statistics,
        totalTokenCount: finalTotalTokenCount,
        postProcessingTokenCount: postProcessingTokenDelta,
        postProcessingCharCount: postProcessingCharDelta,
      },
      session,
    };

    return previewData;
  };

  return {
    executeRequest,
    processUserAttachments,
    calculateUserMessageTokens,
    saveUserProfileSnapshot,
    getContextForPreview,
  };
}
