// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * toolCallingStore 后台任务审批桥接接入测试（P4）
 *
 * 覆盖：按会话解析活动任务后来源标记为 background、approve/deny 短路结算回调、
 * escalate / 无仲裁进入人工时的 pending 投影与 parentSessionId、人工结算回调。
 */

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
  setTaskApprovalBridge,
  useToolCallingStore,
} from "../toolCallingStore";
import type {
  ArbiterDecision,
  ArbitrationContext,
  ApprovalArbiter,
} from "@/services/decision-arbiter/types";
import type {
  BackgroundTaskApprovalBridge,
  BackgroundTaskApprovalInfo,
  BackgroundTaskApprovalSettlement,
} from "@/services/background-tasks/types";

function request(requestId: string) {
  return {
    requestId,
    toolId: "test-tool",
    methodName: "run",
    toolName: "测试工具",
    methodDisplayName: "测试",
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

interface BridgeHarness {
  bridge: BackgroundTaskApprovalBridge;
  arbitratingCalls: BackgroundTaskApprovalInfo[];
  pendingCalls: BackgroundTaskApprovalInfo[];
  settledCalls: Array<{
    info: BackgroundTaskApprovalInfo;
    settlement: BackgroundTaskApprovalSettlement;
  }>;
  resolveCalls: string[];
}

function mockBridge(
  resolved: { taskId: string; parentSessionId: string | null } | null
): BridgeHarness {
  const arbitratingCalls: BackgroundTaskApprovalInfo[] = [];
  const pendingCalls: BackgroundTaskApprovalInfo[] = [];
  const settledCalls: BridgeHarness["settledCalls"] = [];
  const resolveCalls: string[] = [];
  const bridge: BackgroundTaskApprovalBridge = {
    resolveActiveTask(sessionId: string) {
      resolveCalls.push(sessionId);
      return resolved;
    },
    onApprovalArbitrating(info) {
      arbitratingCalls.push(info);
    },
    onApprovalPending(info) {
      pendingCalls.push(info);
    },
    onApprovalSettled(info, settlement) {
      settledCalls.push({ info, settlement });
    },
  };
  return { bridge, arbitratingCalls, pendingCalls, settledCalls, resolveCalls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("toolCallingStore 后台任务审批桥接（P4）", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setApprovalArbiter(null);
    setTaskApprovalBridge(null);
  });

  it("命中活动任务后仲裁来源标记为 background", async () => {
    let captured: ArbitrationContext | null = null;
    setApprovalArbiter(
      mockArbiter(async (ctx) => {
        captured = ctx;
        return decision("escalate");
      })
    );
    const harness = mockBridge({
      taskId: "bgtask-1",
      parentSessionId: "parent-1",
    });
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    const promise = store.requestApproval("child-1", request("req-bg"));
    await flush();
    expect(captured!.source).toBe("background");
    expect(harness.arbitratingCalls).toHaveLength(1);
    expect(harness.pendingCalls).toHaveLength(1);
    expect(store.pendingRequests[0].taskId).toBe("bgtask-1");
    expect(store.pendingRequests[0].parentSessionId).toBe("parent-1");
    store.approveRequest(store.pendingRequests[0].id);
    await promise;
  });

  it("未命中活动任务时来源仍为 orchestrator，不触发桥接", async () => {
    let captured: ArbitrationContext | null = null;
    setApprovalArbiter(
      mockArbiter(async (ctx) => {
        captured = ctx;
        return decision("escalate");
      })
    );
    const harness = mockBridge(null);
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    const promise = store.requestApproval("s1", request("req-local"));
    await flush();
    expect(captured!.source).toBe("orchestrator");
    expect(harness.arbitratingCalls).toHaveLength(0);
    expect(harness.pendingCalls).toHaveLength(0);
    store.approveRequest(store.pendingRequests[0].id);
    await promise;
  });

  it("JEV 自动放行时以 jev 来源结算任务审批", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("approve"))));
    const harness = mockBridge({ taskId: "bgtask-2", parentSessionId: null });
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    await expect(
      store.requestApproval("child-2", request("req-auto"))
    ).resolves.toBe("approved");
    expect(harness.settledCalls).toHaveLength(1);
    expect(harness.settledCalls[0].info.taskId).toBe("bgtask-2");
    expect(harness.settledCalls[0].settlement.decision).toBe("approved");
    expect(harness.settledCalls[0].settlement.origin).toBe("jev");
  });

  it("JEV 拦截时以 jev 来源结算 rejected", async () => {
    setApprovalArbiter(mockArbiter(() => Promise.resolve(decision("deny"))));
    const harness = mockBridge({ taskId: "bgtask-3", parentSessionId: null });
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    await expect(
      store.requestApproval("child-3", request("req-deny"))
    ).resolves.toBe("rejected");
    expect(harness.settledCalls[0].settlement.decision).toBe("rejected");
    expect(harness.settledCalls[0].settlement.origin).toBe("jev");
  });

  it("无仲裁直接人工时先投影 pending，人工批准后以 manual 结算", async () => {
    const harness = mockBridge({
      taskId: "bgtask-4",
      parentSessionId: "parent-4",
    });
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    const promise = store.requestApproval("child-4", request("req-manual"));
    expect(harness.pendingCalls).toHaveLength(1);
    expect(harness.settledCalls).toHaveLength(0);

    store.approveRequest(store.pendingRequests[0].id);
    await expect(promise).resolves.toBe("approved");
    expect(harness.settledCalls).toHaveLength(1);
    expect(harness.settledCalls[0].settlement.decision).toBe("approved");
    expect(harness.settledCalls[0].settlement.origin).toBe("manual");
  });

  it("escalate 后人工批准保留此前 JEV 证据，最终来源记为 manual", async () => {
    setApprovalArbiter(
      mockArbiter(() =>
        Promise.resolve<ArbiterDecision>({
          action: "escalate",
          reason: "需人工复核",
          audit: {
            action: "escalate",
            model: "jev-latest",
            durationMs: 120,
            risk: 0.42,
            intent: 0.88,
            verdict: "escalate",
            confidence: 0.6,
            reason: "需人工复核",
            degraded: false,
          },
        })
      )
    );
    const harness = mockBridge({
      taskId: "bgtask-5",
      parentSessionId: "parent-5",
    });
    setTaskApprovalBridge(harness.bridge);

    const store = useToolCallingStore();
    const promise = store.requestApproval("child-5", request("req-esc"));
    await flush();
    expect(store.pendingRequests).toHaveLength(1);

    store.approveRequest(store.pendingRequests[0].id);
    await expect(promise).resolves.toBe("approved");

    const settlement = harness.settledCalls[0].settlement;
    expect(settlement.origin).toBe("manual");
    expect(settlement.jevAction).toBe("escalate");
    expect(settlement.risk).toBe(0.42);
    expect(settlement.confidence).toBe(0.6);
    expect(settlement.reason).toBe("需人工复核");

    // 旁路审计映射同样保留 JEV 证据，同时记录最终处理来源为人工
    const audit = store.getAuditRecord("req-esc");
    expect(audit?.origin).toBe("manual");
    expect(audit?.arbiter?.action).toBe("escalate");
    expect(audit?.arbiter?.risk).toBe(0.42);
  });
});
