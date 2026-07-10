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
  }),
}));

describe("useLlmChatUiState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should select agent and update last used", () => {
    const { selectAgent, currentAgentId } = useLlmChatUiState();

    selectAgent("agent-2");

    expect(currentAgentId.value).toBe("agent-2");
    expect(mockUpdateLastUsed).toHaveBeenCalledWith("agent-2");
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
