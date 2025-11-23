/**
 * 聊天执行器 Composable
 * 负责核心的 LLM 请求执行逻辑，消除重复代码
 */

import type { ChatSession, ChatMessageNode } from "../types";
import type { Asset } from "@/types/asset-management";
import { useAgentStore } from "../agentStore";
import { useUserProfileStore } from "../userProfileStore";
import { useChatSettings } from "./useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import { useTopicNamer } from "./useTopicNamer";
import { useSessionManager } from "./useSessionManager";
import { useMessageProcessor } from "./useMessageProcessor";
import { useChatContextBuilder } from "./useChatContextBuilder";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useChatAssetProcessor } from "./useChatAssetProcessor";

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
}

export function useChatExecutor() {
  const { buildLlmContext } = useChatContextBuilder();
  const { handleStreamUpdate, validateAndFixUsage, finalizeNode, handleNodeError } =
    useChatResponseHandler();

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
  }: ExecuteRequestParams): Promise<void> => {
    const agentStore = useAgentStore();
    const { settings } = useChatSettings();

    // 获取当前 Agent 配置
    if (!agentStore.currentAgentId) {
      errorHandler.error(new Error("No agent selected"), "执行请求失败：没有选中智能体", {
        showToUser: false,
      });
      throw new Error("请先选择一个智能体");
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      errorHandler.error(
        new Error("Agent config not found"),
        "执行请求失败：无法获取智能体配置",
        { showToUser: false }
      );
      throw new Error("无法获取智能体配置");
    }

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: { id: string; name: string; icon?: string; content: string } | null =
      null;

    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);
    if (currentAgent?.userProfileId) {
      // 智能体有绑定的用户档案
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug("使用智能体绑定的用户档案", {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    } else if (userProfileStore.globalProfileId) {
      // 使用全局用户档案
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
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
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    
    // 提取模型能力（用于智能附件处理）
    const capabilities = model?.capabilities;

    // 注意：助手节点的基本 metadata 已在 useChatHandler 中提前设置
    // 这里只需要获取模型能力用于上下文构建

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

      // 构建 LLM 上下文（传递会话、用户档案和模型能力）
      let { messages } = await buildLlmContext(
        pathToUserNode,
        agentConfig,
        userNode.content,
        session,              // 会话对象（用于宏上下文）
        effectiveUserProfile, // 用户档案
        capabilities          // 模型能力
      );

      // 应用上下文后处理管道
      // 合并模型的默认规则和智能体的规则
      const modelDefaultRules = model?.defaultPostProcessingRules || [];
      const agentRules = agentConfig.parameters.contextPostProcessing?.rules || [];

      // 将模型默认规则类型转换为规则对象
      const modelRulesObjects = modelDefaultRules.map((type) => ({
        type,
        enabled: true,
      }));

      // 合并规则：智能体的规则优先，如果智能体已配置某类型规则，则不使用模型的默认规则
      const agentRuleTypes = new Set(agentRules.map((r) => r.type));
      const mergedRules = [
        ...agentRules,
        ...modelRulesObjects.filter((r) => !agentRuleTypes.has(r.type)),
      ];

      if (mergedRules.length > 0) {
        const { applyProcessingPipeline } = useMessageProcessor();
        messages = applyProcessingPipeline(messages, mergedRules);

        logger.debug("应用后处理规则", {
          modelDefaultRulesCount: modelDefaultRules.length,
          agentRulesCount: agentRules.length,
          mergedRulesCount: mergedRules.length,
          mergedRules: mergedRules.map((r) => ({ type: r.type, enabled: r.enabled })),
        });
      }

      logger.info("📤 发送 LLM 请求", {
        sessionId: session.id,
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
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

      // 发送请求（根据用户设置决定是否流式）
      // 传递所有配置的参数，让用户的设置真正生效
      const response = await sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        messages,
        // 基础采样参数
        temperature: agentConfig.parameters.temperature,
        maxTokens: agentConfig.parameters.maxTokens,
        topP: agentConfig.parameters.topP,
        topK: agentConfig.parameters.topK,
        frequencyPenalty: agentConfig.parameters.frequencyPenalty,
        presencePenalty: agentConfig.parameters.presencePenalty,
        seed: agentConfig.parameters.seed,
        stop: agentConfig.parameters.stop,
        // 高级参数
        n: agentConfig.parameters.n,
        logprobs: agentConfig.parameters.logprobs,
        topLogprobs: agentConfig.parameters.topLogprobs,
        maxCompletionTokens: agentConfig.parameters.maxCompletionTokens,
        reasoningEffort: agentConfig.parameters.reasoningEffort,
        logitBias: agentConfig.parameters.logitBias,
        store: agentConfig.parameters.store,
        user: agentConfig.parameters.user,
        serviceTier: agentConfig.parameters.serviceTier,
        // 响应格式
        responseFormat: agentConfig.parameters.responseFormat,
        // 工具调用
        tools: agentConfig.parameters.tools,
        toolChoice: agentConfig.parameters.toolChoice,
        parallelToolCalls: agentConfig.parameters.parallelToolCalls,
        // 多模态输出
        modalities: agentConfig.parameters.modalities,
        audio: agentConfig.parameters.audio,
        prediction: agentConfig.parameters.prediction,
        // 特殊功能
        webSearchOptions: agentConfig.parameters.webSearchOptions,
        streamOptions: agentConfig.parameters.streamOptions,
        metadata: agentConfig.parameters.metadata,
        // Claude 特有参数
        thinking: agentConfig.parameters.thinking,
        stopSequences: agentConfig.parameters.stopSequences,
        claudeMetadata: agentConfig.parameters.claudeMetadata,
        // 流式响应（根据用户设置）
        stream: settings.value.uiPreferences.isStreaming,
        signal: abortController.signal,
        onStream: settings.value.uiPreferences.isStreaming
          ? (chunk: string) => {
              handleStreamUpdate(session, assistantNode.id, chunk, false);
            }
          : undefined,
        onReasoningStream: settings.value.uiPreferences.isStreaming
          ? (chunk: string) => {
              handleStreamUpdate(session, assistantNode.id, chunk, true);
            }
          : undefined,
      });

      // 验证并修复 usage 信息（如果不可靠则使用本地计算）
      await validateAndFixUsage(response, agentConfig.modelId, messages);

      // 完成节点生成
      await finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId);

      logger.info("请求执行成功", {
        sessionId: session.id,
        assistantNodeId: assistantNode.id,
        messageLength: response.content.length,
        usage: response.usage,
      });

      // 检查是否需要自动生成标题
      const { shouldAutoName, generateTopicName } = useTopicNamer();
      if (shouldAutoName(session)) {
        logger.info("触发自动生成标题", {
          sessionId: session.id,
          sessionName: session.name,
        });

        // 异步生成标题，不阻塞主流程
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
      // AbortError 是用户主动取消，不应该作为错误向上传递
      if (!(error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
    } finally {
      // 清理节点级别的状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  /**
   * 处理用户消息的附件
   * @param userNode 用户消息节点
   * @param session 会话对象
   * @param attachments 附件数组
   * @param pathUserNode 路径中的用户节点引用（用于强制同步）
   */
  const processUserAttachments = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    attachments: Asset[] | undefined,
    pathUserNode?: ChatMessageNode
  ): Promise<void> => {
    if (!attachments || attachments.length === 0) {
      return;
    }

    const { waitForAssetsImport } = useChatAssetProcessor();

    logger.info("检查附件导入状态", {
      attachmentCount: attachments.length,
      pendingCount: attachments.filter(
        (a) => a.importStatus === "pending" || a.importStatus === "importing"
      ).length,
    });

    // 等待所有附件导入完成
    const allImported = await waitForAssetsImport(attachments);
    if (!allImported) {
      throw new Error("附件导入超时，请稍后重试");
    }

    // 保存到用户消息节点
    // 重要：直接修改 session.nodes 中的节点，确保状态同步
    session.nodes[userNode.id].attachments = attachments;

    // 如果提供了路径节点引用，也强制同步附件
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
      attachments: attachments.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    });
  };

  /**
   * 计算并保存用户消息的 Token 数
   */
  const calculateUserMessageTokens = async (
    userNode: ChatMessageNode,
    session: ChatSession,
    content: string,
    modelId: string,
    attachments?: Asset[]
  ): Promise<void> => {
    try {
      // 获取文本附件的内容并合并到消息文本中
      const { getTextAttachmentsContent } = useChatAssetProcessor();
      const textAttachmentsContent = await getTextAttachmentsContent(attachments);
      
      // 合并原始内容和文本附件内容
      const fullContent = textAttachmentsContent
        ? `${content}\n\n${textAttachmentsContent}`
        : content;
      
      // 使用完整内容计算 token
      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        fullContent,
        modelId,
        attachments
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
        hasTextAttachments: !!textAttachmentsContent,
        textAttachmentsLength: textAttachmentsContent?.length || 0,
      });
    } catch (error) {
      logger.warn("计算用户消息 token 失败", {
        messageId: userNode.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * 保存用户档案快照到用户消息节点
   */
  const saveUserProfileSnapshot = (
    userNode: ChatMessageNode,
    effectiveUserProfile: { id: string; name: string; icon?: string } | null
  ): void => {
    if (!effectiveUserProfile) {
      return;
    }

    userNode.metadata = {
      ...userNode.metadata,
      userProfileId: effectiveUserProfile.id,
      userProfileName: effectiveUserProfile.name,
      userProfileIcon: effectiveUserProfile.icon,
    };

    // 更新档案的最后使用时间
    const userProfileStore = useUserProfileStore();
    userProfileStore.updateLastUsed(effectiveUserProfile.id);

    logger.debug("保存用户档案快照", {
      nodeId: userNode.id,
      profileId: effectiveUserProfile.id,
      profileName: effectiveUserProfile.name,
    });
  };

  return {
    executeRequest,
    processUserAttachments,
    calculateUserMessageTokens,
    saveUserProfileSnapshot,
  };
}
