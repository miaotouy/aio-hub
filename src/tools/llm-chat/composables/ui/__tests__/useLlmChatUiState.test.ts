import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useLlmChatUiState } from "../useLlmChatUiState";

// Mock 依赖
const { mockLoad, mockSaveDebounced, mockSave } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSaveDebounced: vi.fn(),
  mockSave: vi.fn(),
}));

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: mockLoad,
    saveDebounced: mockSaveDebounced,
    save: mockSave,
  }),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
  }),
}));

// 模拟 agentStore
const mockAgents = ref<any[]>([]);
const mockUpdateLastUsed = vi.fn();

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    agents: mockAgents.value,
    updateLastUsed: mockUpdateLastUsed,
    getAgentById: (id: string) =>
      mockAgents.value.find((agent) => agent.id === id),
  }),
}));

// 模拟 llmChatStore 以避免 Pinia 未激活错误
const mockUpdateSession = vi.fn();
const mockCurrentSessionId = ref<string | null>(null);
const mockNewSessionDraft = ref<{ index: { id: string } } | null>(null);
const mockUpdateNewSessionAgent = vi.fn();

vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    currentSessionId: mockCurrentSessionId.value,
    newSessionDraft: mockNewSessionDraft.value,
    updateNewSessionAgent: mockUpdateNewSessionAgent,
    updateSession: mockUpdateSession,
  }),
}));

describe("useLlmChatUiState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentSessionId.value = null;
    mockNewSessionDraft.value = null;
    mockUpdateSession.mockResolvedValue(undefined);
    mockUpdateNewSessionAgent.mockResolvedValue(undefined);
    mockAgents.value = [
      { id: "agent-1", name: "Agent 1" },
      { id: "agent-2", name: "Agent 2" },
    ];
  });

  it("should load UI state correctly", async () => {
    mockLoad.mockResolvedValue({
      currentAgentId: "agent-1",
      isLeftSidebarCollapsed: true,
    });

    const { loadUiState, currentAgentId, isLeftSidebarCollapsed } =
      useLlmChatUiState();
    await loadUiState();

    expect(currentAgentId.value).toBe("agent-1");
    expect(isLeftSidebarCollapsed.value).toBe(true);
  });

  it("should select agent and update last used (without active session)", async () => {
    mockCurrentSessionId.value = null;
    const { selectAgent, currentAgentId } = useLlmChatUiState();

    await selectAgent("agent-2");

    expect(currentAgentId.value).toBe("agent-2");
    expect(mockUpdateLastUsed).toHaveBeenCalledWith("agent-2");
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("should select agent and automatically bind to active session", async () => {
    mockCurrentSessionId.value = "session-123";
    const { selectAgent, currentAgentId } = useLlmChatUiState();

    await selectAgent("agent-2");

    expect(currentAgentId.value).toBe("agent-2");
    expect(mockUpdateLastUsed).toHaveBeenCalledWith("agent-2");
    expect(mockUpdateSession).toHaveBeenCalledWith("session-123", {
      displayAgentId: "agent-2",
    });
  });

  it("should select agent and bind to specified session in options", async () => {
    mockCurrentSessionId.value = "session-123"; // 活跃会话是 123
    const { selectAgent, currentAgentId } = useLlmChatUiState();

    // 但 options 指定了 session-456
    await selectAgent("agent-2", { sessionId: "session-456" });

    expect(currentAgentId.value).toBe("agent-2");
    expect(mockUpdateLastUsed).toHaveBeenCalledWith("agent-2");
    expect(mockUpdateSession).toHaveBeenCalledWith("session-456", {
      displayAgentId: "agent-2",
    });
  });

  it("applies an explicit entry choice after restoring older UI state", async () => {
    const ui = useLlmChatUiState();
    mockLoad.mockResolvedValue({
      currentAgentId: "agent-1",
      leftSidebarWidth: 420,
    });

    ui.requestChatAgent("agent-2");
    await ui.loadUiState();
    expect(ui.currentAgentId.value).toBe("agent-1");
    await ui.applyPendingChatAgent();

    expect(ui.currentAgentId.value).toBe("agent-2");
    expect(ui.leftSidebarWidth.value).toBe(420);
    expect(mockUpdateLastUsed).toHaveBeenCalledWith("agent-2");
    expect(mockUpdateSession).not.toHaveBeenCalled();
    mockUpdateLastUsed.mockClear();
    await ui.applyPendingChatAgent();
    expect(mockUpdateLastUsed).not.toHaveBeenCalled();
  });

  it("rebinds the restored active draft to the requested entry agent", async () => {
    const ui = useLlmChatUiState();
    ui.requestChatAgent("agent-2");
    mockLoad.mockResolvedValue({ currentAgentId: "agent-1" });
    await ui.loadUiState();
    mockNewSessionDraft.value = { index: { id: "draft-1" } };
    mockCurrentSessionId.value = "draft-1";

    await ui.applyPendingChatAgent();

    expect(ui.currentAgentId.value).toBe("agent-2");
    expect(mockUpdateNewSessionAgent).toHaveBeenCalledWith("agent-2");
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("serializes entry switches and finishes on the latest requested agent", async () => {
    const ui = useLlmChatUiState();
    mockCurrentSessionId.value = "session-123";
    let finishFirst!: () => void;
    let startedFirst!: () => void;
    const started = new Promise<void>((resolve) => {
      startedFirst = resolve;
    });
    mockUpdateSession.mockImplementationOnce(() => {
      startedFirst();
      return new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    ui.requestChatAgent("agent-1");
    const switching = ui.applyPendingChatAgent();
    await started;
    ui.requestChatAgent("agent-2");
    const following = ui.applyPendingChatAgent();
    finishFirst();
    await Promise.all([switching, following]);

    expect(ui.currentAgentId.value).toBe("agent-2");
    expect(mockUpdateSession.mock.calls).toEqual([
      ["session-123", { displayAgentId: "agent-1" }],
      ["session-123", { displayAgentId: "agent-2" }],
    ]);
  });

  it("should fallback currentAgentId when selected agent is deleted", async () => {
    const { loadUiState, startWatching, currentAgentId } = useLlmChatUiState();

    mockLoad.mockResolvedValue({
      currentAgentId: "agent-2",
    });

    await loadUiState();
    startWatching();

    expect(currentAgentId.value).toBe("agent-2");

    // 模拟删除了 agent-2
    mockAgents.value = [{ id: "agent-1", name: "Agent 1" }];

    // 触发 watch
    await vi.dynamicImportSettled();

    expect(currentAgentId.value).toBe("agent-1");
  });

  it("should fallback to null when all agents are deleted", async () => {
    const { loadUiState, startWatching, currentAgentId } = useLlmChatUiState();

    mockLoad.mockResolvedValue({
      currentAgentId: "agent-1",
    });

    await loadUiState();
    startWatching();

    expect(currentAgentId.value).toBe("agent-1");

    // 模拟删除了所有 agent
    mockAgents.value = [];

    // 触发 watch
    await vi.dynamicImportSettled();

    expect(currentAgentId.value).toBe(null);
  });
});
