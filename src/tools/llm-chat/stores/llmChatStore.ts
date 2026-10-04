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
import {
  isSessionVolatile,
  markSessionPersistent,
  markSessionVolatile,
  useSessionManager,
} from "../composables/session/useSessionManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatUiState } from "../composables/ui/useLlmChatUiState";
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
  ChatSessionDraft,
  ChatMessageNode,
  LlmParameters,
  ModelIdentifier,
} from "../types";
import type { FavoriteFolder } from "../composables/storage/useChatStorageSeparated";
import type { RecoveryState } from "../types/persistence";
import type { PendingInputData } from "../types/context";
import type { LlmMessageContent } from "@/llm-apis/common";
import type { Asset } from "@/types/asset-management";
import type { KnowledgeReference } from "@/tools/knowledge-base/types";
import { createModuleLogger } from "@utils/logger";
import { createSessionAccessManager } from "./session/sessionAccessManager";
import { createSessionRuntimeManager } from "./session/sessionRuntimeManager";
import { createSessionHistoryManager } from "./session/sessionHistoryManager";
import { createSessionGenerationManager } from "./session/sessionGenerationManager";
import { createSessionLifecycleManager } from "./session/sessionLifecycleManager";
import { useToolCallingStore } from "./toolCallingStore";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  // ==================== 状态 ====================
  const sessionIndexMap = ref<Map<string, ChatSessionIndex>>(new Map());
  const sessionDetailMap = ref<Map<string, ChatSessionDetail>>(new Map());
  const newSessionDraft = ref<ChatSessionDraft | null>(null);
  const favoriteFolders = ref<FavoriteFolder[]>([]);
  const currentSessionId = ref<string | null>(null);
  const sessionRecovery = ref<RecoveryState>({
    status: "ready",
    failedSessionCount: 0,
    scannedSessionCount: 0,
  });
  const parameters = ref<LlmParameters>({
    temperature: 1,
    maxTokens: 4096,
  });
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
    findSessionIdByNodeId: sessionAccess.findSessionIdByNodeId,
  });
  const sessionHistory = createSessionHistoryManager({
    sessionIndexMap,
    sessionDetailMap,
    currentSessionId,
  });
  const inputManager = useChatInputManager();
  const toolCallingStore = useToolCallingStore();

  watch(
    newSessionDraft,
    (draft, previousDraft) => {
      if (draft) {
        markSessionVolatile(draft.index.id);
        sessionIndexMap.value.set(draft.index.id, draft.index);
        sessionDetailMap.value.set(draft.detail.id, draft.detail);
        return;
      }

      if (previousDraft) {
        markSessionPersistent(previousDraft.index.id);
      }
    },
    { deep: false }
  );

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
        // 僵死节点修复只针对当前会话；排队调度则必须覆盖后台会话，
        // 否则切换会话后完成的请求会让队列永久停留在 queued 状态。
        const detail = currentSessionDetail.value;
        if (detail?.nodes) {
          let hasFixed = false;
          Object.values(detail.nodes).forEach((node) => {
            if (
              (node.status === "generating" || node.status === "waiting") &&
              node.metadata?.isQueued !== true &&
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
        }

        // 排队调度按节点路径判断，而不是按整个会话加锁。这样同一会话的不同
        // 分支可以并行恢复；如果目标路径仍在生成，则保留队列标记等待下一次完成事件。
        if (queuedSessionIds.value.size > 0) {
          const { useChatSettings } =
            await import("../composables/settings/useChatSettings");
          const { settings } = useChatSettings();
          if (!settings.value.uiPreferences.autoTriggerGenerationAfterQueue) {
            return;
          }
          // 以节点上的排队标记为最终事实，补上运行时集合可能因跨分支发送
          // 或旧版本状态清理而遗漏的会话，避免 queued 节点永久无人调度。
          const queuedIds = new Set(queuedSessionIds.value);
          sessionDetailMap.value.forEach((session, sessionId) => {
            if (
              session.nodes &&
              Object.values(session.nodes).some(
                (node) =>
                  node.metadata?.isQueued === true ||
                  node.status === "queued" ||
                  (node.role === "assistant" &&
                    (node.status as string) === "pending")
              )
            ) {
              queuedIds.add(sessionId);
            }
          });

          await Promise.all(
            Array.from(queuedIds).map((sessionId) =>
              sessionGeneration.triggerQueuedGenerationForSession(sessionId)
            )
          );
        }
      }
    },
    { flush: "post" }
  );

  const sessions = computed(() =>
    Array.from(sessionIndexMap.value.values()).filter(
      (session) => !isSessionVolatile(session.id)
    )
  );

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
    const { currentAgentId } = useLlmChatUiState();
    const agent = currentAgentId.value
      ? agentStore.getAgentById(currentAgentId.value)
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

  const getSiblingsInSession = (
    nodeId: string,
    sessionId: string
  ): ChatMessageNode[] => {
    const detail = sessionAccess.getSessionDetail(sessionId);
    if (!detail) return [];

    if (nodeId.startsWith("preset-")) {
      logger.warn("尝试获取预设消息的兄弟节点", { nodeId });
      return [];
    }

    return BranchNavigator.getSiblings(detail, nodeId);
  };

  const isNodeInActivePathInSession = (
    nodeId: string,
    sessionId: string
  ): boolean => {
    const detail = sessionAccess.getSessionDetail(sessionId);
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
      newSessionDraft,
      currentSessionId,
      favoriteFolders,
      sessionRecovery,
    },
    {
      runtime: sessionRuntime,
      history: sessionHistory,
      executeOrProxy,
      fillMissingTokenMetadata,
      getActivePath: sessionAccess.getActivePath,
      cancelSessionApprovals: (sessionId, reason) => {
        toolCallingStore.cancelBySession(sessionId, reason);
      },
    }
  );
  const {
    beginNewSession,
    materializeNewSession,
    updateNewSessionAgent,
    createSession,
    switchSession,
    deleteSession,
    batchDeleteSessions,
    importSessions,
    clearEmptySessions,
    refreshSessionsIndex,
    cancelIndexRecovery,
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
    ensureSessionDetail,
  } = sessionLifecycle;

  let autoMaterializingDraftId: string | null = null;
  watch(
    () => {
      const draft = newSessionDraft.value;
      if (!draft) return null;

      return {
        id: draft.index.id,
        messageCount: getEffectiveMessageCount(
          draft.detail.nodes,
          draft.detail.rootNodeId
        ),
      };
    },
    async (draft) => {
      // 正常发送会在首条消息前提升草稿。此处兜底处理旧发送路径已经
      // 写入消息、却仍停留在虚拟会话的情况，避免历史会话列表卡住。
      if (!draft || draft.messageCount === 0 || autoMaterializingDraftId) {
        return;
      }

      autoMaterializingDraftId = draft.id;
      try {
        await materializeNewSession();
        logger.info("检测到带消息的虚拟会话，已自动提升为历史会话", {
          sessionId: draft.id,
          messageCount: draft.messageCount,
        });
      } catch (error) {
        logger.warn("自动提升带消息的虚拟会话失败", {
          sessionId: draft.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        autoMaterializingDraftId = null;
      }
    },
    { flush: "post" }
  );

  // ==================== 按会话 id 的只读访问 ====================
  // 显式绑定到任意会话（如后台子会话），不改变 currentSessionId。

  function getSessionIndexById(sessionId: string): ChatSessionIndex | null {
    return sessionAccess.getSessionIndex(sessionId);
  }

  function getSessionDetailById(sessionId: string): ChatSessionDetail | null {
    return sessionAccess.getSessionDetail(sessionId);
  }

  function getActivePathBySessionId(sessionId: string): ChatMessageNode[] {
    return sessionAccess.getActivePath(sessionId);
  }

  async function ensureSessionDetailLoaded(
    sessionId: string
  ): Promise<ChatSessionDetail | null> {
    const existing = sessionAccess.getSessionDetail(sessionId);
    if (existing) return existing;

    try {
      return await ensureSessionDetail(sessionId);
    } catch (error) {
      logger.warn("按需加载会话详情失败", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

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
      knowledgeReference?: KnowledgeReference | null;
      parentId?: string;
      disableMacroParsing?: boolean;
      agentId?: string;
      sessionId?: string;
      /** 子智能体派发深度：sub-agent 派发子会话时传 parent depth + 1 */
      delegationDepth?: number;
    }
  ): Promise<void> {
    let targetOptions = options;
    const draftSessionId = newSessionDraft.value?.index.id;
    // ChatArea 会把当前会话 ID 一并传入发送参数。虚拟新会话此时仍然
    // 使用草稿 ID，不能因为参数里已有 sessionId 就跳过提升，否则消息
    // 会一直留在 volatile 会话中，生成结束后的持久化也会被忽略。
    if (
      newSessionDraft.value &&
      (!options?.sessionId || options.sessionId === draftSessionId)
    ) {
      const sessionId = await materializeNewSession();
      if (sessionId) {
        targetOptions = { ...options, sessionId };
      }
    }
    return sessionGeneration.sendMessage(content, targetOptions);
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
    const targetSessionId = sessionId || currentSessionId.value;
    if (targetSessionId) {
      toolCallingStore.cancelBySession(targetSessionId, "生成已中止");
    }
    sessionRuntime.abortSessionGeneration(sessionId);
  }

  /**
   * 中止指定节点的生成
   */
  function abortNodeGeneration(nodeId: string): void {
    const sessionId = sessionAccess.findSessionIdByNodeId(nodeId);
    if (sessionId) {
      toolCallingStore.cancelBySession(sessionId, "生成节点已中止");
    }
    sessionRuntime.abortNodeGeneration(nodeId);
  }

  /**
   * 增量更新指定消息节点的 metadata（后台任务观察埋点用）。
   *
   * - 只做浅合并，保留既有 metadata 字段，不改变消息持久化格式；
   * - 用于 Phase 1 后台任务把 taskId / childSessionId / parentSessionId 等
   *   关系字段增量写入子会话消息，旧会话缺少这些字段仍可正常读取；
   * - 找不到节点时返回 false，不抛错。
   */
  function updateMessageMetadata(
    sessionId: string,
    nodeId: string,
    patch: Record<string, unknown>
  ): boolean {
    const detail = sessionDetailMap.value.get(sessionId);
    const node = detail?.nodes?.[nodeId];
    if (!detail || !node) {
      logger.warn("更新消息 metadata 失败：目标节点不存在", {
        sessionId,
        nodeId,
      });
      return false;
    }

    node.metadata = {
      ...(node.metadata ?? {}),
      ...patch,
    } as ChatMessageNode["metadata"];
    node.updatedAt = new Date().toISOString();

    const index = sessionIndexMap.value.get(sessionId);
    if (index) {
      const sessionManager = useSessionManager();
      sessionManager.persistSession(index, detail, currentSessionId.value);
    }
    return true;
  }

  /**
   * 创建一个不切换当前选中会话的独立子会话（后端子智能体任务用）。
   *
   * 复用 useSessionManager 的建会话逻辑，只写入内存 maps 与持久化，
   * 不修改 currentSessionId，避免后台任务干扰发起方会话正在进行的生成。
   * 创建失败时返回 null，不抛错。
   */
  async function createDetachedSession(
    agentId: string,
    name?: string
  ): Promise<string | null> {
    try {
      const sessionManager = useSessionManager();
      const { index, detail, sessionId } = await sessionManager.createSession(
        agentId,
        name
      );
      sessionIndexMap.value.set(sessionId, index);
      sessionDetailMap.value.set(sessionId, detail);
      sessionManager.updateMessageCount(
        sessionId,
        detail.nodes,
        sessionIndexMap.value
      );
      sessionManager.persistSession(index, detail, currentSessionId.value);
      sessionHistory.clearHistory(sessionId);
      logger.info("已创建独立子会话（不切换当前会话）", {
        sessionId,
        agentId,
      });
      return sessionId;
    } catch (error) {
      logger.warn("创建独立子会话失败", {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 向指定会话追加一条消息节点（后台任务合成结果 / 用户介入用）。
   *
   * - 挂到当前 activeLeafId 之后，并把它设为新的 activeLeafId；
   * - 只做内存树与持久化写入，不改变既有消息持久化格式；
   * - 目标会话详情未加载时返回 null，不抛错。
   */
  function appendMessageNode(
    sessionId: string,
    message: {
      role: ChatMessageNode["role"];
      content: string;
      metadata?: ChatMessageNode["metadata"];
    }
  ): string | null {
    const detail = sessionDetailMap.value.get(sessionId);
    if (!detail) {
      logger.warn("追加消息失败：目标会话详情未加载", { sessionId });
      return null;
    }

    const now = new Date().toISOString();
    const nodeId = `node-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 11)}`;
    const parentId = detail.activeLeafId ?? detail.rootNodeId;
    const node: ChatMessageNode = {
      id: nodeId,
      parentId,
      childrenIds: [],
      content: message.content,
      role: message.role,
      status: "complete",
      isEnabled: true,
      timestamp: now,
      updatedAt: now,
      metadata: message.metadata,
    };

    detail.nodes[nodeId] = node;
    const parent = detail.nodes[parentId];
    if (parent && !parent.childrenIds.includes(nodeId)) {
      parent.childrenIds.push(nodeId);
    }
    detail.activeLeafId = nodeId;
    detail.updatedAt = now;

    const index = sessionIndexMap.value.get(sessionId);
    if (index) {
      const sessionManager = useSessionManager();
      sessionManager.updateMessageCount(
        sessionId,
        detail.nodes,
        sessionIndexMap.value
      );
      sessionManager.persistSession(index, detail, currentSessionId.value);
    }
    return nodeId;
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
    newSessionDraft,
    favoriteFolders,
    currentSessionId,
    sessionRecovery,
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
      if (newSessionDraft.value) {
        newMap.set(newSessionDraft.value.index.id, newSessionDraft.value.index);
      }
      sessionIndexMap.value = newMap;

      logger.debug("已批量同步会话列表索引", { count: sessions.length });
    },
    isCurrentSessionGenerating,
    currentActivePath,
    currentActivePathWithPresets,
    llmContext,
    getSiblings,
    getSiblingsInSession,
    isNodeInActivePath,
    isNodeInActivePathInSession,
    isNodeGenerating,
    getSessionGeneratingNodeIds,
    isSessionGenerating,
    currentMessageCount,

    // 按会话 id 的只读访问（不改变 currentSessionId）
    getSessionIndexById,
    getSessionDetailById,
    getActivePathBySessionId,
    ensureSessionDetailLoaded,

    // 历史记录
    undo,
    redo,
    jumpToHistory,
    getHistoryManager,
    canUndo: historyManager.canUndo,
    canRedo: historyManager.canRedo,

    // 会话操作
    beginNewSession,
    materializeNewSession,
    updateNewSessionAgent,
    createSession,
    switchSession,
    deleteSession,
    batchDeleteSessions,
    importSessions,
    clearEmptySessions,
    refreshSessionsIndex,
    cancelIndexRecovery,
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
    reparseNodeToolsInSession: async (
      nodeId: string,
      sessionId: string,
      options?: { temporaryModel?: ModelIdentifier | null }
    ): Promise<void> => {
      const detail = sessionAccess.getSessionDetail(sessionId);
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
    updateMessageMetadata,
    createDetachedSession,
    appendMessageNode,

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
