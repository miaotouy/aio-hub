import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
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
    vi.useRealTimers();
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
