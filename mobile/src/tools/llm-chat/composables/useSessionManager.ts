/**
 * LLM Chat 会话存储管理。
 *
 * 会话与消息的正式存储是 llm_chat.db；旧 JSON 文件只在首次启动时作为
 * 一次性导入源读取，不参与后续会话读写。
 */

import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import { debounce } from "lodash-es";
import type { ChatSession } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  buildPersistChatChanges,
  cloneChatSession,
  decodeChatSessionSnapshot,
} from "../services/chatStorageCodec";
import {
  deleteChatSession as deleteStoredChatSession,
  listChatSessions,
  loadChatSession,
  persistChatChanges,
  type ChatSessionRecord,
} from "../services/chatStorageService";

const logger = createModuleLogger("llm-chat/session-manager");
const errorHandler = createModuleErrorHandler("llm-chat/session-manager");

const MODULE_NAME = "llm-chat";
const SESSIONS_SUBDIR = "sessions";
const SQLITE_MIGRATION_VERSION = 1;
const LIST_PAGE_SIZE = 200;

export interface SessionIndexItem {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
  displayAgentId?: string | null;
  isFavorite?: boolean;
}

export interface SessionsIndex {
  version: string;
  currentSessionId: string | null;
  sessions: SessionIndexItem[];
  sqliteMigrationVersion?: number;
}

function createDefaultIndex(): SessionsIndex {
  return {
    version: "2.0.0",
    currentSessionId: null,
    sessions: [],
    // ConfigManager deep-fills missing fields into legacy configs. Start at 0
    // so an old index cannot be mistaken for an already imported index.
    sqliteMigrationVersion: 0,
  };
}

const indexManager = createConfigManager<SessionsIndex>({
  moduleName: MODULE_NAME,
  fileName: "sessions-index.json",
  version: "2.0.0",
  createDefault: createDefaultIndex,
});

// Managers are created by more than one composable. Keep the last persisted
// snapshot and write queue at module scope so those instances share a diff base.
const persistedSnapshots = new Map<string, ChatSession>();
const pendingWrites = new Map<string, Promise<void>>();

function mapSessionRecord(record: ChatSessionRecord): SessionIndexItem {
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    messageCount: record.messageCount,
    displayAgentId: record.displayAgentId,
    isFavorite: record.isFavorite,
  };
}

async function listAllStoredSessions(): Promise<ChatSessionRecord[]> {
  const records: ChatSessionRecord[] = [];
  let cursor: { updatedAt: string; id: string } | undefined;

  while (true) {
    const page = await listChatSessions({
      limit: LIST_PAGE_SIZE,
      beforeUpdatedAt: cursor?.updatedAt,
      beforeId: cursor?.id,
    });
    records.push(...page);
    if (page.length < LIST_PAGE_SIZE) return records;

    const last = page[page.length - 1];
    const nextCursor = { updatedAt: last.updatedAt, id: last.id };
    if (
      cursor?.updatedAt === nextCursor.updatedAt &&
      cursor.id === nextCursor.id
    ) {
      throw new Error("CHAT_SESSION_CURSOR_STALLED");
    }
    cursor = nextCursor;
  }
}

async function enqueueSessionWrite<T>(
  sessionId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = pendingWrites.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const tail = next.then(
    () => undefined,
    () => undefined
  );
  pendingWrites.set(sessionId, tail);

  try {
    return await next;
  } finally {
    if (pendingWrites.get(sessionId) === tail) {
      pendingWrites.delete(sessionId);
    }
  }
}

/** Import legacy JSON sessions without making JSON a second live backend. */
async function migrateLegacySessions(
  index: SessionsIndex
): Promise<SessionsIndex> {
  if ((index.sqliteMigrationVersion ?? 0) >= SQLITE_MIGRATION_VERSION) {
    return index;
  }

  const stored = await listAllStoredSessions();
  const storedIds = new Set(stored.map((session) => session.id));
  let failed = false;

  for (const item of index.sessions) {
    if (storedIds.has(item.id)) continue;

    try {
      const path = await getSessionPath(item.id);
      if (!(await exists(path))) {
        logger.warn("Legacy session file is missing", { sessionId: item.id });
        continue;
      }

      const session = JSON.parse(await readTextFile(path)) as ChatSession;
      const request = buildPersistChatChanges(session);
      const result = await persistChatChanges(request);
      session.messageCount = result.messageCount;
      persistedSnapshots.set(session.id, cloneChatSession(session));
      storedIds.add(session.id);
      logger.info("Imported legacy chat session", { sessionId: session.id });
    } catch (error) {
      failed = true;
      errorHandler.handle(error, {
        userMessage: "迁移旧聊天记录失败，将在下次启动重试",
        showToUser: false,
        context: { sessionId: item.id },
      });
    }
  }

  if (failed) return index;

  const migrated: SessionsIndex = {
    ...index,
    sessions: [],
    sqliteMigrationVersion: SQLITE_MIGRATION_VERSION,
  };
  await indexManager.save(migrated);
  return migrated;
}

async function getSessionPath(sessionId: string): Promise<string> {
  const appDir = await getAppConfigDir();
  const moduleDir = await join(appDir, MODULE_NAME);
  const sessionsDir = await join(moduleDir, SESSIONS_SUBDIR);
  return join(sessionsDir, `${sessionId}.json`);
}

export function useSessionManager() {
  async function loadIndex(): Promise<SessionsIndex> {
    return indexManager.load();
  }

  async function loadSession(sessionId: string): Promise<ChatSession | null> {
    const snapshot = await loadChatSession(sessionId);
    if (!snapshot) return null;

    try {
      const session = decodeChatSessionSnapshot(snapshot);
      persistedSnapshots.set(session.id, cloneChatSession(session));
      return session;
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "加载会话失败",
        showToUser: false,
        context: { sessionId },
      });
      return null;
    }
  }

  async function persistSession(
    session: ChatSession,
    currentSessionId: string | null
  ): Promise<void> {
    // Capture a stable snapshot before waiting behind another write.
    const requested = cloneChatSession(session);
    await enqueueSessionWrite(session.id, async () => {
      const request = buildPersistChatChanges(
        requested,
        persistedSnapshots.get(session.id) ?? null
      );
      const result = await persistChatChanges(request);
      requested.messageCount = result.messageCount;
      persistedSnapshots.set(session.id, cloneChatSession(requested));
      session.messageCount = result.messageCount;
    });

    await updateCurrentSessionId(currentSessionId);
  }

  async function loadSessions(): Promise<{
    sessionMetas: SessionIndexItem[];
    currentSessionId: string | null;
  }> {
    const migratedIndex = await migrateLegacySessions(await loadIndex());
    const records = await listAllStoredSessions();
    const sessionMetas = records.map(mapSessionRecord);
    const availableIds = new Set(sessionMetas.map((session) => session.id));
    const currentSessionId = availableIds.has(
      migratedIndex.currentSessionId ?? ""
    )
      ? migratedIndex.currentSessionId
      : (sessionMetas[0]?.id ?? null);

    if (migratedIndex.currentSessionId !== currentSessionId) {
      await indexManager.save({ ...migratedIndex, currentSessionId });
    }

    return { sessionMetas, currentSessionId };
  }

  async function deleteSession(sessionId: string): Promise<string | null> {
    await enqueueSessionWrite(sessionId, async () => {
      await deleteStoredChatSession(sessionId);
      persistedSnapshots.delete(sessionId);
    });

    const index = await loadIndex();
    const records = await listAllStoredSessions();
    const nextId = records[0]?.id ?? null;
    const currentSessionId =
      index.currentSessionId === sessionId ? nextId : index.currentSessionId;
    await indexManager.save({ ...index, currentSessionId });
    return currentSessionId;
  }

  async function updateCurrentSessionId(id: string | null): Promise<void> {
    const index = await loadIndex();
    if (index.currentSessionId !== id) {
      await indexManager.save({ ...index, currentSessionId: id });
    }
  }

  function createDebouncedSave(delay: number = 1000) {
    return debounce(
      async (session: ChatSession, currentSessionId: string | null) => {
        await persistSession(session, currentSessionId);
      },
      delay
    );
  }

  return {
    loadSessions,
    loadSession,
    persistSession,
    deleteSession,
    updateCurrentSessionId,
    createDebouncedSave,
  };
}
