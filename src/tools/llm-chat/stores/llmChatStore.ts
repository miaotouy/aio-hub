/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的版本：专注于状态管理，复杂逻辑委托给 composables 和 services
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useSessionManager } from "../composables/session/useSessionManager";
import { useChatHandler } from "../composables/chat/useChatHandler";
import { useBranchManager } from "../composables/session/useBranchManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import { useSessionNodeHistory } from "../composables/session/useSessionNodeHistory";
import { useGraphActions } from "../composables/visualization/useGraphActions";
import { useChatContextStats } from "../composables/features/useChatContextStats";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { getActivePathWithPresets } from "../utils/chatPathUtils";
import {
  recalculateNodeTokens as recalculateNodeTokensService,
  fillMissingTokenMetadata as fillMissingTokenMetadataService,
} from "../utils/chatTokenUtils";
import type {
  ChatSessionIndex,
  ChatSessionDetail,
  ChatMessageNode,
  LlmParameters,
  ModelIdentifier,
} from "../types";
import type { PendingInputData } from "../types/context";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@utils/logger";
import { clearSessionCache, clearAllCaches } from "../core/context-utils/knowledge-cache";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  // ==================== 状态 ====================
  const sessionIndexMap = ref<Map<string, ChatSessionIndex>>(new Map());
  const sessionDetailMap = ref<Map<string, ChatSessionDetail>>(new Map());
  const currentSessionId = ref<string | null>(null);
  const parameters = ref<LlmParameters>({
    temperature: 0.7,
    maxTokens: 4096,
  });
  const isSending = ref(false);

  // 上下文分析器状态
  const contextAnalyzerVisible = ref(false);
  const contextAnalyzerNodeId = ref<string | null>(null);
  const contextAnalyzerPendingInput = ref<PendingInputData | undefined>(undefined);
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
        const detail = currentSessionDetail.value;
        if (!detail) return;

        let hasFixed = false;
        if (!detail.nodes) return;

        Object.values(detail.nodes).forEach((node) => {
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
          const index = sessionIndexMap.value.get(detail.id);
          if (index) {
            sessionManager.updateMessageCount(detail.id, detail.nodes, sessionIndexMap.value);
            sessionManager.persistSession(index, detail, currentSessionId.value);
          }
        }
      }
    },
    { flush: "post" },
  );

  const sessions = computed(() => Array.from(sessionIndexMap.value.values()));

  const currentSession = computed((): ChatSessionIndex | null => {
    if (!currentSessionId.value) return null;
    return sessionIndexMap.value.get(currentSessionId.value) || null;
  });

  const currentSessionDetail = computed((): ChatSessionDetail | null => {
    if (!currentSessionId.value) return null;
    return sessionDetailMap.value.get(currentSessionId.value) || null;
  });

  /**
   * 当前完整会话（索引 + 详情）
   * 用于需要完整上下文的组件或逻辑
   */
  const currentFullSession = computed((): { index: ChatSessionIndex; detail: ChatSessionDetail } | null => {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return null;
    return { index, detail };
  });

  /**
   * 当前会话是否正在生成
   * 只检查当前会话的节点，不受其他会话生成状态影响
   */
  const isCurrentSessionGenerating = computed(() => {
    const detail = currentSessionDetail.value;
    if (!detail || !detail.nodes) return false;
    // 只要当前会话中有任何一个节点在生成中，就认为当前会话正在生成
    return Object.values(detail.nodes).some((node) => generatingNodes.value.has(node.id));
  });

  const currentActivePath = computed((): ChatMessageNode[] => {
    const detail = currentSessionDetail.value;
    if (!detail || !detail.nodes || !detail.activeLeafId) return [];

    const nodes = detail.nodes;
    const path: ChatMessageNode[] = [];
    let currentId: string | null = detail.activeLeafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = nodes[currentId];
      if (!node) {
        logger.warn("活动路径中断：节点不存在", {
          sessionId: detail.id,
          nodeId: currentId,
        });
        break;
      }

      path.unshift(node);
      currentId = node.parentId;
    }

    return path.filter((node) => node.id !== detail.rootNodeId);
  });

  const currentActivePathWithPresets = computed((): ChatMessageNode[] => {
    const agentStore = useAgentStore();
    const agent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
    const fullSession = currentFullSession.value;
    if (!fullSession) return [];

    return getActivePathWithPresets(currentActivePath.value, fullSession.index, fullSession.detail, agent || null);
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
    const detail = currentSessionDetail.value;
    if (!detail) return [];

    if (nodeId.startsWith("preset-")) {
      logger.warn("尝试获取预设消息的兄弟节点", { nodeId });
      return [];
    }

    return BranchNavigator.getSiblings(detail, nodeId);
  };

  const isNodeInActivePath = (nodeId: string): boolean => {
    const detail = currentSessionDetail.value;
    if (!detail) return false;

    return BranchNavigator.isNodeInActivePath(detail, nodeId);
  };

  const isNodeGenerating = (nodeId: string): boolean => {
    // 访问 size 以建立响应式依赖，Set 内部的 add/delete 不会自动触发响应式
    // 除非替换整个 Set 引用，或者监听 size
    return generatingNodes.value.size >= 0 && generatingNodes.value.has(nodeId);
  };

  const currentMessageCount = computed((): number => {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index) return 0;
    // 如果详情已加载，使用实时节点数；否则使用索引中缓存的数量
    if (detail && detail.nodes) {
      return Object.keys(detail.nodes).length;
    }
    // 增加对 -1 的容错：如果 messageCount 是负数，说明索引已损坏，回退到 0
    const cachedCount = index.messageCount !== undefined && index.messageCount >= 0 ? index.messageCount : 0;
    return cachedCount + 1; // +1 是因为 messageCount 排除根节点
  });

  // ==================== 历史记录管理 ====================
  const historyManager = useSessionNodeHistory(currentSessionDetail as any);

  // ==================== 代理辅助函数 ====================
  const bus = useWindowSyncBus();

  /**
   * 执行本地逻辑或代理到主窗口
   * 确保 detached-component 窗口的操作始终转发给 Data Owner
   */
  async function executeOrProxy<T>(action: string, params: any, localFn: () => T | Promise<T>): Promise<T> {
    if (bus.windowType === "detached-component") {
      logger.info(`代理操作到主窗口: ${action}`, { params });
      return bus.requestAction<any, T>(`llm-chat:${action}`, params);
    }
    return localFn();
  }

  function undo() {
    const detail = currentSessionDetail.value;
    if (!detail || !historyManager.canUndo.value) return;

    historyManager.undo();
    // 状态跳转后，确保活动叶节点仍然有效
    BranchNavigator.ensureValidActiveLeaf(detail);

    const sessionManager = useSessionManager();
    const index = sessionIndexMap.value.get(detail.id);
    if (index) {
      sessionManager.updateMessageCount(detail.id, detail.nodes, sessionIndexMap.value);
      sessionManager.persistSession(index, detail, currentSessionId.value);
    }
  }

  function redo() {
    const detail = currentSessionDetail.value;
    if (!detail || !historyManager.canRedo.value) return;

    historyManager.redo();
    // 状态跳转后，确保活动叶节点仍然有效
    BranchNavigator.ensureValidActiveLeaf(detail);

    const sessionManager = useSessionManager();
    const index = sessionIndexMap.value.get(detail.id);
    if (index) {
      sessionManager.updateMessageCount(detail.id, detail.nodes, sessionIndexMap.value);
      sessionManager.persistSession(index, detail, currentSessionId.value);
    }
  }

  function jumpToHistory(index: number) {
    const detail = currentSessionDetail.value;
    if (!detail) return;

    historyManager.jumpToState(index);

    BranchNavigator.ensureValidActiveLeaf(detail);
    const sessionManager = useSessionManager();
    const sessionIndex = sessionIndexMap.value.get(detail.id);
    if (sessionIndex) {
      sessionManager.updateMessageCount(detail.id, detail.nodes, sessionIndexMap.value);
      sessionManager.updateSessionDisplayAgent(detail.id, detail, sessionIndexMap.value);
      sessionManager.persistSession(sessionIndex, detail, currentSessionId.value);
    }
    logger.info(`已跳转到历史记录索引 ${index}`);
  }

  // ==================== 图操作 (委托给 useGraphActions) ====================
  const graphActions = useGraphActions(
    currentSessionDetail,
    currentSessionId,
    historyManager,
    sessionIndexMap,
  );

  // ==================== 会话操作 ====================

  /**
   * 创建新会话（使用智能体）
   */
  async function createSession(agentId: string, name?: string): Promise<string> {
    return executeOrProxy("create-session", { agentId, name }, () => {
      const sessionManager = useSessionManager();
      const { index, detail, sessionId } = sessionManager.createSession(agentId, name);

      sessionIndexMap.value.set(sessionId, index);
      sessionDetailMap.value.set(sessionId, detail);
      currentSessionId.value = sessionId;

      sessionManager.updateMessageCount(sessionId, detail.nodes, sessionIndexMap.value);
      sessionManager.persistSession(index, detail, currentSessionId.value);

      // 新会话需要初始化历史
      historyManager.clearHistory();

      return sessionId;
    });
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<void> {
    return executeOrProxy("delete-session", { sessionId }, async () => {
      const sessionManager = useSessionManager();
      const { newCurrentSessionId } = await sessionManager.deleteSession(
        Array.from(sessionIndexMap.value.values()),
        sessionId,
        currentSessionId.value,
      );

      sessionIndexMap.value.delete(sessionId);
      sessionDetailMap.value.delete(sessionId);

      if (currentSessionId.value === sessionId) {
        currentSessionId.value = newCurrentSessionId;
        if (currentSessionId.value) {
          await switchSession(currentSessionId.value);
        }
      }

      clearSessionCache(sessionId);
      persistSessions();
    });
  }

  /**
   * 更新会话信息
   */
  async function updateSession(sessionId: string, updates: Partial<ChatSessionIndex & ChatSessionDetail>): Promise<void> {
    return executeOrProxy("update-session", { sessionId, updates }, () => {
      const sessionManager = useSessionManager();
      sessionManager.updateSession(sessionId, updates, sessionIndexMap.value, sessionDetailMap.value);

      const index = sessionIndexMap.value.get(sessionId);
      const detail = sessionDetailMap.value.get(sessionId);
      if (index && detail) {
        sessionManager.persistSession(index, detail, currentSessionId.value);
      }
    });
  }

  /**
   * 从文件加载会话（优化后的按需加载）
   */
  async function loadSessions(): Promise<void> {
    const sessionManager = useSessionManager();
    const { useChatStorageSeparated } = await import("../composables/storage/useChatStorageSeparated");
    const storage = useChatStorageSeparated();

    // 1. 先加载索引（轻量级）
    const { sessions: indexItems, currentSessionId: loadedId } = await sessionManager.loadSessionsIndex();

    // 2. 填充索引 Map
    sessionIndexMap.value.clear();
    indexItems.forEach((item) => {
      sessionIndexMap.value.set(item.id, item);
    });

    currentSessionId.value = loadedId;

    // 3. 核心优化：只针对当前活跃会话加载完整详情
    if (loadedId) {
      const fullSession = await storage.loadSession(loadedId);
      if (fullSession && fullSession.detail) {
        const { nodes, rootNodeId, activeLeafId, history, historyIndex, updatedAt } = fullSession.detail;
        sessionDetailMap.value.set(loadedId, {
          id: loadedId,
          nodes: nodes!,
          rootNodeId: rootNodeId!,
          activeLeafId: activeLeafId!,
          updatedAt: updatedAt || fullSession.index.updatedAt,
          history: history || [],
          historyIndex: historyIndex || 0,
        });
        logger.info("当前活跃会话详情加载完成", { sessionId: loadedId });
      }
    }

    // 确保加载后的当前会话有历史记录
    const detail = currentSessionDetail.value;
    if (detail && (detail.history === undefined || detail.historyIndex === undefined)) {
      historyManager.clearHistory();
      logger.info("为加载的当前会话初始化了历史堆栈", {
        sessionId: detail.id,
      });
    }

    // 补充 token 元数据（仅对已加载详情的会话）
    await fillMissingTokenMetadata();

    // 4. 索引自愈：检测并修复损坏的索引项（如 messageCount 为 -1）
    setTimeout(async () => {
      try {
        const { repairedCount } = await storage.repairIndex();
        if (repairedCount > 0) {
          const { sessions: updatedIndexItems } = await sessionManager.loadSessionsIndex();
          updatedIndexItems.forEach((updated) => {
            const existing = sessionIndexMap.value.get(updated.id);
            if (existing) {
              sessionIndexMap.value.set(updated.id, { ...existing, ...updated });
            }
          });
        }
      } catch (e) {
        logger.warn("索引自愈执行失败", e);
      }
    }, 3000);
  }

  /**
   * 切换当前会话（增强：支持按需加载详情）
   */
  async function switchSession(sessionId: string): Promise<void> {
    return executeOrProxy("switch-session", { sessionId }, async () => {
      const index = sessionIndexMap.value.get(sessionId);
    if (!index) {
      logger.warn("切换会话失败：会话不存在", { sessionId });
      return;
    }

    // ★ 按需加载详情
    let detail = sessionDetailMap.value.get(sessionId);
    if (!detail) {
      const { useChatStorageSeparated } = await import("../composables/storage/useChatStorageSeparated");
      const storage = useChatStorageSeparated();
      const fullSession = await storage.loadSession(sessionId);
      if (fullSession && fullSession.detail) {
        const { nodes, rootNodeId, activeLeafId, history, historyIndex, updatedAt } = fullSession.detail;
        detail = {
          id: sessionId,
          nodes: nodes!,
          rootNodeId: rootNodeId!,
          activeLeafId: activeLeafId!,
          updatedAt: updatedAt || fullSession.index.updatedAt,
          history: history || [],
          historyIndex: historyIndex || 0,
        };
        sessionDetailMap.value.set(sessionId, detail);
        logger.info("会话详情按需加载完成", { sessionId });
      }
    }

    // ★ 确保切换到的会话有初始化的历史记录
    if (detail && (detail.history === undefined || detail.historyIndex === undefined)) {
      const originalSessionId = currentSessionId.value;
      currentSessionId.value = sessionId;
      historyManager.clearHistory();
      currentSessionId.value = originalSessionId;
      logger.info("为旧会话初始化了历史堆栈", { sessionId });
    }

      currentSessionId.value = sessionId;
      const sessionManager = useSessionManager();
      sessionManager.updateCurrentSessionId(sessionId);
      logger.info("切换会话", { sessionId, sessionName: index.name });
    });
  }

  /**
   * 持久化会话到文件
   */
  function persistSessions(): void {
    const sessionManager = useSessionManager();
    const allSessions = Array.from(sessionIndexMap.value.values()).map((idx) => {
      const detail = sessionDetailMap.value.get(idx.id);
      return { index: idx, detail: detail || undefined };
    });
    sessionManager.persistSessions(allSessions, currentSessionId.value);
  }

  /**
   * 导出当前会话为 Markdown
   */
  function exportSessionAsMarkdown(sessionId?: string): string {
    const id = sessionId || currentSessionId.value;
    if (!id) return "";

    const detail = sessionDetailMap.value.get(id);

    const sessionManager = useSessionManager();
    return sessionManager.exportSessionAsMarkdown(detail || null, currentActivePath.value);
  }

  /**
   * 清空所有会话
   */
  async function clearAllSessions(): Promise<void> {
    sessionIndexMap.value.clear();
    sessionDetailMap.value.clear();
    currentSessionId.value = null;
    persistSessions();
    await clearAllCaches();
    const sessionManager = useSessionManager();
    sessionManager.clearAllSessions();
    logger.info("清空所有会话");
  }

  // ==================== Token 操作 (委托给 Service) ====================

  /**
   * 重新计算单个节点的 token
   */
  async function recalculateNodeTokens(
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    nodeId: string,
  ): Promise<void> {
    await recalculateNodeTokensService(index, detail, nodeId);
  }

  /**
   * 补充会话中缺失的 token 元数据
   */
  async function fillMissingTokenMetadata(): Promise<void> {
    const allSessions = Array.from(sessionIndexMap.value.values())
      .map((idx) => {
        const detail = sessionDetailMap.value.get(idx.id);
        return { index: idx, detail: detail! };
      })
      .filter((s) => !!s.detail);

    const sessionsToSave = await fillMissingTokenMetadataService(allSessions);
    if (sessionsToSave.length > 0) {
      const sessionManager = useSessionManager();
      for (const session of sessionsToSave) {
        const sessionId = (session as any).id;
        const index = sessionIndexMap.value.get(sessionId);
        const detail = sessionDetailMap.value.get(sessionId);
        if (index && detail) {
          sessionManager.persistSession(index, detail, currentSessionId.value);
        }
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
    return executeOrProxy("send-message", { content, options }, async () => {
      const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) throw new Error("请先创建或选择一个会话");

    if (detail.activeLeafId && generatingNodes.value.has(detail.activeLeafId)) {
      logger.warn("发送消息失败：当前分支正在生成中", {
        sessionId: index.id,
        nodeId: detail.activeLeafId,
      });
      return;
    }

    isSending.value = true;

    try {
      const chatHandler = useChatHandler();

      const sendPromise = chatHandler.sendMessage(
        detail,
        content,
        currentActivePath.value,
        abortControllers.value,
        generatingNodes.value,
        options,
        currentSessionId.value,
      );

      try {
        const { useChatInputManager } = await import("../composables/input/useChatInputManager");
        const inputManager = useChatInputManager();
        inputManager.clear();
        logger.info("消息已进入发送流程，已反向驱动清空输入框");
      } catch (e) {
        logger.warn("反向驱动清空输入框失败", e);
      }

      await sendPromise;

      const sessionManager = useSessionManager();
      sessionManager.updateMessageCount(index.id, detail.nodes, sessionIndexMap.value);
      sessionManager.updateSessionDisplayAgent(index.id, detail, sessionIndexMap.value);

      sessionManager.persistSession(index, detail, currentSessionId.value);
      historyManager.clearHistory();
    } catch (error) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(index, detail, currentSessionId.value);
      throw error;
    } finally {
        if (generatingNodes.value.size === 0) {
          isSending.value = false;
        }
      }
    });
  }

  /**
   * 续写消息
   */
  async function continueGeneration(nodeId: string, options?: { modelId?: string; profileId?: string }): Promise<void> {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return;

    isSending.value = true;
    try {
      const chatHandler = useChatHandler();
      await chatHandler.continueGeneration(detail, nodeId, abortControllers.value, generatingNodes.value, options);

      const sessionManager = useSessionManager();
      sessionManager.updateMessageCount(index.id, detail.nodes, sessionIndexMap.value);
      sessionManager.persistSession(index, detail, currentSessionId.value);
      historyManager.clearHistory();
    } catch (error) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(index, detail, currentSessionId.value);
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
  async function completeInput(content: string, options?: { modelId?: string; profileId?: string }): Promise<void> {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return;

    try {
      const chatHandler = useChatHandler();
      const completion = await chatHandler.completeInput(content, detail, options);
      if (completion) {
        const { useChatInputManager } = await import("../composables/input/useChatInputManager");
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
  async function regenerateFromNode(nodeId: string, options?: { modelId?: string; profileId?: string }): Promise<void> {
    return executeOrProxy("regenerate-from-node", { nodeId, options }, async () => {
      const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return;

    try {
      const chatHandler = useChatHandler();
      await chatHandler.regenerateFromNode(
        detail,
        nodeId,
        currentActivePath.value,
        abortControllers.value,
        generatingNodes.value,
        options,
      );

      const sessionManager = useSessionManager();
      sessionManager.updateMessageCount(index.id, detail.nodes, sessionIndexMap.value);
      sessionManager.updateSessionDisplayAgent(index.id, detail, sessionIndexMap.value);
      sessionManager.persistSession(index, detail, currentSessionId.value);

      historyManager.clearHistory();
    } catch (error) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(index, detail, currentSessionId.value);
      throw error;
    } finally {
        if (generatingNodes.value.size === 0) {
          isSending.value = false;
        }
      }
    });
  }

  /**
   * 重新生成最后一条助手消息（向后兼容）
   */
  async function regenerateLastMessage(): Promise<void> {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index || !detail) return;

    const branchManager = useBranchManager();
    const result = branchManager.prepareRegenerateLastMessage(detail);

    if (!result.shouldRegenerate || !result.userContent || !result.newActiveLeafId) {
      return;
    }

    detail.activeLeafId = result.newActiveLeafId;
    BranchNavigator.updateSelectionMemory(detail, result.newActiveLeafId);
    await sendMessage(result.userContent);
  }

  /**
   * 中止当前发送
   */
  function abortSending(): void {
    if (abortControllers.value.size > 0) {
      const detail = currentSessionDetail.value;

      abortControllers.value.forEach((controller, nodeId) => {
        controller.abort();

        if (detail && detail.nodes && detail.nodes[nodeId]) {
          const node = detail.nodes[nodeId];
          if (node.content?.trim()) {
            node.status = "complete";
          } else {
            node.status = "error";
            if (!node.metadata) node.metadata = {};
            node.metadata.error = "用户手动停止";
          }
        }

        logger.info("已中止节点生成", { nodeId });
      });
      abortControllers.value.clear();
      generatingNodes.value.clear();
      isSending.value = false;
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

      const detail = currentSessionDetail.value;
      if (detail && detail.nodes && detail.nodes[nodeId]) {
        const node = detail.nodes[nodeId];
        if (node.content?.trim()) {
          node.status = "complete";
        } else {
          node.status = "error";
          if (!node.metadata) node.metadata = {};
          node.metadata.error = "用户手动停止";
        }
        logger.info("已更新手动停止节点的状态", {
          nodeId,
          status: node.status,
          hasContent: !!node.content?.trim(),
        });
      }

      abortControllers.value.delete(nodeId);
      generatingNodes.value.delete(nodeId);

      if (generatingNodes.value.size === 0) {
        isSending.value = false;
      }

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
    currentSessionDetail,
    currentSessionId,
  );

  /**
   * 自动生成会话标题
   */
  async function generateSessionTopic(sessionId?: string): Promise<void> {
    const id = sessionId || currentSessionId.value;
    if (!id) return;

    const index = sessionIndexMap.value.get(id);
    const detail = sessionDetailMap.value.get(id);
    if (!index || !detail) return;

    const { useTopicNamer } = await import("../composables/chat/useTopicNamer");
    const { shouldAutoName, generateTopicName } = useTopicNamer();

    if (shouldAutoName(detail, sessionIndexMap.value)) {
      try {
        await generateTopicName(
          detail,
          sessionIndexMap.value,
          sessionDetailMap.value,
          (index, detail, currentId) => {
            const sessionManager = useSessionManager();
            sessionManager.persistSession(index, detail, currentId);
          },
        );
      } catch (err) {
        logger.warn("自动生成标题失败", err);
      }
    }
  }

  // ==================== 返回 ====================
  return {
    // 状态
    sessions,
    sessionIndexMap,
    sessionDetailMap,
    currentSessionId,
    parameters,
    isSending,
    abortControllers,
    generatingNodes,

    // Getters
    currentSession,
    currentSessionDetail,
    setSessions: (sessions: ChatSessionIndex[]) => {
      // 避免无意义的清空重写，减少响应式抖动
      // TODO: 如果 ID 列表完全一致且长度一致，可以考虑更细粒度的对比，但这里先简单处理
      sessionIndexMap.value.clear();
      sessions.forEach((s) => sessionIndexMap.value.set(s.id, s));
      
      logger.debug("已同步会话列表索引", { count: sessions.length });
    },
    isCurrentSessionGenerating,
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
    generateSessionTopic,
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

    currentFullSession,

    // 兼容旧接口
    updateParameters,
    updateMessageTranslation: (graphActions as any).updateMessageTranslation,
    updateNodeData: (graphActions as any).updateNodeData,

    // 上下文统计
    contextStats,
    isLoadingContextStats,
    refreshContextStats,

    // 上下文分析器
    contextAnalyzerVisible,
    contextAnalyzerNodeId,
    contextAnalyzerPendingInput,
  };
});
