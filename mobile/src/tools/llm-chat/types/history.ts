import type { ChatMessageNode } from './message';

// 撤销/重做历史记录相关类型

/**
 * 定义可被记录的操作类型
 * @see UNDO_REDO_DESIGN.md
 */
export type HistoryActionTag =
  | "INITIAL_STATE" // 初始状态（空历史）
  | "NODE_EDIT" // 编辑节点内容/附件
  | "NODE_DATA_UPDATE" // 全量更新节点数据（高级）
  | "NODE_DELETE" // 删除单个节点
  | "NODES_DELETE" // 批量删除（如删除分支）
  | "NODE_TOGGLE_ENABLED" // 切换节点启用状态
  | "NODE_MOVE" // 移动单个节点
  | "BRANCH_GRAFT" // 嫁接整个分支
  | "BRANCH_CREATE" // 复制分支
  | "BRANCH_CREATE_FROM_EDIT" // 从编辑创建分支（保存编辑到新分支）
  | "ACTIVE_NODE_SWITCH"; // 切换活动节点

/**
 * 节点关系变化的记录
 * 用于精确恢复 parentId 和 childrenIds 的变化
 */
export interface NodeRelationChange {
  nodeId: string;
  oldParentId: string | null;
  newParentId: string | null;
  // 记录父节点的 childrenIds 变化
  affectedParents?: {
    [parentId: string]: {
      oldChildren: string[];
      newChildren: string[];
    };
  };
}

/**
 * 增量变化（Delta）的类型
 */
export type HistoryDelta =
  | {
    type: "create";
    payload: {
      node: ChatMessageNode;
      relationChange: NodeRelationChange;
    };
  }
  | {
    type: "delete";
    payload: {
      deletedNode: ChatMessageNode;
      relationChange: NodeRelationChange;
    };
  }
  | {
    type: "update";
    payload: {
      nodeId: string;
      previousNodeState: ChatMessageNode;
      finalNodeState: ChatMessageNode;
    };
  }
  | {
    type: "relation";
    payload: {
      changes: NodeRelationChange[];
    };
  }
  | {
    type: "active_leaf_change";
    payload: {
      oldLeafId: string;
      newLeafId: string;
    };
  };

/**
 * 历史上下文（用于生成摘要或调试）
 */
export interface HistoryContext {
  targetNodeId?: string;
  sourceNodeId?: string;
  destinationNodeId?: string;
  affectedNodeCount?: number;
}

/**
 * 历史记录条目（使用可辨识联合类型）
 */
export type HistoryEntry = {
  actionTag: HistoryActionTag;
  timestamp: number;
  context: HistoryContext;
} & (
    | {
      isSnapshot: true;
      snapshot: Record<string, ChatMessageNode>;
    }
    | {
      isSnapshot: false;
      deltas: HistoryDelta[];
    }
  );