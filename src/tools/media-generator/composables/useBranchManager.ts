/**
 * 分支管理 Composable (Media Generator 版)
 * 负责所有与用户交互的树结构操作：编辑、删除、切换分支等
 */

import type { GenerationSession, MediaMessage } from "../types";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "./useNodeManager";
import { BranchNavigator } from "@/tools/llm-chat/utils/BranchNavigator";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("media-generator/branch-manager");

export function useBranchManager() {
  /**
   * 删除消息节点
   */
  const deleteMessage = (
    session: GenerationSession,
    nodeId: string
  ): { success: boolean; deletedNodes: MediaMessage[] } => {
    const nodeManager = useNodeManager();
    const result = nodeManager.hardDeleteNode(session, nodeId);

    if (result.success) {
      logger.info("消息已删除", {
        sessionId: session.id,
        nodeId,
        deletedCount: result.deletedNodes.length,
      });
    }

    return result;
  };

  /**
   * 切换到指定分支（将某个节点设为活跃叶节点）
   */
  const switchBranch = (session: GenerationSession, nodeId: string): boolean => {
    const nodeManager = useNodeManager();
    const success = nodeManager.updateActiveLeaf(session, nodeId);

    if (success) {
      logger.info("已切换分支", { sessionId: session.id, nodeId });
    }

    return success;
  };

  /**
   * 切换到兄弟分支
   */
  const switchToSiblingBranch = (
    session: GenerationSession,
    nodeId: string,
    direction: "prev" | "next"
  ): string => {
    const newLeafId = BranchNavigator.switchToSibling(session as any, nodeId, direction);

    if (newLeafId !== session.activeLeafId) {
      session.activeLeafId = newLeafId;

      // 更新路径上所有父节点的选择记忆
      BranchNavigator.updateSelectionMemory(session as any, newLeafId);

      logger.info("已切换到兄弟分支", {
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
   */
  const editMessage = (
    session: GenerationSession,
    nodeId: string,
    newContent: string,
    attachments?: Asset[]
  ): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("编辑消息失败：节点不存在", { sessionId: session.id, nodeId });
      return false;
    }

    // 直接更新节点内容
    node.content = newContent;

    // 更新附件
    if (attachments !== undefined) {
      if (attachments.length > 0) {
        node.attachments = attachments;
      } else {
        delete node.attachments;
      }
    }

    // 更新时间戳
    session.updatedAt = new Date().toISOString();

    logger.info("消息已编辑", {
      sessionId: session.id,
      nodeId,
      role: node.role,
      contentLength: newContent.length,
    });

    return true;
  };

  /**
   * 创建分支（创建源节点的兄弟节点，复制内容）
   */
  const createBranch = (session: GenerationSession, sourceNodeId: string): string | null => {
    const sourceNode = session.nodes[sourceNodeId];
    if (!sourceNode) return null;

    const nodeManager = useNodeManager();

    // 创建新的兄弟节点，复制源节点的内容
    const newNode = nodeManager.createNode({
      parentId: sourceNode.parentId,
      role: sourceNode.role,
      content: sourceNode.content,
      attachments: sourceNode.attachments ? [...sourceNode.attachments] : undefined,
      isEnabled: true,
      status: "complete",
      metadata: sourceNode.metadata ? { ...sourceNode.metadata } : undefined,
    });

    // 添加新节点到会话
    nodeManager.addNodeToSession(session, newNode);

    // 切换到新分支
    session.activeLeafId = newNode.id;
    BranchNavigator.updateSelectionMemory(session as any, newNode.id);

    session.updatedAt = new Date().toISOString();

    logger.info("分支已创建", {
      sessionId: session.id,
      sourceNodeId,
      newNodeId: newNode.id,
    });

    return newNode.id;
  };

  /**
   * 获取某个节点的兄弟节点（包括自己）
   */
  const getSiblings = (session: GenerationSession, nodeId: string): MediaMessage[] => {
    return BranchNavigator.getSiblings(session as any, nodeId) as MediaMessage[];
  };

  /**
   * 判断节点是否在当前活动路径上
   */
  const isNodeInActivePath = (session: GenerationSession, nodeId: string): boolean => {
    return BranchNavigator.isNodeInActivePath(session as any, nodeId);
  };

  /**
   * 获取当前节点在兄弟节点中的索引
   */
  const getSiblingIndex = (
    session: GenerationSession,
    nodeId: string
  ): { index: number; total: number } => {
    return BranchNavigator.getSiblingIndex(session as any, nodeId);
  };

  return {
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    editMessage,
    createBranch,
    getSiblings,
    isNodeInActivePath,
    getSiblingIndex,
  };
}
