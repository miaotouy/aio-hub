/**
 * 聊天执行器 Composable
 * 负责核心的 LLM 请求执行逻辑，消除重复代码
 */

import type {
  ChatSession,
  ChatMessageNode,
  LlmParameters,
  UserProfile,
  ChatAgent,
} from "../types";
import type { Asset } from "@/types/asset-management";
import type { LlmModelInfo } from "@/types/llm-profiles";
import { useAgentStore } from "../agentStore";
import { useUserProfileStore } from "../userProfileStore";
import { useChatSettings } from "./useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { LlmApiError, TimeoutError } from "@/llm-apis/common";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { ALL_LLM_PARAMETER_KEYS } from "../config/parameter-config";
import { useTopicNamer } from "./useTopicNamer";
import { useSessionManager } from "./useSessionManager";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useContextPipelineStore } from "../stores/contextPipelineStore";
import type { PipelineContext } from "../types/pipeline";
import { useNodeManager } from "./useNodeManager";
import type { ContextPreviewData } from "../types/context";
import { buildPreviewDataFromContext } from "../core/context-utils/preview-builder";
import { resolveAttachmentContent } from "../core/context-utils/attachment-resolver";
import { useContextCompressor } from "./useContextCompressor";
import { useAnchorRegistry } from "./useAnchorRegistry";

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
  /** AbortController 集合 */
  abortControllers: Map<string, AbortController>;
  /** 正在生成的节点集合 */
  generatingNodes: Set<string>;
  /**
   * Agent 配置（可选）
   * 如果提供，将使用此配置，否则从 agentStore 获取
   * 用于支持 @ 切换模型重新生成等场景
   */
  agentConfig?: {
    profileId: string;
    modelId: string;
    parameters: LlmParameters;
  };
}

export function useChatExecutor() {
  const {
    handleStreamUpdate,
    validateAndFixUsage,
    finalizeNode,
    handleNodeError,
  } = useChatResponseHandler();

  const { checkAndCompress } = useContextCompressor();

  /**
   * 执行 LLM 请求的核心逻辑
   * 这个函数被 sendMessage 和 regenerateFromNode 共享
   */
  const executeRequest = async ({
    session,
    userNode,
    assistantNode,
    pathToUserNode,
    abortControllers,
    generatingNodes,
    agentConfig: providedAgentConfig,
  }: ExecuteRequestParams): Promise<void> => {
    const agentStore = useAgentStore();
    const { settings } = useChatSettings();

    const currentAgent = agentStore.currentAgentId
      ? agentStore.getAgentById(agentStore.currentAgentId)
      : null;

    // 获取当前 Agent 配置片段（包含参数覆盖）
    const agentConfigSnippet =
      providedAgentConfig ||
      (agentStore.currentAgentId
        ? agentStore.getAgentConfig(agentStore.currentAgentId, {
          parameterOverrides: session.parameterOverrides,
        })
        : null);

    if (!agentConfigSnippet || !currentAgent) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "执行请求失败：无法获取智能体配置",
        showToUser: false,
      });
      throw new Error("无法获取智能体配置");
    }

    // 为管道创建一个临时的、代表最终配置的 ChatAgent 对象
    const executionAgent: ChatAgent = {
      ...currentAgent,
      ...agentConfigSnippet,
    };

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: UserProfile | null = null;

    if (currentAgent?.userProfileId) {
      const profile = userProfileStore.getProfileById(
        currentAgent.userProfileId,
      );
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug("使用智能体绑定的用户档案", {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(
        userProfileStore.globalProfileId,
      );
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug("使用全局用户档案", {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    }

    // 获取模型信息（用于智能附件处理）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfigSnippet.profileId);
    const model: LlmModelInfo | undefined = profile?.models.find(
      (m) => m.id === agentConfigSnippet.modelId,
    );

    // 提取模型能力（用于智能附件处理）
    const capabilities = model?.capabilities;

    // 创建节点级别的 AbortController
    const abortController = new AbortController();
    abortControllers.set(assistantNode.id, abortController);
    generatingNodes.add(assistantNode.id);

    // 记录请求开始时间
    assistantNode.metadata = {
      ...assistantNode.metadata,
      requestStartTime: Date.now(),
    };
    try {
      const { sendRequest } = useLlmRequest();

      // 动态构建生效的参数对象
      const effectiveParams: Record<string, any> = {};
      const configParams = agentConfigSnippet.parameters;

      // 1. 处理标准参数
      const isStrictFilter = Array.isArray(configParams.enabledParameters);
      const enabledList = new Set(configParams.enabledParameters || []);

      for (const key of ALL_LLM_PARAMETER_KEYS) {
        const value = configParams[key as keyof Omit<LlmParameters, "custom">];
        if (value === undefined) continue;

        const isEnabled = isStrictFilter ? enabledList.has(key as any) : true;
        if (isEnabled) {
          effectiveParams[key] = value;
        }
      }

      // 2. 解包并添加自定义参数
      if (configParams.custom && typeof configParams.custom === "object") {
        Object.assign(effectiveParams, configParams.custom);
      }

      // 保存参数快照到节点元数据
      assistantNode.metadata = {
        ...assistantNode.metadata,
        requestParameters: effectiveParams,
      };
      if (session.nodes[assistantNode.id]) {
        session.nodes[assistantNode.id].metadata = assistantNode.metadata;
      }

      // Phase 5: 使用上下文管道重构
      logger.info("开始执行上下文构建管道...");

      const contextPipelineStore = useContextPipelineStore();

      // 1. 创建管道上下文
      const pipelineContext: PipelineContext = {
        messages: [],
        session,
        userProfile: effectiveUserProfile || undefined,
        agentConfig: executionAgent,
        capabilities: capabilities || {},
        timestamp: Date.now(),
        sharedData: new Map<string, any>(),
        logs: [],
      };
      // 将额外信息放入 sharedData
      pipelineContext.sharedData.set("userMessageContent", userNode.content);
      if (model) {
        pipelineContext.sharedData.set("model", model);
      }
      pipelineContext.sharedData.set(
        "transcriptionConfig",
        settings.value.transcription,
      );
      pipelineContext.sharedData.set("pathToUserNode", pathToUserNode);
      // 提供锚点定义给注入处理器
      const anchorRegistry = useAnchorRegistry();
      pipelineContext.sharedData.set("anchorDefinitions", anchorRegistry.getAvailableAnchors());

      // 2. 执行上下文管道 (一次性执行到底)
      await contextPipelineStore.executePipeline(pipelineContext);
      logger.info("上下文管道执行完毕", {
        messageCount: pipelineContext.messages.length,
        logCount: pipelineContext.logs.length,
      });

      // 4. 从管道获取最终的消息
      const messages = pipelineContext.messages;

      logger.info("📤 发送 LLM 请求", {
        sessionId: session.id,
        agentId: agentStore.currentAgentId,
        profileId: agentConfigSnippet.profileId,
        modelId: agentConfigSnippet.modelId,
        totalMessageCount: messages.length,
        systemMessageCount: messages.filter((m) => m.role === "system").length,
        isStreaming: settings.value.uiPreferences.isStreaming,
      });

      logger.debug("📋 发送的完整消息列表", {
        messages: messages.map((msg, index) => ({
          index,
          role: msg.role,
          contentPreview:
            typeof msg.content === "string"
              ? msg.content.substring(0, 200)
              : JSON.stringify(msg.content).substring(0, 200),
        })),
      });

      const messagesForRequest = messages.map(({ role, content }) => ({
        role,
        content,
      }));

      const maxRetries = settings.value.requestSettings.maxRetries;
      const retryInterval = settings.value.requestSettings.retryInterval;
      const retryMode = settings.value.requestSettings.retryMode;

      let hasReceivedStreamData = false;
      let response: any = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            logger.info(`开始第 ${attempt}/${maxRetries} 次重试`, {
              sessionId: session.id,
              nodeId: assistantNode.id,
            });
          }

          response = await sendRequest({
            profileId: agentConfigSnippet.profileId,
            modelId: agentConfigSnippet.modelId,
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
          const isAbort = error instanceof Error && error.name === "AbortError";
          let isRetryable = false;
          if (error instanceof TimeoutError) {
            isRetryable = true;
          } else if (error instanceof LlmApiError) {
            isRetryable = error.status === 429 || error.status >= 500;
          } else if (error instanceof Error && !isAbort) {
            isRetryable = true;
          }

          const shouldRetry =
            !isAbort &&
            !hasReceivedStreamData &&
            isRetryable &&
            attempt < maxRetries;

          if (shouldRetry) {
            const delayTime =
              retryMode === "exponential"
                ? retryInterval * Math.pow(2, attempt)
                : retryInterval;

            logger.warn(`请求失败，准备重试 (${attempt + 1}/${maxRetries})`, {
              delay: delayTime,
              error: error instanceof Error ? error.message : String(error),
            });

            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delayTime);
              const abortHandler = () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              };
              abortController.signal.addEventListener("abort", abortHandler, {
                once: true,
              });
            });

            continue;
          }
          throw error;
        }
      }

      if (response) {
        await validateAndFixUsage(
          response,
          agentConfigSnippet.modelId,
          messagesForRequest,
        );
        await finalizeNode(
          session,
          assistantNode.id,
          response,
          agentStore.currentAgentId || "",
        );

        // 尝试触发上下文压缩
        // 注意：这不会阻塞 UI，但会等待压缩完成（如果触发的话）
        // 放在 finalizeNode 之后，确保当前对话已完成且状态已保存
        try {
          await checkAndCompress(session);
        } catch (error) {
          logger.warn("自动上下文压缩执行失败（不影响主流程）", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("请求执行成功", {
        sessionId: session.id,
        assistantNodeId: assistantNode.id,
        messageLength: response.content.length,
        usage: response.usage,
      });

      const { shouldAutoName, generateTopicName } = useTopicNamer();
      if (shouldAutoName(session)) {
        logger.info("触发自动生成标题", {
          sessionId: session.id,
          sessionName: session.name,
        });
        const sessionManager = useSessionManager();
        generateTopicName(session, (updatedSession, currentSessionId) => {
          sessionManager.persistSession(updatedSession, currentSessionId);
        }).catch((error) => {
          logger.warn("自动生成标题失败", {
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, "请求执行");
    } finally {
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  /**
   * 等待资产导入完成
   * @param assets 资产数组
   * @param timeout 超时时间（毫秒），默认 30 秒
   * @returns 是否所有资产都成功导入
   */
  const waitForAssetsImport = async (
    assets: Asset[],
    timeout: number = 30000,
  ): Promise<boolean> => {
    const startTime = Date.now();
    const pendingAssets = assets.filter(
      (asset) =>
        asset.importStatus === "pending" || asset.importStatus === "importing",
    );

    if (pendingAssets.length === 0) {
      return true; // 没有待导入的资产
    }

    logger.info("等待资产导入完成", {
      totalAssets: assets.length,
      pendingCount: pendingAssets.length,
    });

    // 轮询检查导入状态
    while (Date.now() - startTime < timeout) {
      const stillPending = assets.filter(
        (asset) =>
          asset.importStatus === "pending" ||
          asset.importStatus === "importing",
      );

      if (stillPending.length === 0) {
        // 检查是否有导入失败的
        const failedAssets = assets.filter(
          (asset) => asset.importStatus === "error",
        );
        if (failedAssets.length > 0) {
          logger.warn("部分资产导入失败", {
            failedCount: failedAssets.length,
            failedAssets: failedAssets.map((a) => ({
              id: a.id,
              name: a.name,
              error: a.importError,
            })),
          });
          // 即使有失败的，也返回 true，让用户决定是否继续
          return true;
        }

        logger.info("所有资产导入完成");
        return true;
      }

      // 等待 100ms 后再次检查
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 超时
    errorHandler.handle(new Error("资产导入超时"), {
      userMessage: "资产导入超时",
      context: {
        timeout,
        stillPendingCount: assets.filter(
          (asset) =>
            asset.importStatus === "pending" ||
            asset.importStatus === "importing",
        ).length,
      },
      showToUser: false,
    });
    return false;
  };

  const processUserAttachments = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    attachments: Asset[] | undefined,
    pathUserNode?: ChatMessageNode,
  ): Promise<void> => {
    if (!attachments || attachments.length === 0) return;

    logger.info("检查附件导入状态", {
      attachmentCount: attachments.length,
      pendingCount: attachments.filter(
        (a) => a.importStatus === "pending" || a.importStatus === "importing",
      ).length,
    });
    const allImported = await waitForAssetsImport(attachments);
    if (!allImported) {
      throw new Error("附件导入超时，请稍后重试");
    }
    session.nodes[userNode.id].attachments = attachments;
    if (pathUserNode) {
      pathUserNode.attachments = attachments;
      logger.debug("强制同步附件到路径节点", {
        nodeId: pathUserNode.id,
        count: attachments.length,
      });
    }
    logger.info("添加附件到用户消息", {
      messageId: userNode.id,
      attachmentCount: attachments.length,
      attachments: attachments.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
      })),
    });
  };

  const calculateUserMessageTokens = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    content: string,
    modelId: string,
    attachments?: Asset[],
  ): Promise<void> => {
    try {
      // 准备用于 Token 计算的消息内容
      // 逻辑复用自 Pipeline，但针对单条消息进行了简化
      let combinedText = content;
      const mediaAttachments: Asset[] = [];
      const { profiles } = useLlmProfiles();

      // 尝试查找 profileId
      const profile = profiles.value.find((p) => p.models.some((m) => m.id === modelId));
      const profileId = profile?.id || "";

      if (attachments && attachments.length > 0) {
        for (const asset of attachments) {
          const result = await resolveAttachmentContent(asset, modelId, profileId);
          if (result.type === "text" && result.content) {
            combinedText += result.content;
          } else {
            mediaAttachments.push(asset);
          }
        }
      }

      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        combinedText,
        modelId,
        mediaAttachments,
      );
      session.nodes[userNode.id].metadata = {
        ...session.nodes[userNode.id].metadata,
        contentTokens: tokenResult.count,
      };
      logger.debug("用户消息 token 计算完成", {
        messageId: userNode.id,
        tokens: tokenResult.count,
        isEstimated: tokenResult.isEstimated,
        tokenizerName: tokenResult.tokenizerName,
        originalAttachmentCount: attachments?.length || 0,
        mediaAttachmentCount: mediaAttachments.length,
        combinedTextLength: combinedText.length,
      });
    } catch (error) {
      logger.warn("计算用户消息 token 失败", {
        messageId: userNode.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const saveUserProfileSnapshot = (
    userNode: ChatMessageNode,
    effectiveUserProfile: {
      id: string;
      name: string;
      displayName?: string;
      icon?: string;
    } | null,
  ): void => {
    if (!effectiveUserProfile) return;
    userNode.metadata = {
      ...userNode.metadata,
      userProfileId: effectiveUserProfile.id,
      userProfileName:
        effectiveUserProfile.displayName || effectiveUserProfile.name,
      userProfileIcon: effectiveUserProfile.icon,
    };
    const userProfileStore = useUserProfileStore();
    userProfileStore.updateLastUsed(effectiveUserProfile.id);
    logger.debug("保存用户档案快照", {
      nodeId: userNode.id,
      profileId: effectiveUserProfile.id,
      profileName: effectiveUserProfile.name,
    });
  };

  const getContextForPreview = async (
    session: ChatSession,
    targetNodeId: string,
    agentId?: string,
    parameterOverrides?: LlmParameters,
  ): Promise<ContextPreviewData | null> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();
    const userProfileStore = useUserProfileStore();
    const { getProfileById } = useLlmProfiles();

    const currentAgentFromStore = agentId
      ? agentStore.getAgentById(agentId)
      : agentStore.currentAgentId
        ? agentStore.getAgentById(agentStore.currentAgentId)
        : null;

    if (!currentAgentFromStore) {
      logger.error("无法获取上下文预览：找不到有效的智能体");
      return null;
    }

    const agentConfigSnippet = agentStore.getAgentConfig(
      currentAgentFromStore.id,
      {
        parameterOverrides,
      },
    );

    if (!agentConfigSnippet) {
      logger.error("无法获取上下文预览：无法生成智能体配置");
      return null;
    }

    const executionAgent: ChatAgent = {
      ...currentAgentFromStore,
      ...agentConfigSnippet,
    };

    let effectiveUserProfile: UserProfile | null = null;
    if (currentAgentFromStore?.userProfileId) {
      const profile = userProfileStore.getProfileById(
        currentAgentFromStore.userProfileId,
      );
      if (profile) effectiveUserProfile = profile;
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(
        userProfileStore.globalProfileId,
      );
      if (profile) effectiveUserProfile = profile;
    }

    const profile = getProfileById(agentConfigSnippet.profileId);
    const model: LlmModelInfo | undefined = profile?.models.find(
      (m) => m.id === agentConfigSnippet.modelId,
    );
    const capabilities = model?.capabilities;

    const pathToUserNode = nodeManager.getNodePath(session, targetNodeId);
    const targetNode = session.nodes[targetNodeId];

    // 尝试从目标节点恢复用户档案快照
    if (targetNode?.metadata?.userProfileName && effectiveUserProfile) {
      effectiveUserProfile = {
        ...effectiveUserProfile,
        name: targetNode.metadata.userProfileName,
        // 如果有 displayName 则优先使用，否则使用 name
        displayName:
          targetNode.metadata.userProfileName || effectiveUserProfile.displayName,
        icon: targetNode.metadata.userProfileIcon || effectiveUserProfile.icon,
      };
    }

    // 1. 创建管道上下文
    const pipelineContext: PipelineContext = {
      messages: [],
      session,
      userProfile: effectiveUserProfile || undefined,
      agentConfig: executionAgent,
      capabilities: capabilities || {},
      // 使用目标节点的时间戳，如果不存在则回退到当前时间
      timestamp: targetNode?.timestamp
        ? new Date(targetNode.timestamp).getTime()
        : Date.now(),
      sharedData: new Map<string, any>(),
      logs: [],
    };

    if (targetNode) {
      pipelineContext.sharedData.set("userMessageContent", targetNode.content);
    }
    if (model) {
      pipelineContext.sharedData.set("model", model);
    }
    const { settings } = useChatSettings();
    pipelineContext.sharedData.set(
      "transcriptionConfig",
      settings.value.transcription,
    );
    pipelineContext.sharedData.set("pathToUserNode", pathToUserNode);
    // 提供锚点定义给注入处理器
    const anchorRegistry = useAnchorRegistry();
    pipelineContext.sharedData.set("anchorDefinitions", anchorRegistry.getAvailableAnchors());
    // 开启预览模式，通知处理器计算差值等
    pipelineContext.sharedData.set("isPreviewMode", true);

    // 2. 执行上下文管道
    const contextPipelineStore = useContextPipelineStore();
    await contextPipelineStore.executePipeline(pipelineContext);

    // 3. 构建预览数据（基于最终状态）
    const basePreviewData = await buildPreviewDataFromContext(pipelineContext);

    // 4. 计算最终的总 Token 数
    const finalTokenPromises = pipelineContext.messages.map(async (msg) => {
      let contentText = "";
      if (typeof msg.content === "string") {
        contentText = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentText = msg.content
          .filter((p) => p.type === "text" && p.text)
          .map((p) => (p as any).text)
          .join("\n");
      }

      // 使用 calculateMessageTokens 正确计算文本和附件的 token
      // 避免直接 JSON.stringify 包含 base64 的 content 导致 token 爆炸
      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        contentText,
        agentConfigSnippet.modelId,
        msg._attachments || [],
      );
      return tokenResult.count;
    });
    const finalTokenCounts = await Promise.all(finalTokenPromises);
    const finalTotalTokenCount = finalTokenCounts.reduce((a, b) => a + b, 0);

    // 5. 获取后处理差值
    const postProcessingTokenDelta =
      (pipelineContext.sharedData.get("postProcessingTokenDelta") as number) || 0;
    const postProcessingCharDelta =
      (pipelineContext.sharedData.get("postProcessingCharDelta") as number) || 0;

    // 6. 更新预览数据中的统计信息
    const previewData: ContextPreviewData = {
      ...basePreviewData,
      finalMessages: pipelineContext.messages,
      statistics: {
        ...basePreviewData.statistics,
        totalTokenCount: finalTotalTokenCount,
        postProcessingTokenCount: postProcessingTokenDelta,
        postProcessingCharCount: postProcessingCharDelta,
      },
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
