import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, currentAgentId } = vi.hoisted(() => ({
  store: {
    currentSessionId: null as string | null,
    sessionIndexMap: new Map<string, { id: string }>(),
    sessions: [{ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" }],
    beginNewSession: vi.fn(),
    switchSession: vi.fn(),
    sendMessage: vi.fn(),
  },
  currentAgentId: { value: "agent-1" as string | null },
}));

vi.mock("../../stores/llmChatStore", () => ({ useLlmChatStore: () => store }));
vi.mock("../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId }),
}));
vi.mock("../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => ({ temporaryModel: { value: null } }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: vi.fn(),
}));
vi.mock("../../stores/userProfileStore", () => ({
  useUserProfileStore: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  ErrorLevel: { ERROR: "error" },
  createModuleErrorHandler: () => ({
    wrapAsync: async (fn: () => Promise<unknown>) => await fn(),
  }),
}));

import { LlmChatService } from "../llmChatService";

// 验证实际发送目标，保护新会话消息不会追加到历史记录。
describe("LlmChatService 会话选择", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAgentId.value = "agent-1";
    store.currentSessionId = null;
    store.sessionIndexMap = new Map([["old", { id: "old" }]]);
    store.beginNewSession.mockImplementation(async () => {
      store.currentSessionId = "draft";
      store.sessionIndexMap.set("draft", { id: "draft" });
      return "draft";
    });
    store.sendMessage.mockResolvedValue(undefined);
  });

  it("空选择且存在历史时，等待新会话就绪再向新会话发送", async () => {
    let releaseDraft!: () => void;
    store.beginNewSession.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releaseDraft = () => {
            store.currentSessionId = "draft";
            store.sessionIndexMap.set("draft", { id: "draft" });
            resolve("draft");
          };
        })
    );
    let sentTo: string | null = null;
    store.sendMessage.mockImplementation(async () => {
      sentTo = store.currentSessionId;
    });

    const sending = new LlmChatService().sendMessage("新话题");
    expect(store.sendMessage).not.toHaveBeenCalled();
    releaseDraft();
    await sending;

    expect(store.beginNewSession).toHaveBeenCalledWith("agent-1");
    expect(sentTo).toBe("draft");
    expect(store.sendMessage).toHaveBeenCalledWith("新话题", {
      sessionId: "draft",
      temporaryModel: null,
    });
    expect(store.switchSession).not.toHaveBeenCalled();
  });

  it("已选中的历史会话继续使用原会话", async () => {
    store.currentSessionId = "old";
    await new LlmChatService().sendMessage("继续");
    expect(store.currentSessionId).toBe("old");
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.sendMessage).toHaveBeenCalledWith("继续", {
      sessionId: "old",
      temporaryModel: null,
    });
  });

  it("显式指定有效历史会话时保留目标和当前选择", async () => {
    await new LlmChatService().sendMessage("后台消息", { sessionId: "old" });
    expect(store.currentSessionId).toBeNull();
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.sendMessage).toHaveBeenCalledWith("后台消息", {
      sessionId: "old",
      temporaryModel: null,
    });
  });

  it("显式指定失效会话时阻止消息发送到其他会话", async () => {
    await expect(
      new LlmChatService().sendMessage("后台消息", {
        sessionId: "missing",
      })
    ).rejects.toThrow();
    expect(store.beginNewSession).not.toHaveBeenCalled();
    expect(store.switchSession).not.toHaveBeenCalled();
    expect(store.sendMessage).not.toHaveBeenCalled();
  });
});
