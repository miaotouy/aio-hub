/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的精简版本：专注于状态管理，复杂逻辑委托给 composables 和 services
 *
 * @see UNDO_REDO_DESIGN.md
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useSessionManager } from "../composables/useSessionManager";
import { useChatHandler } from "../composables/useChatHandler";
import { useBranchManager } from "../composables/useBranchManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import { useSessionNodeHistory } from "../composables/useSessionNodeHistory";
import { useGraphActions } from "../composables/useGraphActions";
import { useChatContextStats } from "../composables/useChatContextStats";
import { getActivePathWithPresets } from "../utils/chatPathUtils";
import {
  recalculateNodeTokens as recalculateNodeTokensService,
  fillMissingTokenMetadata as fillMissingTokenMetadataService,
} from "../utils/chatTokenUtils";
import type {
  ChatSession,
  ChatMessageNode,
  LlmParameters,
  ModelIdentifier,
} from "../types";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  // ==================== 状态 ====================
  const sessions = ref<ChatSession[]>([]);
  const currentSessionId = ref<string | null>(null);
  const parameters = ref<LlmParameters>({
    temperature: 0.7,
    maxTokens: 4096,
  });
  const isSending = ref(false);
  const abortControllers = ref(new Map<string, AbortController>());
  const generatingNodes = ref(new Set<string>());

  /**
   * 自动修复僵死节点的生成状态
   * 如果一个节点在 session 中是 generating 状态，但不在 generatingNodes 集合中，
   * 说明它已经脱离了执行器的控制，需要强制修复状态。
   */
  watch(
    () => generatingNodes.value.size,
    (newSize, oldSize) => {
      // 只有在生成节点减少时（任务结束或中止）才进行检查
      if (newSize < (oldSize || 0)) {
        const session = currentSession.value;
        if (!session) return;

        let hasFixed = false;
        if (!session.nodes) return;

        Object.values(session.nodes).forEach((node) => {
          if (node.status === "generating" && !generatingNodes.value.has(node.id)) {
            logger.warn("检测到僵死节点，正在自动修复状态", {
              nodeId: node.id,
              contentLength: node.content?.length,
            });
            // 如果已经有内容了，标记为 complete，否则标记为 error
            node.status = node.content?.trim() ? "complete" : "error";
            if (node.status === "error" && !node.metadata?.error) {
              if (!node.metadata) node.metadata = {};
              node.metadata.error = "生成意外中断";
            }
            hasFixed = true;
          }
        });

        if (hasFixed) {
          const sessionManager = useSessionManager();
          sessionManager.persistSession(session, currentSessionId.value);
        }
      }
    },
    { flush: "post" }
  );

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
        logger.warn("活动路径中断：节点不存在", {
          sessionId: session.id,
          nodeId: currentId,
        });
        break;
      }

      path.unshift(node);
      currentId = node.parentId;
    }

    return path.filter((node) => node.id !== session.rootNodeId);
  });

  const currentActivePathWithPresets = computed((): ChatMessageNode[] => {
    const agentStore = useAgentStore();
    const agent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
    return getActivePathWithPresets(currentActivePath.value, currentSession.value, agent || null);
  });

  const llmContext = computed(
    (): Array<{
      role: "user" | "assistant";
      content: string | LlmMessageContent[];
    }> => {
      return currentActivePath.value
        .filter((node) => node.isEnabled !== false)
        .filter((node) => node.role !== "system")
        .filter((node) => node.role === "user" || node.role === "assistant")
        .map((node) => ({
          role: node.role as "user" | "assistant",
          content: node.content,
        }));
    },
  );

  const getSiblings = (nodeId: string): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    if (nodeId.startsWith("preset-")) {
      logger.warn("尝试获取预设消息的兄弟节点", { nodeId });
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

  // ==================== 历史记录管理 ====================
  const historyManager = useSessionNodeHistory(currentSession);

  function undo() {
    const session = currentSession.value;
    if (!session || !historyManager.canUndo.value) return;

    historyManager.undo();
    // 状态跳转后，确保活动叶节点仍然有效
    BranchNavigator.ensureValidActiveLeaf(session);

    const sessionManager = useSessionManager();
    sessionManager.persistSession(session, currentSessionId.value);
  }

  function redo() {
    const session = currentSession.value;
    if (!session || !historyManager.canRedo.value) return;

    historyManager.redo();
    // 状态跳转后，确保活动叶节点仍然有效
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

  // ==================== 图操作 (委托给 useGraphActions) ====================
  const graphActions = useGraphActions(
    currentSession,
    currentSessionId,
    historyManager,
  );

  // ==================== 会话操作 ====================

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
      logger.info("为旧会话初始化了历史堆栈", { sessionId });
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
    const { updatedSessions, newCurrentSessionId } =
      await sessionManager.deleteSession(
        sessions.value,
        sessionId,
        currentSessionId.value,
      );

    sessions.value = updatedSessions;
    currentSessionId.value = newCurrentSessionId;
    persistSessions();
  }

  /**
   * 更新会话信息
   */
  function updateSession(
    sessionId: string,
    updates: Partial<ChatSession>,
  ): void {
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
    const { sessions: loadedSessions, currentSessionId: loadedId } =
      await sessionManager.loadSessions();

    sessions.value = loadedSessions;
    currentSessionId.value = loadedId;

    // 确保加载后的当前会话有历史记录
    if (
      currentSession.value &&
      (currentSession.value.history === undefined ||
        currentSession.value.historyIndex === undefined)
    ) {
      historyManager.clearHistory();
      logger.info("为加载的当前会话初始化了历史堆栈", {
        sessionId: currentSession.value.id,
      });
    }

    await fillMissingTokenMetadata();
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
    return sessionManager.exportSessionAsMarkdown(
      session || null,
      currentActivePath.value,
    );
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

  // ==================== Token 操作 (委托给 Service) ====================

  /**
   * 重新计算单个节点的 token
   */
  async function recalculateNodeTokens(
    session: ChatSession,
    nodeId: string,
  ): Promise<void> {
    await recalculateNodeTokensService(session, nodeId);
  }

  /**
   * 补充会话中缺失的 token 元数据
   */
  async function fillMissingTokenMetadata(): Promise<void> {
    const sessionsToSave = await fillMissingTokenMetadataService(
      sessions.value,
    );
    if (sessionsToSave.length > 0) {
      const sessionManager = useSessionManager();
      for (const session of sessionsToSave) {
        sessionManager.persistSession(session, currentSessionId.value);
      }
    }
  }

  // ==================== 发送/生成操作 ====================

  /**
   * 发送消息（历史断点）
   */
  async function sendMessage(
    content: string,
    options?: {
      attachments?: Asset[];
      temporaryModel?: ModelIdentifier | null;
      parentId?: string;
      disableMacroParsing?: boolean;
    },
  ): Promise<void> {
    const session = currentSession.value;
    if (!session) throw new Error("请先创建或选择一个会话");

    // 检查当前活动分支是否正在生成
    if (
      session.activeLeafId &&
      generatingNodes.value.has(session.activeLeafId)
    ) {
      logger.warn("发送消息失败：当前分支正在生成中", {
        sessionId: session.id,
        nodeId: session.activeLeafId,
      });
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
        options,
        currentSessionId.value,
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
   * 续写消息
   */
  async function continueGeneration(
    nodeId: string,
    options?: { modelId?: string; profileId?: string }
  ): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    isSending.value = true;
    try {
      const chatHandler = useChatHandler();
      await chatHandler.continueGeneration(
        session,
        nodeId,
        abortControllers.value,
        generatingNodes.value,
        options
      );

      const sessionManager = useSessionManager();
      sessionManager.persistSession(session, currentSessionId.value);
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
   * 输入框补全
   */
  async function completeInput(
    content: string,
    options?: { modelId?: string; profileId?: string }
  ): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    try {
      const chatHandler = useChatHandler();
      const completion = await chatHandler.completeInput(content, session, options);
      if (completion) {
        // 将补全内容追加到输入框
        // 动态导入以避免循环依赖
        const { useChatInputManager } = await import("../composables/useChatInputManager");
        const inputManager = useChatInputManager();
        inputManager.inputText.value += completion;
      }
    } catch (error) {
      logger.error("补全输入失败", error);
    }
  }

  /**
   * 从指定节点重新生成（历史断点）
   */
  async function regenerateFromNode(
    nodeId: string,
    options?: { modelId?: string; profileId?: string },
  ): Promise<void> {
    const session = currentSession.value;
    if (!session) return;

    try {
      const chatHandler = useChatHandler();
      await chatHandler.regenerateFromNode(
        session,
        nodeId,
        currentActivePath.value,
        abortControllers.value,
        generatingNodes.value,
        options,
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

    if (
      !result.shouldRegenerate ||
      !result.userContent ||
      !result.newActiveLeafId
    ) {
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

  // ==================== 参数管理 ====================
  function updateParameters(newParameters: Partial<LlmParameters>): void {
    Object.assign(parameters.value, newParameters);
    logger.info("更新参数配置", { parameters: newParameters });
  }

  // 上下文统计管理 (委托给 Composable)
  const { contextStats, isLoadingContextStats, refreshContextStats } = useChatContextStats(
    currentSession,
    currentSessionId
  );

  // ==================== 返回 ====================
  return {
    // 状态
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

    // 历史记录
    undo,
    redo,
    jumpToHistory,
    canUndo: historyManager.canUndo,
    canRedo: historyManager.canRedo,

    // 会话操作
    createSession,
    switchSession,
    deleteSession,
    updateSession,
    loadSessions,
    persistSessions,
    exportSessionAsMarkdown,
    clearAllSessions,

    // Token 操作
    recalculateNodeTokens,
    fillMissingTokenMetadata,

    // 发送/生成操作
    sendMessage,
    regenerateFromNode,
    regenerateLastMessage,
    continueGeneration,
    completeInput,
    abortSending,
    abortNodeGeneration,

    // 图操作 (从 useGraphActions 展开)
    ...graphActions,

    // 兼容旧接口
    updateParameters,
    updateMessageTranslation: graphActions.updateMessageTranslation,
    updateNodeData: graphActions.updateNodeData,

    // 上下文统计
    contextStats,
    isLoadingContextStats,
    refreshContextStats,
  };
});
