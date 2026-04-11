/**
 * 节点管理 Composable
 * 负责树形对话历史的节点操作逻辑
 */

import { toRaw } from "vue";
import type { ChatSessionDetail, ChatMessageNode, MessageRole } from "../../types";
import type { Asset } from "@/types/asset-management";
import { BranchNavigator } from "../../utils/BranchNavigator";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";

const logger = createModuleLogger("llm-chat/node-manager");
const errorHandler = createModuleErrorHandler("llm-chat/node-manager");

/**
 * 创建节点的配置
 */
export interface CreateNodeConfig {
  role: MessageRole;
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
   * 清理用于克隆/续写的元数据，移除执行状态和错误信息
   */
  const cleanMetadataForClone = (
    metadata?: Record<string, any>
  ): Record<string, any> | undefined => {
    if (!metadata) return undefined;

    const clean = { ...metadata };

    // 移除执行状态和错误信息
    delete clean.error;
    delete clean.usage;
    delete clean.contentTokens;
    delete clean.tokenCount;
    delete clean.tokenCountEstimated;
    delete clean.reasoningContent;
    delete clean.reasoningStartTime;
    delete clean.reasoningEndTime;
    delete clean.requestStartTime;
    delete clean.requestEndTime;
    delete clean.firstTokenTime;
    delete clean.tokensPerSecond;
    delete clean.lastCalcHash;
    delete clean.translation;

    return clean;
  };

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
  const addNodeToSession = (session: ChatSessionDetail, node: ChatMessageNode): void => {
    if (!session.nodes) session.nodes = {};

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
   * 递归禁用节点及其所有子节点
   */
  const disableNodeTree = (session: ChatSessionDetail, nodeId: string): void => {
    if (!session.nodes) return;
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("禁用节点失败：节点不存在", { sessionId: session.id, nodeId });
      return;
    }

    // 禁用当前节点
    node.isEnabled = false;

    // 递归禁用所有子节点
    node.childrenIds.forEach((childId) => {
      disableNodeTree(session, childId);
    });

    logger.debug("节点树已禁用", {
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
    session: ChatSessionDetail,
    userContent: string,
    currentLeafId: string
  ): {
    userNode: ChatMessageNode;
    assistantNode: ChatMessageNode;
  } => {
    // 创建用户消息节点
    const userNode = createNode({
      role: "user",
      content: userContent,
      parentId: currentLeafId,
      status: "complete",
    });

    // 创建助手消息节点（初始为空）
    const assistantNode = createNode({
      role: "assistant",
      content: "",
      parentId: userNode.id,
      status: "generating",
    });

    // 建立父子关系
    userNode.childrenIds.push(assistantNode.id);

    // 添加到会话
    addNodeToSession(session, userNode);
    addNodeToSession(session, assistantNode);

    logger.info("创建消息对", {
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
    session: ChatSessionDetail,
    targetNodeId: string
  ): { assistantNode: ChatMessageNode; userNode: ChatMessageNode } | null => {
    if (!session.nodes) return null;
    const targetNode = session.nodes[targetNodeId];

    if (!targetNode) {
      logger.warn("创建重新生成分支失败：节点不存在", {
        sessionId: session.id,
        targetNodeId,
      });
      return null;
    }

    let userNode: ChatMessageNode;
    let parentNodeId: string;

    if (targetNode.role === "user") {
      // 从用户消息重新生成：用户消息本身就是父节点
      userNode = targetNode;
      parentNodeId = targetNode.id;

      logger.info("从用户消息创建重新生成分支", {
        sessionId: session.id,
        userNodeId: targetNode.id,
      });
    } else if (targetNode.role === "assistant") {
      // 从助手消息重新生成：使用其父节点（用户消息）
      if (!targetNode.parentId) {
        logger.warn("创建重新生成分支失败：助手消息没有父节点", {
          sessionId: session.id,
          targetNodeId,
        });
        return null;
      }

      const parentNode = session.nodes[targetNode.parentId];
      if (!parentNode) {
        logger.warn("创建重新生成分支失败：父节点不存在", {
          sessionId: session.id,
          parentNodeId: targetNode.parentId,
        });
        return null;
      }

      if (parentNode.role !== "user") {
        logger.warn("创建重新生成分支失败：父节点不是用户消息", {
          sessionId: session.id,
          parentNodeId: targetNode.parentId,
          role: parentNode.role,
        });
        return null;
      }

      userNode = parentNode;
      parentNodeId = parentNode.id;

      logger.info("从助手消息创建重新生成分支", {
        sessionId: session.id,
        targetNodeId,
        userNodeId: parentNode.id,
      });
    } else {
      logger.warn("创建重新生成分支失败：不支持的消息角色", {
        sessionId: session.id,
        targetNodeId,
        role: targetNode.role,
      });
      return null;
    }

    // 创建新的助手消息节点（作为用户消息的子节点）
    const newAssistantNode = createNode({
      role: "assistant",
      content: "",
      parentId: parentNodeId,
      status: "generating",
    });

    // 添加到会话
    addNodeToSession(session, newAssistantNode);

    logger.info("创建重新生成分支成功", {
      sessionId: session.id,
      targetNodeId,
      newNodeId: newAssistantNode.id,
      parentNodeId,
    });

    return { assistantNode: newAssistantNode, userNode };
  };

  /**
   * 创建续写分支
   * - Assistant 续写：创建一个新的助手节点作为兄弟，初始内容等于原内容
   * - User 续写：创建一个新的助手节点作为子节点，初始内容为空
   */
  const createContinuationBranch = (
    session: ChatSessionDetail,
    targetNodeId: string
  ): { assistantNode: ChatMessageNode; userNode: ChatMessageNode | null } | null => {
    if (!session.nodes) return null;
    const targetNode = session.nodes[targetNodeId];
    if (!targetNode) return null;

    if (targetNode.role === "assistant") {
      // Assistant 续写：创建一个新的助手节点作为兄弟
      const cleanedMetadata = cleanMetadataForClone(targetNode.metadata);

      const newAssistantNode = createNode({
        role: "assistant",
        content: targetNode.content, // 初始内容等于原内容
        parentId: targetNode.parentId,
        status: "generating",
        metadata: {
          ...cleanedMetadata,
          continuationPrefix: targetNode.content, // 记录原始前缀，用于后续拼接校验
          isContinuation: true,
        },
      });

      addNodeToSession(session, newAssistantNode);

      // 找到对应的用户节点（父节点）
      const userNode = targetNode.parentId ? session.nodes[targetNode.parentId] : null;

      logger.info("创建 Assistant 续写分支", {
        sessionId: session.id,
        targetNodeId,
        newNodeId: newAssistantNode.id,
      });

      return { assistantNode: newAssistantNode, userNode };
    } else if (targetNode.role === "user") {
      // User 续写：创建一个新的助手节点作为子节点
      const newAssistantNode = createNode({
        role: "assistant",
        content: "", // 初始内容为空（因为是角色接力）
        parentId: targetNode.id,
        status: "generating",
        metadata: {
          isContinuation: true,
        },
      });

      addNodeToSession(session, newAssistantNode);

      logger.info("创建 User 续写分支", {
        sessionId: session.id,
        targetNodeId,
        newNodeId: newAssistantNode.id,
      });

      return { assistantNode: newAssistantNode, userNode: targetNode };
    }

    return null;
  };

  /**
   * 更新活跃叶节点
   */
  const updateActiveLeaf = (session: ChatSessionDetail, nodeId: string): boolean => {
    if (!session.nodes) return false;
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
   * 软删除节点（标记为禁用）
   */
  const softDeleteNode = (session: ChatSessionDetail, nodeId: string): boolean => {
    if (!session.nodes) return false;
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("软删除节点失败：节点不存在", {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    node.isEnabled = false;

    logger.info("节点已软删除", {
      sessionId: session.id,
      nodeId,
      role: node.role,
    });

    return true;
  };
  /*
   * 硬删除节点（从树中移除，级联删除所有子节点）
   * @returns 返回一个包含成功状态和被删除节点完整信息的对象
   */
  const hardDeleteNode = (
    session: ChatSessionDetail,
    nodeId: string
  ): { success: boolean; deletedNodes: ChatMessageNode[] } => {
    logger.info("🗑️ [硬删除] 开始硬删除节点", { sessionId: session.id, nodeId });

    if (!session.nodes) return { success: false, deletedNodes: [] };
    const node = session.nodes[nodeId];
    if (!node) {
      logger.warn("🗑️ [硬删除] 失败：节点不存在", { sessionId: session.id, nodeId });
      return { success: false, deletedNodes: [] };
    }

    logger.info("🗑️ [硬删除] 找到目标节点", {
      sessionId: session.id,
      nodeId,
      role: node.role,
      content: node.content.substring(0, 50),
      hasChildren: node.childrenIds.length > 0,
      childrenCount: node.childrenIds.length,
    });

    if (node.id === session.rootNodeId) {
      logger.warn("🗑️ [硬删除] 失败：不能删除根节点", { sessionId: session.id, nodeId });
      return { success: false, deletedNodes: [] };
    }

    const isCompressionNode = !!node.metadata?.isCompressionNode;
    const nodesToDeleteIds = new Set<string>([nodeId]);

    // 如果是压缩节点，特殊处理：只删除自己，将子节点归还给父节点
    if (isCompressionNode) {
      logger.info("🗑️ [硬删除] 检测到压缩节点，将执行单点删除并归还子节点");

      const parentNode = node.parentId ? session.nodes[node.parentId] : null;
      if (parentNode) {
        // 1. 将压缩节点的子节点交给父节点
        const childrenToReturn = [...node.childrenIds];

        // 在父节点的 childrenIds 中，用子节点列表替换掉压缩节点
        const index = parentNode.childrenIds.indexOf(nodeId);
        if (index !== -1) {
          parentNode.childrenIds.splice(index, 1, ...childrenToReturn);
        }

        // 2. 更新子节点的父引用
        childrenToReturn.forEach((childId) => {
          const childNode = session.nodes?.[childId];
          if (childNode) {
            childNode.parentId = parentNode.id;
          }
        });

        logger.info("🗑️ [硬删除] 已将子节点归还给父节点", {
          parentId: parentNode.id,
          returnedCount: childrenToReturn.length,
        });
      }
    } else {
      // 普通节点：递归收集所有后代
      const collectDescendants = (id: string) => {
        if (!session.nodes) return;
        const currentNode = session.nodes[id];
        if (!currentNode) return;
        currentNode.childrenIds.forEach((childId) => {
          nodesToDeleteIds.add(childId);
          collectDescendants(childId);
        });
      };
      collectDescendants(nodeId);

      logger.info("🗑️ [硬删除] 收集到需要删除的节点", {
        totalCount: nodesToDeleteIds.size,
        nodeIds: Array.from(nodesToDeleteIds),
      });
    }

    const oldActiveLeafId = session.activeLeafId;
    if (session.activeLeafId && nodesToDeleteIds.has(session.activeLeafId)) {
      logger.info("🗑️ [硬删除] 当前活动叶节点将被删除，需要调整", { oldActiveLeafId });

      const siblings = (node.parentId && session.nodes) ? session.nodes[node.parentId]?.childrenIds || [] : [];

      // 找到被删除节点在兄弟列表中的索引
      const deletedIndex = siblings.indexOf(nodeId);
      let targetSiblingId: string | null = null;

      // 尝试选择相邻的兄弟节点（优先下一个，然后上一个）
      if (deletedIndex !== -1) {
        // 尝试下一个兄弟
        if (deletedIndex + 1 < siblings.length) {
          targetSiblingId = siblings[deletedIndex + 1];
        }
        // 如果下一个不存在，尝试上一个兄弟
        else if (deletedIndex - 1 >= 0) {
          targetSiblingId = siblings[deletedIndex - 1];
        }
      }

      // 如果找到了相邻兄弟节点
      if (targetSiblingId && session.nodes?.[targetSiblingId]) {
        const findDeepestLeaf = (n: ChatMessageNode): string => {
          if (n.childrenIds.length === 0) return n.id;
          const lastChildId = n.childrenIds[n.childrenIds.length - 1];
          const lastChild = session.nodes![lastChildId];
          return lastChild ? findDeepestLeaf(lastChild) : n.id;
        };
        session.activeLeafId = findDeepestLeaf(session.nodes[targetSiblingId]);
        if (session.activeLeafId) {
          BranchNavigator.updateSelectionMemory(session, session.activeLeafId as string);
        }
        logger.info("🗑️ [硬删除] 切换到相邻兄弟节点的最深叶子", {
          targetSiblingId,
          newActiveLeafId: session.activeLeafId,
        });
      } else {
        // 没有相邻兄弟节点，回退到父节点
        session.activeLeafId = node.parentId || session.rootNodeId;
        BranchNavigator.updateSelectionMemory(session, session.activeLeafId || "");
        logger.info("🗑️ [硬删除] 回退到父节点", { newActiveLeafId: session.activeLeafId });
      }
    }

    // 如果不是压缩节点（压缩节点已经在上面处理过父子关系了），或者是没有父节点的异常情况
    if (node.parentId && !isCompressionNode) {
      const parentNode = session.nodes[node.parentId];
      if (parentNode) {
        parentNode.childrenIds = parentNode.childrenIds.filter((id) => id !== nodeId);
      }
    }

    const deletedNodes: ChatMessageNode[] = [];
    nodesToDeleteIds.forEach((id) => {
      if (session.nodes?.[id]) {
        try {
          // 使用 toRaw 获取原始对象，避免 DataCloneError
          deletedNodes.push(structuredClone(toRaw(session.nodes[id])));
        } catch (error) {
          logger.warn("无法克隆节点进行备份，将跳过备份直接删除", { nodeId: id, error });
          // 即使深拷贝失败，也尝试保留一个浅拷贝或原始对象，以免返回空导致上层逻辑错误
          // 这里使用解构来创建一个新的普通对象，去除 Proxy
          deletedNodes.push({ ...toRaw(session.nodes[id]) });
        }
        delete session.nodes[id];
        }
      });
  
  
      logger.info("🗑️ [硬删除] 删除完成", {
      sessionId: session.id,
      nodeId,
      deletedCount: deletedNodes.length,
      newActiveLeafId: session.activeLeafId,
      activeLeafChanged: oldActiveLeafId !== session.activeLeafId,
    });

    return { success: true, deletedNodes };
  };

  /**
   * 验证节点关系的完整性
   */
  const validateNodeIntegrity = (
    session: ChatSessionDetail
  ): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];
    if (!session.nodes) {
      return { isValid: false, errors: ["会话数据尚未加载"] };
    }

    // 检查根节点
    if (session.rootNodeId && !session.nodes[session.rootNodeId]) {
      errors.push(`根节点不存在: ${session.rootNodeId}`);
    }

    // 检查活跃叶节点
    if (session.activeLeafId && !session.nodes[session.activeLeafId]) {
      errors.push(`活跃叶节点不存在: ${session.activeLeafId}`);
    }

    // 检查所有节点的父子关系
    Object.values(session.nodes).forEach((node) => {
      // 检查父节点引用
      if (node.parentId !== null && !session.nodes![node.parentId]) {
        errors.push(`节点 ${node.id} 的父节点不存在: ${node.parentId}`);
      }

      // 检查子节点引用
      node.childrenIds.forEach((childId) => {
        if (!session.nodes![childId]) {
          errors.push(`节点 ${node.id} 的子节点不存在: ${childId}`);
        } else {
          const child = session.nodes![childId];
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
      errorHandler.handle(new Error("Node integrity check failed"), {
        userMessage: "节点完整性验证失败",
        showToUser: false,
        context: {
          sessionId: session.id,
          errorCount: errors.length,
          errors,
        },
      });
    }

    return { isValid, errors };
  };

  /**
   * 获取从根节点到指定节点的路径
   */
  const getNodePath = (session: ChatSessionDetail, targetNodeId: string): ChatMessageNode[] => {
    const path: ChatMessageNode[] = [];
    if (!session.nodes) return path;
    let currentId: string | null = targetNodeId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn("获取节点路径失败：节点不存在", {
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
  const getAllDescendants = (session: ChatSessionDetail, nodeId: string): ChatMessageNode[] => {
    const descendants: ChatMessageNode[] = [];
    if (!session.nodes) return descendants;
    const node = session.nodes[nodeId];

    if (!node) return descendants;

    node.childrenIds.forEach((childId) => {
      const childNode = session.nodes![childId];
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
  const getAllAncestors = (session: ChatSessionDetail, nodeId: string): ChatMessageNode[] => {
    const ancestors: ChatMessageNode[] = [];
    if (!session.nodes) return ancestors;
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;

      if (node.parentId) {
        const parent: ChatMessageNode | undefined = session.nodes[node.parentId];
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

  /**
   * 判断两个节点的关系类型
   * @param session - 会话对象
   * @param nodeA - 节点A的ID
   * @param nodeB - 节点B的ID
   * @returns 节点B相对于节点A的关系
   */
  const getNodeRelationship = (
    session: ChatSessionDetail,
    nodeA: string,
    nodeB: string
  ): "ancestor" | "descendant" | "sibling" | "other" => {
    if (!session.nodes) return "other";
    const nodeAObj = session.nodes[nodeA];
    const nodeBObj = session.nodes[nodeB];

    if (!nodeAObj || !nodeBObj) return "other";

    // B 是 A 的祖先
    const ancestors = getAllAncestors(session, nodeA);
    if (ancestors.some((n) => n.id === nodeB)) {
      return "ancestor";
    }

    // B 是 A 的后代
    const descendants = getAllDescendants(session, nodeA);
    if (descendants.some((n) => n.id === nodeB)) {
      return "descendant";
    }

    // B 是 A 的兄弟
    if (nodeAObj.parentId === nodeBObj.parentId && nodeAObj.parentId !== null) {
      return "sibling";
    }

    return "other";
  };

  /**
   * 将某个节点的子节点嫁接到另一个节点
   * 用于非破坏性编辑时转移子树
   */
  const transferChildren = (session: ChatSessionDetail, fromNodeId: string, toNodeId: string): void => {
    if (!session.nodes) return;
    const fromNode = session.nodes[fromNodeId];
    const toNode = session.nodes[toNodeId];

    if (!fromNode || !toNode) {
      logger.warn("嫁接子节点失败：源节点或目标节点不存在", {
        sessionId: session.id,
        fromNodeId,
        toNodeId,
      });
      return;
    }

    // 转移子节点列表
    toNode.childrenIds = [...fromNode.childrenIds];

    // 更新每个子节点的 parentId
    toNode.childrenIds.forEach((childId) => {
      const child = session.nodes![childId];
      if (child) {
        child.parentId = toNode.id;
      }
    });

    // 清空原节点的子节点列表
    fromNode.childrenIds = [];

    logger.debug("子节点嫁接成功", {
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
  const reparentSubtree = (session: ChatSessionDetail, nodeId: string, newParentId: string): boolean => {
    logger.info("🌿 [嫁接] 开始嫁接子树", {
      sessionId: session.id,
      nodeId,
      newParentId,
    });

    if (!session.nodes) return false;

    // 验证节点存在性
    const node = session.nodes[nodeId];
    const newParent = session.nodes[newParentId];

    if (!node) {
      logger.warn("🌿 [嫁接] 失败：源节点不存在", {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    if (!newParent) {
      logger.warn("🌿 [嫁接] 失败：目标父节点不存在", {
        sessionId: session.id,
        newParentId,
      });
      return false;
    }

    // 不允许嫁接根节点
    if (node.id === session.rootNodeId) {
      logger.warn("🌿 [嫁接] 失败：不能嫁接根节点", {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    // 不允许嫁接到自己
    if (nodeId === newParentId) {
      logger.warn("🌿 [嫁接] 失败：不能将节点嫁接到自己", {
        sessionId: session.id,
        nodeId,
      });
      return false;
    }

    // 防止循环引用：检查新父节点是否是当前节点的子孙
    const descendants = getAllDescendants(session, nodeId);
    const descendantIds = new Set(descendants.map((d) => d.id));

    if (descendantIds.has(newParentId)) {
      logger.warn("🌿 [嫁接] 失败：目标父节点是源节点的子孙，会形成循环", {
        sessionId: session.id,
        nodeId,
        newParentId,
      });
      return false;
    }

    // 如果已经是该父节点的子节点，无需操作
    if (node.parentId === newParentId) {
      logger.info("🌿 [嫁接] 节点已经是目标父节点的子节点，无需操作", {
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
        oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== nodeId);
        logger.debug("🌿 [嫁接] 从旧父节点移除引用", {
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

    logger.info("🌿 [嫁接] 嫁接成功", {
      sessionId: session.id,
      nodeId,
      role: node.role,
      oldParentId,
      newParentId,
      newParentChildrenCount: newParent.childrenIds.length,
    });

    return true;
  };

  /**
   * 将单个节点重新挂载到另一个父节点下（不移动子树）
   * 它的子节点将被其原父节点"收养"
   */
  const reparentNode = (session: ChatSessionDetail, nodeId: string, newParentId: string): boolean => {
    logger.info("🌿 [单点移动] 开始移动单个节点", {
      sessionId: session.id,
      nodeId,
      newParentId,
    });

    if (!session.nodes) return false;

    const nodeToMove = session.nodes[nodeId];
    const newParent = session.nodes[newParentId];

    if (!nodeToMove || !newParent) {
      logger.warn("🌿 [单点移动] 失败：源节点或目标父节点不存在", { nodeId, newParentId });
      return false;
    }
    if (nodeToMove.id === session.rootNodeId) {
      logger.warn("🌿 [单点移动] 失败：不能移动根节点");
      return false;
    }
    if (nodeId === newParentId) {
      logger.warn("🌿 [单点移动] 失败：不能将节点移动到自己");
      return false;
    }
    if (nodeToMove.parentId === newParentId) {
      logger.info("🌿 [单点移动] 节点已经是目标父节点的子节点，无需操作");
      return true;
    }

    // 【关键】循环引用检查：不能将节点移动到自己的后代下
    const descendants = getAllDescendants(session, nodeId);
    if (descendants.some((d) => d.id === newParentId)) {
      logger.warn("🌿 [单点移动] 失败：不能将节点移动到自己的后代节点下，会造成循环引用", {
        nodeId,
        newParentId,
        descendantCount: descendants.length,
      });
      throw new Error("无法将节点移动到其自己的子孙节点下，这会导致循环引用。");
    }

    const oldParentId = nodeToMove.parentId;
    const oldParent = oldParentId ? session.nodes[oldParentId] : null;

    // 1. 从旧父节点断开连接
    if (oldParent) {
      oldParent.childrenIds = oldParent.childrenIds.filter((id) => id !== nodeId);

      // 2. 将此节点的子节点交给旧父节点"收养"
      if (nodeToMove.childrenIds.length > 0) {
        oldParent.childrenIds.push(...nodeToMove.childrenIds);
        nodeToMove.childrenIds.forEach((childId) => {
          const child = session.nodes![childId];
          if (child) {
            child.parentId = oldParent.id;
          }
        });
      }
    }

    // 3. 更新此节点的父节点
    nodeToMove.parentId = newParentId;

    // 4. 将此节点添加到新父节点的子节点列表
    if (!newParent.childrenIds.includes(nodeId)) {
      newParent.childrenIds.push(nodeId);
    }

    // 5. 清空此节点的子节点列表
    nodeToMove.childrenIds = [];

    logger.info("🌿 [单点移动] 成功", { nodeId, oldParentId, newParentId });

    return true;
  };

  /**
   * 从编辑创建新分支（保存编辑内容为新的兄弟节点）
   * 用于"保存到分支"功能，保留源节点的角色
   *
   * @param session - 当前会话
   * @param sourceNodeId - 源节点 ID（被编辑的节点）
   * @param newContent - 新的内容
   * @param attachments - 可选的附件
   * @returns 创建的新节点，如果失败返回 null
   */
  const createBranchFromEdit = (
    session: ChatSessionDetail,
    sourceNodeId: string,
    newContent: string,
    attachments?: Asset[]
  ): ChatMessageNode | null => {
    if (!session.nodes) return null;
    const sourceNode = session.nodes[sourceNodeId];
    if (!sourceNode) {
      logger.warn("从编辑创建分支失败：源节点不存在", {
        sessionId: session.id,
        sourceNodeId,
      });
      return null;
    }

    // 创建新节点，保留源节点的角色和元数据（如用户档案信息）
    // 需要清理执行相关的元数据
    const cleanedMetadata = cleanMetadataForClone(sourceNode.metadata);

    const newNode = createNode({
      role: sourceNode.role,
      content: newContent,
      parentId: sourceNode.parentId,
      status: "complete",
      attachments,
      metadata: cleanedMetadata,
    });

    // 添加到会话
    addNodeToSession(session, newNode);

    logger.info("从编辑创建新分支", {
      sessionId: session.id,
      sourceNodeId,
      sourceRole: sourceNode.role,
      newNodeId: newNode.id,
      parentId: sourceNode.parentId,
    });

    return newNode;
  };

  return {
    generateNodeId,
    createNode,
    addNodeToSession,
    disableNodeTree,
    createMessagePair,
    createRegenerateBranch,
    createContinuationBranch,
    createBranchFromEdit,
    updateActiveLeaf,
    softDeleteNode,
    hardDeleteNode,
    validateNodeIntegrity,
    getNodePath,
    getAllDescendants,
    getAllAncestors,
    getNodeRelationship,
    transferChildren,
    reparentSubtree,
    reparentNode,
  };
}
