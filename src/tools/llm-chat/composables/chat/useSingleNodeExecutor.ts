import type { ChatSession, ChatMessageNode, LlmParameters, UserProfile, ChatAgent } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useAgentStore } from "../../stores/agentStore";
import { useChatSettings } from "../settings/useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useContextPipelineStore } from "../../stores/contextPipelineStore";
import type { PipelineContext } from "../../types/pipeline";
import { useTranscriptionManager } from "../features/useTranscriptionManager";
import { useContextCompressor } from "../features/useContextCompressor";
import { useAnchorRegistry } from "../ui/useAnchorRegistry";
import { buildEffectiveParameters } from "../../config/parameter-config";
import { createModuleLogger } from "@/utils/logger";
import { isAbortError } from "@/llm-apis/common";

const logger = createModuleLogger("llm-chat/single-node-executor");

export interface SingleNodeExecuteParams {
  session: ChatSession;
  assistantNode: ChatMessageNode;
  /** 到用户消息的完整路径 */
  currentPathToUserNode: ChatMessageNode[];
  isContinuation?: boolean;
  /** Agent 配置片段 */
  agentConfig: {
    profileId: string;
    modelId: string;
    parameters: LlmParameters;
  };
  /** 完整的执行 Agent 对象 */
  executionAgent: ChatAgent;
  /** 生效的用户档案 */
  effectiveUserProfile: UserProfile | null;
  /** 用于取消请求 */
  abortController: AbortController;
}

export interface SingleNodeExecuteResult {
  /** LLM 返回的原始响应 */
  response: any;
  /** 实际发送给 LLM 的消息列表 */
  messagesForRequest: Array<{ role: string; content: any; prefix?: boolean }>;
}

export function useSingleNodeExecutor() {
  const { handleStreamUpdate, validateAndFixUsage, finalizeNode } = useChatResponseHandler();
  const { checkAndCompress } = useContextCompressor();
  const { sendRequest } = useLlmRequest();
  const contextPipelineStore = useContextPipelineStore();

  /**
   * 执行单次 LLM 请求
   */
  const execute = async (params: SingleNodeExecuteParams): Promise<SingleNodeExecuteResult> => {
    const {
      session,
      assistantNode,
      currentPathToUserNode,
      isContinuation,
      agentConfig,
      executionAgent,
      effectiveUserProfile,
      abortController,
    } = params;

    const { settings } = useChatSettings();
    const agentStore = useAgentStore();

    // 1. 准备参数
    const effectiveParams = buildEffectiveParameters(agentConfig.parameters);

    // 保存参数快照到节点元数据
    assistantNode.metadata = {
      ...assistantNode.metadata,
      requestParameters: {
        ...effectiveParams,
        toolCallingEnabled: executionAgent.toolCallConfig?.enabled ?? false,
      },
    };
    if (session.nodes[assistantNode.id]) {
      session.nodes[assistantNode.id].metadata = assistantNode.metadata;
    }

    // 2. 构建 Pipeline 上下文
    logger.info("开始执行上下文构建管道...");

    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    const capabilities = model?.capabilities || {};

    const pipelineContext: PipelineContext = {
      messages: [],
      session,
      userProfile: effectiveUserProfile || undefined,
      agentConfig: executionAgent,
      settings: settings.value,
      capabilities,
      timestamp: Date.now(),
      sharedData: new Map<string, any>(),
      logs: [],
    };

    // 将额外信息放入 sharedData
    if (model) pipelineContext.sharedData.set("model", model);
    if (profile) pipelineContext.sharedData.set("profile", profile);

    // 填充额外数据
    pipelineContext.sharedData.set("pathToUserNode", currentPathToUserNode);
    pipelineContext.sharedData.set("transcriptionConfig", settings.value.transcription);

    // 获取锚点定义
    const anchorRegistry = useAnchorRegistry();
    pipelineContext.sharedData.set("anchorDefinitions", anchorRegistry.getAvailableAnchors());

    // 预加载世界书
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

    // 处理转写任务预处理
    const transcriptionManager = useTranscriptionManager();
    const allAttachments = currentPathToUserNode.flatMap((node) => node.attachments || []);

    if (allAttachments.length > 0) {
      try {
        const forceAssetIds = new Set<string>();
        const config = settings.value.transcription;

        if (config.enabled && config.strategy === "smart" && config.forceTranscriptionAfter > 0) {
          for (let i = 0; i < currentPathToUserNode.length; i++) {
            const node = currentPathToUserNode[i];
            const nodeDepth = currentPathToUserNode.length - 1 - i;

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
          agentConfig.modelId,
          agentConfig.profileId,
          forceAssetIds.size > 0 ? forceAssetIds : undefined
        );
        pipelineContext.sharedData.set("updatedAssetsMap", updatedAssetsMap);
      } catch (error) {
        logger.warn("等待转写任务完成时出错或超时", error);
        const fallbackMap = new Map<string, Asset>();
        for (const asset of allAttachments) {
          fallbackMap.set(asset.id, asset);
        }
        pipelineContext.sharedData.set("updatedAssetsMap", fallbackMap);
      }
    }

    // 3. 执行上下文管道
    await contextPipelineStore.executePipeline(pipelineContext);
    const messages = pipelineContext.messages;

    // 4. 发送请求
    const messagesForRequest = messages.map((msg, index, filteredMessages) => {
      const isLast = index === filteredMessages.length - 1;
      return {
        role: msg.role as any,
        content: msg.content,
        prefix: isContinuation && isLast ? true : undefined,
      };
    });

    const maxRetries = settings.value.requestSettings.maxRetries;
    const retryInterval = settings.value.requestSettings.retryInterval;
    const retryMode = settings.value.requestSettings.retryMode;

    let hasReceivedStreamData = false;
    let response: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        response = await sendRequest({
          profileId: agentConfig.profileId,
          modelId: agentConfig.modelId,
          messages: messagesForRequest,
          ...effectiveParams,
          stream: settings.value.uiPreferences.isStreaming,
          signal: abortController.signal,
          timeout: settings.value.requestSettings.timeout,
          onStream: settings.value.uiPreferences.isStreaming
            ? (chunk: string) => {
                hasReceivedStreamData = true;
                handleStreamUpdate(session, assistantNode.id, chunk, false);
              }
            : undefined,
          onReasoningStream: settings.value.uiPreferences.isStreaming
            ? (chunk: string) => {
                hasReceivedStreamData = true;
                handleStreamUpdate(session, assistantNode.id, chunk, true);
              }
            : undefined,
        });
        break;
      } catch (error) {
        const isAbort = isAbortError(error);
        const shouldRetry = !isAbort && !hasReceivedStreamData && attempt < maxRetries;
        if (shouldRetry) {
          const delayTime = retryMode === "exponential" ? retryInterval * Math.pow(2, attempt) : retryInterval;
          await new Promise((resolve) => setTimeout(resolve, delayTime));
          continue;
        }
        throw error;
      }
    }

    if (response) {
      await validateAndFixUsage(response, agentConfig.modelId, messagesForRequest as any);
      await finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId || "");

      try {
        await checkAndCompress(session);
      } catch (error) {
        logger.warn("自动上下文压缩执行失败", error);
      }
    }

    return {
      response,
      messagesForRequest,
    };
  };

  return { execute };
}
