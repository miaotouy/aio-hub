/**
 * 分支管理 Composable
 * 负责所有与用户交互的树结构操作：编辑、删除、切换分支等
 */

import type { ChatSession, ChatMessageNode } from '../types';
import { useNodeManager } from './useNodeManager';
import { BranchNavigator } from '../utils/BranchNavigator';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/branch-manager');

export function useBranchManager() {
  const nodeManager = useNodeManager();

  /**
   * 删除消息节点
   */
  const deleteMessage = (
    session: ChatSession,
    nodeId: string
  ): { success: boolean; deletedNodes: ChatMessageNode[] } => {
    const result = nodeManager.hardDeleteNode(session, nodeId);

    if (result.success) {
      logger.info('消息已删除', {
        sessionId: session.id,
        nodeId,
        deletedCount: result.deletedNodes.length,
      });
    }

    return result;
  };

  /**
   * 切换到指定分支
   */
  const switchBranch = (session: ChatSession, nodeId: string): boolean => {
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
   * 编辑消息（原地修改）
   */
  const editMessage = (
    session: ChatSession,
    nodeId: string,
    newContent: string
  ): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('编辑消息失败：节点不存在', { sessionId: session.id, nodeId });
      return false;
    }

    node.content = newContent;
    session.updatedAt = new Date().toISOString();

    logger.info('消息已编辑', {
      sessionId: session.id,
      nodeId,
      contentLength: newContent.length,
    });

    return true;
  };

  /**
   * 准备重新生成（重试）
   * 如果当前是助手消息，回退到父节点（用户消息）并返回内容
   */
  const prepareRegenerate = (
    session: ChatSession,
    nodeId: string
  ): { shouldRegenerate: boolean; userContent?: string; parentNodeId?: string } => {
    const node = session.nodes[nodeId];
    if (!node) return { shouldRegenerate: false };

    if (node.role === 'assistant') {
      const parentNode = node.parentId ? session.nodes[node.parentId] : null;
      if (!parentNode || parentNode.role !== 'user') {
        return { shouldRegenerate: false };
      }

      return {
        shouldRegenerate: true,
        userContent: parentNode.content,
        parentNodeId: parentNode.id,
      };
    } else if (node.role === 'user') {
      return {
        shouldRegenerate: true,
        userContent: node.content,
        parentNodeId: node.id,
      };
    }

    return { shouldRegenerate: false };
  };

  return {
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    editMessage,
    prepareRegenerate,
  };
}