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
 * 后台任务审批桥接（P4）
 *
 * toolCallingStore 的审批入口在按会话解析到活动后台任务后回调本桥接，把
 * 仲裁中 / 人工等待 / 审批结算三个节点投影到任务快照，并复用可靠通知队列
 * 投递 `approval_required`：
 *
 * - 子 Agent 复用聊天编排器进入 `requestApproval`，本桥接按 `childSessionId`
 *   解析出 `taskId`：优先取该 lane 上正在执行的任务，避免把审批挂到同会话的
 *   排队任务（同一子会话可同时存在多个非终态任务）；
 * - 升级人工时任务进入 `awaiting_approval` 并设置 `attention`，同时在任务
 *   快照写入审批记录，历史回溯不依赖 store 的内存审计 Map；
 * - 一批审批全部结算后才恢复执行态，避免多审批并发时提前收敛。
 *
 * 本模块只依赖 registry 与 deliveryQueue，不依赖 Pinia / UI。
 */

import { BackgroundTaskRegistry, backgroundTaskRegistry } from "./registry";
import {
  BackgroundTaskDeliveryQueue,
  backgroundTaskDeliveryQueue,
} from "./deliveryQueue";
import type {
  BackgroundTaskApprovalBridge,
  BackgroundTaskApprovalInfo,
  BackgroundTaskApprovalSettlement,
  BackgroundTaskApprovalOrigin,
  BackgroundTaskOperation,
} from "./types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("background-tasks/approval-bridge");

const TERMINAL_STATES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

/** 放行来源的中文标签（活动摘要用）。 */
const ORIGIN_LABELS: Record<BackgroundTaskApprovalOrigin, string> = {
  rule: "规则自动放行",
  jev: "JEV 仲裁",
  manual: "人工确认",
  timeout: "审批超时",
  cancelled: "已取消",
};

/** 通知幂等键：同一任务同一请求只投递一次。 */
function notificationKey(taskId: string, requestId: string): string {
  return `bg-approval-required:${taskId}:${requestId}`;
}

/**
 * 后台任务审批桥接单例。
 *
 * 内部维护 `taskId → 未决 requestId 集合`，用于一批审批全部结算后再恢复任务
 * 执行态、确认通知。
 */
export class BackgroundTaskApprovalBridgeImpl implements BackgroundTaskApprovalBridge {
  /** taskId → 未决审批 requestId 集合 */
  private pendingByTask = new Map<string, Set<string>>();

  constructor(
    private readonly registry: BackgroundTaskRegistry = backgroundTaskRegistry,
    private readonly queue: BackgroundTaskDeliveryQueue = backgroundTaskDeliveryQueue
  ) {}

  public resolveActiveTask(
    sessionId: string
  ): { taskId: string; parentSessionId: string | null } | null {
    if (!sessionId) return null;
    const candidates = this.registry
      .listTasks()
      .filter(
        (snapshot) =>
          snapshot.childSessionId === sessionId &&
          !TERMINAL_STATES.has(snapshot.state)
      );
    if (candidates.length === 0) return null;

    // 优先命中该 lane 上真正在执行的任务：同一子会话可能同时存在运行中的
    // 任务与排队任务，按 updatedAt 倒序取第一个会把审批挂到排队任务上。
    const executing = candidates.find((snapshot) =>
      this.registry.isExecutingTask(snapshot.taskId)
    );
    if (executing) {
      return {
        taskId: executing.taskId,
        parentSessionId: executing.parentSessionId,
      };
    }

    // 兜底：仅有一个非终态候选且它并非排队 / 未启动态时可采用；
    // 多个候选无法确定执行归属，放弃关联而不是误挂。
    const only = candidates[0];
    if (
      candidates.length === 1 &&
      only.state !== "queued" &&
      only.state !== "created"
    ) {
      return {
        taskId: only.taskId,
        parentSessionId: only.parentSessionId,
      };
    }
    return null;
  }

  public onApprovalArbitrating(info: BackgroundTaskApprovalInfo): void {
    if (!this.isActiveTask(info.taskId)) return;
    this.setCurrentOperation(info, "等待 AI 审核工具");
  }

  public onApprovalPending(info: BackgroundTaskApprovalInfo): void {
    const snapshot = this.registry.getSnapshot(info.taskId);
    if (!snapshot || TERMINAL_STATES.has(snapshot.state)) return;

    this.trackPending(info.taskId, info.requestId);

    if (snapshot.state !== "awaiting_approval") {
      this.registry.updateTaskState(info.taskId, "awaiting_approval", {
        attention: "awaiting_approval",
        phase: "awaiting_approval",
      });
    }
    this.setCurrentOperation(info, "等待用户批准工具");
    this.registry.appendActivity(info.taskId, {
      kind: "approval_requested",
      actor: { kind: "system", channel: "system_event" },
      summary: `等待用户批准工具 ${info.displayName}`,
      detailRef: info.requestId,
    });
    this.queue.enqueueNotification({
      taskId: info.taskId,
      parentSessionId: snapshot.parentSessionId,
      kind: "approval_required",
      summary: `后台任务需要审批：${info.displayName}`,
      idempotencyKey: notificationKey(info.taskId, info.requestId),
    });
    logger.info("后台任务进入人工审批等待", {
      taskId: info.taskId,
      requestId: info.requestId,
      toolName: info.toolName,
    });
  }

  public onApprovalSettled(
    info: BackgroundTaskApprovalInfo,
    settlement: BackgroundTaskApprovalSettlement
  ): void {
    const snapshot = this.registry.getSnapshot(info.taskId);
    if (!snapshot) return;

    this.clearPending(info.taskId, info.requestId);
    this.registry.recordTaskApproval(info.taskId, {
      requestId: info.requestId,
      toolId: info.toolId,
      methodName: info.methodName,
      toolName: info.toolName,
      decision: settlement.decision,
      origin: settlement.origin,
      jevAction: settlement.jevAction ?? null,
      risk: settlement.risk ?? null,
      confidence: settlement.confidence ?? null,
      reason: settlement.reason ?? null,
      at: new Date().toISOString(),
    });

    const originLabel = ORIGIN_LABELS[settlement.origin] ?? settlement.origin;
    this.registry.appendActivity(info.taskId, {
      kind: "approval_resolved",
      actor: { kind: "system", channel: "system_event" },
      summary: `${settlement.decision === "approved" ? "已批准" : "已拒绝"}工具 ${
        info.displayName
      }（${originLabel}）`,
      detailRef: info.requestId,
    });

    const remaining = this.pendingByTask.get(info.taskId)?.size ?? 0;
    const latest = this.registry.getSnapshot(info.taskId);
    if (latest && !TERMINAL_STATES.has(latest.state)) {
      const ownsCurrentOperation =
        latest.currentOperation?.requestId === info.requestId;
      if (remaining === 0 && latest.state === "awaiting_approval") {
        // 一批审批全部结算：恢复执行态（终态任务不做状态回写）
        this.registry.updateTaskState(info.taskId, "running", {
          attention: null,
          phase: "llm_generation",
        });
        this.registry.setCurrentOperation(info.taskId, null);
      } else if (ownsCurrentOperation) {
        // 自动裁决（approve / deny）后任务仍为 running：清除该请求的
        // 「等待 AI 审核」当前操作，避免裁决结束后残留等待态；
        // 只清除归属于本请求的操作，不影响其他仍未决请求。
        this.registry.setCurrentOperation(info.taskId, null);
      }
    }
    // 每条请求的通知在自身结算时确认：多项审批依次结算时不能只确认最后一条，
    // 否则先结算请求的通知会永久停留在 pending。
    this.acknowledgeNotification(info.taskId, info.requestId);
    logger.info("后台任务审批已结算", {
      taskId: info.taskId,
      requestId: info.requestId,
      decision: settlement.decision,
      origin: settlement.origin,
      remaining,
    });
  }

  // ==================== 内部辅助 ====================

  private isActiveTask(taskId: string): boolean {
    const snapshot = this.registry.getSnapshot(taskId);
    return !!snapshot && !TERMINAL_STATES.has(snapshot.state);
  }

  private setCurrentOperation(
    info: BackgroundTaskApprovalInfo,
    summaryPrefix: string
  ): void {
    const operation: BackgroundTaskOperation = {
      kind: "approval",
      name: info.displayName,
      requestId: info.requestId,
      startedAt: new Date().toISOString(),
      summary: `${summaryPrefix} ${info.displayName}`,
    };
    this.registry.setCurrentOperation(info.taskId, operation);
  }

  private trackPending(taskId: string, requestId: string): void {
    const set = this.pendingByTask.get(taskId) ?? new Set<string>();
    set.add(requestId);
    this.pendingByTask.set(taskId, set);
  }

  private clearPending(taskId: string, requestId: string): void {
    const set = this.pendingByTask.get(taskId);
    if (!set) return;
    set.delete(requestId);
    if (set.size === 0) {
      this.pendingByTask.delete(taskId);
    }
  }

  private acknowledgeNotification(taskId: string, requestId: string): void {
    const notification = this.queue.findNotificationByIdempotencyKey(
      notificationKey(taskId, requestId)
    );
    if (notification) {
      this.queue.acknowledgeNotification(notification.notificationId);
    }
  }
}

/** 全局单例：由 llm-chat 装配注入 toolCallingStore。 */
export const backgroundTaskApprovalBridge =
  new BackgroundTaskApprovalBridgeImpl();
