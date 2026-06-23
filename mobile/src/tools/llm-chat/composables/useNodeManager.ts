/**
 * 节点管理 Composable
 * 负责树形对话历史的节点操作逻辑
 */

import { toRaw } from "vue";
import type { ChatSession, ChatMessageNode } from "../types";
import { BranchNavigator } from "../utils/BranchNavigator";
import { createModuleLogger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

const logger = createModuleLogger("llm-chat/node-manager");

/**
 * 创建节点的配置
 */
export interface CreateNodeConfig {
  role: "user" | "assistant" | "system";
  content: string;
  parentId: string | null;
  status?: "complete" | "generating" | "error";
  metadata?: Record<string, any>;
  name?: string;
}

/**
 * 节点管理器
 */
export function useNodeManager() {
  /**
   * 生成唯一的节点 ID
   */
  const generateNodeId = (): string => {
    return uuidv4();
  };

  /**
   * 创建新节点
   */
  const createNode = (config: CreateNodeConfig): ChatMessageNode => {
    const nodeId = generateNodeId();
    const now = new Date().toISOString();

    return {
      id: nodeId,
      parentId: config.parentId,
      childrenIds: [],
      content: config.content,
      role: config.role,
      status: config.status || "complete",
      timestamp: now,
      metadata: config.metadata,
    };
  };

  /**
   * 将节点添加到会话（更新父子关系）
   */
  const addNodeToSession = (
    session: ChatSession,
    node: ChatMessageNode
  ): void => {
    // 添加节点到会话
    session.nodes[node.id] = node;

    // 更新父节点的 childrenIds
    if (node.parentId) {
      const parentNode = session.nodes[node.parentId];
      if (parentNode && !parentNode.childrenIds.includes(node.id)) {
        parentNode.childrenIds.push(node.id);
      }
    }

    logger.debug("节点已添加到会话", {
      sessionId: session.id,
      nodeId: node.id,
      role: node.role,
      parentId: node.parentId,
    });
  };

  /**
   * 基于现有节点创建一个同级分支。
   */
  const createSiblingBranch = (
    session: ChatSession,
    sourceNodeId: string,
    content: string
  ): ChatMessageNode | null => {
    const sourceNode = session.nodes[sourceNodeId];
    if (!sourceNode || !sourceNode.parentId) {
      logger.warn("创建同级分支失败：源节点不存在或没有父节点", {
        sessionId: session.id,
        sourceNodeId,
      });
      return null;
    }

    const branchNode = createNode({
      role: sourceNode.role,
      content,
      parentId: sourceNode.parentId,
      status: "complete",
      metadata: sourceNode.metadata
        ? JSON.parse(JSON.stringify(toRaw(sourceNode.metadata)))
        : undefined,
    });

    session.nodes[branchNode.id] = branchNode;

    const parentNode = session.nodes[sourceNode.parentId];
    if (parentNode) {
      const sourceIndex = parentNode.childrenIds.indexOf(sourceNodeId);
      const insertIndex =
        sourceIndex >= 0 ? sourceIndex + 1 : parentNode.childrenIds.length;
      parentNode.childrenIds.splice(insertIndex, 0, branchNode.id);
    }

    updateActiveLeaf(session, branchNode.id);
    session.updatedAt = new Date().toISOString();

    logger.info("已创建同级分支", {
      sessionId: session.id,
      sourceNodeId,
      branchNodeId: branchNode.id,
    });

    return branchNode;
  };

  /**
   * 更新活跃叶节点
   */
  const updateActiveLeaf = (session: ChatSession, nodeId: string): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("更新活跃叶节点失败：节点不存在", {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    const previousLeafId = session.activeLeafId;
    session.activeLeafId = nodeId;
    session.updatedAt = new Date().toISOString();

    // 更新路径上所有父节点的选择记忆
    BranchNavigator.updateSelectionMemory(session, nodeId);

    logger.debug("活跃叶节点已更新", {
      sessionId: session.id,
      previousLeafId,
      newLeafId: nodeId,
    });

    return true;
  };

  /**
   * 硬删除节点（从树中移除，级联删除所有子节点）
   */
  const hardDeleteNode = (
    session: ChatSession,
    nodeId: string
  ): { success: boolean; deletedNodes: ChatMessageNode[] } => {
    logger.info("🗑️ [硬删除] 开始硬删除节点", {
      sessionId: session.id,
      nodeId,
    });

    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("🗑️ [硬删除] 失败：节点不存在", {
        sessionId: session.id,
        nodeId,
      });
      return { success: false, deletedNodes: [] };
    }

    if (node.id === session.rootNodeId) {
      logger.warn("🗑️ [硬删除] 失败：不能删除根节点", {
        sessionId: session.id,
        nodeId,
      });
      return { success: false, deletedNodes: [] };
    }

    const nodesToDeleteIds = new Set<string>([nodeId]);
    const collectDescendants = (id: string) => {
      const currentNode = session.nodes[id];
      if (!currentNode) return;
      currentNode.childrenIds.forEach((childId) => {
        nodesToDeleteIds.add(childId);
        collectDescendants(childId);
      });
    };
    collectDescendants(nodeId);

    if (nodesToDeleteIds.has(session.activeLeafId)) {
      const siblings = node.parentId
        ? session.nodes[node.parentId]?.childrenIds || []
        : [];
      const siblingNodes = siblings
        .filter((id) => id !== nodeId)
        .map((id) => session.nodes[id])
        .filter((n): n is ChatMessageNode => !!n);

      if (siblingNodes.length > 0) {
        session.activeLeafId = BranchNavigator.findLeafOfBranch(
          session,
          siblingNodes[0].id
        );
        BranchNavigator.updateSelectionMemory(session, session.activeLeafId);
      } else {
        session.activeLeafId = node.parentId || session.rootNodeId;
        BranchNavigator.updateSelectionMemory(session, session.activeLeafId);
      }
    }

    if (node.parentId) {
      const parentNode = session.nodes[node.parentId];
      if (parentNode) {
        parentNode.childrenIds = parentNode.childrenIds.filter(
          (id) => id !== nodeId
        );
      }
    }

    const deletedNodes: ChatMessageNode[] = [];
    nodesToDeleteIds.forEach((id) => {
      if (session.nodes[id]) {
        deletedNodes.push({ ...toRaw(session.nodes[id]) });
        delete session.nodes[id];
      }
    });

    session.updatedAt = new Date().toISOString();

    return { success: true, deletedNodes };
  };

  return {
    generateNodeId,
    createNode,
    addNodeToSession,
    createSiblingBranch,
    updateActiveLeaf,
    hardDeleteNode,
  };
}
