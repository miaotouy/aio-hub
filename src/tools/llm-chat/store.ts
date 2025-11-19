/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的精简版本：专注于状态管理，复杂逻辑委托给 composables
 * 
 * 现已重构为 Setup Store 以更好地集成 useSessionNodeHistory Composable。
 * @see UNDO_REDO_DESIGN.md
 */

import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import { useSessionManager } from "./composables/useSessionManager";
import { useChatHandler } from "./composables/useChatHandler";
import { useBranchManager } from "./composables/useBranchManager";
import { BranchNavigator } from "./utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import { useSessionNodeHistory } from "./composables/useSessionNodeHistory";
import type { ChatSession, ChatMessageNode, LlmParameters, HistoryDelta, NodeRelationChange } from "./types";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@utils/logger";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  // ==================== State ====================
  const sessions = ref<ChatSession[]>([]);
  const currentSessionId = ref<string | null>(null);
  const parameters = ref<LlmParameters>({
    temperature: 0.7,
    maxTokens: 4096,
  });
  const isSending = ref(false);
  const abortControllers = ref(new Map<string, AbortController>());
  const generatingNodes = ref(new Set<string>());

  // ==================== Getters ====================
  const currentSession = computed((): ChatSession | null => {
    if (!currentSessionId.value) return null;
    return sessions.value.find((s) => s.id === currentSessionId.value) || null;
  });

  const currentActivePath = computed((): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    const path: ChatMessageNode[] = [];
    let currentId: string | null = session.activeLeafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) {
        logger.warn("活动路径中断：节点不存在", { sessionId: session.id, nodeId: currentId });
        break;
      }

      path.unshift(node);
      currentId = node.parentId;
    }

    return path.filter((node) => node.id !== session.rootNodeId);
  });

  const currentActivePathWithPresets = computed((): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    const agentStore = useAgentStore();
    if (!agentStore.currentAgentId) {
      return currentActivePath.value;
    }

    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    if (!agent || !agent.presetMessages || !agent.displayPresetCount || agent.displayPresetCount <= 0) {
      return currentActivePath.value;
    }

    const chatHistoryIndex = agent.presetMessages.findIndex(
      (msg: ChatMessageNode) => msg.type === 'chat_history'
    );

    if (chatHistoryIndex === -1) {
      return currentActivePath.value;
    }

    const presetsBeforePlaceholder = agent.presetMessages
      .slice(0, chatHistoryIndex)
      .filter((msg: ChatMessageNode) =>
        (msg.role === 'user' || msg.role === 'assistant') &&
        msg.isEnabled !== false
      );

    const displayPresets = presetsBeforePlaceholder.slice(-agent.displayPresetCount);
    const markedPresets = displayPresets.map((msg: ChatMessageNode) => ({
      ...msg,
      metadata: {
        ...msg.metadata,
        isPresetDisplay: true,
        agentId: agent.id,
        agentName: agent.name,
        agentIcon: agent.icon,
        profileId: agent.profileId,
        modelId: agent.modelId,
      },
    }));

    return [...markedPresets, ...currentActivePath.value];
  });

  const llmContext = computed((): Array<{ role: "user" | "assistant"; content: string | LlmMessageContent[] }> => {
    return currentActivePath.value
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== "system")
      .filter((node) => node.role === "user" || node.role === "assistant")
      .map((node) => ({
        role: node.role as "user" | "assistant",
        content: node.content,
      }));
  });

  const getSiblings = (nodeId: string): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    if (nodeId.startsWith('preset-')) {
      logger.warn('尝试获取预设消息的兄弟节点', { nodeId });
      return [];
    }

    const { getSiblings } = useBranchManager();
    return getSiblings(session, nodeId);
  };

  const isNodeInActivePath = (nodeId: string): boolean => {
    const session = currentSession.value;
    if (!session) return false;

    const { isNodeInActivePath } = useBranchManager();
    return isNodeInActivePath(session, nodeId);
  };

  const isNodeGenerating = (nodeId: string): boolean => {
    return generatingNodes.value.has(nodeId);
  };

  const currentMessageCount = computed((): number => {
    const session = currentSession.value;
    if (!session) return 0;
    return Object.keys(session.nodes).length;
  });

  // ==================== History Management ====================
  const historyManager = useSessionNodeHistory(currentSession);

  function undo() {
    const session = currentSession.value;
    if (!session || !historyManager.canUndo.value) return;

    historyManager.undo();
    // After state jump, ensure the active leaf is still valid
    BranchNavigator.ensureValidActiveLeaf(session);

    const sessionManager = useSessionManager();
    sessionManager.persistSession(session, currentSessionId.value);
  }

  function redo() {
    const session = currentSession.value;
    if (!session || !historyManager.canRedo.value) return;

    historyManager.redo();
    // After state jump, ensure the active leaf is still valid
    BranchNavigator.ensureValidActiveLeaf(session);

    const sessionManager = useSessionManager();
    sessionManager.persistSession(session, currentSessionId.value);
  }

  function jumpToHistory(index: number) {
    const session = currentSession.value;
    if (!session) return;

    historyManager.jumpToState(index);

    BranchNavigator.ensureValidActiveLeaf(session);
    const sessionManager = useSessionManager();
    sessionManager.updateSessionDisplayAgent(session);
    sessionManager.persistSession(session, currentSessionId.value);
    logger.info(`已跳转到历史记录索引 ${index}`);
  }

  // ==================== Actions ====================

  /**
   * 创建新会话（使用智能体）
   */
  function createSession(agentId: string, name?: string): string {
    const sessionManager = useSessionManager();
    const { session, sessionId } = sessionManager.createSession(agentId, name);

    sessions.value.push(session);
    currentSessionId.value = sessionId;
    sessionManager.persistSession(session, currentSessionId.value);

    // 新会话需要初始化历史
    historyManager.clearHistory();

    return sessionId;
  }

  /**
   * 切换当前会话
   */
  function switchSession(sessionId: string): void {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) {
      logger.warn("切换会话失败：会话不存在", { sessionId });
      return;
    }

    // ★ 确保切换到的会话有初始化的历史记录
    if (session.history === undefined || session.historyIndex === undefined) {
      // 临时设置当前会话ID，以便 historyManager 能正确操作
      const originalSessionId = currentSessionId.value;
      currentSessionId.value = session.id;
      historyManager.clearHistory();
      // 恢复原始ID，因为下面的代码会正确设置它
      currentSessionId.value = originalSessionId;
      logger.info('为旧会话初始化了历史堆栈', { sessionId });
    }

    currentSessionId.value = sessionId;
    const sessionManager = useSessionManager();
    sessionManager.updateCurrentSessionId(sessionId);
    logger.info("切换会话", { sessionId, sessionName: session.name });
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<void> {
    const sessionManager = useSessionManager();
    const { updatedSessions, newCurrentSessionId } = await sessionManager.deleteSession(
      sessions.value,
      sessionId,
      currentSessionId.value
    );

    sessions.value = updatedSessions;
    currentSessionId.value = newCurrentSessionId;
    persistSessions();
  }

  /**
   * 更新会话信息
   */
  function updateSession(sessionId: string, updates: Partial<ChatSession>): void {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) {
      logger.warn("更新会话失败：会话不存在", { sessionId });
      return;
    }

    const sessionManager = useSessionManager();
    sessionManager.updateSession(session, updates);
    sessionManager.persistSession(session, currentSessionId.value);
  }

  /**
   * 从文件加载会话
   */
  async function loadSessions(): Promise<void> {
    const sessionManager = useSessionManager();
    const { sessions: loadedSessions, currentSessionId: loadedId } = await sessionManager.loadSessions();

    sessions.value = loadedSessions;
    currentSessionId.value = loadedId;

    // 确保加载后的当前会话有历史记录
    if (currentSession.value && (currentSession.value.history === undefined || currentSession.value.historyIndex === undefined)) {
      historyManager.clearHistory();
      logger.info('为加载的当前会话初始化了历史堆栈', { sessionId: currentSession.value.id });
    }

    await fillMissingTokenMetadata();
  }

  /**
   * 重新计算单个节点的 token
   */
  async function recalculateNodeTokens(session: ChatSession, nodeId: string): Promise<void> {
    const node = session.nodes[nodeId];
    if (!node || !node.content) return;
    if (node.role !== 'user' && node.role !== 'assistant') return;

    let modelId: string | undefined;
    if (node.role === 'assistant' && node.metadata?.modelId) {
      modelId = node.metadata.modelId;
    } else if (node.role === 'user') {
      let currentId: string | null = session.activeLeafId;
      while (currentId !== null) {
        const pathNode: ChatMessageNode | undefined = session.nodes[currentId];
        if (pathNode?.role === 'assistant' && pathNode.metadata?.modelId) {
          modelId = pathNode.metadata.modelId;
          break;
        }
        currentId = pathNode?.parentId ?? null;
      }
      if (!modelId) {
        for (const n of Object.values(session.nodes)) {
          if (n.role === 'assistant' && n.metadata?.modelId) {
            modelId = n.metadata.modelId;
            break;
          }
        }
      }
    }

    if (!modelId) {
      logger.warn('无法确定模型ID，跳过token重新计算', { sessionId: session.id, nodeId, role: node.role });
      return;
    }

    try {
      let fullContent = node.content;
      if (node.role === 'user' && node.attachments && node.attachments.length > 0) {
        const { useChatAssetProcessor } = await import('./composables/useChatAssetProcessor');
        const { getTextAttachmentsContent } = useChatAssetProcessor();
        const textAttachmentsContent = await getTextAttachmentsContent(node.attachments);
        if (textAttachmentsContent) {
          fullContent = `${node.content}\n\n${textAttachmentsContent}`;
        }
      }

      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        fullContent,
        modelId,
        node.attachments
      );

      if (!node.metadata) node.metadata = {};
      node.metadata.contentTokens = tokenResult.count;

      logger.debug('重新计算消息 token', {
        sessionId: session.id,
        nodeId,
        role: node.role,
        tokens: tokenResult.count,
        isEstimated: tokenResult.isEstimated,
      });
    } catch (error) {
      logger.warn('重新计算 token 失败', {
        sessionId: session.id,
        nodeId,
        role: node.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 补充会话中缺失的 token 元数据
   */
  async function fillMissingTokenMetadata(): Promise<void> {
    let updatedCount = 0;
    const sessionsToSave: ChatSession[] = [];

    for (const session of sessions.value) {
      let sessionUpdated = false;
      for (const [nodeId, node] of Object.entries(session.nodes)) {
        if (!node.content || node.metadata?.contentTokens !== undefined) continue;

        let modelId: string | undefined;
        if (node.role === 'assistant' && node.metadata?.modelId) {
          modelId = node.metadata.modelId;
        } else if (node.role === 'user') {
          let currentId: string | null = session.activeLeafId;
          while (currentId !== null) {
            const pathNode: ChatMessageNode | undefined = session.nodes[currentId];
            if (pathNode?.role === 'assistant' && pathNode.metadata?.modelId) {
              modelId = pathNode.metadata.modelId;
              break;
            }
            currentId = pathNode?.parentId ?? null;
          }
          if (!modelId) {
            for (const n of Object.values(session.nodes)) {
              if (n.role === 'assistant' && n.metadata?.modelId) {
                modelId = n.metadata.modelId;
                break;
              }
            }
          }
        }

        if (!modelId) continue;

        try {
          let fullContent = node.content;
          if (node.role === 'user' && node.attachments && node.attachments.length > 0) {
            const { useChatAssetProcessor } = await import('./composables/useChatAssetProcessor');
            const { getTextAttachmentsContent } = useChatAssetProcessor();
            const textAttachmentsContent = await getTextAttachmentsContent(node.attachments);
            if (textAttachmentsContent) {
              fullContent = `${node.content}\n\n${textAttachmentsContent}`;
            }
          }
          const tokenResult = await tokenCalculatorService.calculateMessageTokens(
            fullContent,
            modelId,
            node.attachments
          );

          if (!node.metadata) node.metadata = {};
          node.metadata.contentTokens = tokenResult.count;
          updatedCount++;
          sessionUpdated = true;
        } catch (error) {
          logger.warn('计算 token 失败', { sessionId: session.id, nodeId, error });
        }
      }
      if (sessionUpdated) sessionsToSave.push(session);
    }

    if (sessionsToSave.length > 0) {
      const sessionManager = useSessionManager();
      for (const session of sessionsToSave) {
        sessionManager.persistSession(session, currentSessionId.value);
      }
      logger.info('补充 token 元数据完成', { totalUpdated: updatedCount, sessionsUpdated: sessionsToSave.length });
    }
  }

  /**
   * 持久化会话到文件
   */
  function persistSessions(): void {
    const sessionManager = useSessionManager();
    sessionManager.persistSessions(sessions.value, currentSessionId.value);
  }

  /**
   * 导出当前会话为 Markdown
   */
  function exportSessionAsMarkdown(sessionId?: string): string {
    const session = sessionId
      ? sessions.value.find((s) => s.id === sessionId)
      : currentSession.value;
    const sessionManager = useSessionManager();
    return sessionManager.exportSessionAsMarkdown(session || null, currentActivePath.value);
  }

  /**
   * 清空所有会话
   */
  function clearAllSessions(): void {
    sessions.value = [];
    currentSessionId.value = null;
    persistSessions();
    const sessionManager = useSessionManager();
    sessionManager.clearAllSessions();
    logger.info("清空所有会话");
  }

  /**
   * 发送消息（历史断点）
   */
  async function sendMessage(content: string, attachments?: Asset[]): Promise<void> {
    const session = currentSession.value;
    if (!session) throw new Error("请先创建或选择一个会话");
    if (isSending.value) {
      logger.warn("发送消息失败：正在发送中", { sessionId: session.id });
      return;
    }

    isSending.value = true;

    try {
      const chatHandler = useChatHandler();
      await chatHandler.sendMessage(
        session,
        content,
        currentActivePath.value,
        abortControllers.value,
        generatingNodes.value,
        attachments
      );

      const sessionManager = useSessionManager();
      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);

      // ★ 清空历史堆栈（历史断点）
      historyManager.clearHistory();

    } catch (error) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(session, currentSessionId.value);
      throw error;
    } finally {
      if (generatingNodes.value.size === 0) {
        isSending.value = false;
      }
    }
  }

  /**
   * 从指定节点重新生成（历史断点）
   */
  async function regenerateFromNode(nodeId: string): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    try {
      const chatHandler = useChatHandler();
      await chatHandler.regenerateFromNode(
        session,
        nodeId,
        currentActivePath.value,
        abortControllers.value,
        generatingNodes.value
      );

      const sessionManager = useSessionManager();
      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);

      // ★ 清空历史堆栈（历史断点）
      historyManager.clearHistory();

    } catch (error) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(session, currentSessionId.value);
      throw error;
    } finally {
      if (generatingNodes.value.size === 0) {
        isSending.value = false;
      }
    }
  }

  /**
   * 重新生成最后一条助手消息（向后兼容）
   */
  async function regenerateLastMessage(): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    const branchManager = useBranchManager();
    const result = branchManager.prepareRegenerateLastMessage(session);

    if (!result.shouldRegenerate || !result.userContent || !result.newActiveLeafId) {
      return;
    }

    session.activeLeafId = result.newActiveLeafId;
    BranchNavigator.updateSelectionMemory(session, result.newActiveLeafId);
    await sendMessage(result.userContent);
  }

  /**
   * 中止当前发送
   */
  function abortSending(): void {
    if (abortControllers.value.size > 0) {
      abortControllers.value.forEach((controller, nodeId) => {
        controller.abort();
        logger.info("已中止节点生成", { nodeId });
      });
      abortControllers.value.clear();
      generatingNodes.value.clear();
      logger.info("已中止所有消息发送");
    }
  }

  /**
   * 中止指定节点的生成
   */
  function abortNodeGeneration(nodeId: string): void {
    const controller = abortControllers.value.get(nodeId);
    if (controller) {
      controller.abort();
      abortControllers.value.delete(nodeId);
      generatingNodes.value.delete(nodeId);
      logger.info("已中止节点生成", { nodeId });
    }
  }

  // ==================== Branch Operations (with History) ====================

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

    const previousNodeState = structuredClone(toRaw(session.nodes[nodeId]));
    const branchManager = useBranchManager();
    const success = branchManager.editMessage(session, nodeId, newContent, attachments);

    if (success) {
      const finalNodeState = structuredClone(toRaw(session.nodes[nodeId]));
      const delta: HistoryDelta = {
        type: 'update',
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory('NODE_EDIT', [delta], { targetNodeId: nodeId });

      await recalculateNodeTokens(session, nodeId);
      const sessionManager = useSessionManager();
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  /**
   * 删除消息节点
   */
  function deleteMessage(nodeId: string): void {
    const session = currentSession.value;
    if (!session) return;

    const branchManager = useBranchManager();
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

      const sessionManager = useSessionManager();
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
    const branchManager = useBranchManager();
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

      const sessionManager = useSessionManager();
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

    const branchManager = useBranchManager();
    const newLeafId = branchManager.switchToSiblingBranch(session, nodeId, direction);

    if (newLeafId !== session.activeLeafId) {
      const sessionManager = useSessionManager();
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

    const branchManager = useBranchManager();
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

      const sessionManager = useSessionManager();
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

    const previousNodeState = structuredClone(toRaw(session.nodes[nodeId]));
    const branchManager = useBranchManager();
    const success = branchManager.toggleNodeEnabled(session, nodeId);

    if (success) {
      const finalNodeState = structuredClone(toRaw(session.nodes[nodeId]));
      const delta: HistoryDelta = {
        type: 'update',
        payload: { nodeId, previousNodeState, finalNodeState },
      };
      historyManager.recordHistory('NODE_TOGGLE_ENABLED', [delta], { targetNodeId: nodeId });

      const sessionManager = useSessionManager();
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
    const branchManager = useBranchManager();
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

      const sessionManager = useSessionManager();
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
    const branchManager = useBranchManager();
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

      const sessionManager = useSessionManager();
      sessionManager.updateSessionDisplayAgent(session);
      sessionManager.persistSession(session, currentSessionId.value);
    }
  }

  // ==================== Deprecated Methods ====================
  function editUserMessage(nodeId: string, newContent: string): void {
    editMessage(nodeId, newContent);
  }
  function editAssistantMessage(nodeId: string, newContent: string): void {
    editMessage(nodeId, newContent);
  }

  // ==================== Parameter Management ====================
  function updateParameters(newParameters: Partial<LlmParameters>): void {
    Object.assign(parameters.value, newParameters);
    logger.info("更新参数配置", { parameters: newParameters });
  }

  // ==================== Helper Functions ====================
  function extractRelationChange(
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

  function captureRelationChangesForGraft(
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

  function captureRelationChangesForMove(
    session: ChatSession,
    nodeId: string,
    newParentId: string
  ): NodeRelationChange[] {
    return captureRelationChangesForGraft(session, nodeId, newParentId);
  }

  // ==================== Return ====================
  return {
    // State
    sessions,
    currentSessionId,
    parameters,
    isSending,
    abortControllers,
    generatingNodes,

    // Getters
    currentSession,
    currentActivePath,
    currentActivePathWithPresets,
    llmContext,
    getSiblings,
    isNodeInActivePath,
    isNodeGenerating,
    currentMessageCount,

    // History
    undo,
    redo,
    jumpToHistory,
    canUndo: historyManager.canUndo,
    canRedo: historyManager.canRedo,

    // Actions
    createSession,
    switchSession,
    deleteSession,
    updateSession,
    loadSessions,
    recalculateNodeTokens,
    fillMissingTokenMetadata,
    persistSessions,
    exportSessionAsMarkdown,
    clearAllSessions,
    sendMessage,
    regenerateFromNode,
    regenerateLastMessage,
    abortSending,
    abortNodeGeneration,
    editMessage,
    deleteMessage,
    switchBranch,
    switchToSiblingBranch,
    createBranch,
    toggleNodeEnabled,
    graftBranch,
    moveNode,
    editUserMessage,
    editAssistantMessage,
    updateParameters,
  };
});
