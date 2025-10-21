/**
 * 节点管理 Composable
 * 负责树形对话历史的节点操作逻辑
 */

import type { ChatSession, ChatMessageNode } from '../types';
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
   * 禁用旧分支，创建新的助手消息节点
   */
  const createRegenerateBranch = (
    session: ChatSession,
    targetNodeId: string,
    parentNodeId: string
  ): ChatMessageNode | null => {
    const targetNode = session.nodes[targetNodeId];
    const parentNode = session.nodes[parentNodeId];

    if (!targetNode || !parentNode) {
      logger.warn('创建重新生成分支失败：节点不存在', {
        sessionId: session.id,
        targetNodeId,
        parentNodeId,
      });
      return null;
    }

    // 验证角色
    if (targetNode.role !== 'assistant') {
      logger.warn('创建重新生成分支失败：只能重新生成助手消息', {
        sessionId: session.id,
        targetNodeId,
        role: targetNode.role,
      });
      return null;
    }

    if (parentNode.role !== 'user') {
      logger.warn('创建重新生成分支失败：父节点不是用户消息', {
        sessionId: session.id,
        parentNodeId,
        role: parentNode.role,
      });
      return null;
    }

    // 禁用旧分支（包括所有子节点）
    disableNodeTree(session, targetNodeId);

    // 创建新的助手消息节点
    const newAssistantNode = createNode({
      role: 'assistant',
      content: '',
      parentId: parentNodeId,
      status: 'generating',
    });

    // 添加到会话
    addNodeToSession(session, newAssistantNode);

    logger.info('创建重新生成分支', {
      sessionId: session.id,
      oldNodeId: targetNodeId,
      newNodeId: newAssistantNode.id,
      parentNodeId,
    });

    return newAssistantNode;
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

  return {
    generateNodeId,
    createNode,
    addNodeToSession,
    disableNodeTree,
    createMessagePair,
    createRegenerateBranch,
    updateActiveLeaf,
    softDeleteNode,
    validateNodeIntegrity,
    getNodePath,
    getAllDescendants,
    transferChildren,
  };
}