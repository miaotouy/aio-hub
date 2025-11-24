import { toRaw, type Ref } from 'vue';
import type { ChatSession, HistoryDelta } from '../types';
import type { Asset } from '@/types/asset-management';
import { useBranchManager } from './useBranchManager';
import { useSessionManager } from './useSessionManager';
import { useAgentStore } from '../agentStore';
import { 
  extractRelationChange, 
  captureRelationChangesForGraft,
  captureRelationChangesForMove
} from '../utils/graphUtils';
import { recalculateNodeTokens } from '../utils/chatTokenUtils';
import type { useSessionNodeHistory } from './useSessionNodeHistory';

type HistoryManager = ReturnType<typeof useSessionNodeHistory>;

/**
 * 图操作 Actions Composable
 * 
 * 封装了图结构的修改、历史记录、持久化等组合操作。
 * 旨在减轻 Store 的负担，将复杂的业务流程逻辑分离。
 */
export function useGraphActions(
  currentSession: Ref<ChatSession | null>,
  currentSessionId: Ref<string | null>,
  historyManager: HistoryManager
) {
  const branchManager = useBranchManager();
  const sessionManager = useSessionManager();

  /**
   * 编辑消息
   */
  async function editMessage(nodeId: string, newContent: string, attachments?: Asset[]): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    if (nodeId.startsWith('preset-')) {
      const agentStore = useAgentStore();
      if (!agentStore.currentAgentId) return;
      agentStore.updatePresetMessage(agentStore.currentAgentId, nodeId, newContent);
      return;
    }

    // 使用 JSON 序列化来创建快照，避免 structuredClone 处理 Vue Proxy 或特殊对象时出错
    const previousNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes[nodeId])));
    const success = branchManager.editMessage(session, nodeId, newContent, attachments);

    if (success) {
      const finalNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes[nodeId])));
      const delta: HistoryDelta = {
        type: 'update',
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory('NODE_EDIT', [delta], { targetNodeId: nodeId });

      await recalculateNodeTokens(session, nodeId);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 删除消息节点
   */
  function deleteMessage(nodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const { success, deletedNodes } = branchManager.deleteMessage(session, nodeId);

    if (success && deletedNodes.length > 0) {
      const deltas: HistoryDelta[] = deletedNodes.map((node) => {
        const relationChange = extractRelationChange(session, node, 'delete');
        return {
          type: 'delete',
          payload: { deletedNode: node, relationChange },
        };
      });

      historyManager.recordHistory('NODES_DELETE', deltas, {
        targetNodeId: nodeId,
        affectedNodeCount: deletedNodes.length,
      });

      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 切换到指定分支
   */
  function switchBranch(nodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const oldLeafId = session.activeLeafId;
    const success = branchManager.switchBranch(session, nodeId);

    if (success) {
      const newLeafId = session.activeLeafId;

      // 只有当活动节点真正改变时才记录历史
      if (oldLeafId !== newLeafId) {
        const delta: HistoryDelta = {
          type: 'active_leaf_change',
          payload: { oldLeafId, newLeafId },
        };
        historyManager.recordHistory('ACTIVE_NODE_SWITCH', [delta], {
          sourceNodeId: oldLeafId,
          targetNodeId: newLeafId,
        });
      }

      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 切换到兄弟分支
   */
  function switchToSiblingBranch(nodeId: string, direction: "prev" | "next"): void {
    const session = currentSession.value;
    if (!session) return;

    const newLeafId = branchManager.switchToSiblingBranch(session, nodeId, direction);

    if (newLeafId !== session.activeLeafId) {
      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 创建分支
   */
  function createBranch(sourceNodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const newNodeId = branchManager.createBranch(session, sourceNodeId);

    if (newNodeId) {
      const newNode = session.nodes[newNodeId];
      if (newNode) {
        const relationChange = extractRelationChange(session, newNode, 'create');
        const delta: HistoryDelta = {
          type: 'create',
          payload: { node: newNode, relationChange },
        };
        historyManager.recordHistory('BRANCH_CREATE', [delta], { targetNodeId: newNodeId });
      }

      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 切换节点启用状态
   */
  function toggleNodeEnabled(nodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    if (nodeId.startsWith('preset-')) {
      const agentStore = useAgentStore();
      if (!agentStore.currentAgentId) return;
      agentStore.togglePresetMessageEnabled(agentStore.currentAgentId, nodeId);
      return;
    }

    const previousNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes[nodeId])));
    const success = branchManager.toggleNodeEnabled(session, nodeId);

    if (success) {
      const finalNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes[nodeId])));
      const delta: HistoryDelta = {
        type: 'update',
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory('NODE_TOGGLE_ENABLED', [delta], { targetNodeId: nodeId });

      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 嫁接分支
   */
  function graftBranch(nodeId: string, newParentId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const relationChanges = captureRelationChangesForGraft(session, nodeId, newParentId);
    const success = branchManager.graftBranch(session, nodeId, newParentId);

    if (success) {
      const delta: HistoryDelta = {
        type: 'relation',
        payload: { changes: relationChanges },
      };
      historyManager.recordHistory('BRANCH_GRAFT', [delta], {
        targetNodeId: nodeId,
        destinationNodeId: newParentId,
      });

      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 移动单个节点
   */
  function moveNode(nodeId: string, newParentId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const relationChanges = captureRelationChangesForMove(session, nodeId, newParentId);
    const success = branchManager.moveNode(session, nodeId, newParentId);

    if (success) {
      const delta: HistoryDelta = {
        type: 'relation',
        payload: { changes: relationChanges },
      };
      historyManager.recordHistory('NODE_MOVE', [delta], {
        targetNodeId: nodeId,
        destinationNodeId: newParentId,
      });

      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  return {
    editMessage,
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    createBranch,
    toggleNodeEnabled,
    graftBranch,
    moveNode,
  };
}