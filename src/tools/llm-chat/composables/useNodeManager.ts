/**
 * 节点管理 Composable
 * 负责树形对话历史的节点操作逻辑
 */

import type { ChatSession, ChatMessageNode } from '../types';
import { BranchNavigator } from '../utils/BranchNavigator';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/node-manager');

/**
 * 创建节点的配置
 */
export interface CreateNodeConfig {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parentId: string | null;
  status?: 'complete' | 'generating' | 'error';
  isEnabled?: boolean;
  metadata?: Record<string, any>;
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
  const createNode = (config: CreateNodeConfig): ChatMessageNode => {
    const nodeId = generateNodeId();
    const now = new Date().toISOString();

    return {
      id: nodeId,
      parentId: config.parentId,
      childrenIds: [],
      content: config.content,
      role: config.role,
      status: config.status || 'complete',
      isEnabled: config.isEnabled !== false,
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

    logger.debug('节点已添加到会话', {
      sessionId: session.id,
      nodeId: node.id,
      role: node.role,
      parentId: node.parentId,
    });
  };

  /**
   * 递归禁用节点及其所有子节点
   */
  const disableNodeTree = (session: ChatSession, nodeId: string): void => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('禁用节点失败：节点不存在', { sessionId: session.id, nodeId });
      return;
    }

    // 禁用当前节点
    node.isEnabled = false;

    // 递归禁用所有子节点
    node.childrenIds.forEach(childId => {
      disableNodeTree(session, childId);
    });

    logger.debug('节点树已禁用', {
      sessionId: session.id,
      nodeId,
      childrenCount: node.childrenIds.length,
    });
  };

  /**
   * 创建消息对（用户消息 + 助手消息）
   * 返回创建的两个节点
   */
  const createMessagePair = (
    session: ChatSession,
    userContent: string,
    currentLeafId: string
  ): {
    userNode: ChatMessageNode;
    assistantNode: ChatMessageNode;
  } => {
    // 创建用户消息节点
    const userNode = createNode({
      role: 'user',
      content: userContent,
      parentId: currentLeafId,
      status: 'complete',
    });

    // 创建助手消息节点（初始为空）
    const assistantNode = createNode({
      role: 'assistant',
      content: '',
      parentId: userNode.id,
      status: 'generating',
    });

    // 建立父子关系
    userNode.childrenIds.push(assistantNode.id);

    // 添加到会话
    addNodeToSession(session, userNode);
    addNodeToSession(session, assistantNode);

    logger.info('创建消息对', {
      sessionId: session.id,
      userNodeId: userNode.id,
      assistantNodeId: assistantNode.id,
      previousLeafId: currentLeafId,
    });

    return { userNode, assistantNode };
  };

  /**
   * 创建新分支（重新生成场景）
   * 支持从用户消息或助手消息重新生成
   * - 用户消息：创建新的助手回复（作为其子节点的兄弟）
   * - 助手消息：创建新的助手回复（作为兄弟节点）
   */
  const createRegenerateBranch = (
    session: ChatSession,
    targetNodeId: string
  ): { assistantNode: ChatMessageNode; userNode: ChatMessageNode } | null => {
    const targetNode = session.nodes[targetNodeId];

    if (!targetNode) {
      logger.warn('创建重新生成分支失败：节点不存在', {
        sessionId: session.id,
        targetNodeId,
      });
      return null;
    }

    let userNode: ChatMessageNode;
    let parentNodeId: string;

    if (targetNode.role === 'user') {
      // 从用户消息重新生成：用户消息本身就是父节点
      userNode = targetNode;
      parentNodeId = targetNode.id;

      logger.info('从用户消息创建重新生成分支', {
        sessionId: session.id,
        userNodeId: targetNode.id,
      });
    } else if (targetNode.role === 'assistant') {
      // 从助手消息重新生成：使用其父节点（用户消息）
      if (!targetNode.parentId) {
        logger.warn('创建重新生成分支失败：助手消息没有父节点', {
          sessionId: session.id,
          targetNodeId,
        });
        return null;
      }

      const parentNode = session.nodes[targetNode.parentId];
      if (!parentNode) {
        logger.warn('创建重新生成分支失败：父节点不存在', {
          sessionId: session.id,
          parentNodeId: targetNode.parentId,
        });
        return null;
      }

      if (parentNode.role !== 'user') {
        logger.warn('创建重新生成分支失败：父节点不是用户消息', {
          sessionId: session.id,
          parentNodeId: targetNode.parentId,
          role: parentNode.role,
        });
        return null;
      }

      userNode = parentNode;
      parentNodeId = parentNode.id;

      logger.info('从助手消息创建重新生成分支', {
        sessionId: session.id,
        targetNodeId,
        userNodeId: parentNode.id,
      });
    } else {
      logger.warn('创建重新生成分支失败：不支持的消息角色', {
        sessionId: session.id,
        targetNodeId,
        role: targetNode.role,
      });
      return null;
    }

    // 创建新的助手消息节点（作为用户消息的子节点）
    const newAssistantNode = createNode({
      role: 'assistant',
      content: '',
      parentId: parentNodeId,
      status: 'generating',
    });

    // 添加到会话
    addNodeToSession(session, newAssistantNode);

    logger.info('创建重新生成分支成功', {
      sessionId: session.id,
      targetNodeId,
      newNodeId: newAssistantNode.id,
      parentNodeId,
    });

    return { assistantNode: newAssistantNode, userNode };
  };

  /**
   * 更新活跃叶节点
   */
  const updateActiveLeaf = (
    session: ChatSession,
    nodeId: string
  ): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('更新活跃叶节点失败：节点不存在', {
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

    logger.debug('活跃叶节点已更新', {
      sessionId: session.id,
      previousLeafId,
      newLeafId: nodeId,
    });

    return true;
  };

  /**
   * 软删除节点（标记为禁用）
   */
  const softDeleteNode = (session: ChatSession, nodeId: string): boolean => {
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('软删除节点失败：节点不存在', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    node.isEnabled = false;
    session.updatedAt = new Date().toISOString();

    logger.info('节点已软删除', {
      sessionId: session.id,
      nodeId,
      role: node.role,
    });

    return true;
  };

  /**
   * 硬删除节点（从树中移除，级联删除所有子节点）
   */
  const hardDeleteNode = (session: ChatSession, nodeId: string): boolean => {
    logger.info('🗑️ [硬删除] 开始硬删除节点', {
      sessionId: session.id,
      nodeId,
    });

    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn('🗑️ [硬删除] 失败：节点不存在', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    logger.info('🗑️ [硬删除] 找到目标节点', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      content: node.content.substring(0, 50),
      hasChildren: node.childrenIds.length > 0,
      childrenCount: node.childrenIds.length,
    });

    // 不允许删除根节点
    if (node.id === session.rootNodeId) {
      logger.warn('🗑️ [硬删除] 失败：不能删除根节点', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    // 收集需要删除的所有节点（包括所有子孙节点）
    const nodesToDelete = new Set<string>([nodeId]);
    const collectDescendants = (id: string) => {
      const currentNode = session.nodes[id];
      if (!currentNode) return;

      currentNode.childrenIds.forEach(childId => {
        nodesToDelete.add(childId);
        collectDescendants(childId);
      });
    };
    collectDescendants(nodeId);

    logger.info('🗑️ [硬删除] 收集到需要删除的节点', {
      totalCount: nodesToDelete.size,
      nodeIds: Array.from(nodesToDelete),
    });

    // 如果当前活动叶节点将被删除，需要调整到兄弟节点或父节点
    const oldActiveLeafId = session.activeLeafId;
    if (nodesToDelete.has(session.activeLeafId)) {
      logger.info('🗑️ [硬删除] 当前活动叶节点将被删除，需要调整', {
        oldActiveLeafId: session.activeLeafId,
      });

      // 获取兄弟节点
      const siblings = node.parentId ? session.nodes[node.parentId]?.childrenIds || [] : [];
      const siblingNodes = siblings
        .filter(id => id !== nodeId)
        .map(id => session.nodes[id])
        .filter(n => n);

      logger.info('🗑️ [硬删除] 兄弟节点信息', {
        siblingCount: siblingNodes.length,
        siblingIds: siblingNodes.map(n => n.id),
      });

      if (siblingNodes.length > 0) {
        // 有兄弟节点，切换到第一个兄弟节点的最深叶子
        const findDeepestLeaf = (n: ChatMessageNode): string => {
          if (n.childrenIds.length === 0) return n.id;
          const lastChild = session.nodes[n.childrenIds[n.childrenIds.length - 1]];
          return lastChild ? findDeepestLeaf(lastChild) : n.id;
        };
        session.activeLeafId = findDeepestLeaf(siblingNodes[0]);
        
        // 更新路径上所有父节点的选择记忆
        BranchNavigator.updateSelectionMemory(session, session.activeLeafId);
        
        logger.info('🗑️ [硬删除] 切换到兄弟节点的最深叶子', {
          newActiveLeafId: session.activeLeafId,
        });
      } else {
        // 没有兄弟节点，回退到父节点
        session.activeLeafId = node.parentId || session.rootNodeId;
        
        // 更新路径上所有父节点的选择记忆
        BranchNavigator.updateSelectionMemory(session, session.activeLeafId);
        
        logger.info('🗑️ [硬删除] 回退到父节点', {
          newActiveLeafId: session.activeLeafId,
          parentId: node.parentId,
        });
      }
    }

    // 从父节点的 childrenIds 中移除
    if (node.parentId) {
      const parentNode = session.nodes[node.parentId];
      if (parentNode) {
        const oldChildrenCount = parentNode.childrenIds.length;
        parentNode.childrenIds = parentNode.childrenIds.filter(id => id !== nodeId);
        logger.info('🗑️ [硬删除] 从父节点移除引用', {
          parentId: node.parentId,
          oldChildrenCount,
          newChildrenCount: parentNode.childrenIds.length,
        });
      }
    }

    // 删除所有收集到的节点
    const beforeDeleteCount = Object.keys(session.nodes).length;
    nodesToDelete.forEach(id => {
      delete session.nodes[id];
    });
    const afterDeleteCount = Object.keys(session.nodes).length;

    session.updatedAt = new Date().toISOString();

    logger.info('🗑️ [硬删除] 删除完成', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      deletedCount: nodesToDelete.size,
      beforeNodeCount: beforeDeleteCount,
      afterNodeCount: afterDeleteCount,
      newActiveLeafId: session.activeLeafId,
      activeLeafChanged: oldActiveLeafId !== session.activeLeafId,
    });

    return true;
  };

  /**
   * 验证节点关系的完整性
   */
  const validateNodeIntegrity = (session: ChatSession): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    // 检查根节点
    if (!session.nodes[session.rootNodeId]) {
      errors.push(`根节点不存在: ${session.rootNodeId}`);
    }

    // 检查活跃叶节点
    if (!session.nodes[session.activeLeafId]) {
      errors.push(`活跃叶节点不存在: ${session.activeLeafId}`);
    }

    // 检查所有节点的父子关系
    Object.values(session.nodes).forEach(node => {
      // 检查父节点引用
      if (node.parentId !== null && !session.nodes[node.parentId]) {
        errors.push(`节点 ${node.id} 的父节点不存在: ${node.parentId}`);
      }

      // 检查子节点引用
      node.childrenIds.forEach(childId => {
        if (!session.nodes[childId]) {
          errors.push(`节点 ${node.id} 的子节点不存在: ${childId}`);
        } else {
          const child = session.nodes[childId];
          if (child.parentId !== node.id) {
            errors.push(
              `节点关系不一致: ${node.id} 认为 ${childId} 是子节点，但 ${childId} 的父节点是 ${child.parentId}`
            );
          }
        }
      });
    });

    const isValid = errors.length === 0;
    if (!isValid) {
      logger.error('节点完整性验证失败', new Error('Node integrity check failed'), {
        sessionId: session.id,
        errorCount: errors.length,
        errors,
      });
    }

    return { isValid, errors };
  };

  /**
   * 获取从根节点到指定节点的路径
   */
  const getNodePath = (
    session: ChatSession,
    targetNodeId: string
  ): ChatMessageNode[] => {
    const path: ChatMessageNode[] = [];
    let currentId: string | null = targetNodeId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn('获取节点路径失败：节点不存在', {
          sessionId: session.id,
          nodeId: currentId,
        });
        break;
      }

      // 只添加启用的节点
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
  const getAllDescendants = (
    session: ChatSession,
    nodeId: string
  ): ChatMessageNode[] => {
    const descendants: ChatMessageNode[] = [];
    const node = session.nodes[nodeId];

    if (!node) return descendants;

    node.childrenIds.forEach(childId => {
      const childNode = session.nodes[childId];
      if (childNode) {
        descendants.push(childNode);
        descendants.push(...getAllDescendants(session, childId));
      }
    });

    return descendants;
  };

  /**
   * 将某个节点的子节点嫁接到另一个节点
   * 用于非破坏性编辑时转移子树
   */
  const transferChildren = (
    session: ChatSession,
    fromNodeId: string,
    toNodeId: string
  ): void => {
    const fromNode = session.nodes[fromNodeId];
    const toNode = session.nodes[toNodeId];

    if (!fromNode || !toNode) {
      logger.warn('嫁接子节点失败：源节点或目标节点不存在', {
        sessionId: session.id,
        fromNodeId,
        toNodeId,
      });
      return;
    }

    // 转移子节点列表
    toNode.childrenIds = [...fromNode.childrenIds];

    // 更新每个子节点的 parentId
    toNode.childrenIds.forEach(childId => {
      const child = session.nodes[childId];
      if (child) {
        child.parentId = toNode.id;
      }
    });

    // 清空原节点的子节点列表
    fromNode.childrenIds = [];

    logger.debug('子节点嫁接成功', {
      sessionId: session.id,
      fromNodeId,
      toNodeId,
      transferredCount: toNode.childrenIds.length,
    });
  };

  /**
   * 将一个节点及其整个子树重新挂载到另一个父节点下（嫁接功能）
   *
   * 用于会话树图中的拖拽嫁接操作。
   *
   * @param session - 当前会话
   * @param nodeId - 要移动的节点 ID
   * @param newParentId - 新的父节点 ID
   * @returns 操作是否成功
   */
  const reparentSubtree = (
    session: ChatSession,
    nodeId: string,
    newParentId: string
  ): boolean => {
    logger.info('🌿 [嫁接] 开始嫁接子树', {
      sessionId: session.id,
      nodeId,
      newParentId,
    });

    // 验证节点存在性
    const node = session.nodes[nodeId];
    const newParent = session.nodes[newParentId];

    if (!node) {
      logger.warn('🌿 [嫁接] 失败：源节点不存在', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    if (!newParent) {
      logger.warn('🌿 [嫁接] 失败：目标父节点不存在', {
        sessionId: session.id,
        newParentId,
      });
      return false;
    }

    // 不允许嫁接根节点
    if (node.id === session.rootNodeId) {
      logger.warn('🌿 [嫁接] 失败：不能嫁接根节点', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    // 不允许嫁接到自己
    if (nodeId === newParentId) {
      logger.warn('🌿 [嫁接] 失败：不能将节点嫁接到自己', {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    // 防止循环引用：检查新父节点是否是当前节点的子孙
    const descendants = getAllDescendants(session, nodeId);
    const descendantIds = new Set(descendants.map(d => d.id));
    
    if (descendantIds.has(newParentId)) {
      logger.warn('🌿 [嫁接] 失败：目标父节点是源节点的子孙，会形成循环', {
        sessionId: session.id,
        nodeId,
        newParentId,
      });
      return false;
    }

    // 如果已经是该父节点的子节点，无需操作
    if (node.parentId === newParentId) {
      logger.info('🌿 [嫁接] 节点已经是目标父节点的子节点，无需操作', {
        sessionId: session.id,
        nodeId,
        newParentId,
      });
      return true;
    }

    const oldParentId = node.parentId;

    // 从旧父节点的 childrenIds 中移除
    if (oldParentId) {
      const oldParent = session.nodes[oldParentId];
      if (oldParent) {
        const oldChildrenCount = oldParent.childrenIds.length;
        oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== nodeId);
        logger.debug('🌿 [嫁接] 从旧父节点移除引用', {
          oldParentId,
          oldChildrenCount,
          newChildrenCount: oldParent.childrenIds.length,
        });
      }
    }

    // 更新节点的 parentId
    node.parentId = newParentId;

    // 将节点添加到新父节点的 childrenIds 中
    if (!newParent.childrenIds.includes(nodeId)) {
      newParent.childrenIds.push(nodeId);
    }

    // 更新会话时间戳
    session.updatedAt = new Date().toISOString();

    logger.info('🌿 [嫁接] 嫁接成功', {
      sessionId: session.id,
      nodeId,
      role: node.role,
      oldParentId,
      newParentId,
      newParentChildrenCount: newParent.childrenIds.length,
    });

    return true;
  };

  return {
    generateNodeId,
    createNode,
    addNodeToSession,
    disableNodeTree,
    createMessagePair,
    createRegenerateBranch,
    updateActiveLeaf,
    softDeleteNode,
    hardDeleteNode,
    validateNodeIntegrity,
    getNodePath,
    getAllDescendants,
    transferChildren,
    reparentSubtree,
  };
}