/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的精简版本：专注于状态管理，复杂逻辑委托给 composables 和 services
 *
 * @see UNDO_REDO_DESIGN.md
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { debounce } from "lodash-es";
import { useSessionManager } from "./composables/useSessionManager";
import { useChatHandler } from "./composables/useChatHandler";
import { useBranchManager } from "./composables/useBranchManager";
import { BranchNavigator } from "./utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import { useSessionNodeHistory } from "./composables/useSessionNodeHistory";
import { useGraphActions } from "./composables/useGraphActions";
import {
  recalculateNodeTokens as recalculateNodeTokensService,
  fillMissingTokenMetadata as fillMissingTokenMetadataService,
} from "./utils/chatTokenUtils";
import type {
  ChatSession,
  ChatMessageNode,
  LlmParameters,
  ModelIdentifier,
} from "./types";
import type { ContextPreviewData } from "./types/context";
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

  // 上下文统计（中央状态）
  const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
  const isLoadingContextStats = ref(false);

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
    const session = currentSession.value;
    if (!session) return [];

    const agentStore = useAgentStore();
    if (!agentStore.currentAgentId) {
      return currentActivePath.value;
    }

    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    if (
      !agent ||
      !agent.presetMessages ||
      !agent.displayPresetCount ||
      agent.displayPresetCount <= 0
    ) {
      return currentActivePath.value;
    }

    const chatHistoryIndex = agent.presetMessages.findIndex(
      (msg: ChatMessageNode) => msg.type === "chat_history",
    );

    if (chatHistoryIndex === -1) {
      return currentActivePath.value;
    }

    const presetsBeforePlaceholder = agent.presetMessages
      .slice(0, chatHistoryIndex)
      .filter(
        (msg: ChatMessageNode) =>
          (msg.role === "user" || msg.role === "assistant") &&
          msg.isEnabled !== false,
      );

    const displayPresets = presetsBeforePlaceholder.slice(
      -agent.displayPresetCount,
    );
    const markedPresets = displayPresets.map((msg: ChatMessageNode) => ({
      ...msg,
      metadata: {
        ...msg.metadata,
        isPresetDisplay: true,
        agentId: agent.id,
        agentName: agent.name,
        agentDisplayName: agent.displayName || agent.name,
        agentIcon: agent.icon,
        profileId: agent.profileId,
        modelId: agent.modelId,
      },
    }));

    return [...markedPresets, ...currentActivePath.value];
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
        const { useChatInputManager } = await import("./composables/useChatInputManager");
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

  // ==================== 上下文统计管理 ====================
  const refreshContextStats = async () => {
    const session = currentSession.value;
    if (!session || !session.activeLeafId) {
      contextStats.value = null;
      return;
    }

    const agentStore = useAgentStore();
    isLoadingContextStats.value = true;

    try {
      // 动态导入以避免潜在的循环依赖
      const { useChatHandler: useChatHandlerInternal } = await import("./composables/useChatHandler");
      const { getLlmContextForPreview } = useChatHandlerInternal();

      const previewData = await getLlmContextForPreview(
        session,
        session.activeLeafId,
        agentStore.currentAgentId ?? undefined,
      );

      if (previewData) {
        contextStats.value = previewData.statistics;
      }
    } catch (error) {
      logger.warn("获取上下文统计失败", error);
      // 出错时不清除旧数据，避免闪烁，或者可以根据需求清除
    } finally {
      isLoadingContextStats.value = false;
    }
  };

  const debouncedRefreshContextStats = debounce(refreshContextStats, 1000);

  // 自动监听变化并刷新统计
  watch(
    [
      currentSessionId,
      () => currentSession.value?.activeLeafId,
      () => currentSession.value?.updatedAt, // 监听会话更新（如消息内容变化）
      () => {
        const agentStore = useAgentStore();
        return agentStore.currentAgentId;
      },
      () => {
        // 深度监听当前 Agent 的关键配置
        const agentStore = useAgentStore();
        if (!agentStore.currentAgentId) return null;
        const agent = agentStore.getAgentById(agentStore.currentAgentId);
        // 仅监听影响上下文计算的核心参数
        // 排除 temperature, topP 等生成参数
        // contextManagement: 决定截断逻辑
        // contextPostProcessing: 决定内容过滤/修改逻辑
        const contextParams = {
          contextManagement: agent?.parameters?.contextManagement,
          contextPostProcessing: agent?.parameters?.contextPostProcessing,
        };

        // 使用 JSON.stringify 进行稳定化比较，避免因对象引用变化（如状态同步时）导致的误触发
        return JSON.stringify({
          modelId: agent?.modelId,
          contextParams,
          presets: agent?.presetMessages,
        });
      },
    ],
    () => {
      debouncedRefreshContextStats();
    },
    { deep: true, immediate: true },
  );

  // ==================== 已弃用方法 (保留兼容性) ====================
  function editUserMessage(nodeId: string, newContent: string): void {
    graphActions.editMessage(nodeId, newContent);
  }
  function editAssistantMessage(nodeId: string, newContent: string): void {
    graphActions.editMessage(nodeId, newContent);
  }

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
    editUserMessage,
    editAssistantMessage,
    updateParameters,
    updateMessageTranslation: graphActions.updateMessageTranslation,
    updateNodeData: graphActions.updateNodeData,

    // 上下文统计
    contextStats,
    isLoadingContextStats,
    refreshContextStats,
  };
});
