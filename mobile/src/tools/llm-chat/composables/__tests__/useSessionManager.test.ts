import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession } from "../../types";
import type { ChatSessionSnapshot } from "../../services/chatStorageService";

const mocks = vi.hoisted(() => ({
  index: {
    version: "1.1.2",
    currentSessionId: "legacy-session",
    sessions: [] as Array<Record<string, unknown>>,
    sqliteMigrationVersion: 0,
  },
  loadIndex: vi.fn(),
  saveIndex: vi.fn(),
  exists: vi.fn(),
  readTextFile: vi.fn(),
  listChatSessions: vi.fn(),
  loadChatSession: vi.fn(),
  persistChatChanges: vi.fn(),
  deleteChatSession: vi.fn(),
  drainAssetUsageOutbox: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: mocks.loadIndex,
    save: mocks.saveIndex,
  }),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: mocks.exists,
  readTextFile: mocks.readTextFile,
}));
vi.mock("@tauri-apps/api/path", () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));
vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: () => Promise.resolve("/app-config"),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: mocks.handleError }),
}));
vi.mock("../../services/chatStorageService", () => ({
  listChatSessions: mocks.listChatSessions,
  loadChatSession: mocks.loadChatSession,
  persistChatChanges: mocks.persistChatChanges,
  deleteChatSession: mocks.deleteChatSession,
  drainAssetUsageOutbox: mocks.drainAssetUsageOutbox,
}));

import { useSessionManager } from "../useSessionManager";

function legacySession(): ChatSession {
  return {
    id: "legacy-session",
    name: "Legacy",
    rootNodeId: "root",
    activeLeafId: "assistant",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["assistant"],
        lastSelectedChildId: "assistant",
        content: "",
        role: "system",
        status: "complete",
        timestamp: "2026-07-21T00:00:00.000Z",
      },
      assistant: {
        id: "assistant",
        parentId: "root",
        childrenIds: [],
        content: "old answer",
        role: "assistant",
        status: "complete",
        timestamp: "2026-07-21T00:00:01.000Z",
        metadata: { futureField: { preserved: true } },
      },
    },
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:01.000Z",
  };
}

function storedSnapshot(): ChatSessionSnapshot {
  return {
    session: {
      id: "legacy-session",
      name: "Legacy",
      rootNodeId: "root",
      activeLeafId: "assistant",
      displayAgentId: null,
      messageCount: 1,
      isFavorite: false,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:01.000Z",
    },
    messages: [
      {
        id: "root",
        sessionId: "legacy-session",
        parentId: null,
        siblingOrder: 0,
        lastSelectedChildId: "assistant",
        role: "system",
        type: "message",
        content: "",
        status: "complete",
        timestamp: "2026-07-21T00:00:00.000Z",
        metadata: {},
      },
      {
        id: "assistant",
        sessionId: "legacy-session",
        parentId: "root",
        siblingOrder: 0,
        lastSelectedChildId: null,
        role: "assistant",
        type: "message",
        content: "old answer",
        status: "complete",
        timestamp: "2026-07-21T00:00:01.000Z",
        metadata: { futureField: { preserved: true } },
      },
    ],
    attachments: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.index = {
    version: "1.1.2",
    currentSessionId: "legacy-session",
    sessions: [
      {
        id: "legacy-session",
        name: "Legacy",
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:00:01.000Z",
        messageCount: 1,
      },
    ],
    sqliteMigrationVersion: 0,
  };
  mocks.loadIndex.mockImplementation(async () => structuredClone(mocks.index));
  mocks.saveIndex.mockImplementation(async (index) => {
    mocks.index = structuredClone(index);
  });
  mocks.exists.mockResolvedValue(true);
  mocks.readTextFile.mockResolvedValue(JSON.stringify(legacySession()));
  mocks.persistChatChanges.mockResolvedValue({
    messageCount: 1,
    outboxEvents: 0,
  });
  mocks.drainAssetUsageOutbox.mockResolvedValue({
    inspected: 0,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
  });
});

describe("useSessionManager SQLite migration", () => {
  it("imports legacy JSON once, then persists only changed message rows", async () => {
    const storedRecord = storedSnapshot().session;
    mocks.listChatSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([storedRecord]);
    mocks.loadChatSession.mockResolvedValue(storedSnapshot());
    const manager = useSessionManager();

    await expect(manager.loadSessions()).resolves.toEqual({
      sessionMetas: [
        expect.objectContaining({ id: "legacy-session", messageCount: 1 }),
      ],
      currentSessionId: "legacy-session",
    });
    expect(mocks.persistChatChanges).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        upsertMessages: [
          expect.objectContaining({ id: "root" }),
          expect.objectContaining({ id: "assistant" }),
        ],
      })
    );
    expect(mocks.drainAssetUsageOutbox).toHaveBeenCalled();
    expect(mocks.index).toMatchObject({
      currentSessionId: "legacy-session",
      sessions: [],
      sqliteMigrationVersion: 1,
    });

    const loaded = await manager.loadSession("legacy-session");
    expect(loaded).not.toBeNull();
    loaded!.nodes.assistant.content = "new answer";
    loaded!.updatedAt = "2026-07-21T00:00:02.000Z";
    await manager.persistSession(loaded!, "legacy-session");

    expect(mocks.persistChatChanges).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        upsertMessages: [
          expect.objectContaining({ id: "assistant", content: "new answer" }),
        ],
        deleteMessageIds: [],
      })
    );
  });
});
