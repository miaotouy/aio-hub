import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ChatMessageNode } from "../../../types/message";
import type {
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../../types/session";

const { sessionManager, storage } = vi.hoisted(() => ({
  sessionManager: {
    loadSessionsIndex: vi.fn(),
    updateMessageCount: vi.fn(),
    persistSession: vi.fn(),
    updateCurrentSessionId: vi.fn(),
  },
  storage: {
    loadSession: vi.fn(),
    reconcileIndexIncrementally: vi.fn(),
    getRecoveryState: vi.fn(() => ({ status: "ready" })),
  },
}));

vi.mock("../../../composables/session/useSessionManager", () => ({
  useSessionManager: () => sessionManager,
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

describe("sessionLifecycleManager 重启恢复", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
