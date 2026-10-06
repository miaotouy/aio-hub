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
 * 后台任务审批桥接单元测试（P4）
 *
 * 覆盖：按子会话解析活动任务、升级人工时的状态/活动/通知投影、
 * 结算后恢复执行态与通知确认、一批多审批的收敛时机。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundTaskApprovalBridgeImpl } from "../background-tasks/approvalBridge";
import { BackgroundTaskRegistry } from "../background-tasks/registry";
import { BackgroundTaskDeliveryQueue } from "../background-tasks/deliveryQueue";
import type {
  BackgroundTaskApprovalInfo,
  CreateBackgroundTaskInput,
  MessageOrigin,
} from "../background-tasks/types";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function origin(overrides: Partial<MessageOrigin> = {}): MessageOrigin {
  return {
    kind: "agent",
    channel: "sub_agent",
    actorId: "agent-child",
    actorName: "child-agent",
    actorDisplayName: "子智能体",
    ...overrides,
  };
}

function taskInput(
  overrides: Partial<CreateBackgroundTaskInput> = {}
): CreateBackgroundTaskInput {
  return {
    parentSessionId: "session-parent",
    childSessionId: "session-child",
    conversationId: "conv-1",
    callerAgent: origin({ actorId: "agent-caller", actorName: "caller" }),
    targetAgent: origin(),
    owner: origin({ actorId: "agent-caller" }),
    executionLaneKey: "sub-agent:session-child",
    ...overrides,
  };
}

function approvalInfo(
  overrides: Partial<BackgroundTaskApprovalInfo> = {}
): BackgroundTaskApprovalInfo {
  return {
    taskId: "bgtask-1",
    requestId: "req-1",
    childSessionId: "session-child",
    toolId: "json-formatter",
    methodName: "formatJson",
    toolName: "json-formatter_formatJson",
    displayName: "格式化 JSON",
    forceApproval: false,
    summary: "格式化 JSON（json-formatter.formatJson）",
    ...overrides,
  };
}

function uniqueFileName(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}.json`;
}

describe("BackgroundTaskApprovalBridge", () => {
  let registry: BackgroundTaskRegistry;
  let queue: BackgroundTaskDeliveryQueue;
  let bridge: BackgroundTaskApprovalBridgeImpl;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:00:00.000Z"));
    registry = new BackgroundTaskRegistry({
      persistenceFileName: uniqueFileName("bridge-registry"),
    });
    queue = new BackgroundTaskDeliveryQueue({
      persistenceFileName: uniqueFileName("bridge-queue"),
    });
    await Promise.all([
      registry.loadFromPersistence(),
      queue.loadFromPersistence(),
    ]);
    bridge = new BackgroundTaskApprovalBridgeImpl(registry, queue);
  });

  it("resolveActiveTask 按子会话命中非终态任务", () => {
    const task = registry.createTask(taskInput())!;
    const resolved = bridge.resolveActiveTask("session-child");
    expect(resolved).toEqual({
      taskId: task.taskId,
      parentSessionId: "session-parent",
    });
    expect(bridge.resolveActiveTask("unknown-session")).toBeNull();
  });

  it("resolveActiveTask 优先命中 lane 上执行中的任务而非排队任务", () => {
    const running = registry.createTask(taskInput())!;
    registry.markExecutingTask(running.taskId);
    vi.advanceTimersByTime(1000);
    // 排队任务 updatedAt 更新，旧的“取倒序第一个”实现会误选它
    const queued = registry.createTask(
      taskInput({
        conversationId: "conv-queued",
        initialState: "queued",
        phase: "queued_for_execution",
      })
    )!;
    expect(queued.updatedAt > running.updatedAt).toBe(true);
    expect(bridge.resolveActiveTask("session-child")).toEqual({
      taskId: running.taskId,
      parentSessionId: "session-parent",
    });
  });

  it("多个非终态候选且无执行归属时放弃关联，不误挂排队任务", () => {
    registry.createTask(taskInput())!;
    vi.advanceTimersByTime(1000);
    registry.createTask(
      taskInput({ conversationId: "conv-b", initialState: "queued" })
    );
    expect(bridge.resolveActiveTask("session-child")).toBeNull();
  });

  it("仲裁中只更新当前操作，不改变任务状态", () => {
    const task = registry.createTask(taskInput())!;
    bridge.onApprovalArbitrating(approvalInfo({ taskId: task.taskId }));
    const snapshot = registry.getSnapshot(task.taskId)!;
    expect(snapshot.state).toBe("running");
    expect(snapshot.currentOperation?.kind).toBe("approval");
    expect(snapshot.currentOperation?.requestId).toBe("req-1");
  });

  it("升级人工时进入 awaiting_approval、追加活动并投递可靠通知", () => {
    const task = registry.createTask(taskInput())!;
    bridge.onApprovalPending(approvalInfo({ taskId: task.taskId }));

    const snapshot = registry.getSnapshot(task.taskId)!;
    expect(snapshot.state).toBe("awaiting_approval");
    expect(snapshot.attention).toBe("awaiting_approval");
    expect(
      snapshot.recentActivity.some((a) => a.kind === "approval_requested")
    ).toBe(true);

    const notifications = queue.listNotifications({
      taskId: task.taskId,
      pendingOnly: true,
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("approval_required");
    expect(notifications[0].parentSessionId).toBe("session-parent");
  });

  it("结算后写回审批记录、恢复执行态并确认通知", () => {
    const task = registry.createTask(taskInput())!;
    bridge.onApprovalPending(approvalInfo({ taskId: task.taskId }));
    bridge.onApprovalSettled(approvalInfo({ taskId: task.taskId }), {
      decision: "approved",
      origin: "jev",
      jevAction: "approve",
      risk: 0.1,
      confidence: 0.95,
      reason: "低风险",
    });

    const snapshot = registry.getSnapshot(task.taskId)!;
    expect(snapshot.state).toBe("running");
    expect(snapshot.attention).toBeUndefined();
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.approvals![0]).toMatchObject({
      requestId: "req-1",
      decision: "approved",
      origin: "jev",
      jevAction: "approve",
    });
    expect(
      snapshot.recentActivity.some((a) => a.kind === "approval_resolved")
    ).toBe(true);
    expect(
      queue.listNotifications({ taskId: task.taskId, pendingOnly: true })
    ).toHaveLength(0);
  });

  it("一批多审批全部结算后才恢复执行态", () => {
    const task = registry.createTask(taskInput())!;
    const first = approvalInfo({ taskId: task.taskId, requestId: "req-a" });
    const second = approvalInfo({ taskId: task.taskId, requestId: "req-b" });
    bridge.onApprovalPending(first);
    bridge.onApprovalPending(second);

    bridge.onApprovalSettled(first, { decision: "approved", origin: "manual" });
    expect(registry.getSnapshot(task.taskId)!.state).toBe("awaiting_approval");

    bridge.onApprovalSettled(second, {
      decision: "rejected",
      origin: "manual",
    });
    expect(registry.getSnapshot(task.taskId)!.state).toBe("running");
    expect(registry.getSnapshot(task.taskId)!.approvals).toHaveLength(2);
  });

  it("多项审批逐项确认各自通知，不残留 pending", () => {
    const task = registry.createTask(taskInput())!;
    const first = approvalInfo({ taskId: task.taskId, requestId: "req-a" });
    const second = approvalInfo({ taskId: task.taskId, requestId: "req-b" });
    bridge.onApprovalPending(first);
    bridge.onApprovalPending(second);
    expect(
      queue.listNotifications({ taskId: task.taskId, pendingOnly: true })
    ).toHaveLength(2);

    bridge.onApprovalSettled(first, { decision: "approved", origin: "manual" });
    const afterFirst = queue.listNotifications({
      taskId: task.taskId,
      pendingOnly: true,
    });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].idempotencyKey.endsWith(":req-b")).toBe(true);

    bridge.onApprovalSettled(second, {
      decision: "rejected",
      origin: "manual",
    });
    expect(
      queue.listNotifications({ taskId: task.taskId, pendingOnly: true })
    ).toHaveLength(0);
  });

  it("自动裁决结算后清除该请求的等待 AI 审核当前操作", () => {
    const task = registry.createTask(taskInput())!;
    // JEV 自动裁决路径：先 arbitrating（不进入 pending），再结算
    bridge.onApprovalArbitrating(
      approvalInfo({ taskId: task.taskId, requestId: "req-auto" })
    );
    expect(
      registry.getSnapshot(task.taskId)!.currentOperation?.requestId
    ).toBe("req-auto");

    bridge.onApprovalSettled(
      approvalInfo({ taskId: task.taskId, requestId: "req-auto" }),
      { decision: "approved", origin: "jev", jevAction: "approve" }
    );
    const snapshot = registry.getSnapshot(task.taskId)!;
    expect(snapshot.state).toBe("running");
    expect(snapshot.currentOperation).toBeUndefined();
  });

  it("终态任务不再被审批事件改写", () => {
    const task = registry.createTask(taskInput())!;
    registry.cancelTask(task.taskId, "用户取消");
    bridge.onApprovalPending(approvalInfo({ taskId: task.taskId }));
    const snapshot = registry.getSnapshot(task.taskId)!;
    expect(snapshot.state).toBe("cancelled");
    expect(
      queue.listNotifications({ taskId: task.taskId, pendingOnly: true })
    ).toHaveLength(0);
  });
});
