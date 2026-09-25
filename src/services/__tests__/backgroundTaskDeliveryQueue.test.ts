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
 * 后台任务投递队列单元测试（Phase 4 数据模型与持久化契约）
 *
 * 覆盖：排队消息入队与幂等、状态流转与终态保护、列表过滤、执行链合并、
 * 通知幂等与投影/确认、持久化恢复与幂等索引重建、超出上限淘汰。
 *
 * 非 Tauri 测试环境下 ConfigManager 自动降级为内存存储；
 * 每个用例使用独立的持久化文件名以隔离内存存储中的数据。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundTaskDeliveryQueue } from "../background-tasks/deliveryQueue";
import type {
  EnqueueTaskMessageInput,
  EnqueueTaskNotificationInput,
  MessageOrigin,
} from "../background-tasks/types";

function makeOrigin(overrides: Partial<MessageOrigin> = {}): MessageOrigin {
  return {
    kind: "user",
    channel: "user_intervention",
    actorId: "user-1",
    actorDisplayName: "主人",
    ...overrides,
  };
}

function makeMessageInput(
  overrides: Partial<EnqueueTaskMessageInput> = {}
): EnqueueTaskMessageInput {
  return {
    sourceTaskId: "bgtask-1",
    childSessionId: "session-child",
    executionLaneKey: "sub-agent:session-child",
    messageNodeId: "node-1",
    origin: makeOrigin(),
    delivery: "next_turn",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function makeNotificationInput(
  overrides: Partial<EnqueueTaskNotificationInput> = {}
): EnqueueTaskNotificationInput {
  return {
    taskId: "bgtask-1",
    parentSessionId: "session-parent",
    kind: "task_terminal",
    summary: "后台任务已完成",
    idempotencyKey: "notif-idem-1",
    ...overrides,
  };
}

function uniquePersistenceFileName(): string {
  return `bgdel-test-${Math.random().toString(36).slice(2)}-${Date.now()}.json`;
}

describe("BackgroundTaskDeliveryQueue", () => {
  let queue: BackgroundTaskDeliveryQueue;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-09-25T10:00:00.000Z"));
    queue = new BackgroundTaskDeliveryQueue({
      persistenceFileName: uniquePersistenceFileName(),
    });
    return queue.loadFromPersistence();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("排队消息", () => {
    it("入队生成 queued 记录并携带消息节点引用与来源", () => {
      const message = queue.enqueueMessage(makeMessageInput())!;

      expect(message).not.toBeNull();
      expect(message.deliveryId).toMatch(/^bgdel-/);
      expect(message.state).toBe("queued");
      expect(message.delivery).toBe("next_turn");
      expect(message.messageNodeId).toBe("node-1");
      expect(message.origin).toMatchObject({ channel: "user_intervention" });
      expect(message.enqueuedAt).toBe("2026-09-25T10:00:00.000Z");
      expect(message.deliveredAt).toBeUndefined();
    });

    it("相同 idempotencyKey 重复入队返回原记录，不产生新投递", () => {
      const first = queue.enqueueMessage(makeMessageInput())!;
      const second = queue.enqueueMessage(
        makeMessageInput({ messageNodeId: "node-2" })
      )!;

      expect(second.deliveryId).toBe(first.deliveryId);
      expect(second.messageNodeId).toBe("node-1");
      expect(queue.listMessages()).toHaveLength(1);
    });

    it("状态按等待安全点 → 已投递流转并记录 follow-up task", () => {
      const message = queue.enqueueMessage(makeMessageInput())!;

      const waiting = queue.markMessageWaitingSafePoint(message.deliveryId)!;
      expect(waiting.state).toBe("waiting_safe_point");

      const delivered = queue.markMessageDelivered(
        message.deliveryId,
        "bgtask-followup"
      )!;
      expect(delivered.state).toBe("delivered");
      expect(delivered.followUpTaskId).toBe("bgtask-followup");
      expect(delivered.deliveredAt).toBe("2026-09-25T10:00:00.000Z");

      // 终态保护：已投递记录不再接受二次流转
      expect(
        queue.markMessageFailed(message.deliveryId, {
          message: "x",
          failedAt: "2026-09-25T10:00:00.000Z",
        })
      ).toBeNull();
      expect(queue.cancelMessage(message.deliveryId)).toBeNull();
    });

    it("失败与取消记录原因并冻结状态", () => {
      const failed = queue.enqueueMessage(
        makeMessageInput({ idempotencyKey: "idem-fail" })
      )!;
      const failedResult = queue.markMessageFailed(failed.deliveryId, {
        code: "session_unavailable",
        message: "子会话不可读",
        failedAt: "2026-09-25T10:00:00.000Z",
      })!;
      expect(failedResult.state).toBe("failed");
      expect(failedResult.error?.code).toBe("session_unavailable");

      const cancelled = queue.enqueueMessage(
        makeMessageInput({ idempotencyKey: "idem-cancel" })
      )!;
      expect(queue.cancelMessage(cancelled.deliveryId)!.state).toBe(
        "cancelled"
      );
      expect(queue.markMessageDelivered(cancelled.deliveryId)).toBeNull();
    });

    it("可按源任务与状态过滤，执行链支持合并写入", () => {
      queue.enqueueMessage(
        makeMessageInput({ idempotencyKey: "a", sourceTaskId: "task-a" })
      );
      const b = queue.enqueueMessage(
        makeMessageInput({ idempotencyKey: "b", sourceTaskId: "task-b" })
      )!;
      queue.markMessageWaitingSafePoint(b.deliveryId);

      expect(
        queue.listMessages({ sourceTaskId: "task-a" }).map((m) => m.deliveryId)
      ).toHaveLength(1);
      expect(queue.listMessages({ states: ["waiting_safe_point"] })).toEqual([
        expect.objectContaining({ deliveryId: b.deliveryId }),
      ]);

      queue.setExecutionLink("task-b", { continuationOfTaskId: "task-a" });
      queue.setExecutionLink("task-b", { retryOfTaskId: "task-x" });
      expect(queue.getExecutionLink("task-b")).toEqual({
        continuationOfTaskId: "task-a",
        retryOfTaskId: "task-x",
      });
      expect(queue.getExecutionLink("task-missing")).toBeNull();
    });
  });

  describe("可靠通知", () => {
    it("入队幂等，投影与确认记录时间且不覆盖原值", () => {
      const notification = queue.enqueueNotification(makeNotificationInput())!;
      expect(notification.notificationId).toMatch(/^bgnotif-/);
      expect(notification.kind).toBe("task_terminal");

      const duplicate = queue.enqueueNotification(
        makeNotificationInput({ summary: "重复事件" })
      )!;
      expect(duplicate.notificationId).toBe(notification.notificationId);

      const delivered = queue.markNotificationDelivered(
        notification.notificationId
      )!;
      expect(delivered.deliveredAt).toBe("2026-09-25T10:00:00.000Z");

      const acknowledged = queue.acknowledgeNotification(
        notification.notificationId
      )!;
      expect(acknowledged.acknowledgedAt).toBe("2026-09-25T10:00:00.000Z");
      expect(acknowledged.deliveredAt).toBe("2026-09-25T10:00:00.000Z");
    });

    it("未投影与未确认通知可按过滤条件筛选", () => {
      const pending = queue.enqueueNotification(
        makeNotificationInput({ idempotencyKey: "n-pending" })
      )!;
      const settled = queue.enqueueNotification(
        makeNotificationInput({ idempotencyKey: "n-settled" })
      )!;
      queue.acknowledgeNotification(settled.notificationId);

      expect(
        queue
          .listNotifications({ pendingOnly: true })
          .map((n) => n.notificationId)
      ).toEqual([pending.notificationId]);
      expect(
        queue
          .listNotifications({ undeliveredOnly: true })
          .map((n) => n.notificationId)
      ).toEqual([pending.notificationId]);
    });
  });

  describe("持久化恢复", () => {
    it("恢复期间以相同幂等键入队时保留内存记录且索引一致", async () => {
      const fileName = uniquePersistenceFileName();
      const seed = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      await seed.loadFromPersistence();

      const persistedMessage = seed.enqueueMessage(
        makeMessageInput({
          idempotencyKey: "hydrate-msg",
          messageNodeId: "node-old",
        })
      )!;
      const persistedNotification = seed.enqueueNotification(
        makeNotificationInput({
          idempotencyKey: "hydrate-notif",
          summary: "旧通知",
        })
      )!;
      await vi.advanceTimersByTimeAsync(600);

      vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
      const restored = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      // 恢复完成前用相同幂等键入队：内存记录应优先，旧持久化记录被丢弃
      const liveMessage = restored.enqueueMessage(
        makeMessageInput({
          idempotencyKey: "hydrate-msg",
          messageNodeId: "node-new",
        })
      )!;
      const liveNotification = restored.enqueueNotification(
        makeNotificationInput({
          idempotencyKey: "hydrate-notif",
          summary: "新通知",
        })
      )!;
      await restored.loadFromPersistence();

      const resolvedMessage =
        restored.findMessageByIdempotencyKey("hydrate-msg");
      expect(resolvedMessage?.deliveryId).toBe(liveMessage.deliveryId);
      expect(resolvedMessage?.messageNodeId).toBe("node-new");
      // 队列不再同时保留两条同键记录
      expect(restored.listMessages()).toHaveLength(1);
      expect(restored.getMessage(persistedMessage.deliveryId)).toBeNull();

      const resolvedNotification =
        restored.findNotificationByIdempotencyKey("hydrate-notif");
      expect(resolvedNotification?.notificationId).toBe(
        liveNotification.notificationId
      );
      expect(resolvedNotification?.summary).toBe("新通知");
      expect(restored.listNotifications()).toHaveLength(1);
      expect(
        restored.getNotification(persistedNotification.notificationId)
      ).toBeNull();
    });

    it("恢复排队消息、执行链与通知，并重建幂等索引", async () => {
      const fileName = uniquePersistenceFileName();
      const seed = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      await seed.loadFromPersistence();

      const message = seed.enqueueMessage(
        makeMessageInput({ idempotencyKey: "persist-msg" })
      )!;
      seed.markMessageWaitingSafePoint(message.deliveryId);
      seed.setExecutionLink("bgtask-followup", {
        continuationOfTaskId: "bgtask-1",
      });
      const notification = seed.enqueueNotification(
        makeNotificationInput({ idempotencyKey: "persist-notif" })
      )!;
      await vi.advanceTimersByTimeAsync(600);

      vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
      const restored = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      await restored.loadFromPersistence();

      expect(restored.getMessage(message.deliveryId)?.state).toBe(
        "waiting_safe_point"
      );
      expect(restored.getExecutionLink("bgtask-followup")).toEqual({
        continuationOfTaskId: "bgtask-1",
      });
      expect(
        restored.getNotification(notification.notificationId)?.summary
      ).toBe("后台任务已完成");
      // 幂等索引重建：相同键不重复入队
      expect(
        restored.enqueueMessage(
          makeMessageInput({ idempotencyKey: "persist-msg" })
        )!.deliveryId
      ).toBe(message.deliveryId);
      expect(
        restored.enqueueNotification(
          makeNotificationInput({ idempotencyKey: "persist-notif" })
        )!.notificationId
      ).toBe(notification.notificationId);
    });

    it("持久化超出上限时优先淘汰已终结的排队消息", async () => {
      const fileName = uniquePersistenceFileName();
      const seed = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      await seed.loadFromPersistence();

      for (let i = 0; i < 105; i += 1) {
        const message = seed.enqueueMessage(
          makeMessageInput({ idempotencyKey: `bulk-${i}` })
        )!;
        if (i % 2 === 0) {
          seed.markMessageDelivered(message.deliveryId);
        }
        vi.advanceTimersByTime(10);
      }
      await vi.advanceTimersByTimeAsync(600);

      const restored = new BackgroundTaskDeliveryQueue({
        persistenceFileName: fileName,
      });
      await restored.loadFromPersistence();

      const messages = restored.listMessages();
      expect(messages).toHaveLength(100);
      // 已终结消息优先被淘汰，未终结消息全部保留
      expect(messages.filter((m) => m.state === "queued")).toHaveLength(52);
      expect(messages.filter((m) => m.state === "delivered")).toHaveLength(48);
    });
  });
});
