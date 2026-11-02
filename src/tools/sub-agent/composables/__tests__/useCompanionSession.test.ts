import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
} from "@/tools/llm-chat/types";
const ctx = vi.hoisted(() => ({ store: null as any }));
vi.mock("@/tools/llm-chat/stores/llmChatStore", () => ({
  useLlmChatStore: () => ctx.store,
}));
vi.mock("@/tools/llm-chat/composables/ui/useChatCompanionDock", () => ({
  useChatCompanionDock: () => ({ closeDock: vi.fn() }),
}));
vi.mock("@/services/background-tasks", () => ({
  backgroundTaskRegistry: { getSnapshot: () => null },
}));
import { useCompanionSession } from "../useCompanionSession";

function message(id: string, content: string): ChatMessageNode {
  return {
    id,
    content,
    role: "assistant",
    status: "complete",
    parentId: null,
    childrenIds: [],
    isEnabled: true,
    timestamp: "2026-10-19T00:00:00Z",
  };
}

describe("伴生会话实时读取", () => {
  afterEach(() => useCompanionSession().closeCompanion());
  it("跟随子会话增量和节点替换，刷新时保留视图并保持父会话选中态", async () => {
    const state = reactive({
      currentSessionId: "parent",
      paths: new Map<string, ChatMessageNode[]>([
        ["child", [message("a", "第一轮")]],
      ]),
      detail: { id: "child" } as ChatSessionDetail,
    });
    let finishLoad: ((detail: ChatSessionDetail) => void) | undefined;
    ctx.store = {
      getSessionIndexById: (id: string) => ({ id }) as ChatSessionIndex,
      getSessionDetailById: () => state.detail,
      getActivePathBySessionId: (id: string) => state.paths.get(id) ?? [],
      ensureSessionDetailLoaded: vi.fn(async () => state.detail),
    };
    const view = useCompanionSession();
    await view.openCompanion({ taskId: "task", childSessionId: "child" });
    expect(view.messages.value.map((m) => m.content)).toEqual(["第一轮"]);
    state.paths.get("child")!.push(message("b", "第二轮"));
    expect(view.messages.value.map((m) => m.content)).toEqual([
      "第一轮",
      "第二轮",
    ]);
    state.paths.set("child", [
      message("a", "结果已更新"),
      message("b", "第二轮"),
    ]);
    expect(view.messages.value[0].content).toBe("结果已更新");
    ctx.store.ensureSessionDetailLoaded.mockImplementationOnce(
      () =>
        new Promise<ChatSessionDetail>((resolve) => {
          finishLoad = resolve;
        })
    );
    const refresh = view.refresh();
    expect(view.isLoading.value).toBe(false);
    finishLoad!(state.detail);
    await refresh;
    expect(state.currentSessionId).toBe("parent");
    view.closeCompanion();
    expect(view.messages.value).toEqual([]);
  });
});
