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
 * 后台任务 UI 展示映射
 *
 * 对应设计文档：src/tools/sub-agent/docs/Plan/background-agent-observability-and-intervention.md
 * 的 §6（用户前端交互设计）与 §6.5（视觉规范）。
 *
 * 这里只承载“状态 → 中文文案/色调”的纯映射与若干格式化辅助，供
 * BackgroundTaskList / BackgroundTaskDetail 复用，不依赖任何响应式上下文。
 */

import type {
  BackgroundTaskSnapshot,
  BackgroundTaskStaleReason,
  BackgroundTaskState,
  MessageOrigin,
} from "@/services/background-tasks";

/** 状态徽标色调（映射到主题变量） */
export type BackgroundTaskTone =
  "running" | "success" | "danger" | "warning" | "info";

/** 状态展示描述 */
export interface BackgroundTaskStatePresentation {
  /** 中文标签 */
  label: string;
  /** 色调 */
  tone: BackgroundTaskTone;
}

/** 任务状态 → 中文标签与色调 */
const STATE_PRESENTATION: Record<
  BackgroundTaskState,
  BackgroundTaskStatePresentation
> = {
  created: { label: "已创建", tone: "info" },
  queued: { label: "排队中", tone: "info" },
  running: { label: "运行中", tone: "running" },
  waiting_input: { label: "等待输入", tone: "warning" },
  awaiting_approval: { label: "等待审批", tone: "warning" },
  paused: { label: "已暂停", tone: "info" },
  completed: { label: "已完成", tone: "success" },
  failed: { label: "失败", tone: "danger" },
  cancelled: { label: "已取消", tone: "info" },
  interrupted: { label: "已中断", tone: "danger" },
};

/** 获取任务状态的中文展示；未知状态回退为原始字符串 */
export function getTaskStatePresentation(
  state: BackgroundTaskState
): BackgroundTaskStatePresentation {
  return STATE_PRESENTATION[state] ?? { label: state, tone: "info" };
}

/** 停滞原因 → 中文说明 */
const STALE_REASON_LABEL: Record<BackgroundTaskStaleReason, string> = {
  no_progress: "长时间无进展",
  runtime_heartbeat_lost: "运行时心跳丢失",
};

/** 获取停滞提示文案 */
export function getStaleReasonLabel(
  reason?: BackgroundTaskStaleReason
): string {
  if (!reason) {
    return "可能停滞";
  }
  return STALE_REASON_LABEL[reason] ?? "可能停滞";
}

/** 是否为仍在推进的任务状态（非终态） */
const ACTIVE_STATES: ReadonlySet<BackgroundTaskState> = new Set([
  "created",
  "queued",
  "running",
  "waiting_input",
  "awaiting_approval",
  "paused",
]);

/** 判断任务是否处于活动状态（非终态） */
export function isActiveTaskState(state: BackgroundTaskState): boolean {
  return ACTIVE_STATES.has(state);
}

/** 解析任务主体的展示名称 */
export function getOriginDisplayName(origin: MessageOrigin): string {
  return (
    origin.actorDisplayName ||
    origin.actorName ||
    origin.actorId ||
    "未知智能体"
  );
}

/** 活动流水里的主体名称（系统事件使用中性文案） */
export function getActivityActorName(origin: MessageOrigin): string {
  switch (origin.kind) {
    case "user":
      return getOriginDisplayName(origin) || "用户";
    case "system":
      return "系统";
    case "tool":
      return origin.actorName || "工具";
    default:
      return getOriginDisplayName(origin);
  }
}

/** 列表卡片用的“最后操作摘要”，无摘要时给出中性占位 */
export function getTaskSummary(snapshot: BackgroundTaskSnapshot): string {
  const summary = snapshot.lastOperationSummary?.trim();
  if (summary) {
    return summary;
  }
  return getTaskStatePresentation(snapshot.state).label;
}
