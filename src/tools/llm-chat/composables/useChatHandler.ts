/**
 * 聊天处理 Composable
 * 负责协调核心聊天逻辑：发送消息、重新生成、流式响应处理
 *
 * 重构说明：
 * - 本文件已重构为"指挥家"角色，不再直接实现具体逻辑
 * - 具体功能已拆分到专门的 Composable：
 *   - useChatAssetProcessor: 附件处理
 *   - useChatContextBuilder: 上下文构建
 *   - useChatResponseHandler: 响应处理
 *   - useChatExecutor: 核心请求执行
 */

import type { ChatSession, ChatMessageNode } from "../types";
import type { Asset } from "@/types/asset-management";
import { useAgentStore } from "../agentStore";
import { useUserProfileStore } from "../userProfileStore";
import { useNodeManager } from "./useNodeManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useChatExecutor } from "./useChatExecutor";
import { useChatContextBuilder, type ContextPreviewData } from "./useChatContextBuilder";
import { useMessageProcessor } from "./useMessageProcessor";
import { useMacroProcessor } from "./useMacroProcessor";
import { filterParametersForModel } from "../config/parameter-config";
import type { ModelIdentifier } from "../types";

const logger = createModuleLogger("llm-chat/chat-handler");
const errorHandler = createModuleErrorHandler("llm-chat/chat-handler");

export type { ContextPreviewData };

export function useChatHandler() {
  const {
    executeRequest,
    processUserAttachments,
    calculateUserMessageTokens,
    saveUserProfileSnapshot,
  } = useChatExecutor();
  const { getLlmContextForPreview } = useChatContextBuilder();
  const { processMacros } = useMacroProcessor();

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSession,
    content: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: {
      attachments?: Asset[];
      temporaryModel?: ModelIdentifier | null;
    }
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const userProfileStore = useUserProfileStore();
    const nodeManager = useNodeManager();
    // 获取当前智能体（在函数开头，以便后续宏处理使用）
    const currentAgent = agentStore.currentAgentId
      ? agentStore.getAgentById(agentStore.currentAgentId)
      : null;

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      errorHandler.handle(new Error("No agent selected"), {
        userMessage: "发送消息失败：没有选中智能体",
        showToUser: false,
      });
      throw new Error("请先选择一个智能体");
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });
    if (!agentConfig) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "发送消息失败：无法获取智能体配置",
        showToUser: false,
      });
      throw new Error("无法获取智能体配置");
    }

    // 如果提供了临时模型，则覆盖 agentConfig
    if (options?.temporaryModel) {
      const { getProfileById, getSupportedParameters } = useLlmProfiles();
      const targetProfile = getProfileById(options.temporaryModel.profileId);
      const targetModel = targetProfile?.models.find((m) => m.id === options.temporaryModel?.modelId);

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.temporaryModel.modelId;
        agentConfig.profileId = options.temporaryModel.profileId;

        // 过滤参数，只保留目标模型支持的参数
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities
        );
        logger.info("使用临时指定的模型（参数已过滤）", {
          modelId: agentConfig.modelId,
          profileId: agentConfig.profileId,
          parameterKeys: Object.keys(agentConfig.parameters),
        });
      } else {
        logger.warn("无法找到指定的临时模型，将使用智能体默认模型", {
          modelId: options.temporaryModel.modelId,
          profileId: options.temporaryModel.profileId,
        });
      }
    }

    // 处理用户输入中的宏
    const processedContent = await processMacros(content, {
      session,
      agent: currentAgent ?? undefined,
      input: content,
    });

    logger.debug("用户消息宏处理", {
      originalLength: content.length,
      processedLength: processedContent.length,
      hasChange: content !== processedContent,
    });

    // 使用节点管理器创建消息对（使用处理后的内容）
    const { userNode, assistantNode } = nodeManager.createMessagePair(
      session,
      processedContent,
      session.activeLeafId
    );

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新获取包含新用户消息的完整路径
    const pathWithNewMessage = nodeManager.getNodePath(session, userNode.id);

    // 获取路径中的用户节点引用
    const pathUserNode = pathWithNewMessage[pathWithNewMessage.length - 1];

    // 处理附件（如果有）
    if (options?.attachments && options.attachments.length > 0) {
      await processUserAttachments(userNode, session, options.attachments, pathUserNode);
    }

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    let effectiveUserProfile: { id: string; name: string; displayName?: string; icon?: string; content: string } | null =
      null;
    if (currentAgent?.userProfileId) {
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) {
        effectiveUserProfile = profile;
      }
    } else if (userProfileStore.globalProfileId) {
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) {
        effectiveUserProfile = profile;
      }
    }

    // 保存用户档案快照到用户消息节点
    saveUserProfileSnapshot(userNode, effectiveUserProfile);

    // 计算用户消息的 token 数（包括文本和附件）
    await calculateUserMessageTokens(
      userNode,
      session,
      content,
      agentConfig.modelId,
      options?.attachments
    );
    // 获取模型信息用于元数据（提前设置，确保即时显示）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    // 直接修改 session.nodes 中的节点，确保响应式更新
    session.nodes[assistantNode.id].metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.displayName || currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
      virtualTimeConfig: currentAgent?.virtualTimeConfig,
    };

    logger.debug("已设置助手节点元数据", {
      nodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      modelId: agentConfig.modelId,
    });

    // 执行 LLM 请求
    await executeRequest({
      session,
      userNode,
      assistantNode,
      pathToUserNode: pathWithNewMessage,
      abortControllers,
      generatingNodes,
      agentConfig,
    });
  };

  /**
   * 从指定节点重新生成
   * 支持从用户消息或助手消息重新生成
   */
  const regenerateFromNode = async (
    session: ChatSession,
    nodeId: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    options?: { modelId?: string; profileId?: string }
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();

    // 定位目标节点
    const targetNode = session.nodes[nodeId];
    if (!targetNode) {
      logger.warn("重新生成失败：目标节点不存在", { sessionId: session.id, nodeId });
      return;
    }

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      errorHandler.handle(new Error("No agent selected"), {
        userMessage: "重新生成失败：没有选中智能体",
        showToUser: false,
      });
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      errorHandler.handle(new Error("Agent config not found"), {
        userMessage: "重新生成失败：无法获取智能体配置",
        showToUser: false,
      });
      return;
    }

    // 如果提供了特定的模型选项，覆盖 agentConfig 中的设置
    if (options?.modelId && options?.profileId) {
      const { getProfileById, getSupportedParameters } = useLlmProfiles();
      const targetProfile = getProfileById(options.profileId);
      const targetModel = targetProfile?.models.find(m => m.id === options.modelId);

      if (targetProfile && targetModel) {
        agentConfig.modelId = options.modelId;
        agentConfig.profileId = options.profileId;

        // 过滤参数，只保留目标模型支持的参数
        const supportedParameters = getSupportedParameters(targetProfile.type);
        agentConfig.parameters = filterParametersForModel(
          agentConfig.parameters,
          supportedParameters,
          targetModel.capabilities
        );

        logger.info("使用指定的模型进行重试（参数已过滤）", {
          modelId: options.modelId,
          profileId: options.profileId,
          parameterKeys: Object.keys(agentConfig.parameters),
        });
      } else {
        logger.warn("无法找到指定的模型，将使用原始配置", {
          modelId: options.modelId,
          profileId: options.profileId,
        });
      }
    }

    // 使用节点管理器创建重新生成分支
    const result = nodeManager.createRegenerateBranch(session, nodeId);

    if (!result) {
      return;
    }

    const { assistantNode, userNode } = result;

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新生成所需的历史记录，应该是到当前用户消息为止的完整路径（包含用户消息）
    const pathToUserNode = nodeManager.getNodePath(session, userNode.id);

    // 获取模型信息用于元数据（提前设置，确保即时显示）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);

    // 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    // 直接修改 session.nodes 中的节点，确保响应式更新
    session.nodes[assistantNode.id].metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.displayName || currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
      virtualTimeConfig: currentAgent?.virtualTimeConfig,
    };

    logger.info("🔄 从节点重新生成", {
      sessionId: session.id,
      targetNodeId: nodeId,
      targetRole: targetNode.role,
      userNodeId: userNode.id,
      newNodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
    });

    logger.debug("已设置助手节点元数据", {
      nodeId: assistantNode.id,
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      modelId: agentConfig.modelId,
    });

    // 执行 LLM 请求
    await executeRequest({
      session,
      userNode,
      assistantNode,
      pathToUserNode,
      abortControllers,
      generatingNodes,
      agentConfig, // 传递包含正确模型信息的 agentConfig
    });
  };

  /**
   * 获取指定节点的上下文预览数据（用于上下文分析器）
   * @param session 当前会话
   * @param targetNodeId 目标节点 ID
   * @param agentId 要使用的 Agent ID (可选)
   * @returns 详细的上下文分析数据，如果无法获取则返回 null
   */
  const getContextPreview = async (
    session: ChatSession,
    targetNodeId: string,
    agentId?: string,
    parameterOverrides?: any
  ): Promise<ContextPreviewData | null> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();
    const { getProfileById } = useLlmProfiles();
    const { applyProcessingPipeline } = useMessageProcessor();

    return getLlmContextForPreview(
      session,
      targetNodeId,
      agentStore,
      nodeManager,
      getProfileById,
      applyProcessingPipeline,
      agentId,
      parameterOverrides
    );
  };

  return {
    sendMessage,
    regenerateFromNode,
    getLlmContextForPreview: getContextPreview,
  };
}
