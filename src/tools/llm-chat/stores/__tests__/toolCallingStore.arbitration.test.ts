import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
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

import {
  setApprovalArbiter,
  useToolCallingStore,
} from "../toolCallingStore";
import type {
  ArbiterDecision,
  ArbitrationContext,
  ApprovalArbiter,
} from "@/services/decision-arbiter/types";

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

function decision(action: ArbiterDecision["action"]): ArbiterDecision {
  return { action, reason: `mock-${action}`, audit: null };
}

function mockArbiter(
  impl: (
    ctx: ArbitrationContext,
    signal?: AbortSignal
  ) => Promise<ArbiterDecision>
): ApprovalArbiter {
  return { arbitrate: vi.fn(impl) };
}

/** flush microtasks：requestApproval 在 arbiter resolve 后才入列。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("toolCallingStore 仲裁接入（§2.3 / §2.4）", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setApprovalArbiter(null);
  });

  it("未注入 arbiter 时行为与原有人工流程一致", async () => {
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-1"));
    expect(store.arbitrationStates.size).toBe(0);
    expect(store.pendingRequests).toHaveLength(1);
    store.approveRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("approved");
  });

  it("arbiter approve 短路返回，不入列 pendingRequests", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("approve"))));
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-approve"));
    await expect(resultPromise).resolves.toBe("approved");
    expect(store.pendingRequests).toHaveLength(0);
    expect(store.arbitrationStates.get("req-approve")).toBe("auto-approved");
    expect(store.auditRecords.get("req-approve")?.origin).toBe("jev");
  });

  it("arbiter deny 短路返回 rejected，状态标记 auto-denied", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("deny"))));
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-deny"));
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
    expect(store.arbitrationStates.get("req-deny")).toBe("auto-denied");
  });

  it("escalate 才入列 pendingRequests，人工批准后正常结算", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("escalate"))));
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "s1",
      request("req-esc"),
      undefined,
      { agentId: "agent-1", agentName: "助手", source: "orchestrator" }
    );
    await flush();
    expect(store.pendingRequests).toHaveLength(1);
    expect(store.arbitrationStates.get("req-esc")).toBe("escalated");
    // JEV 建议保留在审计映射，供浮窗展示
    expect(store.auditRecords.get("req-esc")?.origin).toBe("jev");

    store.approveRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("approved");
    // 人工放行审计覆盖（红线 7 旁路映射）
    expect(store.auditRecords.get("req-esc")?.origin).toBe("manual");
  });

  it("仲裁器抛异常时兜底转人工（fail-closed）", async () => {
    setApprovalArbiter({
      arbitrate: vi.fn(() => Promise.reject(new Error("channel boom"))),
    });
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-err"));
    await flush();
    expect(store.pendingRequests).toHaveLength(1);
    expect(store.arbitrationStates.get("req-err")).toBe("escalated");
    store.rejectRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("rejected");
  });

  it("skipArbitration 时跳过仲裁直接人工", async () => {
    const arbiter = mockArbiter(() => Promise.resolve(decision("approve")));
    setApprovalArbiter(arbiter);
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-skip"), undefined, {
      skipArbitration: true,
    });
    expect(store.pendingRequests).toHaveLength(1);
    expect(arbiter.arbitrate).not.toHaveBeenCalled();
    store.approveRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("approved");
  });

  it("仲裁期间 AbortSignal 中止 → rejected 且不进入人工流程", async () => {
    const controller = new AbortController();
    setApprovalArbiter(
      mockArbiter(
        () =>
          new Promise<ArbiterDecision>((resolve) => {
            controller.abort();
            resolve(decision("escalate"));
          })
      )
    );
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-abort"), undefined, {
      signal: controller.signal,
    });
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
  });

  it("arbitrationStates 以 request.requestId 为 key（红线 7 契约）", async () => {
    let captured: ArbitrationContext | null = null;
    setApprovalArbiter(
      mockArbiter(async (ctx) => {
        captured = ctx;
        return decision("escalate");
      })
    );
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-key"));
    // 仲裁状态 key 与消息卡片 requestId 一致
    expect(store.arbitrationStates.has("req-key")).toBe(true);
    await flush();
    expect(store.pendingRequests[0].id).not.toBe("req-key");
    // ArbitrationContext 携带完整请求
    expect(captured!.request.requestId).toBe("req-key");
    store.approveRequest(store.pendingRequests[0].id);
    await resultPromise;
  });

  it("cancelBySession 联动清理该会话的仲裁状态与审计映射", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("escalate"))));
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s-session", request("req-clean"));
    expect(store.arbitrationStates.has("req-clean")).toBe(true);
    await flush();

    store.cancelBySession("s-session", "会话删除");
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.arbitrationStates.has("req-clean")).toBe(false);
    expect(store.auditRecords.has("req-clean")).toBe(false);
    expect(store.pendingRequests).toHaveLength(0);
  });

  it("已结项的仲裁记录不因 cancelBySession 被误清（索引不残留）", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("approve"))));
    const store = useToolCallingStore();
    await expect(
      store.requestApproval("s2", request("req-done"))
    ).resolves.toBe("approved");
    expect(store.arbitrationStates.get("req-done")).toBe("auto-approved");

    // approve 短路未入列，会话清理不应触碰已结项的审计/状态映射
    store.cancelBySession("s2", "会话删除");
    expect(store.arbitrationStates.get("req-done")).toBe("auto-approved");
    expect(store.auditRecords.get("req-done")?.origin).toBe("jev");
  });

  it("审批超时审计标记为 timeout", async () => {
    vi.useFakeTimers();
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("escalate"))));
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s1", request("req-timeout"), undefined, {
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.auditRecords.get("req-timeout")?.origin).toBe("timeout");
    vi.useRealTimers();
  });

  it("仲裁期间 cancelBySession → JEV 返回 approve 后仍 rejected，不再自动放行", async () => {
    let release: (d: ArbiterDecision) => void = () => {};
    setApprovalArbiter(
      mockArbiter(
        () =>
          new Promise<ArbiterDecision>((resolve) => {
            release = resolve;
          })
      )
    );
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s-cancel", request("req-late"));
    expect(store.arbitrationStates.get("req-late")).toBe("arbitrating");

    // 会话取消：仲裁被中止、等待态被清理
    store.cancelBySession("s-cancel", "会话删除");
    expect(store.arbitrationStates.has("req-late")).toBe(false);

    // JEV 稍后返回 approve：不得放行
    release(decision("approve"));
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.pendingRequests).toHaveLength(0);
    expect(store.arbitrationStates.has("req-late")).toBe(false);
  });

  it("仲裁透传 signal 给 arbiter（会话取消可中止渠道调用）", async () => {
    let capturedSignal: AbortSignal | null = null;
    setApprovalArbiter(
      mockArbiter((_ctx, signal) => {
        capturedSignal = signal ?? null;
        return new Promise<ArbiterDecision>(() => {});
      })
    );
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval("s-sig", request("req-sig"));
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal!.aborted).toBe(false);

    store.cancelBySession("s-sig", "会话删除");
    expect(capturedSignal!.aborted).toBe(true);
    await expect(resultPromise).resolves.toBe("rejected");
  });

  it("重复 externalId 在仲裁阶段即可取消旧请求（不入列也生效）", async () => {
    let releaseFirst: (d: ArbiterDecision) => void = () => {};
    // 第一个请求挂起在仲裁中
    setApprovalArbiter(
      mockArbiter(
        () =>
          new Promise<ArbiterDecision>((resolve) => {
            releaseFirst = resolve;
          })
      )
    );
    const store = useToolCallingStore();
    const firstPromise = store.requestApproval(
      "vcp-1",
      request("req-ext-1"),
      "ext-1",
      { source: "vcp-log" }
    );
    expect(store.arbitrationStates.get("req-ext-1")).toBe("arbitrating");

    // 相同 externalId 的第二个请求到达：旧仲裁立即被中止
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("approve"))));
    const secondPromise = store.requestApproval(
      "vcp-1",
      request("req-ext-2"),
      "ext-1",
      { source: "vcp-log" }
    );

    // 第一个请求即使随后返回 approve 也必须被拒绝
    releaseFirst(decision("approve"));
    await expect(firstPromise).resolves.toBe("rejected");
    await expect(secondPromise).resolves.toBe("approved");
    expect(store.arbitrationStates.get("req-ext-1")).toBeUndefined();
  });

  it("cancelExternalRequests 中止仍在仲裁中的外部请求", async () => {
    let capturedSignal: AbortSignal | null = null;
    setApprovalArbiter(
      mockArbiter((_ctx, signal) => {
        capturedSignal = signal ?? null;
        return new Promise<ArbiterDecision>(() => {});
      })
    );
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "vcp-2",
      request("req-vcp"),
      "ext-vcp",
      { source: "vcp-log" }
    );
    store.cancelExternalRequests("VCP 连接已断开");
    expect(capturedSignal!.aborted).toBe(true);
    await expect(resultPromise).resolves.toBe("rejected");
    expect(store.arbitrationStates.has("req-vcp")).toBe(false);
  });

  it("配置未启用（isArbitrationEnabled=false）直接走人工，不产生 arbitrating 等待态", async () => {
    const arbitrate = vi.fn(() => Promise.resolve(decision("approve")));
    setApprovalArbiter({
      arbitrate,
      isArbitrationEnabled: () => false,
    });
    const store = useToolCallingStore();
    const resultPromise = store.requestApproval(
      "s-off",
      request("req-off"),
      undefined,
      { agentId: "agent-disabled" }
    );
    // 未启用仲裁：不写等待态、不消耗渠道，直接进入人工审批
    expect(store.arbitrationStates.has("req-off")).toBe(false);
    expect(store.pendingRequests).toHaveLength(1);
    expect(arbitrate).not.toHaveBeenCalled();
    store.approveRequest(store.pendingRequests[0].id);
    await expect(resultPromise).resolves.toBe("approved");
  });
});
