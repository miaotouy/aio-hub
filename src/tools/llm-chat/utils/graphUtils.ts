import type { ChatSession, ChatMessageNode, NodeRelationChange } from "../types";

/**
 * 提取节点关系变更（用于历史记录）
 * 
 * 计算节点在创建或删除操作前后的父子关系变化
 */
export function extractRelationChange(
  session: ChatSession,
  node: ChatMessageNode,
  operation: "delete" | "create"
): NodeRelationChange {
  const oldParentId = operation === 'delete' ? node.parentId : null;
  const newParentId = operation === 'create' ? node.parentId : null;
  const affectedParents: NodeRelationChange["affectedParents"] = {};

  if (oldParentId) {
    const oldParent = session.nodes[oldParentId];
    if (oldParent) {
      affectedParents[oldParentId] = {
        oldChildren: [...oldParent.childrenIds],
        newChildren: oldParent.childrenIds.filter((id) => id !== node.id),
      };
    }
  }

  if (newParentId) {
    const newParent = session.nodes[newParentId];
    if (newParent) {
      affectedParents[newParentId] = {
        oldChildren: [...newParent.childrenIds],
        newChildren: [...newParent.childrenIds, node.id],
      };
    }
  }

  return {
    nodeId: node.id,
    oldParentId,
    newParentId,
    affectedParents,
  };
}

/**
 * 捕获嫁接操作的关系变更
 */
export function captureRelationChangesForGraft(
  session: ChatSession,
  nodeId: string,
  newParentId: string
): NodeRelationChange[] {
  const node = session.nodes[nodeId];
  if (!node) return [];
  const oldParentId = node.parentId;
  const affectedParents: NodeRelationChange["affectedParents"] = {};

  if (oldParentId) {
    const oldParent = session.nodes[oldParentId];
    if (oldParent) {
      affectedParents[oldParentId] = {
        oldChildren: [...oldParent.childrenIds],
        newChildren: oldParent.childrenIds.filter((id) => id !== nodeId),
      };
    }
  }

  const newParent = session.nodes[newParentId];
  if (newParent) {
    affectedParents[newParentId] = {
      oldChildren: [...newParent.childrenIds],
      newChildren: [...newParent.childrenIds, nodeId],
    };
  }

  return [{
    nodeId,
    oldParentId,
    newParentId,
    affectedParents,
  }];
}

/**
 * 捕获移动操作的关系变更（目前逻辑与嫁接相同）
 */
export function captureRelationChangesForMove(
  session: ChatSession,
  nodeId: string,
  newParentId: string
): NodeRelationChange[] {
  return captureRelationChangesForGraft(session, nodeId, newParentId);
}