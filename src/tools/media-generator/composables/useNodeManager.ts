/**
 * 节点管理 Composable (Media Generator 版)
 * 负责树形对话历史的节点操作逻辑
 */

import { toRaw } from "vue";
import type { GenerationSession, MediaMessage } from "../types";
import type { Asset } from "@/types/asset-management";
import { BranchNavigator } from "@/tools/llm-chat/utils/BranchNavigator";
import { createModuleLogger } from "@/utils/logger";
import { getLocalISOString } from "@/utils/time";

const logger = createModuleLogger("media-generator/node-manager");

/**
 * 创建节点的配置
 */
export interface CreateNodeConfig {
  role: "user" | "assistant" | "system";
  content: string;
  parentId: string | null;
  status?: "complete" | "generating" | "error";
  isEnabled?: boolean;
  metadata?: Record<string, any>;
  attachments?: Asset[];
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
    return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * 创建新节点
   */
  const createNode = (config: CreateNodeConfig): MediaMessage => {
    const nodeId = generateNodeId();
    const now = getLocalISOString();

    return {
      id: nodeId,
      parentId: config.parentId,
      childrenIds: [],
      content: config.content,
      role: config.role,
      status: config.status || "complete",
      isEnabled: config.isEnabled !== false,
      timestamp: now,
      metadata: config.metadata || {},
      attachments: config.attachments,
      name: config.name,
    };
  };

  /**
   * 将节点添加到会话（更新父子关系）
   */
  const addNodeToSession = (session: GenerationSession, node: MediaMessage): void => {
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
   * 更新活跃叶节点
   */
  const updateActiveLeaf = (session: GenerationSession, nodeId: string): boolean => {
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
    session.updatedAt = getLocalISOString();

    // 更新路径上所有父节点的选择记忆 (复用 llm-chat 的 BranchNavigator)
    BranchNavigator.updateSelectionMemory(session as any, nodeId);

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
    session: GenerationSession,
    nodeId: string
  ): { success: boolean; deletedNodes: MediaMessage[] } => {
    logger.info("🗑️ [硬删除] 开始硬删除节点", { sessionId: session.id, nodeId });

    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("🗑️ [硬删除] 失败：节点不存在", { sessionId: session.id, nodeId });
      return { success: false, deletedNodes: [] };
    }

    if (node.id === session.rootNodeId) {
      logger.warn("🗑️ [硬删除] 失败：不能删除根节点", { sessionId: session.id, nodeId });
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
      const siblings = node.parentId ? session.nodes[node.parentId]?.childrenIds || [] : [];
      const siblingNodes = siblings
        .filter((id) => id !== nodeId)
        .map((id) => session.nodes[id])
        .filter((n): n is MediaMessage => !!n);

      if (siblingNodes.length > 0) {
        const findDeepestLeaf = (n: MediaMessage): string => {
          if (n.childrenIds.length === 0) return n.id;
          const lastChildId = n.childrenIds[n.childrenIds.length - 1];
          const lastChild = session.nodes[lastChildId];
          return lastChild ? findDeepestLeaf(lastChild) : n.id;
        };
        session.activeLeafId = findDeepestLeaf(siblingNodes[0]);
        BranchNavigator.updateSelectionMemory(session as any, session.activeLeafId);
      } else {
        session.activeLeafId = node.parentId || session.rootNodeId;
        BranchNavigator.updateSelectionMemory(session as any, session.activeLeafId);
      }
    }

    if (node.parentId) {
      const parentNode = session.nodes[node.parentId];
      if (parentNode) {
        parentNode.childrenIds = parentNode.childrenIds.filter((id) => id !== nodeId);
      }
    }

    const deletedNodes: MediaMessage[] = [];
    nodesToDeleteIds.forEach((id) => {
      if (session.nodes[id]) {
        try {
          deletedNodes.push(structuredClone(toRaw(session.nodes[id])));
        } catch (error) {
          deletedNodes.push({ ...toRaw(session.nodes[id]) });
        }
        delete session.nodes[id];
      }
    });

    session.updatedAt = getLocalISOString();

    return { success: true, deletedNodes };
  };

  /**
   * 获取从根节点到指定节点的路径
   */
  const getNodePath = (session: GenerationSession, targetNodeId: string): MediaMessage[] => {
    const path: MediaMessage[] = [];
    let currentId: string | null = targetNodeId;

    while (currentId !== null) {
      const node: MediaMessage | undefined = session.nodes[currentId];
      if (!node) break;

      if (node.isEnabled !== false) {
        path.unshift(node);
      }

      currentId = node.parentId;
    }

    return path;
  };

  /**
   * 获取节点的所有子节点（递归）
   */
  const getAllDescendants = (session: GenerationSession, nodeId: string): MediaMessage[] => {
    const descendants: MediaMessage[] = [];
    const node = session.nodes[nodeId];

    if (!node) return descendants;

    node.childrenIds.forEach((childId) => {
      const childNode = session.nodes[childId];
      if (childNode) {
        descendants.push(childNode);
        descendants.push(...getAllDescendants(session, childId));
      }
    });

    return descendants;
  };

  /**
   * 获取节点的所有祖先节点（递归）
   */
  const getAllAncestors = (session: GenerationSession, nodeId: string): MediaMessage[] => {
    const ancestors: MediaMessage[] = [];
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node: MediaMessage | undefined = session.nodes[currentId];
      if (!node) break;

      if (node.parentId) {
        const parent: MediaMessage | undefined = session.nodes[node.parentId];
        if (parent) {
          ancestors.push(parent);
          currentId = parent.id;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return ancestors;
  };

  return {
    generateNodeId,
    createNode,
    addNodeToSession,
    updateActiveLeaf,
    hardDeleteNode,
    getNodePath,
    getAllDescendants,
    getAllAncestors,
  };
}
