/**
 * 分支管理 Composable
 * 负责所有与用户交互的树结构操作：编辑、删除、切换分支等
 */

import type { ChatSession, ChatMessageNode } from '../types';
import type { Asset } from '@/types/asset-management';
import { useNodeManager } from './useNodeManager';
import { BranchNavigator } from '../utils/BranchNavigator';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/branch-manager');

export function useBranchManager() {
  /**
   * 删除消息节点（硬删除：从节点树中移除）
   */
  const deleteMessage = (session: ChatSession, nodeId: string): boolean => {
    const nodeManager = useNodeManager();
    const success = nodeManager.hardDeleteNode(session, nodeId);

    if (success) {
      logger.info('消息已删除', { sessionId: session.id, nodeId });
    }

    return success;
  };

  /**
   * 切换到指定分支（将某个节点设为活跃叶节点）
   */
  const switchBranch = (session: ChatSession, nodeId: string): boolean => {
    const nodeManager = useNodeManager();
    const success = nodeManager.updateActiveLeaf(session, nodeId);

    if (success) {
      logger.info('已切换分支', { sessionId: session.id, nodeId });
    }

    return success;
  };

  /**
   * 切换到兄弟分支
   */
  const switchToSiblingBranch = (
    session: ChatSession,
    nodeId: string,
    direction: 'prev' | 'next'
  ): string => {
    const newLeafId = BranchNavigator.switchToSibling(session, nodeId, direction);

    if (newLeafId !== session.activeLeafId) {
      session.activeLeafId = newLeafId;

      // 更新路径上所有父节点的选择记忆
      BranchNavigator.updateSelectionMemory(session, newLeafId);

      logger.info('已切换到兄弟分支', {
        sessionId: session.id,
        fromNode: nodeId,
        toLeaf: newLeafId,
        direction,
      });
    }

    return newLeafId;
  };

  /**
   * 编辑消息（原地修改内容和附件）
   * 直接修改节点内容，不创建新节点
   */
  const editMessage = (
    session: ChatSession,
    nodeId: string,
    newContent: string,
    attachments?: Asset[]
  ): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('编辑消息失败：节点不存在', { sessionId: session.id, nodeId });
      return false;
    }

    // 只允许编辑用户消息和助手消息
    if (node.role !== 'user' && node.role !== 'assistant') {
      logger.warn('编辑消息失败：只能编辑用户或助手消息', {
        sessionId: session.id,
        nodeId,
        role: node.role,
      });
      return false;
    }

    // 直接更新节点内容
    node.content = newContent;
    
    // 更新附件（如果提供了）
    if (attachments !== undefined) {
      if (attachments.length > 0) {
        node.attachments = attachments;
      } else {
        // 如果附件数组为空，删除附件字段
        delete node.attachments;
      }
    }

    // 更新时间戳
    session.updatedAt = new Date().toISOString();

    logger.info('消息已编辑', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      contentLength: newContent.length,
      attachmentCount: attachments?.length ?? node.attachments?.length ?? 0,
    });

    return true;
  };

  /**
   * 创建分支（创建源节点的兄弟节点，复制内容）
   * 用于在同一父节点下创建新的分支
   */
  const createBranch = (session: ChatSession, sourceNodeId: string): string | null => {
    const sourceNode = session.nodes[sourceNodeId];
    if (!sourceNode) {
      logger.warn('创建分支失败：源节点不存在', { sessionId: session.id, sourceNodeId });
      return null;
    }

    // 只允许为用户消息和助手消息创建分支
    if (sourceNode.role !== 'user' && sourceNode.role !== 'assistant') {
      logger.warn('创建分支失败：只能为用户或助手消息创建分支', {
        sessionId: session.id,
        sourceNodeId,
        role: sourceNode.role,
      });
      return null;
    }

    const nodeManager = useNodeManager();

    // 创建新的兄弟节点，复制源节点的内容
    const newNode = nodeManager.createNode({
      parentId: sourceNode.parentId,
      role: sourceNode.role,
      content: sourceNode.content,
      isEnabled: true,
      status: 'complete',
    });

    // 如果是助手消息，复制元数据
    if (sourceNode.role === 'assistant' && sourceNode.metadata) {
      newNode.metadata = { ...sourceNode.metadata };
    }

    // 添加新节点到会话
    nodeManager.addNodeToSession(session, newNode);

    // 切换到新分支
    session.activeLeafId = newNode.id;

    // 更新路径上所有父节点的选择记忆
    BranchNavigator.updateSelectionMemory(session, newNode.id);

    // 更新时间戳
    session.updatedAt = new Date().toISOString();

    logger.info('分支已创建', {
      sessionId: session.id,
      sourceNodeId,
      newNodeId: newNode.id,
      role: newNode.role,
    });

    return newNode.id;
  };

  /**
   * 切换节点启用状态
   */
  const toggleNodeEnabled = (session: ChatSession, nodeId: string): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('切换节点状态失败：节点不存在', { sessionId: session.id, nodeId });
      return false;
    }

    // 切换启用状态
    const newState = !(node.isEnabled ?? true);
    node.isEnabled = newState;

    logger.info('节点状态已切换', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      isEnabled: newState,
    });

    return true;
  };

  /**
   * 重新生成最后一条助手消息（向后兼容）
   * 这个函数返回新的活跃叶节点ID，由调用方负责实际的重新生成
   */
  const prepareRegenerateLastMessage = (
    session: ChatSession
  ): { shouldRegenerate: boolean; userContent?: string; newActiveLeafId?: string } => {
    const currentLeaf = session.nodes[session.activeLeafId];
    if (!currentLeaf) {
      logger.warn('重新生成失败：当前叶节点不存在', { sessionId: session.id });
      return { shouldRegenerate: false };
    }

    // 如果当前叶节点是助手消息，回退到其父节点（用户消息）
    if (currentLeaf.role === 'assistant') {
      const parentNode = currentLeaf.parentId ? session.nodes[currentLeaf.parentId] : null;
      if (!parentNode || parentNode.role !== 'user') {
        logger.warn('重新生成失败：父节点不是用户消息', { sessionId: session.id });
        return { shouldRegenerate: false };
      }

      // 返回信息供调用方使用
      return {
        shouldRegenerate: true,
        userContent: parentNode.content,
        newActiveLeafId: parentNode.id,
      };
    }

    logger.warn('重新生成失败：当前叶节点不是助手消息', {
      sessionId: session.id,
      currentRole: currentLeaf.role,
    });
    return { shouldRegenerate: false };
  };

  /**
   * 获取某个节点的兄弟节点（包括自己）
   */
  const getSiblings = (session: ChatSession, nodeId: string): ChatMessageNode[] => {
    return BranchNavigator.getSiblings(session, nodeId);
  };

  /**
   * 判断节点是否在当前活动路径上
   */
  const isNodeInActivePath = (session: ChatSession, nodeId: string): boolean => {
    return BranchNavigator.isNodeInActivePath(session, nodeId);
  };

  /**
   * 获取当前节点在兄弟节点中的索引
   */
  const getSiblingIndex = (
    session: ChatSession,
    nodeId: string
  ): { index: number; total: number } => {
    return BranchNavigator.getSiblingIndex(session, nodeId);
  };

  return {
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    editMessage,
    createBranch,
    toggleNodeEnabled,
    prepareRegenerateLastMessage,
    getSiblings,
    isNodeInActivePath,
    getSiblingIndex,
  };
}