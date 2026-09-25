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
 * 后台任务可续投递、执行链与可靠通知队列
 *
 * 对应设计文档：src/tools/sub-agent/docs/Plan/background-agent-observability-and-intervention.md
 * 的 §4.2（可续投递、执行链与可靠通知模型）与 §9 Phase 4。
 *
 * Phase 4 边界：
 * - 本模块只承载 runtime-neutral 的数据模型、幂等去重与持久化契约；
 * - 不包含 task runner、安全点消费、触发生成或父会话投影逻辑；
 * - 队列记录引用已写入子会话的消息节点，保证消息身份、会话导出与
 *   恢复后的执行读取同一份事实。
 */

import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  BackgroundTaskError,
  EnqueueTaskMessageInput,
  EnqueueTaskNotificationInput,
  MessageOrigin,
  QueuedTaskMessage,
  QueuedTaskMessageState,
  TaskExecutionLink,
  TaskNotification,
} from "./types";

const logger = createModuleLogger("background-tasks/delivery-queue");
const errorHandler = createModuleErrorHandler(
  "background-tasks/delivery-queue"
);

// ==================== 常量 ====================

/** 持久化数据结构版本 */
const PERSISTENCE_VERSION = "1.0.0";

/** 排队消息持久化上限（超出优先淘汰已终结且最旧的记录） */
const MAX_PERSISTED_MESSAGES = 100;

/** 通知持久化上限（超出优先淘汰已确认且最旧的记录） */
const MAX_PERSISTED_NOTIFICATIONS = 100;

/** 排队消息终态：进入后不再接受状态流转 */
const TERMINAL_MESSAGE_STATES: ReadonlySet<QueuedTaskMessageState> = new Set([
  "delivered",
  "failed",
  "cancelled",
]);

/** 持久化 payload 结构 */
interface DeliveryQueuePersistencePayload {
  version: string;
  messages: QueuedTaskMessage[];
  executionLinks: Record<string, TaskExecutionLink>;
  notifications: TaskNotification[];
}

/** listMessages 的过滤条件 */
export interface ListQueuedTaskMessagesFilter {
  sourceTaskId?: string;
  childSessionId?: string;
  states?: QueuedTaskMessageState[];
}

/** listNotifications 的过滤条件 */
export interface ListTaskNotificationsFilter {
  taskId?: string;
  parentSessionId?: string | null;
  /** 仅返回尚未确认的通知 */
  pendingOnly?: boolean;
  /** 仅返回尚未投影到父会话的通知 */
  undeliveredOnly?: boolean;
}

// ==================== 内部工具函数 ====================

/** 当前时间的 ISO 8601 字符串 */
function nowIso(): string {
  return new Date().toISOString();
}

/** 生成带前缀的短 ID（进程内计数 + 随机后缀，避免与历史记录碰撞） */
function generateId(prefix: string, counter: number): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${counter.toString(36)}-${random}`;
}

function cloneOrigin(origin: MessageOrigin): MessageOrigin {
  return { ...origin };
}

function cloneQueuedMessage(message: QueuedTaskMessage): QueuedTaskMessage {
  return {
    ...message,
    origin: cloneOrigin(message.origin),
    error: message.error ? { ...message.error } : undefined,
  };
}

function cloneNotification(notification: TaskNotification): TaskNotification {
  return { ...notification };
}

function cloneExecutionLink(link: TaskExecutionLink): TaskExecutionLink {
  return { ...link };
}

// ==================== 服务类 ====================

/**
 * 后台任务投递与通知队列。
 *
 * 持久化到 `background-tasks/delivery-queue.json`：排队消息、执行链关联
 * 与可靠通知使用同一份 payload，保证恢复后三者的引用关系一致。
 */
export class BackgroundTaskDeliveryQueue {
  /** 排队消息索引（deliveryId → 记录） */
  private messages = new Map<string, QueuedTaskMessage>();

  /** 消息幂等索引（idempotencyKey → deliveryId） */
  private messageIdempotency = new Map<string, string>();

  /** 执行链关联（taskId → link） */
  private executionLinks = new Map<string, TaskExecutionLink>();

  /** 通知索引（notificationId → 记录） */
  private notifications = new Map<string, TaskNotification>();

  /** 通知幂等索引（idempotencyKey → notificationId） */
  private notificationIdempotency = new Map<string, string>();

  /** 持久化管理器 */
  private persistence: ReturnType<
    typeof createConfigManager<DeliveryQueuePersistencePayload>
  >;

  /** 初始化恢复是否完成（完成前不落盘，避免用空状态覆盖旧数据） */
  private hydrated = false;

  /** 初始化恢复的共享 Promise（保证幂等） */
  private hydrationPromise: Promise<void> | null = null;

  /** ID 生成计数器 */
  private idCounter = 0;

  constructor(options?: { persistenceFileName?: string }) {
    this.persistence = createConfigManager<DeliveryQueuePersistencePayload>({
      moduleName: "background-tasks",
      fileName: options?.persistenceFileName ?? "delivery-queue.json",
      version: PERSISTENCE_VERSION,
      createDefault: () => ({
        version: PERSISTENCE_VERSION,
        messages: [],
        executionLinks: {},
        notifications: [],
      }),
      mergeConfig: (defaults, loaded) => ({
        version: PERSISTENCE_VERSION,
        messages: Array.isArray(loaded?.messages)
          ? (loaded.messages as QueuedTaskMessage[])
          : defaults.messages,
        executionLinks:
          loaded?.executionLinks && typeof loaded.executionLinks === "object"
            ? (loaded.executionLinks as Record<string, TaskExecutionLink>)
            : defaults.executionLinks,
        notifications: Array.isArray(loaded?.notifications)
          ? (loaded.notifications as TaskNotification[])
          : defaults.notifications,
      }),
    });
    void this.loadFromPersistence();
  }

  // ==================== 排队消息 ====================

  /**
   * 入队一条投递请求。
   *
   * 幂等：`idempotencyKey` 已存在时直接返回原记录，不重复创建。
   * 只记录投递意图与消息节点引用，不触发执行。
   */
  public enqueueMessage(
    input: EnqueueTaskMessageInput
  ): QueuedTaskMessage | null {
    return errorHandler.wrapSync(
      () => {
        const existing = this.findMessageByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          return existing;
        }
        this.idCounter += 1;
        const message: QueuedTaskMessage = {
          deliveryId: generateId("bgdel", this.idCounter),
          sourceTaskId: input.sourceTaskId,
          childSessionId: input.childSessionId,
          executionLaneKey: input.executionLaneKey,
          messageNodeId: input.messageNodeId,
          origin: cloneOrigin(input.origin),
          delivery: input.delivery,
          state: "queued",
          idempotencyKey: input.idempotencyKey,
          enqueuedAt: nowIso(),
        };
        this.messages.set(message.deliveryId, message);
        this.messageIdempotency.set(message.idempotencyKey, message.deliveryId);
        this.persistDebounced();
        logger.info("投递请求已入队", {
          deliveryId: message.deliveryId,
          sourceTaskId: message.sourceTaskId,
          delivery: message.delivery,
        });
        return cloneQueuedMessage(message);
      },
      {
        userMessage: "入队投递请求失败",
        context: { taskId: input.sourceTaskId },
      }
    );
  }

  /** 按投递记录 ID 读取 */
  public getMessage(deliveryId: string): QueuedTaskMessage | null {
    const message = this.messages.get(deliveryId);
    return message ? cloneQueuedMessage(message) : null;
  }

  /** 按幂等键读取（重复调用去重用） */
  public findMessageByIdempotencyKey(key: string): QueuedTaskMessage | null {
    const deliveryId = this.messageIdempotency.get(key);
    if (!deliveryId) {
      return null;
    }
    const message = this.messages.get(deliveryId);
    return message ? cloneQueuedMessage(message) : null;
  }

  /** 列出排队消息（按入队时间升序） */
  public listMessages(
    filter?: ListQueuedTaskMessagesFilter
  ): QueuedTaskMessage[] {
    return [...this.messages.values()]
      .filter((message) => {
        if (
          filter?.sourceTaskId &&
          message.sourceTaskId !== filter.sourceTaskId
        ) {
          return false;
        }
        if (
          filter?.childSessionId &&
          message.childSessionId !== filter.childSessionId
        ) {
          return false;
        }
        if (filter?.states && !filter.states.includes(message.state)) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.enqueuedAt.localeCompare(b.enqueuedAt) ||
          a.deliveryId.localeCompare(b.deliveryId)
      )
      .map(cloneQueuedMessage);
  }

  /** 标记消息进入“等待安全点”。仅 queued 可流转。 */
  public markMessageWaitingSafePoint(
    deliveryId: string
  ): QueuedTaskMessage | null {
    return this.transitionMessage(deliveryId, "waiting_safe_point");
  }

  /**
   * 标记消息已投递（被 follow-up task 消费）。
   * 记录承接执行的 `followUpTaskId`。
   */
  public markMessageDelivered(
    deliveryId: string,
    followUpTaskId?: string
  ): QueuedTaskMessage | null {
    return this.transitionMessage(deliveryId, "delivered", (message) => {
      message.deliveredAt = nowIso();
      if (followUpTaskId) {
        message.followUpTaskId = followUpTaskId;
      }
    });
  }

  /** 标记消息投递失败，记录可展示原因。 */
  public markMessageFailed(
    deliveryId: string,
    error: BackgroundTaskError
  ): QueuedTaskMessage | null {
    return this.transitionMessage(deliveryId, "failed", (message) => {
      message.error = { ...error };
    });
  }

  /** 取消排队中的投递请求。 */
  public cancelMessage(deliveryId: string): QueuedTaskMessage | null {
    return this.transitionMessage(deliveryId, "cancelled");
  }

  // ==================== 执行链 ====================

  /**
   * 合并写入某任务的执行链关联。
   *
   * 只覆盖传入的字段，保留已有关系；用于 follow-up、重试与接管串链。
   */
  public setExecutionLink(
    taskId: string,
    link: TaskExecutionLink
  ): TaskExecutionLink | null {
    return errorHandler.wrapSync(
      () => {
        const merged: TaskExecutionLink = {
          ...this.executionLinks.get(taskId),
          ...link,
        };
        this.executionLinks.set(taskId, merged);
        this.persistDebounced();
        return cloneExecutionLink(merged);
      },
      { userMessage: "写入任务执行链失败", context: { taskId } }
    );
  }

  /** 读取某任务的执行链关联 */
  public getExecutionLink(taskId: string): TaskExecutionLink | null {
    const link = this.executionLinks.get(taskId);
    return link ? cloneExecutionLink(link) : null;
  }

  // ==================== 可靠通知 ====================

  /**
   * 入队一条可靠通知。
   *
   * 幂等：`idempotencyKey` 已存在时直接返回原记录，避免同一事件重复投影。
   */
  public enqueueNotification(
    input: EnqueueTaskNotificationInput
  ): TaskNotification | null {
    return errorHandler.wrapSync(
      () => {
        const existing = this.findNotificationByIdempotencyKey(
          input.idempotencyKey
        );
        if (existing) {
          return existing;
        }
        this.idCounter += 1;
        const notification: TaskNotification = {
          notificationId: generateId("bgnotif", this.idCounter),
          taskId: input.taskId,
          parentSessionId: input.parentSessionId ?? null,
          kind: input.kind,
          summary: input.summary,
          idempotencyKey: input.idempotencyKey,
          createdAt: nowIso(),
        };
        this.notifications.set(notification.notificationId, notification);
        this.notificationIdempotency.set(
          notification.idempotencyKey,
          notification.notificationId
        );
        this.persistDebounced();
        logger.info("可靠通知已入队", {
          notificationId: notification.notificationId,
          taskId: notification.taskId,
          kind: notification.kind,
        });
        return cloneNotification(notification);
      },
      { userMessage: "入队可靠通知失败", context: { taskId: input.taskId } }
    );
  }

  /** 按通知 ID 读取 */
  public getNotification(notificationId: string): TaskNotification | null {
    const notification = this.notifications.get(notificationId);
    return notification ? cloneNotification(notification) : null;
  }

  /** 按幂等键读取（重复投影去重用） */
  public findNotificationByIdempotencyKey(
    key: string
  ): TaskNotification | null {
    const notificationId = this.notificationIdempotency.get(key);
    if (!notificationId) {
      return null;
    }
    const notification = this.notifications.get(notificationId);
    return notification ? cloneNotification(notification) : null;
  }

  /** 列出通知（按创建时间升序） */
  public listNotifications(
    filter?: ListTaskNotificationsFilter
  ): TaskNotification[] {
    return [...this.notifications.values()]
      .filter((notification) => {
        if (filter?.taskId && notification.taskId !== filter.taskId) {
          return false;
        }
        if (
          filter?.parentSessionId !== undefined &&
          (notification.parentSessionId ?? null) !== filter.parentSessionId
        ) {
          return false;
        }
        if (filter?.pendingOnly && notification.acknowledgedAt) {
          return false;
        }
        if (filter?.undeliveredOnly && notification.deliveredAt) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.notificationId.localeCompare(b.notificationId)
      )
      .map(cloneNotification);
  }

  /** 记录通知已投影到父会话 */
  public markNotificationDelivered(
    notificationId: string
  ): TaskNotification | null {
    return this.updateNotification(notificationId, (notification) => {
      notification.deliveredAt ??= nowIso();
    });
  }

  /** 记录通知已被用户确认 */
  public acknowledgeNotification(
    notificationId: string
  ): TaskNotification | null {
    return this.updateNotification(notificationId, (notification) => {
      notification.acknowledgedAt ??= nowIso();
      notification.deliveredAt ??= notification.acknowledgedAt;
    });
  }

  // ==================== 持久化 ====================

  /** 加载持久化数据并重建幂等索引；方法幂等。 */
  public loadFromPersistence(): Promise<void> {
    this.hydrationPromise ??= this.doHydrate();
    return this.hydrationPromise;
  }

  /** 实际执行恢复流程 */
  private async doHydrate(): Promise<void> {
    try {
      const payload = await this.persistence.load();
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const notifications = Array.isArray(payload?.notifications)
        ? payload.notifications
        : [];
      const executionLinks =
        payload?.executionLinks && typeof payload.executionLinks === "object"
          ? payload.executionLinks
          : {};

      for (const raw of messages) {
        const message = normalizeLoadedMessage(raw);
        if (!message) {
          continue;
        }
        // 内存优先：恢复窗口内可能已入队同 ID 或同幂等键的新记录。
        // 此时保留内存记录并跳过持久化旧记录，避免记录与幂等索引指向
        // 不同对象（例如索引被旧记录覆盖，导致同键请求返回旧记录）。
        if (this.messages.has(message.deliveryId)) {
          continue;
        }
        if (this.messageIdempotency.has(message.idempotencyKey)) {
          continue;
        }
        this.messages.set(message.deliveryId, message);
        this.messageIdempotency.set(message.idempotencyKey, message.deliveryId);
      }
      for (const raw of notifications) {
        const notification = normalizeLoadedNotification(raw);
        if (!notification) {
          continue;
        }
        // 与排队消息一致：内存记录优先，幂等索引不指向被丢弃的旧记录
        if (this.notifications.has(notification.notificationId)) {
          continue;
        }
        if (this.notificationIdempotency.has(notification.idempotencyKey)) {
          continue;
        }
        this.notifications.set(notification.notificationId, notification);
        this.notificationIdempotency.set(
          notification.idempotencyKey,
          notification.notificationId
        );
      }
      for (const [taskId, link] of Object.entries(executionLinks)) {
        if (!taskId || !link || typeof link !== "object") {
          continue;
        }
        if (!this.executionLinks.has(taskId)) {
          this.executionLinks.set(taskId, cloneExecutionLink(link));
        }
      }

      this.hydrated = true;
      if (messages.length > 0 || notifications.length > 0) {
        logger.info("后台任务投递队列恢复完成", {
          messages: this.messages.size,
          notifications: this.notifications.size,
        });
      }
    } catch (error) {
      // 失败也要标记完成，避免永久阻塞后续落盘
      this.hydrated = true;
      errorHandler.handle(error as Error, {
        userMessage: "恢复后台任务投递队列失败",
        showToUser: false,
      });
    }
  }

  /** 触发防抖持久化；恢复完成前不落盘 */
  private persistDebounced(): void {
    if (!this.hydrated) {
      return;
    }
    this.persistence.saveDebounced(this.buildPersistencePayload());
  }

  /** 构建持久化 payload，按上限淘汰旧记录 */
  private buildPersistencePayload(): DeliveryQueuePersistencePayload {
    const messages = this.evictMessages();
    const notifications = this.evictNotifications();
    return {
      version: PERSISTENCE_VERSION,
      messages,
      executionLinks: Object.fromEntries(
        [...this.executionLinks.entries()].map(([taskId, link]) => [
          taskId,
          cloneExecutionLink(link),
        ])
      ),
      notifications,
    };
  }

  /** 超出上限时优先淘汰已终结且最旧的排队消息 */
  private evictMessages(): QueuedTaskMessage[] {
    const all = [...this.messages.values()];
    if (all.length <= MAX_PERSISTED_MESSAGES) {
      return all.map(cloneQueuedMessage);
    }
    const terminalFirst = [...all].sort((a, b) => {
      const aTerminal = TERMINAL_MESSAGE_STATES.has(a.state) ? 0 : 1;
      const bTerminal = TERMINAL_MESSAGE_STATES.has(b.state) ? 0 : 1;
      return (
        aTerminal - bTerminal ||
        a.enqueuedAt.localeCompare(b.enqueuedAt) ||
        a.deliveryId.localeCompare(b.deliveryId)
      );
    });
    const evictIds = new Set(
      terminalFirst
        .slice(0, all.length - MAX_PERSISTED_MESSAGES)
        .map((message) => message.deliveryId)
    );
    return all
      .filter((message) => !evictIds.has(message.deliveryId))
      .map(cloneQueuedMessage);
  }

  /** 超出上限时优先淘汰已确认且最旧的通知 */
  private evictNotifications(): TaskNotification[] {
    const all = [...this.notifications.values()];
    if (all.length <= MAX_PERSISTED_NOTIFICATIONS) {
      return all.map(cloneNotification);
    }
    const settledFirst = [...all].sort((a, b) => {
      const aSettled = a.acknowledgedAt ? 0 : 1;
      const bSettled = b.acknowledgedAt ? 0 : 1;
      return (
        aSettled - bSettled ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.notificationId.localeCompare(b.notificationId)
      );
    });
    const evictIds = new Set(
      settledFirst
        .slice(0, all.length - MAX_PERSISTED_NOTIFICATIONS)
        .map((notification) => notification.notificationId)
    );
    return all
      .filter((notification) => !evictIds.has(notification.notificationId))
      .map(cloneNotification);
  }

  // ==================== 内部辅助 ====================

  /** 排队消息状态流转（含终态保护）；mutate 用于附带时间戳/错误 */
  private transitionMessage(
    deliveryId: string,
    nextState: QueuedTaskMessageState,
    mutate?: (message: QueuedTaskMessage) => void
  ): QueuedTaskMessage | null {
    const message = this.messages.get(deliveryId);
    if (!message) {
      return null;
    }
    if (TERMINAL_MESSAGE_STATES.has(message.state)) {
      return null;
    }
    if (nextState === "waiting_safe_point" && message.state !== "queued") {
      return null;
    }
    message.state = nextState;
    mutate?.(message);
    this.persistDebounced();
    return cloneQueuedMessage(message);
  }

  /** 通知字段更新；不存在返回 null */
  private updateNotification(
    notificationId: string,
    mutate: (notification: TaskNotification) => void
  ): TaskNotification | null {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      return null;
    }
    mutate(notification);
    this.persistDebounced();
    return cloneNotification(notification);
  }
}

// ==================== 加载规整 ====================

function normalizeLoadedMessage(raw: unknown): QueuedTaskMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<QueuedTaskMessage>;
  if (
    typeof candidate.deliveryId !== "string" ||
    typeof candidate.sourceTaskId !== "string" ||
    typeof candidate.childSessionId !== "string" ||
    typeof candidate.messageNodeId !== "string" ||
    typeof candidate.idempotencyKey !== "string" ||
    (candidate.delivery !== "next_turn" &&
      candidate.delivery !== "after_current_step")
  ) {
    return null;
  }
  return {
    deliveryId: candidate.deliveryId,
    sourceTaskId: candidate.sourceTaskId,
    childSessionId: candidate.childSessionId,
    executionLaneKey:
      candidate.executionLaneKey ?? `sub-agent:${candidate.childSessionId}`,
    messageNodeId: candidate.messageNodeId,
    origin: candidate.origin ?? { kind: "user", channel: "user_intervention" },
    delivery: candidate.delivery,
    state: candidate.state ?? "queued",
    idempotencyKey: candidate.idempotencyKey,
    enqueuedAt: candidate.enqueuedAt ?? nowIso(),
    deliveredAt: candidate.deliveredAt,
    followUpTaskId: candidate.followUpTaskId,
    error: candidate.error,
  };
}

function normalizeLoadedNotification(raw: unknown): TaskNotification | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Partial<TaskNotification>;
  if (
    typeof candidate.notificationId !== "string" ||
    typeof candidate.taskId !== "string" ||
    typeof candidate.idempotencyKey !== "string"
  ) {
    return null;
  }
  return {
    notificationId: candidate.notificationId,
    taskId: candidate.taskId,
    parentSessionId: candidate.parentSessionId ?? null,
    kind: candidate.kind ?? "task_terminal",
    summary: candidate.summary ?? "",
    idempotencyKey: candidate.idempotencyKey,
    createdAt: candidate.createdAt ?? nowIso(),
    deliveredAt: candidate.deliveredAt,
    acknowledgedAt: candidate.acknowledgedAt,
  };
}

/** 全局单例：投递队列、执行链与通知的持久化入口。 */
export const backgroundTaskDeliveryQueue = new BackgroundTaskDeliveryQueue();
