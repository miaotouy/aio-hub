// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * LLM Chat 状态管理（树形历史结构）
 * 重构后的版本：专注于状态管理，复杂逻辑委托给 composables 和 services
 */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useSessionManager } from "../composables/session/useSessionManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useAgentStore } from "./agentStore";
import { useGraphActions } from "../composables/visualization/useGraphActions";
import { useChatHandler } from "../composables/chat/useChatHandler";
import { useChatInputManager } from "../composables/input/useChatInputManager";
import { useChatContextStats } from "../composables/features/useChatContextStats";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getActivePathWithPresets } from "../utils/chatPathUtils";
import { getEffectiveMessageCount } from "../utils/sessionMessageCount";
import type { ModelMatchContext } from "../utils/modelMatchUtils";
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
import type { FavoriteFolder } from "../composables/storage/useChatStorageSeparated";
import type { PendingInputData } from "../types/context";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import { createModuleLogger } from "@utils/logger";
import { createSessionAccessManager } from "./session/sessionAccessManager";
import { createSessionRuntimeManager } from "./session/sessionRuntimeManager";
import { createSessionHistoryManager } from "./session/sessionHistoryManager";
import { createSessionGenerationManager } from "./session/sessionGenerationManager";
import { createSessionLifecycleManager } from "./session/sessionLifecycleManager";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  // ==================== 状态 ====================
  const sessionIndexMap = ref<Map<string, ChatSessionIndex>>(new Map());
  const sessionDetailMap = ref<Map<string, ChatSessionDetail>>(new Map());
  const favoriteFolders = ref<FavoriteFolder[]>([]);
  const currentSessionId = ref<string | null>(null);
  const parameters = ref<LlmParameters>({
    temperature: 1,
    maxTokens: 4096,
  });
  // 用户主动中止的节点集合，用于区分"用户中止"与"自然结束"，防止错误触发排队
  const userAbortedNodeIds = ref(new Set<string>());
  // 只记录同一会话连续发送产生的队列，避免跨会话生成被误判成全局队列锁
  const queuedSessionIds = ref(new Set<string>());
  const queuedSessionAgentIds = ref(new Map<string, string>());

  // 上下文分析器状态
  const contextAnalyzerVisible = ref(false);
  const contextAnalyzerNodeId = ref<string | null>(null);
  const contextAnalyzerPendingInput = ref<PendingInputData | undefined>(
    undefined
  );
  const abortControllers = ref(new Map<string, AbortController>());
  const generatingNodes = ref(new Set<string>());
  const isSending = computed(() => generatingNodes.value.size > 0);

  const sessionAccess = createSessionAccessManager({
    sessionIndexMap,
    sessionDetailMap,
    currentSessionId,
  });
  const sessionRuntime = createSessionRuntimeManager({
    sessionDetailMap,
    currentSessionId,
    abortControllers,
    generatingNodes,
    queuedSessionIds,
    queuedSessionAgentIds,
    userAbortedNodeIds,
    findSessionIdByNodeId: sessionAccess.findSessionIdByNodeId,
  });
  const sessionHistory = createSessionHistoryManager({
    sessionIndexMap,
    sessionDetailMap,
    currentSessionId,
  });
  const inputManager = useChatInputManager();

  watch(
    currentSessionId,
    (sessionId) => {
      inputManager.setActiveSessionId(sessionId);
    },
    { immediate: true }
  );

  /**
   * 自动修复僵死节点的生成状态
   * 如果一个节点在 session 中是 generating 状态，但不在 generatingNodes 集合中，
   * 说明它已经脱离了执行器的控制，需要强制修复状态。
   */
  watch(
    () => generatingNodes.value.size,
    async (newSize, oldSize) => {
      // 只有在生成节点减少时（任务结束或中止）才进行检查
      if (newSize < (oldSize || 0)) {
        const detail = currentSessionDetail.value;
        if (!detail) return;

        let hasFixed = false;
        if (!detail.nodes) return;

        Object.values(detail.nodes).forEach((node) => {
          if (
            node.status === "generating" &&
            !generatingNodes.value.has(node.id)
          ) {
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
            sessionManager.updateMessageCount(
              detail.id,
              detail.nodes,
              sessionIndexMap.value
            );
            sessionManager.persistSession(
              index,
              detail,
              currentSessionId.value
            );
          }
        }

        if (userAbortedNodeIds.value.size > 0) {
          userAbortedNodeIds.value.forEach((nodeId) => {
            const sessionId = findSessionIdByNodeId(nodeId);
            if (sessionId) {
              queuedSessionIds.value.delete(sessionId);
              queuedSessionAgentIds.value.delete(sessionId);
            }
          });
          userAbortedNodeIds.value.clear();
        }

        // 排队自动触发：生成节点减少时，只检查本次同会话连续发送产生的队列
        if (queuedSessionIds.value.size > 0) {
          const { useChatSettings } =
            await import("../composables/settings/useChatSettings");
          const { settings } = useChatSettings();
          if (!settings.value.uiPreferences.autoTriggerGenerationAfterQueue) {
            return;
          }
          const queuedIds = Array.from(queuedSessionIds.value).filter(
            (sessionId) => !isSessionGenerating(sessionId)
          );
          for (const sessionId of queuedIds) {
            await sessionGeneration.triggerQueuedGenerationForSession(
              sessionId
            );
          }
        }
      }
    },
    { flush: "post" }
  );

  const sessions = computed(() => Array.from(sessionIndexMap.value.values()));

  const favoriteSessions = computed(() =>
    sessions.value.filter((session) => session.isFavorite)
  );

  const getSessionsByFolderId = computed(() => {
    return (folderId: string | null) =>
      sessions.value.filter(
        (session) =>
          session.isFavorite && (session.favoriteFolderId ?? null) === folderId
      );
  });

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
  const currentFullSession = computed(
    (): { index: ChatSessionIndex; detail: ChatSessionDetail } | null => {
      const index = currentSession.value;
      const detail = currentSessionDetail.value;
      if (!index || !detail) return null;
      return { index, detail };
    }
  );

  /**
   * 当前会话是否正在生成
   * 只检查当前会话的节点，不受其他会话生成状态影响
   */
  const isCurrentSessionGenerating = computed(() => {
    return currentSessionId.value
      ? isSessionGenerating(currentSessionId.value)
      : false;
  });

  const currentActivePath = computed((): ChatMessageNode[] => {
    return sessionAccess.getActivePath(currentSessionId.value);
  });

  const currentActivePathWithPresets = computed((): ChatMessageNode[] => {
    const agentStore = useAgentStore();
    const agent = agentStore.currentAgentId
      ? agentStore.getAgentById(agentStore.currentAgentId)
      : null;
    const fullSession = currentFullSession.value;
    if (!fullSession) return [];

    // 构建 modelMatch 上下文，用于 displayPresetCount 的类型感知过滤
    let modelMatchContext: ModelMatchContext | undefined;
    if (agent) {
      const { getProfileById } = useLlmProfiles();
      const profile = getProfileById(agent.profileId);
      const model = profile?.models.find((m) => m.id === agent.modelId);
      modelMatchContext = {
        modelId: agent.modelId,
        modelName: model?.name || agent.modelId,
        profileName: profile?.name,
      };
    }

    return getActivePathWithPresets(
      currentActivePath.value,
      fullSession.index,
      fullSession.detail,
      agent || null,
      modelMatchContext
    );
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
    }
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
    return sessionRuntime.isNodeGenerating(nodeId);
  };

  const getSessionGeneratingNodeIds = (sessionId: string): string[] => {
    return sessionRuntime.getSessionGeneratingNodeIds(sessionId);
  };

  const isSessionGenerating = (sessionId: string): boolean => {
    return sessionRuntime.isSessionGenerating(sessionId);
  };

  const findSessionIdByNodeId = (nodeId: string): string | null => {
    return sessionAccess.findSessionIdByNodeId(nodeId);
  };

  const currentMessageCount = computed((): number => {
    const index = currentSession.value;
    const detail = currentSessionDetail.value;
    if (!index) return 0;
    // 如果详情已加载，使用实时节点数；否则使用索引中缓存的数量
    if (detail && detail.nodes) {
      return getEffectiveMessageCount(detail.nodes, detail.rootNodeId);
    }
    // 增加对 -1 的容错：如果 messageCount 是负数，说明索引已损坏，回退到 0
    const cachedCount =
      index.messageCount !== undefined && index.messageCount >= 0
        ? index.messageCount
        : 0;
    return cachedCount;
  });

  // ==================== 历史记录管理 ====================
  const historyManager = {
    undo: () => sessionHistory.undo(),
    redo: () => sessionHistory.redo(),
    recordHistory: (...args: any[]) =>
      (sessionHistory.getHistoryManager()?.recordHistory as any)?.(...args),
    clearHistory: () => sessionHistory.clearHistory(),
    jumpToState: (index: number) => sessionHistory.jumpToHistory(index),
    canUndo: sessionHistory.canUndo,
    canRedo: sessionHistory.canRedo,
    historyStack: computed(
      () => sessionHistory.getHistoryManager()?.historyStack.value ?? []
    ),
  };

  // ==================== 代理辅助函数 ====================
  const bus = useWindowSyncBus();

  /**
   * 执行本地逻辑或代理到主窗口
   * 确保 detached-component 窗口的操作始终转发给 Data Owner
   */
  async function executeOrProxy<T>(
    action: string,
    params: any,
    localFn: () => T | Promise<T>
  ): Promise<T> {
    if (bus.windowType === "detached-component") {
      logger.info(`代理操作到主窗口: ${action}`, { params });
      return bus.requestAction<any, T>(`llm-chat:${action}`, params);
    }
    return localFn();
  }

  const sessionGeneration = createSessionGenerationManager(
    {
      sessionIndexMap,
      sessionDetailMap,
      currentSessionId,
      abortControllers,
      generatingNodes,
      queuedSessionIds,
      queuedSessionAgentIds,
    },
    {
      access: sessionAccess,
      runtime: sessionRuntime,
      history: sessionHistory,
      executeOrProxy,
    }
  );
  const sessionLifecycle = createSessionLifecycleManager(
    {
      sessionIndexMap,
      sessionDetailMap,
      currentSessionId,
      favoriteFolders,
    },
    {
      runtime: sessionRuntime,
      history: sessionHistory,
      executeOrProxy,
      fillMissingTokenMetadata,
      getActivePath: sessionAccess.getActivePath,
    }
  );
  const {
    createSession,
    switchSession,
    deleteSession,
    batchDeleteSessions,
    importSessions,
    clearEmptySessions,
    refreshSessionsIndex,
    updateSession,
    loadSessions,
    persistSessions,
    toggleFavorite,
    createFavoriteFolder,
    renameFavoriteFolder,
    deleteFavoriteFolder,
    moveSessionToFolder,
    batchMoveSessionsToFolder,
    reorderFavoriteFolders,
    generateSessionTopic,
    exportSessionAsMarkdown,
    clearAllSessions,
  } = sessionLifecycle;

  function undo(sessionId?: string) {
    sessionHistory.undo(sessionId);
  }

  function redo(sessionId?: string) {
    sessionHistory.redo(sessionId);
  }

  function jumpToHistory(index: number, sessionId?: string) {
    sessionHistory.jumpToHistory(index, sessionId);
  }

  function getHistoryManager(sessionId?: string | null) {
    return sessionHistory.getHistoryManager(sessionId);
  }

  // ==================== 图操作 (委托给 useGraphActions) ====================
  const graphActions = useGraphActions(
    currentSessionDetail,
    currentSessionId,
    historyManager,
    sessionIndexMap,
    {
      sessionDetailMap,
      getHistoryManager,
    }
  );

  // ==================== Token 操作 (委托给 Service) ====================

  /**
   * 重新计算单个节点的 token
   */
  async function recalculateNodeTokens(
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    nodeId: string
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
      agentId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    return sessionGeneration.sendMessage(content, options);
  }

  /**
   * 续写消息
   */
  async function continueGeneration(
    nodeId: string,
    options?: {
      modelId?: string;
      profileId?: string;
      agentId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    return sessionGeneration.continueGeneration(nodeId, options);
  }

  /**
   * 输入框补全
   */
  async function completeInput(
    content: string,
    options?: { modelId?: string; profileId?: string; sessionId?: string }
  ): Promise<void> {
    return sessionGeneration.completeInput(content, options);
  }

  /**
   * 从指定节点重新生成（历史断点）
   */
  async function regenerateFromNode(
    nodeId: string,
    options?: {
      modelId?: string;
      profileId?: string;
      agentId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    return sessionGeneration.regenerateFromNode(nodeId, options);
  }

  /**
   * 重新生成最后一条助手消息（向后兼容）
   */
  async function regenerateLastMessage(): Promise<void> {
    return sessionGeneration.regenerateLastMessage();
  }

  /**
   * 中止当前发送
   */
  function abortSending(sessionId?: string): void {
    sessionRuntime.abortSessionGeneration(sessionId);
  }

  /**
   * 中止指定节点的生成
   */
  function abortNodeGeneration(nodeId: string): void {
    sessionRuntime.abortNodeGeneration(nodeId);
  }

  // ==================== 参数管理 ====================
  function updateParameters(newParameters: Partial<LlmParameters>): void {
    Object.assign(parameters.value, newParameters);
    logger.info("更新参数配置", { parameters: newParameters });
  }

  // 上下文统计管理 (委托给 Composable)
  const { contextStats, isLoadingContextStats, refreshContextStats } =
    useChatContextStats(currentSession, currentSessionDetail, currentSessionId);

  // ==================== 返回 ====================
  return {
    // 状态
    sessions,
    sessionIndexMap,
    sessionDetailMap,
    favoriteFolders,
    currentSessionId,
    parameters,
    isSending,
    abortControllers,
    generatingNodes,

    // Getters
    currentSession,
    currentSessionDetail,
    favoriteSessions,
    getSessionsByFolderId,
    setSessions: (sessions: ChatSessionIndex[]) => {
      // 性能优化：创建一个新的 Map 并一次性替换，避免逐个 set 触发响应式风暴
      const newMap = new Map<string, ChatSessionIndex>();
      sessions.forEach((s) => newMap.set(s.id, s));
      sessionIndexMap.value = newMap;

      logger.debug("已批量同步会话列表索引", { count: sessions.length });
    },
    isCurrentSessionGenerating,
    currentActivePath,
    currentActivePathWithPresets,
    llmContext,
    getSiblings,
    isNodeInActivePath,
    isNodeGenerating,
    getSessionGeneratingNodeIds,
    isSessionGenerating,
    currentMessageCount,

    // 历史记录
    undo,
    redo,
    jumpToHistory,
    getHistoryManager,
    canUndo: historyManager.canUndo,
    canRedo: historyManager.canRedo,

    // 会话操作
    createSession,
    switchSession,
    deleteSession,
    batchDeleteSessions,
    importSessions,
    clearEmptySessions,
    refreshSessionsIndex,
    updateSession,
    loadSessions,
    persistSessions,
    toggleFavorite,
    createFavoriteFolder,
    renameFavoriteFolder,
    deleteFavoriteFolder,
    moveSessionToFolder,
    batchMoveSessionsToFolder,
    reorderFavoriteFolders,
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
    reparseNodeTools: async (
      nodeId: string,
      options?: { temporaryModel?: ModelIdentifier | null }
    ): Promise<void> => {
      const detail = currentSessionDetail.value;
      if (!detail) return;
      const chatHandler = useChatHandler();
      await chatHandler.reparseNodeTools(
        detail,
        nodeId,
        abortControllers.value,
        generatingNodes.value,
        options
      );
    },
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
