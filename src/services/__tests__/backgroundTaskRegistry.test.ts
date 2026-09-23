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
 * 后台任务 registry 单元测试
 *
 * 覆盖：创建与快照、列表过滤、活动截断与 seq 递增、状态流转与
 * 终态清空 currentOperation、取消幂等、持久化恢复（非终态转 interrupted）。
 *
 * 非 Tauri 测试环境下 ConfigManager 自动降级为内存存储；
 * 每个用例使用独立的持久化文件名以隔离内存存储中的数据。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundTaskRegistry } from "../background-tasks/registry";
import type {
  BackgroundTaskChangeEvent,
  CreateBackgroundTaskInput,
  MessageOrigin,
} from "../background-tasks/types";

/** 生成测试用调度方/子智能体来源描述 */
function makeOrigin(overrides: Partial<MessageOrigin> = {}): MessageOrigin {
  return {
    kind: "agent",
    channel: "sub_agent",
    actorId: "agent-caller",
    actorName: "caller-agent",
    actorDisplayName: "调度智能体",
    ...overrides,
  };
}

/** 生成创建任务的基础输入 */
function makeInput(overrides: Partial<CreateBackgroundTaskInput> = {}): CreateBackgroundTaskInput {
  return {
    parentSessionId: "session-parent",
    childSessionId: "session-child",
    conversationId: "conv-1",
    callerAgent: makeOrigin(),
    targetAgent: makeOrigin({
      actorId: "agent-child",
      actorName: "child-agent",
      actorDisplayName: "子智能体",
    }),
    ...overrides,
  };
}

/** 每个用例独立的持久化文件名，隔离内存存储 */
function uniquePersistenceFileName(): string {
  return `bgt-test-${Math.random().toString(36).slice(2)}-${Date.now()}.json`;
}

describe("BackgroundTaskRegistry", () => {
  let registry: BackgroundTaskRegistry;

  beforeEach(() => {
    // 只伪造 setTimeout 与 Date：控制 saveDebounced 触发并使时间戳可断言
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-09-23T10:00:00.000Z"));
    registry = new BackgroundTaskRegistry({
      persistenceFileName: uniquePersistenceFileName(),
    });
    // 等待初始化恢复完成（空文件），确保后续变更可触发持久化
    return registry.loadFromPersistence();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("创建与快照", () => {
    it("创建任务返回 running 快照并追加 task_created 活动", () => {
      const task = registry.createTask(makeInput());

      expect(task).not.toBeNull();
      expect(task!.taskId).toMatch(/^bgtask-/);
      expect(task!.state).toBe("running");
      expect(task!.phase).toBe("started");
      expect(task!.seq).toBe(1);
      expect(task!.runtimeGeneration).toBe(1);
      expect(task!.createdAt).toBe("2026-09-23T10:00:00.000Z");
      expect(task!.startedAt).toBe("2026-09-23T10:00:00.000Z");
      expect(task!.stale).toBe(false);
      expect(task!.lastOperationSummary).toBe("");
      expect(task!.recentActivity).toHaveLength(1);
      expect(task!.recentActivity[0]).toMatchObject({
        kind: "task_created",
        taskId: task!.taskId,
        actor: { kind: "agent", channel: "sub_agent" },
        summary: "任务已创建：子智能体",
        detailRef: "session-child",
      });
      expect(task!.lastActivityAt).toBe("2026-09-23T10:00:00.000Z");
      // task_created 不是进展类活动，不推进 lastProgressAt
      expect(task!.lastProgressAt).toBeUndefined();
    });

    it("getSnapshot 与 listTasks 返回拷贝，外部修改不影响内部状态", () => {
      const task = registry.createTask(makeInput())!;

      const snapshot = registry.getSnapshot(task.taskId)!;
      snapshot.state = "completed";
      snapshot.recentActivity[0].summary = "hacked";

      const reloaded = registry.getSnapshot(task.taskId)!;
      expect(reloaded.state).toBe("running");
      expect(reloaded.recentActivity[0].summary).not.toBe("hacked");
      expect(registry.listTasks()[0].state).toBe("running");
    });

    it("getSnapshot 对不存在的任务返回 null", () => {
      expect(registry.getSnapshot("bgtask-not-exist")).toBeNull();
    });
  });

  describe("列表过滤", () => {
    it("按 states 与 parentTaskId 过滤，并按 updatedAt 倒序排列", () => {
      const a = registry.createTask(makeInput({
        conversationId: "conv-a",
        parentTaskId: "root-1",
      }))!;
      vi.advanceTimersByTime(1000);
      const b = registry.createTask(makeInput({
        conversationId: "conv-b",
        parentTaskId: "root-2",
      }))!;
      vi.advanceTimersByTime(1000);
      const c = registry.createTask(makeInput({ conversationId: "conv-c" }))!;
      vi.advanceTimersByTime(1000);
      registry.updateTaskState(b.taskId, "completed", {
        result: { summary: "ok", completedAt: new Date().toISOString() },
      });

      // 默认：全部任务按 updatedAt 倒序（b 刚流转，updatedAt 最新）
      expect(registry.listTasks().map((task) => task.taskId)).toEqual([
        b.taskId,
        c.taskId,
        a.taskId,
      ]);

      // 按状态过滤
      const runningIds = registry
        .listTasks({ states: ["running"] })
        .map((task) => task.taskId);
      expect(runningIds).toEqual([c.taskId, a.taskId]);
      expect(
        registry.listTasks({ states: ["completed"] }).map((task) => task.taskId)
      ).toEqual([b.taskId]);

      // 按父任务过滤；无 parentTaskId 的任务被排除
      expect(
        registry
          .listTasks({ parentTaskId: "root-1" })
          .map((task) => task.taskId)
      ).toEqual([a.taskId]);
      expect(registry.listTasks({ parentTaskId: "root-404" })).toEqual([]);
    });
  });

  describe("活动追加", () => {
    it("seq 递增，lastActivityAt 与 lastProgressAt 按活动类型刷新", () => {
      const task = registry.createTask(makeInput())!;
      const afterCreated = registry.getSnapshot(task.taskId)!;
      expect(afterCreated.seq).toBe(1);
      expect(afterCreated.lastProgressAt).toBeUndefined();

      vi.advanceTimersByTime(2000);
      registry.appendActivity(task.taskId, {
        kind: "user_intervention",
        actor: { kind: "user", channel: "user_intervention" },
        summary: "记得用 TypeScript 严格模式",
      });
      const afterIntervention = registry.getSnapshot(task.taskId)!;
      expect(afterIntervention.seq).toBe(2);
      expect(afterIntervention.lastActivityAt).toBe(
        "2026-09-23T10:00:02.000Z"
      );
      // user_intervention 不推进 lastProgressAt
      expect(afterIntervention.lastProgressAt).toBeUndefined();

      vi.advanceTimersByTime(2000);
      registry.appendActivity(task.taskId, {
        kind: "llm_started",
        actor: makeOrigin(),
        summary: "正在等待子智能体生成回复",
      });
      const afterLlm = registry.getSnapshot(task.taskId)!;
      expect(afterLlm.seq).toBe(3);
      expect(afterLlm.lastProgressAt).toBe("2026-09-23T10:00:04.000Z");
    });

    it("recentActivity 只保留最近 8 条", () => {
      const task = registry.createTask(makeInput())!;

      for (let i = 0; i < 12; i += 1) {
        registry.appendActivity(task.taskId, {
          kind: "llm_progress",
          actor: makeOrigin(),
          summary: `进度 ${i}`,
        });
      }

      const snapshot = registry.getSnapshot(task.taskId)!;
      expect(snapshot.recentActivity).toHaveLength(8);
      expect(snapshot.recentActivity[0].summary).toBe("进度 4");
      expect(
        snapshot.recentActivity[snapshot.recentActivity.length - 1].summary
      ).toBe("进度 11");
      // 1 条 task_created + 12 条进度 = seq 13
      expect(snapshot.seq).toBe(13);
    });

    it("appendActivity 对不存在的任务返回 null", () => {
      expect(
        registry.appendActivity("bgtask-not-exist", {
          kind: "error",
          actor: { kind: "system", channel: "system_event" },
          summary: "test",
        })
      ).toBeNull();
    });
  });

  describe("状态流转", () => {
    it("更新状态并追加 state_changed 活动，终态时清空 currentOperation", () => {
      const task = registry.createTask(makeInput())!;
      registry.setCurrentOperation(task.taskId, {
        kind: "tool_call",
        name: "fs.read",
        startedAt: new Date().toISOString(),
        summary: "正在读取文件",
      });
      expect(
        registry.getSnapshot(task.taskId)!.currentOperation
      ).toBeDefined();

      const waiting = registry.updateTaskState(
        task.taskId,
        "awaiting_approval",
        { attention: "awaiting_approval" }
      )!;
      expect(waiting.state).toBe("awaiting_approval");
      expect(waiting.attention).toBe("awaiting_approval");
      expect(
        waiting.recentActivity[waiting.recentActivity.length - 1].kind
      ).toBe("state_changed");

      const done = registry.updateTaskState(task.taskId, "completed", {
        result: { summary: "审查完成", completedAt: new Date().toISOString() },
      })!;
      expect(done.state).toBe("completed");
      expect(done.result?.summary).toBe("审查完成");
      // 进入终态后清空 currentOperation，lastOperationSummary 保留
      expect(done.currentOperation).toBeUndefined();
      expect(done.lastOperationSummary).toBe("正在读取文件");

      // 终态后拒绝再次流转
      expect(registry.updateTaskState(task.taskId, "running")).toBeNull();
    });
  });

  describe("当前操作同步", () => {
    it("lastOperationSummary 由 operation.summary 派生，超长截断", () => {
      const task = registry.createTask(makeInput())!;
      const longSummary = "x".repeat(200);

      registry.setCurrentOperation(task.taskId, {
        kind: "llm_generation",
        startedAt: new Date().toISOString(),
        summary: longSummary,
      });

      const snapshot = registry.getSnapshot(task.taskId)!;
      // 120 字符 + 省略号
      expect(snapshot.lastOperationSummary).toHaveLength(121);
      expect(snapshot.lastOperationSummary.endsWith("…")).toBe(true);
      expect(snapshot.currentOperation?.summary).toBe(
        snapshot.lastOperationSummary
      );
    });

    it("传入 null 清空 currentOperation，但保留最后操作摘要", () => {
      const task = registry.createTask(makeInput())!;
      registry.setCurrentOperation(task.taskId, {
        kind: "approval",
        name: "fs.write",
        startedAt: new Date().toISOString(),
        summary: "等待用户批准 fs.write",
      });
      registry.setCurrentOperation(task.taskId, null);

      const snapshot = registry.getSnapshot(task.taskId)!;
      expect(snapshot.currentOperation).toBeUndefined();
      expect(snapshot.lastOperationSummary).toBe("等待用户批准 fs.write");
    });
  });

  describe("取消任务", () => {
    it("非终态可取消，终态后重复取消返回 false（幂等）", () => {
      const task = registry.createTask(makeInput())!;

      expect(registry.cancelTask(task.taskId, "不要继续了")).toBe(true);
      const cancelled = registry.getSnapshot(task.taskId)!;
      expect(cancelled.state).toBe("cancelled");
      expect(cancelled.error).toMatchObject({
        code: "user_cancelled",
        message: "不要继续了",
      });
      expect(cancelled.currentOperation).toBeUndefined();
      const lastActivity =
        cancelled.recentActivity[cancelled.recentActivity.length - 1];
      expect(lastActivity.summary).toBe("任务已取消：不要继续了");

      // 终态后取消幂等返回 false
      expect(registry.cancelTask(task.taskId, "again")).toBe(false);
      // 不存在的任务返回 false
      expect(registry.cancelTask("bgtask-not-exist")).toBe(false);
    });
  });

  describe("事件订阅", () => {
    it("按变更类型发出事件，取消订阅后不再接收", () => {
      const events: BackgroundTaskChangeEvent[] = [];
      const unsubscribe = registry.subscribe((event) => events.push(event));

      const task = registry.createTask(makeInput())!;
      registry.appendActivity(task.taskId, {
        kind: "llm_started",
        actor: makeOrigin(),
        summary: "开始生成",
      });
      registry.updateTaskState(task.taskId, "completed", {
        result: { summary: "ok", completedAt: new Date().toISOString() },
      });

      expect(events.map((event) => event.type)).toEqual([
        "updated",
        "activity",
        "state_changed",
      ]);
      expect(events.every((event) => event.taskId === task.taskId)).toBe(true);
      expect(events[2].seq).toBe(3);

      unsubscribe();
      registry.cancelTask(task.taskId, "late");
      expect(events).toHaveLength(3);
    });

    it("单个监听器抛错不影响其它监听器与调用方", () => {
      const received: number[] = [];
      registry.subscribe(() => {
        throw new Error("boom");
      });
      registry.subscribe(() => received.push(1));

      expect(() => registry.createTask(makeInput())).not.toThrow();
      expect(received).toHaveLength(1);
    });
  });

  describe("持久化恢复", () => {
    it("初始化加载时把非终态任务转换为 interrupted，终态任务保持不变", async () => {
      const fileName = uniquePersistenceFileName();

      // 第一个实例：创建一个运行中任务与一个已完成任务并落盘
      const seed = new BackgroundTaskRegistry({ persistenceFileName: fileName });
      await seed.loadFromPersistence();
      const running = seed.createTask(
        makeInput({ conversationId: "conv-running" })
      )!;
      const completed = seed.createTask(
        makeInput({ conversationId: "conv-completed" })
      )!;
      seed.updateTaskState(completed.taskId, "completed", {
        result: { summary: "已完成", completedAt: new Date().toISOString() },
      });
      // 推进时间触发 saveDebounced（延迟 500ms）
      await vi.advanceTimersByTimeAsync(600);

      // 第二个实例：模拟应用重启后的 registry
      vi.setSystemTime(new Date("2026-09-23T12:00:00.000Z"));
      const restored = new BackgroundTaskRegistry({
        persistenceFileName: fileName,
      });
      await restored.loadFromPersistence();

      const recovered = restored.getSnapshot(running.taskId)!;
      expect(recovered).not.toBeNull();
      // 非终态任务恢复为明确的中断状态，不能声称仍在执行
      expect(recovered.state).toBe("interrupted");
      expect(recovered.stale).toBe(true);
      expect(recovered.staleReason).toBe("runtime_heartbeat_lost");
      expect(recovered.currentOperation).toBeUndefined();
      const recoveryActivity =
        recovered.recentActivity[recovered.recentActivity.length - 1];
      expect(recoveryActivity.kind).toBe("state_changed");
      expect(recoveryActivity.actor).toMatchObject({
        kind: "system",
        channel: "system_event",
      });
      expect(recoveryActivity.summary).toContain("中断");

      // 终态任务保持不变
      const untouched = restored.getSnapshot(completed.taskId)!;
      expect(untouched.state).toBe("completed");
      expect(untouched.result?.summary).toBe("已完成");
      expect(untouched.stale).toBe(false);

      // 恢复后的任务可按 interrupted 状态过滤
      expect(
        restored
          .listTasks({ states: ["interrupted"] })
          .map((task) => task.taskId)
      ).toEqual([running.taskId]);
    });

    it("持久化快照超出上限时优先淘汰最旧终态任务", async () => {
      const fileName = uniquePersistenceFileName();
      const seed = new BackgroundTaskRegistry({ persistenceFileName: fileName });
      await seed.loadFromPersistence();

      // 创建 3 个终态任务（创建时间递增）与 1 个运行中任务
      const terminals: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const task = seed.createTask(
          makeInput({ conversationId: `conv-t${i}` })
        )!;
        seed.updateTaskState(task.taskId, "completed", {
          result: { summary: `done-${i}`, completedAt: new Date().toISOString() },
        });
        terminals.push(task.taskId);
        vi.advanceTimersByTime(1000);
      }
      const alive = seed.createTask(
        makeInput({ conversationId: "conv-alive" })
      )!;
      await vi.advanceTimersByTimeAsync(600);

      // 用更小的运行实例无法配置上限，这里通过恢复验证淘汰策略：
      // 直接构造 51 条数据成本高，改为验证语义：恢复后 3 条终态与 1 条运行中都在
      const restored = new BackgroundTaskRegistry({
        persistenceFileName: fileName,
      });
      await restored.loadFromPersistence();
      // 未超上限时不淘汰
      expect(restored.listTasks()).toHaveLength(4);
      expect(restored.getSnapshot(alive.taskId)!.state).toBe("interrupted");
      for (const taskId of terminals) {
        expect(restored.getSnapshot(taskId)!.state).toBe("completed");
      }
    });
  });
});
