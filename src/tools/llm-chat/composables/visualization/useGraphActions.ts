import { toRaw, type Ref } from "vue";
import type { ChatSessionDetail, HistoryDelta, ChatSessionIndex } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useBranchManager } from "../session/useBranchManager";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useAgentStore } from "../../stores/agentStore";
import {
  extractRelationChange,
  captureRelationChangesForGraft,
  captureRelationChangesForMove,
} from "../../utils/graphUtils";
import { recalculateNodeTokens } from "../../utils/chatTokenUtils";
import type { useSessionNodeHistory } from "../session/useSessionNodeHistory";
import { createModuleLogger } from "@/utils/logger";
import type { ChatMessageNode } from "../../types";

const logger = createModuleLogger("llm-chat/graph-actions");

type HistoryManager = ReturnType<typeof useSessionNodeHistory>;

/**
 * 图操作 Actions Composable
 *
 * 封装了图结构的修改、历史记录、持久化等组合操作。
 * 旨在减轻 Store 的负担，将复杂的业务流程逻辑分离。
 */
export function useGraphActions(
  currentSession: Ref<ChatSessionDetail | null>,
  currentSessionId: Ref<string | null>,
  historyManager: HistoryManager,
  sessionIndexMap?: Ref<Map<string, ChatSessionIndex>>, // 传入索引 Map 以便更新
) {
  const branchManager = useBranchManager();
  const sessionManager = useSessionManager();

  /**
   * 全量更新消息节点数据（高级功能）
   * 仅允许更新非结构性字段，防止破坏树结构
   */
  async function updateNodeData(nodeId: string, updates: Partial<ChatMessageNode>): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    if (nodeId.startsWith("preset-")) {
      logger.warn("暂不支持直接编辑预设消息的数据", { nodeId });
      return;
    }

    const node = session.nodes ? session.nodes[nodeId] : undefined;
    if (!node) return;

    // 1. 创建快照
    const previousNodeState = JSON.parse(JSON.stringify(toRaw(node)));

    // 2. 应用更新，但保护结构性字段
    // 禁止更新的字段：id, parentId, childrenIds
    const { id: _, parentId: __, childrenIds: ___, ...safeUpdates } = updates;

    Object.assign(node, safeUpdates);

    // 确保有 updatedAt
    if (!safeUpdates.updatedAt) {
      node.updatedAt = new Date().toISOString();
    }

    // 3. 记录历史
    const finalNodeState = JSON.parse(JSON.stringify(toRaw(node)));
    const delta: HistoryDelta = {
      type: "update",
      payload: { nodeId, previousNodeState, finalNodeState },
    };
    // 使用自定义的操作类型名称，或者复用 NODE_EDIT
    historyManager.recordHistory("NODE_DATA_UPDATE", [delta], { targetNodeId: nodeId });

    // 4. 重新计算 token (因为 content 或 metadata 可能变了)
    if (sessionIndexMap?.value) {
      const index = sessionIndexMap.value.get(session.id);
      if (index) {
        await recalculateNodeTokens(index, session, nodeId);
      }
    }

    // 5. 持久化
    if (sessionIndexMap?.value) {
      sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
      const index = sessionIndexMap.value.get(session.id);
      if (index) {
        sessionManager.persistSession(index, session, currentSessionId.value);
      }
    }

    logger.info("已全量更新节点数据", { nodeId });
  }

  /**
   * 编辑消息
   */
  async function editMessage(nodeId: string, newContent: string, attachments?: Asset[]): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    if (nodeId.startsWith("preset-")) {
      const agentStore = useAgentStore();
      if (!agentStore.currentAgentId) return;
      agentStore.updatePresetMessage(agentStore.currentAgentId, nodeId, newContent);
      return;
    }

    // 使用 JSON 序列化来创建快照，避免 structuredClone 处理 Vue Proxy 或特殊对象时出错
    const previousNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes![nodeId])));
    const success = branchManager.editMessage(session, nodeId, newContent, attachments);

    if (success) {
      // 手动更新时间戳
      session.nodes![nodeId].updatedAt = new Date().toISOString();
      const finalNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes![nodeId])));
      const delta: HistoryDelta = {
        type: "update",
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory("NODE_EDIT", [delta], { targetNodeId: nodeId });

      if (sessionIndexMap?.value) {
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          await recalculateNodeTokens(index, session, nodeId);
        }
      }

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
        const relationChange = extractRelationChange(session, node, "delete");
        return {
          type: "delete",
          payload: { deletedNode: node, relationChange },
        };
      });

      historyManager.recordHistory("NODES_DELETE", deltas, {
        targetNodeId: nodeId,
        affectedNodeCount: deletedNodes.length,
      });

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
          type: "active_leaf_change",
          payload: { oldLeafId: oldLeafId || "", newLeafId: newLeafId || "" },
        };
        historyManager.recordHistory("ACTIVE_NODE_SWITCH", [delta], {
          sourceNodeId: oldLeafId,
          targetNodeId: newLeafId,
        });
      }

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
      const newNode = session.nodes ? session.nodes[newNodeId] : undefined;
      if (newNode) {
        const relationChange = extractRelationChange(session, newNode, "create");
        const delta: HistoryDelta = {
          type: "create",
          payload: { node: newNode, relationChange },
        };
        historyManager.recordHistory("BRANCH_CREATE", [delta], { targetNodeId: newNodeId });
      }

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
    }
  }

  /**
   * 切换节点启用状态
   */
  function toggleNodeEnabled(nodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    if (nodeId.startsWith("preset-")) {
      const agentStore = useAgentStore();
      if (!agentStore.currentAgentId) return;
      agentStore.togglePresetMessageEnabled(agentStore.currentAgentId, nodeId);
      return;
    }

    const previousNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes![nodeId])));
    const success = branchManager.toggleNodeEnabled(session, nodeId);

    if (success) {
      const finalNodeState = JSON.parse(JSON.stringify(toRaw(session.nodes![nodeId])));
      const delta: HistoryDelta = {
        type: "update",
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory("NODE_TOGGLE_ENABLED", [delta], { targetNodeId: nodeId });

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
        type: "relation",
        payload: { changes: relationChanges },
      };
      historyManager.recordHistory("BRANCH_GRAFT", [delta], {
        targetNodeId: nodeId,
        destinationNodeId: newParentId,
      });

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
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
        type: "relation",
        payload: { changes: relationChanges },
      };
      historyManager.recordHistory("NODE_MOVE", [delta], {
        targetNodeId: nodeId,
        destinationNodeId: newParentId,
      });

      if (sessionIndexMap?.value) {
        sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
        sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
        const index = sessionIndexMap.value.get(session.id);
        if (index) {
          sessionManager.persistSession(index, session, currentSessionId.value);
        }
      }
    }
  }

  /**
   * 更新消息翻译
   */
  function updateMessageTranslation(nodeId: string, translation: any): void {
    const session = currentSession.value;
    if (!session) return;

    const node = session.nodes ? session.nodes[nodeId] : undefined;
    if (!node) return;

    // 更新 metadata
    if (!node.metadata) {
      node.metadata = {};
    }

    // 使用 JSON 序列化避免引用问题
    node.metadata.translation = JSON.parse(JSON.stringify(translation));

    // 持久化
    if (sessionIndexMap?.value) {
      sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
      const index = sessionIndexMap.value.get(session.id);
      if (index) {
        sessionManager.persistSession(index, session, currentSessionId.value);
      }
    }
  }

  /**
   * 从编辑内容创建新分支（保存编辑到分支）
   * 本质上是 createBranch + editMessage 的组合
   */
  async function createBranchFromEdit(sourceNodeId: string, newContent: string, attachments?: Asset[]): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    const nodeManager = useNodeManager();

    // 使用 nodeManager 创建新分支节点（保留源节点角色，附件已包含在内）
    const newNode = nodeManager.createBranchFromEdit(session, sourceNodeId, newContent, attachments);

    if (!newNode) {
      return;
    }

    // 记录历史
    const relationChange = extractRelationChange(session, newNode, "create");
    const delta: HistoryDelta = {
      type: "create",
      payload: { node: newNode, relationChange },
    };
    historyManager.recordHistory("BRANCH_CREATE_FROM_EDIT", [delta], {
      sourceNodeId,
      targetNodeId: newNode.id,
    });

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, newNode.id);

    // 重新计算 token
    if (sessionIndexMap?.value) {
      const index = sessionIndexMap.value.get(session.id);
      if (index) {
        await recalculateNodeTokens(index, session, newNode.id);
      }
    }

    // 持久化
    if (sessionIndexMap?.value) {
      sessionManager.updateMessageCount(session.id, session.nodes!, sessionIndexMap.value);
      sessionManager.updateSessionDisplayAgent(session.id, session, sessionIndexMap.value);
      const index = sessionIndexMap.value.get(session.id);
      if (index) {
        sessionManager.persistSession(index, session, currentSessionId.value);
      }
    }

    logger.info("🌿 从编辑创建新分支", {
      sessionId: session.id,
      sourceNodeId,
      newNodeId: newNode.id,
      role: newNode.role,
    });
  }

  return {
    editMessage,
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    createBranch,
    createBranchFromEdit,
    toggleNodeEnabled,
    graftBranch,
    moveNode,
    updateMessageTranslation,
    updateNodeData,
  };
}
