import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ChatMessageNode } from "../../../types/message";
import type {
  ChatSessionDetail,
  ChatSessionDraft,
  ChatSessionIndex,
} from "../../../types/session";

const { inputManager, sessionManager, storage } = vi.hoisted(() => ({
  inputManager: {
    clearDraft: vi.fn(),
    clearAllDrafts: vi.fn(),
  },
  sessionManager: {
    createSession: vi.fn(),
    loadSessionsIndex: vi.fn(),
    updateMessageCount: vi.fn(),
    persistSession: vi.fn(),
    persistSessions: vi.fn(),
    deleteSession: vi.fn(),
    updateCurrentSessionId: vi.fn(),
  },
  storage: {
    loadSession: vi.fn(),
    saveSession: vi.fn(),
    persistSession: vi.fn(),
    reconcileIndexIncrementally: vi.fn(),
    getRecoveryState: vi.fn(() => ({ status: "ready" })),
  },
}));

vi.mock("../../../composables/session/useSessionManager", () => ({
  isSessionVolatile: vi.fn(() => false),
  markSessionPersistent: vi.fn(),
  markSessionVolatile: vi.fn(),
  useSessionManager: () => sessionManager,
}));
vi.mock("../../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => inputManager,
}));
vi.mock("../../../composables/storage/useChatStorageSeparated", () => ({
  useChatStorageSeparated: () => storage,
}));
vi.mock("@/tools/recall/services/api", () => ({
  clearRetrievalCache: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createSessionLifecycleManager } from "../sessionLifecycleManager";
import {
  loadNewSessionDraft,
  saveNewSessionDraft,
} from "../../../composables/storage/useNewSessionDraftStorage";

function index(id: string): ChatSessionIndex {
  return {
    id,
    name: id,
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function node(
  id: string,
  content: string,
  status: ChatMessageNode["status"] = "generating"
): ChatMessageNode {
  return {
    id,
    parentId: null,
    childrenIds: [],
    role: "assistant",
    content,
    status,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function detail(id: string): ChatSessionDetail {
  const completed = node(`${id}-completed`, "已有正文");
  const interrupted = node(`${id}-interrupted`, "");
  const interruptedWaiting = node(`${id}-interrupted-waiting`, "", "waiting");
  return {
    id,
    nodes: {
      [completed.id]: completed,
      [interrupted.id]: interrupted,
      [interruptedWaiting.id]: interruptedWaiting,
    },
    rootNodeId: completed.id,
    activeLeafId: interrupted.id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    history: [],
    historyIndex: -1,
  };
}

function fullSession(id: string) {
  return { index: index(id), detail: detail(id) };
}

function lifecycleFor(
  state: Parameters<typeof createSessionLifecycleManager>[0]
) {
  return createSessionLifecycleManager(state, {
    runtime: { clearSessionRuntime: vi.fn() } as any,
    history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
    executeOrProxy: async (_action, _params, localFn) => await localFn(),
    fillMissingTokenMetadata: vi.fn(),
    getActivePath: vi.fn(() => []),
  });
}

describe("sessionLifecycleManager 重启恢复", () => {
  beforeEach(async () => {
    await saveNewSessionDraft(null);
    vi.clearAllMocks();
    sessionManager.updateCurrentSessionId.mockResolvedValue(undefined);
    storage.loadSession.mockReset();
    storage.saveSession.mockResolvedValue(undefined);
    storage.persistSession.mockResolvedValue(undefined);
    storage.reconcileIndexIncrementally.mockResolvedValue(undefined);
    sessionManager.updateMessageCount.mockImplementation(
      (
        sessionId: string,
        nodes: Record<string, ChatMessageNode>,
        indexes: Map<string, ChatSessionIndex>
      ) => {
        const item = indexes.get(sessionId);
        if (item) item.messageCount = Object.keys(nodes).length;
      }
    );
  });

  it("启动加载当前会话时修复并持久化残留 generating 节点", async () => {
    sessionManager.loadSessionsIndex.mockResolvedValue({
      sessions: [index("current"), index("other")],
      currentSessionId: "current",
      favoriteFolders: [],
      recoveryState: { status: "ready" },
    });
    storage.loadSession.mockImplementation(async (id: string) =>
      id === "current" ? fullSession(id) : null
    );

    const state = {
      sessionIndexMap: ref(new Map<string, ChatSessionIndex>()),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "idle" } as any),
    };
    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    await lifecycle.loadSessions();

    const loaded = state.sessionDetailMap.value.get("current")!;
    expect(loaded.nodes["current-completed"].status).toBe("complete");
    expect(loaded.nodes["current-interrupted"].status).toBe("error");
    expect(loaded.nodes["current-interrupted"].metadata?.error).toBe(
      "生成意外中断"
    );
    expect(loaded.nodes["current-interrupted-waiting"].status).toBe("error");
    expect(loaded.nodes["current-interrupted-waiting"].metadata?.error).toBe(
      "生成意外中断"
    );
    expect(loaded.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(state.sessionIndexMap.value.get("current")?.messageCount).toBe(3);
    expect(sessionManager.persistSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "current" }),
      loaded,
      "current"
    );
  });

  it("按需加载其他会话时执行同一恢复逻辑", async () => {
    const otherIndex = index("other");
    const state = {
      sessionIndexMap: ref(new Map([["other", otherIndex]])),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      currentSessionId: ref<string | null>("current"),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    storage.loadSession.mockResolvedValue(fullSession("other"));
    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    await lifecycle.switchSession("other");

    const loaded = state.sessionDetailMap.value.get("other")!;
    expect(loaded.nodes["other-completed"].status).toBe("complete");
    expect(loaded.nodes["other-interrupted"].status).toBe("error");
    expect(sessionManager.persistSession).toHaveBeenCalled();
    expect(state.currentSessionId.value).toBe("other");
  });

  it("等待当前会话选择落盘，避免重启恢复到旧会话", async () => {
    const state = {
      sessionIndexMap: ref(
        new Map([
          ["old", index("old")],
          ["latest", index("latest")],
        ])
      ),
      sessionDetailMap: ref(
        new Map<string, ChatSessionDetail>([
          ["old", fullSession("old").detail],
          ["latest", fullSession("latest").detail],
        ])
      ),
      currentSessionId: ref<string | null>("old"),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    let resolvePersist!: () => void;
    sessionManager.updateCurrentSessionId.mockImplementation(
      () => new Promise<void>((resolve) => (resolvePersist = resolve))
    );
    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    const switchPromise = lifecycle.switchSession("latest");
    await vi.waitFor(() =>
      expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledWith(
        "latest"
      )
    );
    expect(state.currentSessionId.value).toBe("latest");
    let settled = false;
    void switchPromise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    resolvePersist();
    await switchPromise;
    expect(settled).toBe(true);
  });

  it("删除最后一个当前会话时清除持久化的当前会话 ID", async () => {
    const state = {
      sessionIndexMap: ref(new Map([["only", index("only")]])),
      sessionDetailMap: ref(
        new Map<string, ChatSessionDetail>([
          ["only", fullSession("only").detail],
        ])
      ),
      currentSessionId: ref<string | null>("only"),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    sessionManager.deleteSession.mockResolvedValue({
      newCurrentSessionId: null,
    });

    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    await lifecycle.deleteSession("only");

    expect(state.currentSessionId.value).toBeNull();
    expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledWith(null);
  });

  it("忽略较慢的旧切换请求，保留最后一次选择", async () => {
    const state = {
      sessionIndexMap: ref(
        new Map([
          ["first", index("first")],
          ["second", index("second")],
        ])
      ),
      sessionDetailMap: ref(
        new Map<string, ChatSessionDetail>([
          ["second", fullSession("second").detail],
        ])
      ),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    let resolveFirst!: (value: ReturnType<typeof fullSession>) => void;
    storage.loadSession.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === "first") resolveFirst = resolve;
        })
    );
    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    const firstSwitch = lifecycle.switchSession("first");
    const secondSwitch = lifecycle.switchSession("second");
    await vi.waitFor(() => expect(resolveFirst).toBeDefined());
    await secondSwitch;
    resolveFirst(fullSession("first"));
    await firstSwitch;

    expect(state.currentSessionId.value).toBe("second");
    expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledWith(
      "second"
    );
    expect(sessionManager.updateCurrentSessionId).not.toHaveBeenCalledWith(
      "first"
    );
  });
  it("首条消息发送前只创建内存草稿，提升时才提交当前会话", async () => {
    const draftIndex = index("draft");
    const draftDetail = detail("draft");
    sessionManager.createSession.mockResolvedValue({
      index: draftIndex,
      detail: draftDetail,
      sessionId: "draft",
    });

    const state = {
      sessionIndexMap: ref(new Map<string, ChatSessionIndex>()),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    const lifecycle = createSessionLifecycleManager(state, {
      runtime: { clearSessionRuntime: vi.fn() } as any,
      history: { clearHistory: vi.fn(), cleanupSession: vi.fn() } as any,
      executeOrProxy: async (_action, _params, localFn) => await localFn(),
      fillMissingTokenMetadata: vi.fn(),
      getActivePath: vi.fn(() => []),
    });

    await lifecycle.beginNewSession("agent-1");

    expect(state.newSessionDraft.value?.index.id).toBe("draft");
    expect(state.currentSessionId.value).toBe("draft");
    expect(sessionManager.persistSession).not.toHaveBeenCalled();
    expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledWith(null);

    await lifecycle.materializeNewSession();

    expect(state.newSessionDraft.value).toBeNull();
    expect(storage.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft", nodes: draftDetail.nodes })
    );
    expect(storage.persistSession).toHaveBeenCalledWith(
      draftIndex,
      draftDetail
    );
    expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledWith("draft");
    expect(storage.saveSession.mock.invocationCallOrder[0]).toBeLessThan(
      storage.persistSession.mock.invocationCallOrder[0]
    );
    expect(storage.persistSession.mock.invocationCallOrder[0]).toBeLessThan(
      sessionManager.updateCurrentSessionId.mock.invocationCallOrder[1]
    );
  });
  it("从历史进入新会话后，重载恢复同一草稿身份和配置", async () => {
    let persistedId: string | null = "old";
    sessionManager.updateCurrentSessionId.mockImplementation(async (id) => {
      persistedId = id;
    });
    const draft = fullSession("draft");
    draft.index.name = "未发送的会话";
    draft.index.displayAgentId = "agent-1";
    draft.detail.parameterOverrides = { temperature: 0.3 };
    sessionManager.createSession.mockResolvedValue({
      ...draft,
      sessionId: "draft",
    });
    const state = {
      sessionIndexMap: ref(new Map([["old", index("old")]])),
      sessionDetailMap: ref(new Map([["old", detail("old")]])),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>("old"),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    await lifecycleFor(state).beginNewSession("agent-1");
    expect(persistedId).toBeNull();

    sessionManager.loadSessionsIndex.mockResolvedValue({
      sessions: [index("old")],
      currentSessionId: persistedId,
      favoriteFolders: [],
      recoveryState: { status: "ready" },
    });
    const reloaded = {
      ...state,
      sessionIndexMap: ref(new Map<string, ChatSessionIndex>()),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>(null),
    };
    await lifecycleFor(reloaded).loadSessions();
    expect(reloaded.currentSessionId.value).toBe("draft");
    expect([...reloaded.sessionIndexMap.value.keys()]).toEqual([
      "old",
      "draft",
    ]);
    expect(reloaded.newSessionDraft.value?.index).toMatchObject({
      id: "draft",
      name: "未发送的会话",
      displayAgentId: "agent-1",
    });
    expect(reloaded.newSessionDraft.value?.detail.parameterOverrides).toEqual({
      temperature: 0.3,
    });
    expect(reloaded.sessionDetailMap.value.size).toBe(1);
    expect(storage.loadSession).not.toHaveBeenCalled();
  });

  it("在历史会话中刷新保留待发草稿，首次发送沿用草稿 ID 并清理恢复记录", async () => {
    const draft = fullSession("pending");
    await saveNewSessionDraft(draft);
    sessionManager.loadSessionsIndex.mockResolvedValue({
      sessions: [index("history")],
      currentSessionId: "history",
      favoriteFolders: [],
      recoveryState: { status: "ready" },
    });
    storage.loadSession.mockResolvedValue(fullSession("history"));
    const state = {
      sessionIndexMap: ref(new Map<string, ChatSessionIndex>()),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    const lifecycle = lifecycleFor(state);
    await lifecycle.loadSessions();
    expect(state.currentSessionId.value).toBe("history");
    expect(state.newSessionDraft.value?.index.id).toBe("pending");
    await lifecycle.switchSession("pending");
    expect(state.currentSessionId.value).toBe("pending");
    expect(await lifecycle.materializeNewSession()).toBe("pending");
    expect(state.newSessionDraft.value).toBeNull();
    expect(await loadNewSessionDraft()).toBeNull();
    expect(sessionManager.updateCurrentSessionId).toHaveBeenLastCalledWith(
      "pending"
    );
  });

  it("首次发送已写入正式索引时，重启清理残留草稿记录并加载正式消息", async () => {
    await saveNewSessionDraft(fullSession("promoted"));
    sessionManager.loadSessionsIndex.mockResolvedValue({
      sessions: [index("promoted")],
      currentSessionId: null,
      favoriteFolders: [],
      recoveryState: { status: "ready" },
    });
    storage.loadSession.mockResolvedValue(fullSession("promoted"));
    const state = {
      sessionIndexMap: ref(new Map<string, ChatSessionIndex>()),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    await lifecycleFor(state).loadSessions();
    expect(state.currentSessionId.value).toBe("promoted");
    expect(state.newSessionDraft.value).toBeNull();
    expect(
      state.sessionDetailMap.value.get("promoted")?.nodes["promoted-completed"]
        .content
    ).toBe("已有正文");
    expect(await loadNewSessionDraft()).toBeNull();
  });

  it("从历史切回已有草稿时持久化空选择，选择历史时持久化历史 ID", async () => {
    const draft = fullSession("draft");
    const state = {
      sessionIndexMap: ref(
        new Map([
          ["old", index("old")],
          ["draft", draft.index],
        ])
      ),
      sessionDetailMap: ref(
        new Map([
          ["old", detail("old")],
          ["draft", draft.detail],
        ])
      ),
      newSessionDraft: ref<ChatSessionDraft | null>(draft),
      currentSessionId: ref<string | null>("old"),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    const lifecycle = lifecycleFor(state);
    await lifecycle.switchSession("draft");
    expect(state.currentSessionId.value).toBe("draft");
    expect(sessionManager.updateCurrentSessionId).toHaveBeenLastCalledWith(
      null
    );

    await lifecycle.switchSession("old");
    expect(sessionManager.updateCurrentSessionId).toHaveBeenLastCalledWith(
      "old"
    );
    await lifecycle.beginNewSession("");
    expect(state.currentSessionId.value).toBe("draft");
    expect(sessionManager.updateCurrentSessionId).toHaveBeenLastCalledWith(
      null
    );
  });

  it("进入新会话后忽略尚未完成的历史会话切换", async () => {
    let resolveOld!: (value: ReturnType<typeof fullSession>) => void;
    storage.loadSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    sessionManager.createSession.mockResolvedValue({
      ...fullSession("draft"),
      sessionId: "draft",
    });
    const state = {
      sessionIndexMap: ref(new Map([["old", index("old")]])),
      sessionDetailMap: ref(new Map<string, ChatSessionDetail>()),
      newSessionDraft: ref<ChatSessionDraft | null>(null),
      currentSessionId: ref<string | null>(null),
      favoriteFolders: ref([]),
      sessionRecovery: ref({ status: "ready" } as any),
    };
    const lifecycle = lifecycleFor(state);
    const switching = lifecycle.switchSession("old");
    await vi.waitFor(() => expect(resolveOld).toBeDefined());
    await lifecycle.beginNewSession("agent-1");
    resolveOld(fullSession("old"));
    await switching;

    expect(state.currentSessionId.value).toBe("draft");
    expect(sessionManager.updateCurrentSessionId).toHaveBeenCalledTimes(1);
    expect(sessionManager.updateCurrentSessionId).toHaveBeenLastCalledWith(
      null
    );
  });
});
