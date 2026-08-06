import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const chatSettings = ref({
  uiPreferences: {
    toolApprovalTimeoutEnabled: false,
    toolApprovalTimeoutSeconds: 60,
  },
});

vi.mock("../../composables/settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: chatSettings }),
}));

import { useToolCallingStore } from "../toolCallingStore";

function request(requestId: string) {
  return {
    requestId,
    toolId: "test-tool",
    methodName: "run",
    toolName: "测试工具",
    rawBlock: "",
    args: {},
  };
}

describe("toolCallingStore 审批生命周期", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    chatSettings.value.uiPreferences.toolApprovalTimeoutEnabled = false;
    chatSettings.value.uiPreferences.toolApprovalTimeoutSeconds = 60;
    vi.useRealTimers();
  });

  it("默认不超时并一直等待人工处理", async () => {
    vi.useFakeTimers();
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "session-wait",
      request("request-wait")
    );

    expect(store.pendingRequests).toHaveLength(1);
    expect(store.pendingRequests[0].expiresAt).toBeNull();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(store.pendingRequests).toHaveLength(1);

    store.approveRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("approved");
  });

  it("全局开关会为当前默认策略请求启停超时", async () => {
    vi.useFakeTimers();
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "session-toggle",
      request("request-toggle")
    );

    chatSettings.value.uiPreferences.toolApprovalTimeoutEnabled = true;
    await nextTick();
    expect(store.pendingRequests[0].expiresAt).toBe(Date.now() + 60_000);

    chatSettings.value.uiPreferences.toolApprovalTimeoutSeconds = 120;
    await nextTick();
    expect(store.pendingRequests[0].expiresAt).toBe(Date.now() + 120_000);

    chatSettings.value.uiPreferences.toolApprovalTimeoutEnabled = false;
    await nextTick();
    expect(store.pendingRequests[0].expiresAt).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.pendingRequests).toHaveLength(1);

    store.rejectRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("rejected");
  });

  it("超时后默认拒绝并移除 pending 请求", async () => {
    vi.useFakeTimers();
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "session-1",
      request("request-timeout"),
      undefined,
      { timeoutMs: 1000 }
    );

    expect(store.pendingRequests).toHaveLength(1);
    expect(store.pendingRequests[0].expiresAt).toBe(
      store.pendingRequests[0].createdAt + 1000
    );
    await vi.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
  });

  it("AbortSignal 中止后默认拒绝并清理监听", async () => {
    const store = useToolCallingStore();
    const controller = new AbortController();
    const resultPromise = store.requestApproval(
      "session-abort",
      request("request-abort"),
      undefined,
      { signal: controller.signal }
    );

    controller.abort();

    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
  });

  it("批量审批只处理指定请求", async () => {
    const store = useToolCallingStore();
    const first = store.requestApproval("session-a", request("request-a"));
    const second = store.requestApproval("session-b", request("request-b"));
    const firstId = store.pendingRequests[0].id;

    store.approveByIds([firstId]);

    await expect(first).resolves.toBe("approved");
    expect(store.pendingRequests.map((item) => item.sessionId)).toEqual([
      "session-b",
    ]);
    store.cancelAll("测试结束");
    await expect(second).resolves.toBe("rejected");
  });

  it("会话删除与 VCP 断线只清理对应请求", async () => {
    const store = useToolCallingStore();
    const local = store.requestApproval("session-local", request("local"));
    const external = store.requestApproval(
      "vcp-maid",
      request("external"),
      "external-id"
    );

    expect(store.cancelBySession("session-local", "会话删除")).toBe(1);
    await expect(local).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(1);

    expect(store.cancelExternalRequests("VCP 断线")).toBe(1);
    await expect(external).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
  });

  it("窗口关闭事件拒绝全部挂起请求", async () => {
    const store = useToolCallingStore();
    const pending = store.requestApproval("session-window", request("window"));

    window.dispatchEvent(new Event("beforeunload"));

    await expect(pending).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
  });
});
