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
 * Compatibility facade for llm-chat's separated session files.
 *
 * All writes now flow through SessionPersistenceCoordinator and the native
 * atomic-write command. The facade intentionally keeps legacy call sites
 * working while separating session content, index metadata and current-session
 * selection persistence.
 */

import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { toRaw } from "vue";
import { useDebounceFn } from "@vueuse/core";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types";
import { getEffectiveMessageCount } from "../../utils/sessionMessageCount";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import {
  SessionPersistenceCoordinator,
  type SessionPersistenceWriter,
} from "../../services/sessionPersistenceCoordinator";
import {
  createPersistenceMeta,
  isValidSessionPayload,
  readRevision,
  SessionPersistenceRepository,
} from "../../services/sessionPersistenceRepository";
import type {
  CommitResult,
  CorruptionManifestEntry,
  FavoriteFolder,
  RecoveryState,
  SessionsIndex,
} from "../../types/persistence";

export type { FavoriteFolder } from "../../types/persistence";

const logger = createModuleLogger("llm-chat/storage-separated");
const errorHandler = createModuleErrorHandler("llm-chat/storage-separated");
const INDEX_VERSION = "1.1.2";

function createDefaultIndex(): SessionsIndex {
  return {
    version: INDEX_VERSION,
    currentSessionId: null,
    sessions: [],
    favoriteFolders: [],
    _persistence: createPersistenceMeta(),
  };
}

function serialize(value: unknown): string {
  // JSON.stringify is deliberately synchronous so a queued commit cannot keep
  // reactive references that later mutate underneath it.
  return JSON.stringify(toRaw(value));
}

function createIndexItem(
  session: ChatSessionIndex & Partial<ChatSessionDetail>
): ChatSessionIndex {
  return {
    id: session.id,
    name: session.name,
    displayAgentId: session.displayAgentId,
    messageCount: session.nodes
      ? getEffectiveMessageCount(session.nodes, session.rootNodeId)
      : session.messageCount || 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isFavorite: session.isFavorite,
    favoriteFolderId: session.favoriteFolderId,
  };
}

function toStoredSession(
  session: ChatSessionIndex & ChatSessionDetail,
  revision: number
): Record<string, unknown> {
  const {
    history: _history,
    historyIndex: _historyIndex,
    ...persisted
  } = toRaw(session);
  const result = {
    ...persisted,
    _persistence: createPersistenceMeta(revision),
  } as Record<string, unknown>;
  delete result.isFavorite;
  delete result.favoriteFolderId;
  return result;
}

const repository = new SessionPersistenceRepository();

function isDetachedComponentWindow(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/detached-component/")
  );
}

const writer: SessionPersistenceWriter = {
  write(request) {
    if (isDetachedComponentWindow()) {
      return Promise.reject(
        new Error(
          "Detached llm-chat windows must proxy persistence to the main window"
        )
      );
    }
    return invoke<CommitResult>("llm_chat_atomic_write", { request });
  },
};

async function deleteSessionFromNative(sessionId: string): Promise<void> {
  if (isDetachedComponentWindow()) {
    throw new Error(
      "Detached llm-chat windows must proxy persistence to the main window"
    );
  }
  await invoke("llm_chat_delete_session", { request: { sessionId } });
}
const coordinator = new SessionPersistenceCoordinator({
  writer,
  onBackgroundError(error, context) {
    errorHandler.handle(error as Error, {
      userMessage: "会话持久化失败",
      showToUser: false,
      context,
    });
  },
});

let cachedIndex: SessionsIndex | null = null;
let needsPrimaryRepair = false;
let recoveryState: RecoveryState = {
  status: "ready",
  failedSessionCount: 0,
  scannedSessionCount: 0,
};

async function ensureIndex(): Promise<SessionsIndex> {
  if (cachedIndex) return cachedIndex;
  const result = await repository.loadIndex();
  if (result.status === "ready" || result.status === "recovered") {
    cachedIndex = result.index;
    cachedIndex.favoriteFolders = Array.isArray(cachedIndex.favoriteFolders)
      ? cachedIndex.favoriteFolders
      : [];
    coordinator.primeIndexRevision(readRevision(cachedIndex));
    if (result.status === "recovered") {
      needsPrimaryRepair = true;
      recoveryState = {
        status: "ready",
        failedSessionCount: 0,
        scannedSessionCount: 0,
      };
      // Preserve the damaged primary before any later normal mutation replaces
      // it, so diagnostics are not silently lost.
      await repository.preserveCorruptPrimary().catch((error) => {
        logger.warn("保留损坏会话索引样本失败", { error });
      });
      logger.warn("使用会话索引备份恢复", { source: result.source });
    }
    return cachedIndex;
  }
  if (result.status === "missing" && result.sessionsDirectoryEmpty) {
    cachedIndex = createDefaultIndex();
    return cachedIndex;
  }

  recoveryState = {
    status: "corrupt",
    failedSessionCount: 0,
    scannedSessionCount: 0,
  };
  throw new Error(
    result.status === "corrupt"
      ? `会话索引损坏：${result.primaryError}`
      : "会话索引当前不可用"
  );
}

function captureIndex(revision: number): string {
  if (!cachedIndex) throw new Error("Session index has not been loaded");
  cachedIndex._persistence = createPersistenceMeta(revision);
  return serialize(cachedIndex);
}

async function commitIndex(
  reason: Parameters<typeof coordinator.flushIndex>[1]
): Promise<CommitResult> {
  const index = await ensureIndex();
  coordinator.primeIndexRevision(readRevision(index));
  return coordinator.flushIndex(captureIndex, reason);
}

async function appendCorruptionManifest(
  entries: CorruptionManifestEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  let manifest: Awaited<ReturnType<typeof repository.loadCorruptionManifest>>;
  try {
    manifest = await repository.loadCorruptionManifest();
  } catch (error) {
    // A damaged manifest must not prevent the rebuilt index from becoming
    // usable. Preserve the sample when possible, then start a fresh manifest.
    await repository.preserveCorruptManifest().catch((preserveError) => {
      logger.warn("保留损坏会话清单失败", { preserveError });
    });
    manifest = {
      version: 1,
      entries: [],
      _persistence: createPersistenceMeta(),
    };
    logger.warn("会话损坏清单无效，已重新建立", { error });
  }

  const revision = readRevision(manifest) + 1;
  manifest.entries.push(...entries);
  manifest._persistence = createPersistenceMeta(revision);
  try {
    await writer.write({
      kind: "corruptionManifest",
      content: serialize(manifest),
      revision,
      expectedMinRevision: revision - 1,
      keepLastValidBackup: false,
    });
  } catch (error) {
    // Recovery remains useful even if diagnostics cannot be persisted.
    logger.warn("写入会话损坏清单失败", { error, entryCount: entries.length });
  }
}

/** Separated-session storage facade. */
export function useChatStorageSeparated() {
  async function getSessionPath(sessionId: string): Promise<string> {
    return repository.getSessionPath(sessionId);
  }

  async function getSessionsDir(): Promise<string> {
    return repository.getSessionsDir();
  }

  async function getCorruptSessionsDir(): Promise<string> {
    return repository.ensureCorruptSessionsDir();
  }

  async function listSessionIds(): Promise<string[]> {
    return repository.listSessionIds();
  }

  async function exportCorruptionDiagnostics(): Promise<string> {
    let manifest: unknown;
    try {
      manifest = await repository.loadCorruptionManifest();
    } catch (error) {
      manifest = { error: String(error) };
    }
    return JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recoveryState,
        manifest,
      },
      null,
      2
    );
  }

  async function clearQuarantinedSessionFiles(): Promise<number> {
    return repository.clearQuarantinedSessionFiles();
  }

  async function loadIndex(): Promise<SessionsIndex> {
    return ensureIndex();
  }

  async function loadSession(
    sessionId: string
  ): Promise<{ index: ChatSessionIndex; detail: ChatSessionDetail } | null> {
    try {
      const sessionPath = await repository.getSessionPath(sessionId);
      if (!(await exists(sessionPath))) return null;
      const parsed: unknown = JSON.parse(await readTextFile(sessionPath));
      if (!isValidSessionPayload(parsed, sessionId)) {
        throw new Error("会话文件结构无效");
      }
      const fullData = parsed;
      coordinator.primeSessionRevision(sessionId, readRevision(fullData));
      return {
        index: {
          id: fullData.id,
          name: fullData.name,
          displayAgentId: fullData.displayAgentId,
          messageCount: getEffectiveMessageCount(
            fullData.nodes,
            fullData.rootNodeId
          ),
          createdAt: fullData.createdAt,
          updatedAt: fullData.updatedAt,
        },
        detail: {
          id: fullData.id,
          nodes: fullData.nodes,
          rootNodeId: fullData.rootNodeId || "",
          activeLeafId: fullData.activeLeafId || "",
          updatedAt: fullData.updatedAt || fullData.createdAt,
          parameterOverrides: fullData.parameterOverrides,
          history: fullData.history || [],
          historyIndex: fullData.historyIndex || 0,
          agentUsage: fullData.agentUsage,
        },
      };
    } catch (error) {
      logger.warn("加载会话失败", { sessionId, error });
      return null;
    }
  }

  async function saveSession(
    session: ChatSessionIndex & ChatSessionDetail
  ): Promise<void> {
    await repository.ensureSessionsDir();
    const currentRevision = readRevision(session as unknown);
    coordinator.primeSessionRevision(session.id, currentRevision);
    await coordinator.flushSession(
      session.id,
      (revision) => serialize(toStoredSession(session, revision)),
      "session-completed"
    );
  }

  async function persistSession(
    index: ChatSessionIndex,
    detail: ChatSessionDetail,
    _currentSessionId?: string | null
  ): Promise<void> {
    // Deliberately do not use currentSessionId: a background session save must
    // never move the user's active-session selection on disk.
    await repository.ensureSessionsDir();
    coordinator.markSessionDirty(
      index.id,
      (revision) =>
        serialize(toStoredSession({ ...index, ...detail }, revision)),
      "session-content"
    );

    const persistedIndex = await ensureIndex();
    const position = persistedIndex.sessions.findIndex(
      (item) => item.id === index.id
    );
    const item = createIndexItem({ ...index, ...detail });
    if (position === -1) persistedIndex.sessions.push(item);
    else
      persistedIndex.sessions[position] = {
        ...persistedIndex.sessions[position],
        ...item,
      };
    coordinator.markIndexDirty(captureIndex, "index-mutation");
  }

  async function saveIndex(index: SessionsIndex): Promise<void> {
    cachedIndex = {
      ...index,
      favoriteFolders: Array.isArray(index.favoriteFolders)
        ? index.favoriteFolders
        : [],
    };
    coordinator.primeIndexRevision(readRevision(cachedIndex));
    await commitIndex("index-mutation");
  }

  async function saveSessions(
    sessions: Array<{ index: ChatSessionIndex; detail?: ChatSessionDetail }>,
    currentSessionId: string | null,
    favoriteFolders: FavoriteFolder[] = []
  ): Promise<void> {
    const index = await ensureIndex();
    index.currentSessionId = currentSessionId;
    index.favoriteFolders = favoriteFolders;
    index.sessions = sessions.map(({ index: item, detail }) =>
      createIndexItem({ ...item, ...(detail || {}) })
    );
    for (const session of sessions) {
      if (session.detail)
        await saveSession({ ...session.index, ...session.detail });
    }
    await commitIndex("index-mutation");
  }

  async function deleteSessionFile(sessionId: string): Promise<void> {
    coordinator.markSessionDeleted(sessionId);
    await deleteSessionFromNative(sessionId);
  }

  async function deleteSessionFiles(sessionIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(sessionIds)];
    coordinator.markSessionsDeleted(uniqueIds);
    const failures: Array<{ sessionId: string; error: unknown }> = [];
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(4, uniqueIds.length || 1));
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < uniqueIds.length) {
          const sessionId = uniqueIds[cursor++];
          try {
            await deleteSessionFromNative(sessionId);
          } catch (error) {
            failures.push({ sessionId, error });
          }
        }
      })
    );
    if (failures.length > 0) {
      throw new Error(
        `删除 ${failures.length} 个会话文件失败：${failures
          .map(({ sessionId, error }) => `${sessionId}: ${String(error)}`)
          .join("；")}`
      );
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    await deleteSessionFile(sessionId);
    const index = await ensureIndex();
    index.sessions = index.sessions.filter((item) => item.id !== sessionId);
    if (index.currentSessionId === sessionId)
      index.currentSessionId = index.sessions[0]?.id || null;
    await commitIndex("delete");
  }

  async function updateCurrentSessionId(
    currentSessionId: string | null
  ): Promise<void> {
    const index = await ensureIndex();
    index.currentSessionId = currentSessionId;
    await commitIndex("current-session");
  }

  async function loadSessionsIndex(): Promise<{
    sessions: ChatSessionIndex[];
    currentSessionId: string | null;
    favoriteFolders: FavoriteFolder[];
    recoveryState: RecoveryState;
  }> {
    try {
      const index = await ensureIndex();
      return {
        sessions: index.sessions,
        currentSessionId: index.currentSessionId,
        favoriteFolders: index.favoriteFolders || [],
        recoveryState,
      };
    } catch (error) {
      logger.warn("会话索引需要恢复", { error });
      return {
        sessions: [],
        currentSessionId: null,
        favoriteFolders: [],
        recoveryState,
      };
    }
  }

  async function loadSessionsAll(): Promise<{
    sessions: Array<{ index: ChatSessionIndex; detail: ChatSessionDetail }>;
    currentSessionId: string | null;
    favoriteFolders: FavoriteFolder[];
  }> {
    const index = await loadSessionsIndex();
    const results = await Promise.all(
      index.sessions.map((item) => loadSession(item.id))
    );
    const details = results.filter(
      (session): session is NonNullable<typeof session> => session !== null
    );
    return {
      sessions: details.map((session) => ({
        ...session,
        index:
          index.sessions.find((item) => item.id === session.index.id) ||
          session.index,
      })),
      currentSessionId: index.currentSessionId,
      favoriteFolders: index.favoriteFolders,
    };
  }

  async function loadSessions() {
    return loadSessionsAll();
  }

  /**
   * Compare only directory names with the loaded index. Existing sessions are
   * not parsed; only new files are read in the background after first paint.
   */
  async function reconcileIndexIncrementally(options?: {
    concurrency?: number;
    onNewSessions?: (sessions: ChatSessionIndex[]) => void;
  }): Promise<{
    addedCount: number;
    removedCount: number;
    failedCount: number;
  }> {
    if (isDetachedComponentWindow()) {
      return { addedCount: 0, removedCount: 0, failedCount: 0 };
    }
    const index = await ensureIndex();
    const sessionIdsOnDisk = new Set(await repository.listSessionIds());
    const indexedIds = new Set(index.sessions.map((session) => session.id));
    const missingIds = index.sessions
      .filter((session) => !sessionIdsOnDisk.has(session.id))
      .map((session) => session.id);
    const newIds = [...sessionIdsOnDisk].filter(
      (sessionId) => !indexedIds.has(sessionId)
    );
    const recovered: ChatSessionIndex[] = [];
    const corruptions: CorruptionManifestEntry[] = [];
    let cursor = 0;
    const workerCount = Math.max(
      1,
      Math.min(options?.concurrency ?? 4, 8, newIds.length || 1)
    );
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < newIds.length) {
          const sessionId = newIds[cursor++];
          const session = await loadSession(sessionId);
          if (session) {
            recovered.push(session.index);
          } else {
            try {
              corruptions.push(
                await repository.quarantineSessionFile(
                  sessionId,
                  "Session JSON could not be parsed or failed structural validation"
                )
              );
            } catch (error) {
              logger.warn("隔离增量扫描中的损坏会话失败", { sessionId, error });
            }
          }
        }
      })
    );
    await appendCorruptionManifest(corruptions);
    if (missingIds.length > 0 || recovered.length > 0) {
      const missingIdSet = new Set(missingIds);
      index.sessions = [
        ...index.sessions.filter((session) => !missingIdSet.has(session.id)),
        ...recovered,
      ];
      options?.onNewSessions?.(recovered);
    }
    if (missingIds.length > 0 || recovered.length > 0 || needsPrimaryRepair) {
      await commitIndex("repair");
      needsPrimaryRepair = false;
    }
    return {
      addedCount: recovered.length,
      removedCount: missingIds.length,
      failedCount: corruptions.length,
    };
  }

  /** Explicit, non-startup recovery/repair operation. */
  async function repairIndex(options?: {
    signal?: AbortSignal;
    concurrency?: number;
    onProgress?: (state: RecoveryState) => void;
    onBatch?: (sessions: ChatSessionIndex[]) => void;
  }): Promise<{
    repairedCount: number;
    failedCount: number;
    cancelled: boolean;
  }> {
    const ids = await repository.listSessionIds();
    recoveryState = {
      status: "recovering",
      failedSessionCount: 0,
      scannedSessionCount: 0,
    };
    options?.onProgress?.({ ...recoveryState });

    const repaired: ChatSessionIndex[] = [];
    const corruptions: CorruptionManifestEntry[] = [];
    const pendingBatch: ChatSessionIndex[] = [];
    let failedCount = 0;
    let nextIndex = 0;
    const workerCount = Math.max(
      1,
      Math.min(options?.concurrency ?? 4, 8, ids.length || 1)
    );
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (!options?.signal?.aborted) {
          const sessionId = ids[nextIndex++];
          if (!sessionId) return;
          const session = await loadSession(sessionId);
          if (session) {
            repaired.push(session.index);
            pendingBatch.push(session.index);
            if (pendingBatch.length >= 25) {
              options?.onBatch?.(pendingBatch.splice(0));
            }
          } else {
            failedCount += 1;
            try {
              corruptions.push(
                await repository.quarantineSessionFile(
                  sessionId,
                  "Session JSON could not be parsed or failed structural validation"
                )
              );
            } catch (error) {
              logger.warn("隔离损坏会话失败", { sessionId, error });
            }
          }
          recoveryState = {
            status: "recovering",
            failedSessionCount: failedCount,
            scannedSessionCount: recoveryState.scannedSessionCount + 1,
          };
          options?.onProgress?.({ ...recoveryState });
        }
      })
    );

    if (pendingBatch.length > 0) {
      options?.onBatch?.(pendingBatch.splice(0));
    }
    const cancelled = Boolean(options?.signal?.aborted);
    if (cancelled) {
      recoveryState = {
        status: "corrupt",
        failedSessionCount: failedCount,
        scannedSessionCount: recoveryState.scannedSessionCount,
      };
      return { repairedCount: 0, failedCount, cancelled: true };
    }

    await appendCorruptionManifest(corruptions);
    const index = await ensureIndex().catch(async () => {
      await repository.preserveCorruptPrimary().catch(() => undefined);
      cachedIndex = createDefaultIndex();
      return cachedIndex;
    });
    const previousCount = index.sessions.length;
    index.sessions = repaired.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
    index.currentSessionId =
      index.currentSessionId &&
      repaired.some((item) => item.id === index.currentSessionId)
        ? index.currentSessionId
        : repaired[0]?.id || null;
    recoveryState = {
      status: "ready",
      failedSessionCount: failedCount,
      scannedSessionCount: ids.length,
    };
    await commitIndex("repair");
    return {
      repairedCount: Math.abs(repaired.length - previousCount),
      failedCount,
      cancelled: false,
    };
  }

  function createDebouncedSave(delay = 500) {
    return useDebounceFn(saveSessions, delay);
  }

  return {
    loadIndex,
    saveIndex,
    loadSessions,
    loadSessionsIndex,
    loadSessionsAll,
    saveSessions,
    persistSession,
    repairIndex,
    reconcileIndexIncrementally,
    deleteSession,
    deleteSessionFiles,
    updateCurrentSessionId,
    createDebouncedSave,
    loadSession,
    saveSession,
    getSessionsDir,
    getCorruptSessionsDir,
    listSessionIds,
    exportCorruptionDiagnostics,
    clearQuarantinedSessionFiles,
    getSessionPath,
    flushAll: () => coordinator.flushAll(),
    getRecoveryState: () => recoveryState,
  };
}
