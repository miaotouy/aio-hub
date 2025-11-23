import { computed, type Ref } from 'vue';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import type {
  ChatSession,
  HistoryEntry,
  HistoryDelta,
  HistoryActionTag,
  HistoryContext,
  NodeRelationChange,
  ChatMessageNode,
} from '../types';

const logger = createModuleLogger('useSessionNodeHistory');
const errorHandler = createModuleErrorHandler('useSessionNodeHistory');

/**
 * 创建一个节点的纯净克隆，只包含 ChatMessageNode 中定义的字段。
 * 这可以防止因 Vue Flow 或其他库在运行时向节点对象添加不可克隆的属性
 * (如 DOM 引用、循环引用) 而导致的 structuredClone 失败。
 * 使用 JSON 序列化和反序列化是一种简单而有效的方法来剥离这些附加属性。
 * @param nodes - 要克隆的节点记录。
 * @returns 节点的纯净深度克隆。
 */
function cloneNodes(nodes: Record<string, ChatMessageNode>): Record<string, ChatMessageNode> {
  try {
    return JSON.parse(JSON.stringify(nodes));
  } catch (error) {
    errorHandler.error(error as Error, "克隆节点失败，可能存在循环引用或其他不可序列化的数据", {
      showToUser: false,
      context: { nodeCount: Object.keys(nodes).length },
    });
    // 作为备用方案，返回一个空对象，防止整个应用崩溃
    return {};
  }
}

// 来自设计文档的常量
const MAX_HISTORY_LENGTH = 50;
const SNAPSHOT_COMPLEXITY_THRESHOLD = 30;
const SNAPSHOT_INTERVAL = 15;

/**
 * 管理聊天会话节点操作的撤销/重做历史记录。
 * @param sessionRef 对当前 ChatSession 的 Ref 引用。
 * @see UNDO_REDO_DESIGN.md
 */
export function useSessionNodeHistory(sessionRef: Ref<ChatSession | null>) {
  /**
   * 应用关系变化。
   * @param session - 当前会话。
   * @param change - 节点关系变化对象。
   * @param direction - 'forward' 表示重做, 'backward' 表示撤销。
   */
  function applyRelationChange(
    session: ChatSession,
    change: NodeRelationChange,
    direction: 'forward' | 'backward'
  ): void {
    const node = session.nodes[change.nodeId];
    if (!node) {
      logger.warn('在应用关系变更时未找到节点', { nodeId: change.nodeId });
      return;
    }

    // 恢复节点的 parentId
    if (direction === 'forward') {
      node.parentId = change.newParentId;
    } else {
      node.parentId = change.oldParentId;
    }

    // 恢复受影响父节点的 childrenIds
    if (change.affectedParents) {
      for (const [parentId, childrenChange] of Object.entries(change.affectedParents)) {
        const parentNode = session.nodes[parentId];
        if (!parentNode) {
          logger.warn('在关系变更期间未找到父节点', { parentId });
          continue;
        }

        if (direction === 'forward') {
          parentNode.childrenIds = [...childrenChange.newChildren];
        } else {
          parentNode.childrenIds = [...childrenChange.oldChildren];
        }
      }
    }
  }

  /**
   * 应用单个增量（Delta）。
   * @param session - 当前会话。
   * @param delta - 增量历史记录对象。
   * @param direction - 'forward' 表示重做, 'backward' 表示撤销。
   */
  function applyDelta(session: ChatSession, delta: HistoryDelta, direction: 'forward' | 'backward'): void {
    if (delta.type === 'create') {
      if (direction === 'forward') {
        session.nodes[delta.payload.node.id] = cloneNodes({ [delta.payload.node.id]: delta.payload.node })[delta.payload.node.id];
        applyRelationChange(session, delta.payload.relationChange, 'forward');
      } else {
        applyRelationChange(session, delta.payload.relationChange, 'backward');
        delete session.nodes[delta.payload.node.id];
      }
    } else if (delta.type === 'delete') {
      if (direction === 'forward') {
        applyRelationChange(session, delta.payload.relationChange, 'forward');
        delete session.nodes[delta.payload.deletedNode.id];
      } else {
        session.nodes[delta.payload.deletedNode.id] = cloneNodes({ [delta.payload.deletedNode.id]: delta.payload.deletedNode })[delta.payload.deletedNode.id];
        applyRelationChange(session, delta.payload.relationChange, 'backward');
      }
    } else if (delta.type === 'update') {
      const node = session.nodes[delta.payload.nodeId];
      if (!node) {
        logger.warn('未找到用于更新增量的节点', { nodeId: delta.payload.nodeId });
        return;
      }
      if (direction === 'forward') {
        session.nodes[delta.payload.nodeId] = cloneNodes({ [delta.payload.nodeId]: delta.payload.finalNodeState })[delta.payload.nodeId];
      } else {
        session.nodes[delta.payload.nodeId] = cloneNodes({ [delta.payload.nodeId]: delta.payload.previousNodeState })[delta.payload.nodeId];
      }
    } else if (delta.type === 'relation') {
      for (const change of delta.payload.changes) {
        applyRelationChange(session, change, direction);
      }
    } else if (delta.type === 'active_leaf_change') {
      // 切换活动节点
      if (direction === 'forward') {
        session.activeLeafId = delta.payload.newLeafId;
      } else {
        session.activeLeafId = delta.payload.oldLeafId;
      }
    } else {
      logger.warn('未知的 delta 类型', { deltaType: (delta as any).type });
    }
  }

  /**
   * 清空并重置历史记录。
   */
  function clearHistory(): void {
    const session = sessionRef.value;
    if (!session) return;

    const initialEntry: HistoryEntry = {
      isSnapshot: true,
      snapshot: cloneNodes(session.nodes),
      actionTag: 'INITIAL_STATE',
      timestamp: Date.now(),
      context: {},
    };

    session.history = [initialEntry];
    session.historyIndex = 0;

    logger.info('历史堆栈已清空并重置。');
  }

  /**
   * 跳转到指定的历史状态。
   * @param targetIndex - 目标历史记录的索引。
   */
  function jumpToState(targetIndex: number): void {
    const session = sessionRef.value;
    if (!session || !session.history || targetIndex < 0 || targetIndex >= session.history.length) {
      logger.warn('无效的历史索引，无法跳转状态。', {
        targetIndex,
        historyLength: session?.history?.length,
      });
      return;
    }

    let snapshotIndex = -1;
    for (let i = targetIndex; i >= 0; i--) {
      if (session.history[i].isSnapshot) {
        snapshotIndex = i;
        break;
      }
    }

    if (snapshotIndex < 0) {
      errorHandler.error(new Error('Anchor snapshot not found'), '找不到锚点快照，历史数据可能已损坏。', {
        showToUser: false,
        context: { targetIndex },
      });
      clearHistory();
      return;
    }

    const snapshotEntry = session.history[snapshotIndex] as HistoryEntry & { isSnapshot: true };
    session.nodes = cloneNodes(snapshotEntry.snapshot);

    for (let i = snapshotIndex + 1; i <= targetIndex; i++) {
      const entry = session.history[i];
      if (entry.isSnapshot) {
        session.nodes = cloneNodes(entry.snapshot);
      } else {
        for (const delta of entry.deltas) {
          applyDelta(session, delta, 'forward');
        }
      }
    }

    session.historyIndex = targetIndex;

    logger.info('成功跳转到状态', {
      targetIndex,
      snapshotIndex,
      currentNodeCount: Object.keys(session.nodes).length,
    });
  }

  /**
   * 记录一个新的历史条目。
   * @param actionTag - 操作类型标签。
   * @param deltas - 本次操作产生的增量变化数组。
   * @param context - 历史上下文信息。
   */
  function recordHistory(
    actionTag: HistoryActionTag,
    deltas: HistoryDelta[],
    context: HistoryContext = {}
  ): void {
    const session = sessionRef.value;
    if (!session) return;

    if (session.history === undefined || session.historyIndex === undefined) {
      clearHistory();
    }

    if (session.historyIndex! < session.history!.length - 1) {
      session.history = session.history!.slice(0, session.historyIndex! + 1);
    }

    let affectedNodesCount = 0;
    let deltasSinceLastSnapshot = 0;

    for (let i = session.historyIndex!; i >= 0; i--) {
      const entry = session.history![i];
      if (entry.isSnapshot) break;

      deltasSinceLastSnapshot++;
      if (!entry.isSnapshot) {
        affectedNodesCount += entry.deltas.reduce((count, delta) => {
          if (delta.type === 'create' || delta.type === 'delete') return count + 1;
          if (delta.type === 'update') return count + 1;
          if (delta.type === 'relation') return count + delta.payload.changes.length;
          return count;
        }, 0);
      }
    }

    const currentAffectedCount = deltas.reduce((count, delta) => {
      if (delta.type === 'create' || delta.type === 'delete') return count + 1;
      if (delta.type === 'update') return count + 1;
      if (delta.type === 'relation') return count + delta.payload.changes.length;
      return count;
    }, 0);

    affectedNodesCount += currentAffectedCount;

    const shouldCreateSnapshot =
      session.history!.length === 0 ||
      affectedNodesCount > SNAPSHOT_COMPLEXITY_THRESHOLD ||
      deltasSinceLastSnapshot >= SNAPSHOT_INTERVAL;

    const newEntry: HistoryEntry = shouldCreateSnapshot
      ? {
        isSnapshot: true,
        snapshot: cloneNodes(session.nodes),
        actionTag,
        timestamp: Date.now(),
        context: { ...context, affectedNodeCount: currentAffectedCount },
      }
      : {
        isSnapshot: false,
        deltas,
        actionTag,
        timestamp: Date.now(),
        context: { ...context, affectedNodeCount: currentAffectedCount },
      };

    session.history!.push(newEntry);

    if (session.history!.length > MAX_HISTORY_LENGTH) {
      let removedCount = 0;
      while (session.history!.length > MAX_HISTORY_LENGTH && removedCount < 5) {
        const firstEntry = session.history![0];
        if (firstEntry.isSnapshot && session.history!.length > 1) {
          session.history!.shift();
          removedCount++;
        } else if (!firstEntry.isSnapshot) {
          session.history!.shift();
          removedCount++;
        } else {
          break;
        }
      }
    }

    session.historyIndex = session.history!.length - 1;
  }

  /**
   * 撤销上一步操作。
   */
  function undo(): void {
    const session = sessionRef.value;
    if (!session || !session.historyIndex || session.historyIndex <= 0) {
      return;
    }
    jumpToState(session.historyIndex - 1);
  }

  /**
   * 重做上一步被撤销的操作。
   */
  function redo(): void {
    const session = sessionRef.value;
    if (
      !session ||
      session.historyIndex === undefined ||
      !session.history ||
      session.historyIndex >= session.history.length - 1
    ) {
      return;
    }
    jumpToState(session.historyIndex + 1);
  }

  const canUndo = computed(() => (sessionRef.value?.historyIndex ?? 0) > 0);
  const canRedo = computed(
    () => (sessionRef.value?.historyIndex ?? -1) < (sessionRef.value?.history?.length ?? 0) - 1
  );
  const historyStack = computed(() => sessionRef.value?.history ?? []);

  return {
    undo,
    redo,
    recordHistory,
    clearHistory,
    jumpToState,
    canUndo,
    canRedo,
    historyStack,
  };
}