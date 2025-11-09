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
import { useChatExecutor } from "./useChatExecutor";
import { useChatContextBuilder, type ContextPreviewData } from "./useChatContextBuilder";
import { useMessageProcessor } from "./useMessageProcessor";

const logger = createModuleLogger("llm-chat/chat-handler");

export type { ContextPreviewData };

export function useChatHandler() {
  const {
    executeRequest,
    processUserAttachments,
    calculateUserMessageTokens,
    saveUserProfileSnapshot,
  } = useChatExecutor();
  const { getLlmContextForPreview } = useChatContextBuilder();

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSession,
    content: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    attachments?: Asset[]
  ): Promise<void> => {
    const agentStore = useAgentStore();
    const userProfileStore = useUserProfileStore();
    const nodeManager = useNodeManager();

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      logger.error("发送消息失败：没有选中智能体", new Error("No agent selected"));
      throw new Error("请先选择一个智能体");
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error("发送消息失败：无法获取智能体配置", new Error("Agent config not found"));
      throw new Error("无法获取智能体配置");
    }

    // 使用节点管理器创建消息对
    const { userNode, assistantNode } = nodeManager.createMessagePair(
      session,
      content,
      session.activeLeafId
    );

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新获取包含新用户消息的完整路径
    const pathWithNewMessage = nodeManager.getNodePath(session, userNode.id);

    // 获取路径中的用户节点引用
    const pathUserNode = pathWithNewMessage[pathWithNewMessage.length - 1];

    // 处理附件（如果有）
    if (attachments && attachments.length > 0) {
      await processUserAttachments(userNode, session, attachments, pathUserNode);
    }

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    let effectiveUserProfile: { id: string; name: string; icon?: string; content: string } | null =
      null;

    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);
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
    await calculateUserMessageTokens(userNode, session, content, agentConfig.modelId, attachments);
    // 获取模型信息用于元数据（提前设置，确保即时显示）
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 在助手节点中设置基本 metadata（包括 Agent 名称和图标的快照）
    // 直接修改 session.nodes 中的节点，确保响应式更新
    session.nodes[assistantNode.id].metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      agentIconMode: currentAgent?.iconMode,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
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
    generatingNodes: Set<string>
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
      logger.error("重新生成失败：没有选中智能体", new Error("No agent selected"));
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error("重新生成失败：无法获取智能体配置", new Error("Agent config not found"));
      return;
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
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      agentIconMode: currentAgent?.iconMode,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
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
    agentId?: string
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
      agentId
    );
  };

  return {
    sendMessage,
    regenerateFromNode,
    getLlmContextForPreview: getContextPreview,
  };
}
