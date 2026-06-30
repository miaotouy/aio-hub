import type { Ref } from "vue";
import type { ChatMessageNode } from "../../types/message";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import type {
  ExportableChatSession,
  ResolvedSessionImport,
  SessionImportConflictStrategy,
} from "../../services/sessionImportExportService";
import { resolveConflicts } from "../../services/sessionImportExportService";
import type { FavoriteFolder } from "../../composables/storage/useChatStorageSeparated";
import { refreshLiveGreetingsIfNeeded } from "../../services/greetingService";
import { useSessionManager } from "../../composables/session/useSessionManager";
import { getEffectiveMessageCount } from "../../utils/sessionMessageCount";
import { clearRetrievalCache } from "@/tools/knowledge-base/services/api";
import { createModuleLogger } from "@/utils/logger";
import type { createSessionHistoryManager } from "./sessionHistoryManager";
import type { createSessionRuntimeManager } from "./sessionRuntimeManager";

const logger = createModuleLogger("llm-chat/session-lifecycle");

export interface LifecycleState {
  sessionIndexMap: Ref<Map<string, ChatSessionIndex>>;
  sessionDetailMap: Ref<Map<string, ChatSessionDetail>>;
  currentSessionId: Ref<string | null>;
  favoriteFolders: Ref<FavoriteFolder[]>;
}

export interface LifecycleManagers {
  runtime: ReturnType<typeof createSessionRuntimeManager>;
  history: ReturnType<typeof createSessionHistoryManager>;
  executeOrProxy: <T>(
    action: string,
    params: unknown,
    localFn: () => T | Promise<T>
  ) => Promise<T>;
  fillMissingTokenMetadata: () => Promise<void>;
  getActivePath: (sessionId?: string | null) => ChatMessageNode[];
}

export function createSessionLifecycleManager(
  state: LifecycleState,
  managers: LifecycleManagers
) {
  function getSessionManager() {
    return useSessionManager();
  }

  async function getStorage() {
    const { useChatStorageSeparated } =
      await import("../../composables/storage/useChatStorageSeparated");
    return useChatStorageSeparated();
  }

  async function getInputManager() {
    const { useChatInputManager } =
      await import("../../composables/input/useChatInputManager");
    return useChatInputManager();
  }

  function normalizeLoadedDetail(
    sessionId: string,
    fullSession: {
      index: ChatSessionIndex;
      detail?: Partial<ChatSessionDetail>;
    }
  ): ChatSessionDetail | null {
    if (!fullSession.detail) return null;
    const {
      nodes,
      rootNodeId,
      activeLeafId,
      history,
      historyIndex,
      updatedAt,
    } = fullSession.detail;
    if (!nodes || !rootNodeId || !activeLeafId) return null;

    return {
      id: sessionId,
      nodes,
      rootNodeId,
      activeLeafId,
      updatedAt: updatedAt || fullSession.index.updatedAt,
      history: history && history.length > 0 ? history : [],
      historyIndex: historyIndex !== undefined ? historyIndex : -1,
      parameterOverrides: fullSession.detail.parameterOverrides,
      agentUsage: fullSession.detail.agentUsage,
    };
  }

  async function ensureSessionDetail(
    sessionId: string
  ): Promise<ChatSessionDetail | null> {
    const existing = state.sessionDetailMap.value.get(sessionId);
    if (existing) return existing;

    const storage = await getStorage();
    const fullSession = await storage.loadSession(sessionId);
    if (!fullSession) return null;

    const detail = normalizeLoadedDetail(sessionId, fullSession);
    if (detail) {
      state.sessionDetailMap.value.set(sessionId, detail);
      logger.info("会话详情按需加载完成", { sessionId });
    }
    return detail;
  }

  function cleanupSessionMemory(sessionId: string): void {
    managers.runtime.clearSessionRuntime(sessionId);
    managers.history.cleanupSession(sessionId);
  }

  async function cleanupSessionDraft(sessionId: string): Promise<void> {
    const inputManager = await getInputManager();
    inputManager.clearDraft(sessionId);
  }

  function persistSessions(): void {
    const sessionManager = getSessionManager();
    const allSessions = Array.from(state.sessionIndexMap.value.values()).map(
      (idx) => {
        const detail = state.sessionDetailMap.value.get(idx.id);
        return { index: idx, detail: detail || undefined };
      }
    );
    sessionManager.persistSessions(
      allSessions,
      state.currentSessionId.value,
      state.favoriteFolders.value
    );
  }

  async function createSession(
    agentId: string,
    name?: string
  ): Promise<string> {
    return managers.executeOrProxy(
      "create-session",
      { agentId, name },
      async () => {
        const sessionManager = getSessionManager();
        const { index, detail, sessionId } = await sessionManager.createSession(
          agentId,
          name
        );

        state.sessionIndexMap.value.set(sessionId, index);
        state.sessionDetailMap.value.set(sessionId, detail);
        state.currentSessionId.value = sessionId;

        sessionManager.updateMessageCount(
          sessionId,
          detail.nodes,
          state.sessionIndexMap.value
        );
        sessionManager.persistSession(
          index,
          detail,
          state.currentSessionId.value
        );
        managers.history.clearHistory(sessionId);

        return sessionId;
      }
    );
  }

  async function deleteSession(sessionId: string): Promise<void> {
    return managers.executeOrProxy(
      "delete-session",
      { sessionId },
      async () => {
        const sessionManager = getSessionManager();
        const { newCurrentSessionId } = await sessionManager.deleteSession(
          Array.from(state.sessionIndexMap.value.values()),
          sessionId,
          state.currentSessionId.value
        );

        cleanupSessionMemory(sessionId);
        state.sessionIndexMap.value.delete(sessionId);
        state.sessionDetailMap.value.delete(sessionId);
        await cleanupSessionDraft(sessionId);

        if (state.currentSessionId.value === sessionId) {
          state.currentSessionId.value = newCurrentSessionId;
          if (state.currentSessionId.value) {
            await switchSession(state.currentSessionId.value);
          }
        }

        persistSessions();
      }
    );
  }

  async function batchDeleteSessions(sessionIds: string[]): Promise<void> {
    return managers.executeOrProxy(
      "batch-delete-sessions",
      { sessionIds },
      async () => {
        const idsToDelete = [...new Set(sessionIds)].filter((id) =>
          state.sessionIndexMap.value.has(id)
        );
        if (idsToDelete.length === 0) return;

        const storage = await getStorage();
        const inputManager = await getInputManager();
        const deleteIdSet = new Set(idsToDelete);
        const remainingSessions = Array.from(
          state.sessionIndexMap.value.values()
        )
          .filter((session) => !deleteIdSet.has(session.id))
          .sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );

        let nextCurrentSessionId = state.currentSessionId.value;
        if (nextCurrentSessionId && deleteIdSet.has(nextCurrentSessionId)) {
          nextCurrentSessionId = remainingSessions[0]?.id || null;
        }

        for (const id of idsToDelete) {
          await storage.deleteSession(id);
          cleanupSessionMemory(id);
          state.sessionIndexMap.value.delete(id);
          state.sessionDetailMap.value.delete(id);
          inputManager.clearDraft(id);
        }

        state.currentSessionId.value = nextCurrentSessionId;
        if (nextCurrentSessionId) {
          await switchSession(nextCurrentSessionId);
        } else {
          const sessionManager = getSessionManager();
          await sessionManager.updateCurrentSessionId(null);
        }

        persistSessions();
        logger.info("已批量删除会话", { count: idsToDelete.length });
      }
    );
  }

  async function importSessions(
    sessionsToImport: ExportableChatSession[],
    strategy: SessionImportConflictStrategy = "keep"
  ): Promise<ResolvedSessionImport> {
    return managers.executeOrProxy(
      "import-sessions",
      { sessions: sessionsToImport, strategy },
      async () => {
        const storage = await getStorage();
        const resolved = resolveConflicts(
          sessionsToImport,
          strategy,
          new Set(state.sessionIndexMap.value.keys())
        );

        for (const session of resolved.sessions) {
          const messageCount = getEffectiveMessageCount(
            session.detail.nodes,
            session.detail.rootNodeId
          );
          const index: ChatSessionIndex = {
            ...session.index,
            messageCount,
            updatedAt: session.detail.updatedAt || session.index.updatedAt,
            favoriteFolderId: session.index.favoriteFolderId ?? null,
          };
          const detail: ChatSessionDetail = {
            ...session.detail,
            id: index.id,
            updatedAt: index.updatedAt,
            history: session.detail.history || [],
            historyIndex: session.detail.historyIndex ?? -1,
          };

          state.sessionIndexMap.value.set(index.id, index);
          state.sessionDetailMap.value.set(index.id, detail);
          await storage.persistSession(
            index,
            detail,
            state.currentSessionId.value
          );
        }

        persistSessions();
        logger.info("会话批量导入完成", {
          importedCount: resolved.importedCount,
          skippedCount: resolved.skippedCount,
          renamedCount: resolved.renamedCount,
          overwrittenCount: resolved.overwrittenCount,
        });
        return resolved;
      }
    );
  }

  async function clearEmptySessions(options?: {
    preferredOrderIds?: string[];
  }): Promise<number> {
    return managers.executeOrProxy(
      "clear-empty-sessions",
      { options },
      async () => {
        const storage = await getStorage();
        const inputManager = await getInputManager();
        const sessionIndexes = Array.from(state.sessionIndexMap.value.values());
        const emptySessionIds = sessionIndexes
          .filter((session) => (session.messageCount ?? 0) === 0)
          .map((session) => session.id);

        if (emptySessionIds.length === 0) return 0;

        const emptyIdSet = new Set(emptySessionIds);
        const remainingSessions = sessionIndexes.filter(
          (session) => !emptyIdSet.has(session.id)
        );
        const pickNeighborSessionId = (): string | null => {
          const currentId = state.currentSessionId.value;
          const orderedIds = options?.preferredOrderIds || [];
          const currentIndex = currentId ? orderedIds.indexOf(currentId) : -1;
          if (currentIndex !== -1) {
            for (let i = currentIndex + 1; i < orderedIds.length; i++) {
              const id = orderedIds[i];
              if (!emptyIdSet.has(id) && state.sessionIndexMap.value.has(id)) {
                return id;
              }
            }
            for (let i = currentIndex - 1; i >= 0; i--) {
              const id = orderedIds[i];
              if (!emptyIdSet.has(id) && state.sessionIndexMap.value.has(id)) {
                return id;
              }
            }
          }

          return (
            [...remainingSessions].sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
            )[0]?.id || null
          );
        };

        let nextCurrentSessionId = state.currentSessionId.value;
        if (nextCurrentSessionId && emptyIdSet.has(nextCurrentSessionId)) {
          nextCurrentSessionId = pickNeighborSessionId();
        }

        for (const id of emptySessionIds) {
          await storage.deleteSession(id);
          cleanupSessionMemory(id);
          state.sessionIndexMap.value.delete(id);
          state.sessionDetailMap.value.delete(id);
          inputManager.clearDraft(id);
        }

        state.currentSessionId.value = nextCurrentSessionId;
        if (nextCurrentSessionId) {
          await switchSession(nextCurrentSessionId);
        } else {
          const sessionManager = getSessionManager();
          await sessionManager.updateCurrentSessionId(null);
        }

        persistSessions();
        logger.info("已清理空会话", { count: emptySessionIds.length });
        return emptySessionIds.length;
      }
    );
  }

  async function refreshSessionsIndex(): Promise<number> {
    return managers.executeOrProxy("refresh-sessions-index", {}, async () => {
      const storage = await getStorage();
      const sessionManager = getSessionManager();

      const { repairedCount } = await storage.repairIndex();
      const {
        sessions: refreshedSessions,
        favoriteFolders: refreshedFavoriteFolders,
      } = await sessionManager.loadSessionsIndex();

      const nextMap = new Map<string, ChatSessionIndex>();
      refreshedSessions.forEach((session) => {
        nextMap.set(session.id, session);
      });
      state.sessionIndexMap.value = nextMap;
      state.favoriteFolders.value = refreshedFavoriteFolders;

      if (
        state.currentSessionId.value &&
        !nextMap.has(state.currentSessionId.value)
      ) {
        state.currentSessionId.value =
          [...nextMap.values()].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0]?.id || null;
      }

      logger.info("会话列表索引已刷新", {
        sessionCount: refreshedSessions.length,
        repairedCount,
      });

      return repairedCount;
    });
  }

  async function updateSession(
    sessionId: string,
    updates: Partial<ChatSessionIndex & ChatSessionDetail>
  ): Promise<void> {
    return managers.executeOrProxy(
      "update-session",
      { sessionId, updates },
      async () => {
        const sessionManager = getSessionManager();
        sessionManager.updateSession(
          sessionId,
          updates,
          state.sessionIndexMap.value,
          state.sessionDetailMap.value
        );

        const index = state.sessionIndexMap.value.get(sessionId);
        const detail = state.sessionDetailMap.value.get(sessionId);
        if (index && detail) {
          sessionManager.persistSession(
            index,
            detail,
            state.currentSessionId.value
          );
        }
      }
    );
  }

  async function loadSessions(): Promise<void> {
    const sessionManager = getSessionManager();
    const storage = await getStorage();

    const {
      sessions: indexItems,
      currentSessionId: loadedId,
      favoriteFolders: loadedFavoriteFolders,
    } = await sessionManager.loadSessionsIndex();

    state.sessionIndexMap.value.clear();
    indexItems.forEach((item) => {
      state.sessionIndexMap.value.set(item.id, item);
    });

    state.currentSessionId.value = loadedId;
    state.favoriteFolders.value = loadedFavoriteFolders;

    if (loadedId) {
      const fullSession = await storage.loadSession(loadedId);
      if (fullSession) {
        const detail = normalizeLoadedDetail(loadedId, fullSession);
        if (detail) {
          state.sessionDetailMap.value.set(loadedId, detail);
          logger.info("当前活跃会话详情加载完成", { sessionId: loadedId });
        }
      }
    }

    const detail = loadedId ? state.sessionDetailMap.value.get(loadedId) : null;
    if (
      detail &&
      (detail.history === undefined ||
        detail.historyIndex === undefined ||
        detail.history.length === 0)
    ) {
      managers.history.clearHistory(detail.id);
      logger.info("为加载的当前会话初始化了历史堆栈", {
        sessionId: detail.id,
      });
    }

    await managers.fillMissingTokenMetadata();

    setTimeout(async () => {
      try {
        const { repairedCount } = await storage.repairIndex();
        if (repairedCount > 0) {
          const { sessions: updatedIndexItems } =
            await sessionManager.loadSessionsIndex();
          updatedIndexItems.forEach((updated) => {
            const existing = state.sessionIndexMap.value.get(updated.id);
            if (existing) {
              state.sessionIndexMap.value.set(updated.id, {
                ...existing,
                ...updated,
              });
            }
          });
        }
      } catch (e) {
        logger.warn("索引自愈执行失败", e);
      }
    }, 3000);
  }

  async function switchSession(sessionId: string): Promise<void> {
    return managers.executeOrProxy(
      "switch-session",
      { sessionId },
      async () => {
        const index = state.sessionIndexMap.value.get(sessionId);
        if (!index) {
          logger.warn("切换会话失败：会话不存在", { sessionId });
          return;
        }

        const detail = await ensureSessionDetail(sessionId);
        if (
          detail &&
          (detail.history === undefined ||
            detail.historyIndex === undefined ||
            detail.history.length === 0)
        ) {
          managers.history.clearHistory(sessionId);
          logger.info("为会话初始化了历史堆栈", { sessionId });
        }

        if (detail && index.displayAgentId) {
          const { useAgentStore } = await import("../agentStore");
          const { useUserProfileStore } = await import("../userProfileStore");
          const agentStore = useAgentStore();
          const userProfileStore = useUserProfileStore();
          const agent = await agentStore.ensureAgentLoaded(
            index.displayAgentId
          );
          if (agent) {
            const effectiveUserProfile = userProfileStore.getEffectiveProfile(
              agent.userProfileId
            );
            const changed = await refreshLiveGreetingsIfNeeded(
              index,
              detail,
              agent,
              effectiveUserProfile
            );
            if (changed) {
              const sessionManager = getSessionManager();
              sessionManager.updateMessageCount(
                sessionId,
                detail.nodes,
                state.sessionIndexMap.value
              );
              sessionManager.persistSession(index, detail, sessionId);
              logger.info("切换会话时已同步未固化开场白", {
                sessionId,
                agentId: agent.id,
              });
            }
          }
        }

        state.currentSessionId.value = sessionId;
        const sessionManager = getSessionManager();
        sessionManager.updateCurrentSessionId(sessionId);
        logger.info("切换会话", { sessionId, sessionName: index.name });
      }
    );
  }

  function createFavoriteFolderId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `folder-${crypto.randomUUID()}`;
    }
    return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function toggleFavorite(sessionId: string): Promise<void> {
    return managers.executeOrProxy("toggle-favorite", { sessionId }, () => {
      const index = state.sessionIndexMap.value.get(sessionId);
      if (!index) return;

      index.isFavorite = !index.isFavorite;
      if (!index.isFavorite) {
        index.favoriteFolderId = null;
      }
      index.updatedAt = new Date().toISOString();
      persistSessions();
    });
  }

  async function createFavoriteFolder(
    name: string,
    icon?: string
  ): Promise<string> {
    return managers.executeOrProxy(
      "create-favorite-folder",
      { name, icon },
      () => {
        const now = new Date().toISOString();
        const folder: FavoriteFolder = {
          id: createFavoriteFolderId(),
          name: name.trim(),
          icon: icon || "📁",
          createdAt: now,
          updatedAt: now,
        };

        state.favoriteFolders.value = [...state.favoriteFolders.value, folder];
        persistSessions();
        return folder.id;
      }
    );
  }

  async function renameFavoriteFolder(
    folderId: string,
    name: string
  ): Promise<void> {
    return managers.executeOrProxy(
      "rename-favorite-folder",
      { folderId, name },
      () => {
        const folder = state.favoriteFolders.value.find(
          (item) => item.id === folderId
        );
        if (!folder) return;

        folder.name = name.trim();
        folder.updatedAt = new Date().toISOString();
        persistSessions();
      }
    );
  }

  async function deleteFavoriteFolder(folderId: string): Promise<void> {
    return managers.executeOrProxy(
      "delete-favorite-folder",
      { folderId },
      () => {
        state.favoriteFolders.value = state.favoriteFolders.value.filter(
          (folder) => folder.id !== folderId
        );
        for (const session of state.sessionIndexMap.value.values()) {
          if (session.favoriteFolderId === folderId) {
            session.favoriteFolderId = null;
          }
        }
        persistSessions();
      }
    );
  }

  async function moveSessionToFolder(
    sessionId: string,
    folderId: string | null
  ): Promise<void> {
    return managers.executeOrProxy(
      "move-session-to-folder",
      { sessionId, folderId },
      () => {
        if (
          folderId !== null &&
          !state.favoriteFolders.value.some((folder) => folder.id === folderId)
        ) {
          return;
        }

        const index = state.sessionIndexMap.value.get(sessionId);
        if (!index) return;

        index.isFavorite = true;
        index.favoriteFolderId = folderId;
        index.updatedAt = new Date().toISOString();
        persistSessions();
      }
    );
  }

  async function batchMoveSessionsToFolder(
    sessionIds: string[],
    folderId: string | null
  ): Promise<void> {
    return managers.executeOrProxy(
      "batch-move-sessions-to-folder",
      { sessionIds, folderId },
      () => {
        if (
          folderId !== null &&
          !state.favoriteFolders.value.some((folder) => folder.id === folderId)
        ) {
          return;
        }

        const now = new Date().toISOString();
        for (const sessionId of new Set(sessionIds)) {
          const index = state.sessionIndexMap.value.get(sessionId);
          if (!index) continue;
          index.isFavorite = true;
          index.favoriteFolderId = folderId;
          index.updatedAt = now;
        }

        persistSessions();
        logger.info("已批量移动会话到收藏夹", {
          count: sessionIds.length,
          folderId,
        });
      }
    );
  }

  async function reorderFavoriteFolders(folderIds: string[]): Promise<void> {
    return managers.executeOrProxy(
      "reorder-favorite-folders",
      { folderIds },
      () => {
        const newFolders: FavoriteFolder[] = [];
        for (const id of folderIds) {
          const folder = state.favoriteFolders.value.find((f) => f.id === id);
          if (folder) newFolders.push(folder);
        }
        const remaining = state.favoriteFolders.value.filter(
          (f) => !folderIds.includes(f.id)
        );
        state.favoriteFolders.value = [...newFolders, ...remaining];
        persistSessions();
      }
    );
  }

  async function generateSessionTopic(
    sessionId?: string,
    force?: boolean
  ): Promise<void> {
    const id = sessionId || state.currentSessionId.value;
    if (!id) {
      logger.warn("generateSessionTopic: 无有效 sessionId，退出");
      return;
    }

    const index = state.sessionIndexMap.value.get(id);
    if (!index) {
      logger.warn("generateSessionTopic: index 不存在，退出", {
        sessionId: id,
        detailMapSize: state.sessionDetailMap.value.size,
      });
      return;
    }

    const detail = await ensureSessionDetail(id);
    if (!detail) {
      logger.warn("generateSessionTopic: detail 不存在，退出", {
        sessionId: id,
        detailMapSize: state.sessionDetailMap.value.size,
      });
      return;
    }

    const { useTopicNamer } =
      await import("../../composables/chat/useTopicNamer");
    const { shouldAutoName, generateTopicName } = useTopicNamer();
    const shouldName =
      force || shouldAutoName(detail, state.sessionIndexMap.value);
    logger.info("generateSessionTopic: 命名检查", {
      sessionId: id,
      shouldName,
      force: !!force,
      sessionName: index.name,
    });

    if (shouldName) {
      try {
        await generateTopicName(
          detail,
          state.sessionIndexMap.value,
          state.sessionDetailMap.value,
          (index, detail, currentId) => {
            const sessionManager = getSessionManager();
            sessionManager.persistSession(index, detail, currentId);
          }
        );
      } catch (err) {
        logger.warn("自动生成标题失败", err);
      }
    }
  }

  function exportSessionAsMarkdown(sessionId?: string): string {
    const id = sessionId || state.currentSessionId.value;
    if (!id) return "";

    const detail = state.sessionDetailMap.value.get(id);
    const activePath = managers.getActivePath(id);
    const sessionManager = getSessionManager();
    return sessionManager.exportSessionAsMarkdown(detail || null, activePath);
  }

  async function clearAllSessions(): Promise<void> {
    const inputManager = await getInputManager();
    for (const sessionId of state.sessionIndexMap.value.keys()) {
      cleanupSessionMemory(sessionId);
    }

    state.sessionIndexMap.value.clear();
    state.sessionDetailMap.value.clear();
    state.currentSessionId.value = null;
    inputManager.clearAllDrafts();
    persistSessions();
    await clearRetrievalCache();
    const sessionManager = getSessionManager();
    sessionManager.clearAllSessions();
    logger.info("清空所有会话");
  }

  return {
    createSession,
    deleteSession,
    batchDeleteSessions,
    importSessions,
    clearEmptySessions,
    refreshSessionsIndex,
    updateSession,
    loadSessions,
    switchSession,
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
  };
}
