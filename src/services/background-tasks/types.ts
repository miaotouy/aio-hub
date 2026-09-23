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
 * 后台任务核心类型定义
 *
 * 对应设计文档：src/tools/sub-agent/docs/Plan/background-agent-observability-and-intervention.md
 * 的 §3（核心概念与关系）、§4（后台任务数据模型）与 §7.1（消息来源）。
 *
 * 本模块只承载类型与纯数据契约，不包含任何运行时逻辑。
 */

/**
 * 消息/活动主体类型。
 *
 * - `user`：真实用户本人产生的内容或操作；
 * - `agent`：某个智能体（调度方、子智能体）产生的内容或操作；
 * - `tool`：工具调用产生的内容；
 * - `system`：系统事件（任务完成通知、运行时中断等合成消息）。
 */
export type MessageOriginKind = "user" | "agent" | "tool" | "system";

/**
 * 消息来源通道。
 *
 * - `main_chat`：主会话内直接对话；
 * - `sub_agent`：调度 Agent 与子 Agent 之间的委托/回复链路；
 * - `background_task`：后台任务内部的工具与执行事件；
 * - `user_intervention`：用户对后台任务/子会话的追加指导等介入行为；
 * - `system_event`：系统合成事件（任务完成/失败/中断通知等）。
 */
export type MessageOriginChannel =
  | "main_chat"
  | "sub_agent"
  | "background_task"
  | "user_intervention"
  | "system_event";

/**
 * 消息来源与归属元数据。
 *
 * 设计文档 §7.1：来源信息保存在 ChatMessageNode.metadata 中，
 * 用于表达“哪一个主体通过哪条通道发送了这条消息”；
 * 旧会话没有 origin 时按既有 role 与 agentId 推导展示。
 */
export interface MessageOrigin {
  /** 主体类型：用户 / 智能体 / 工具 / 系统 */
  kind: MessageOriginKind;
  /** 来源通道 */
  channel: MessageOriginChannel;
  /** 主体 ID（Agent ID、用户档案 ID 等） */
  actorId?: string;
  /** 主体原始名称（如 Agent 的 name 字段） */
  actorName?: string;
  /** 主体展示名称（UI 直接渲染用） */
  actorDisplayName?: string;
  /** 关联的后台任务 ID（当内容属于某个后台任务时） */
  taskId?: string;
  /** 关联的父任务 ID（多层委托场景） */
  parentTaskId?: string;
  /** 关联的来源消息 ID（引用/合成场景） */
  sourceMessageId?: string;
}

/**
 * 后台任务控制归属。
 *
 * `owner` 描述谁可以继续观察或控制任务；它与 `callerAgent` 保持同值只是
 * 当前单层委托的默认关系，单独建模后多层编排和用户接管可以使用不同归属。
 */
export type BackgroundTaskOwner = MessageOrigin;

/**
 * 后台任务状态。
 *
 * 状态流转（设计文档 §3.2）：
 * created → queued → running → (waiting_input / awaiting_approval / paused)
 *   → completed / failed / cancelled / interrupted
 *
 * Phase 1 没有排队器，任务创建后直接进入 running。
 */
export type BackgroundTaskState =
  | "created"
  | "queued"
  | "running"
  | "waiting_input"
  | "awaiting_approval"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

/**
 * 后台任务终态集合。
 *
 * 进入终态后任务不再接受状态流转（cancelTask 返回 false，
 * updateTaskState 拒绝从终态再流转）。
 */
export type BackgroundTerminalTaskState =
  "completed" | "failed" | "cancelled" | "interrupted";

/**
 * 后台任务活动类型。
 *
 * - `task_created`：任务创建；
 * - `llm_started` / `llm_progress`：模型生成开始与进度；
 * - `tool_started` / `tool_progress` / `tool_finished`：工具调用生命周期；
 * - `approval_requested`：触发敏感审批等待；
 * - `user_intervention`：用户追加指导/介入；
 * - `state_changed`：任务状态流转；
 * - `error`：发生错误。
 */
export type BackgroundActivityKind =
  | "task_created"
  | "llm_started"
  | "llm_progress"
  | "tool_started"
  | "tool_progress"
  | "tool_finished"
  | "approval_requested"
  | "user_intervention"
  | "state_changed"
  | "error";

/**
 * 当前操作描述。
 *
 * 由运行时（Phase 1 为 assistant.ask 埋点）写入，用于“最后部分操作摘要”展示：
 * - `llm_generation`：正在等待 <agentName> 生成回复；
 * - `tool_call`：正在执行工具 <toolName>；
 * - `approval`：等待用户批准 <toolName>；
 * - `waiting`：等待用户补充信息等。
 */
export interface BackgroundTaskOperation {
  /** 操作类型 */
  kind: "llm_generation" | "tool_call" | "approval" | "waiting";
  /** 操作对象名称（工具名、模型名等） */
  name?: string;
  /** 请求 ID（审批路由、生成请求追踪用） */
  requestId?: string;
  /** 操作开始时间（ISO 8601 字符串） */
  startedAt: string;
  /** 面向 Agent 与列表卡片的操作摘要（写入时会做长度截断） */
  summary: string;
}

/**
 * 后台任务活动记录。
 *
 * 快照的 recentActivity 只保留最近 8 条；完整操作记录通过
 * childSessionId 对应的会话消息按需读取（设计文档 §4）。
 */
export interface BackgroundTaskActivity {
  /** 活动 ID（registry 生成，任务内唯一） */
  id: string;
  /** 所属任务 ID */
  taskId: string;
  /** 活动类型 */
  kind: BackgroundActivityKind;
  /** 活动主体（谁触发了这条活动） */
  actor: MessageOrigin;
  /** 活动时间（ISO 8601 字符串） */
  timestamp: string;
  /** 面向展示的摘要文本（由调用方提供，需控制长度并脱敏） */
  summary: string;
  /** 关联的当前操作（活动对应具体操作时附带） */
  operation?: BackgroundTaskOperation;
  /** 供 UI 展开查看的受限信息引用；Agent 摘要按需省略 */
  detailRef?: string;
}

/**
 * 任务结果（completed 终态附带）。
 */
export interface BackgroundTaskResult {
  /** 最终结果摘要 */
  summary: string;
  /** 完成时间（ISO 8601 字符串） */
  completedAt: string;
}

/**
 * 任务错误信息（failed / cancelled 终态可附带）。
 */
export interface BackgroundTaskError {
  /** 错误码（可选） */
  code?: string;
  /** 可展示的错误消息 */
  message: string;
  /** 失败时间（ISO 8601 字符串） */
  failedAt: string;
}

/**
 * 停滞原因。
 *
 * - `no_progress`：长时间没有推进（按 lastProgressAt 与当前操作类型推导）；
 * - `runtime_heartbeat_lost`：后台运行时心跳丢失。
 */
export type BackgroundTaskStaleReason =
  "no_progress" | "runtime_heartbeat_lost";

/**
 * 需要关注标记。
 *
 * - `awaiting_input`：任务等待用户补充信息；
 * - `awaiting_approval`：任务等待用户审批。
 */
export type BackgroundTaskAttention = "awaiting_input" | "awaiting_approval";

/**
 * 后台任务快照。
 *
 * “事件流 + 当前快照”组合中的当前快照部分：调用方先读 snapshot 与 seq，
 * 再从该 seq 订阅增量事件；发现序号不连续时重新拉取 snapshot
 * （设计文档 §5.2）。主窗口刷新、窗口重建或 runtime generation 变化后
 * 通过同一份持久化快照恢复观察。
 */
export interface BackgroundTaskSnapshot {
  /** 任务控制与观察 ID（前缀 bgtask-，生命周期内不变） */
  taskId: string;
  /** 任务事件序号；snapshot 与增量订阅通过它衔接，任何变更递增 */
  seq: number;
  /** 父任务 ID（子任务由另一个后台任务调度时建立） */
  parentTaskId?: string;
  /** 当前任务的控制归属主体 */
  owner: BackgroundTaskOwner;
  /** 同一 child session 的生成、追加消息与取消共享的执行 lane */
  executionLaneKey: string;
  /** 调度方（发起调用）的会话 ID */
  parentSessionId: string | null;
  /** 被调用 Agent 的完整聊天会话 ID（允许被同一续聊句柄多次复用） */
  childSessionId: string;
  /** assistant 工具的用户/Agent 侧续聊句柄（与 taskId 非永久一对一） */
  conversationId: string;
  /** 调度方 Agent 的来源描述 */
  callerAgent: MessageOrigin;
  /** 被调用 Agent 的来源描述 */
  targetAgent: MessageOrigin;
  /** 当前任务状态 */
  state: BackgroundTaskState;
  /** 任务所处阶段（自由文本，由调用方定义） */
  phase: string;
  /** 创建时间（ISO 8601 字符串） */
  createdAt: string;
  /** 开始执行时间（ISO 8601 字符串） */
  startedAt?: string;
  /** 最近更新时间（ISO 8601 字符串，任何变更刷新） */
  updatedAt: string;
  /** 最近活动时间（ISO 8601 字符串，追加活动时刷新） */
  lastActivityAt?: string;
  /** 最近进展时间（ISO 8601 字符串，llm/tool 类活动刷新） */
  lastProgressAt?: string;
  /** 当前正在执行的操作（终态时清空） */
  currentOperation?: BackgroundTaskOperation;
  /** 最后部分操作摘要（由 currentOperation.summary 派生，超长截断） */
  lastOperationSummary: string;
  /** 是否可能停滞（观察状态，由 lastProgressAt/心跳推导） */
  stale: boolean;
  /** 停滞原因 */
  staleReason?: BackgroundTaskStaleReason;
  /** 需要关注标记（等待输入/审批） */
  attention?: BackgroundTaskAttention;
  /** 最近活动记录（只保留最近 8 条） */
  recentActivity: BackgroundTaskActivity[];
  /** 创建该任务的后台运行时代次 */
  runtimeGeneration: number;
  /** 任务结果（completed 终态附带） */
  result?: BackgroundTaskResult;
  /** 任务错误（failed / cancelled 终态可附带） */
  error?: BackgroundTaskError;
}

/**
 * 任务变更事件类型。
 *
 * - `updated`：任务元数据更新（创建、当前操作变化等）；
 * - `activity`：追加了新的活动记录；
 * - `state_changed`：任务状态发生流转。
 */
export type BackgroundTaskChangeType = "updated" | "activity" | "state_changed";

/**
 * 任务变更事件（subscribe 监听器接收）。
 */
export interface BackgroundTaskChangeEvent {
  /** 发生变更的任务 ID */
  taskId: string;
  /** 变更后的任务事件序号 */
  seq: number;
  /** 变更类型 */
  type: BackgroundTaskChangeType;
}

/**
 * 任务变更监听器。
 */
export type BackgroundTaskChangeListener = (
  event: BackgroundTaskChangeEvent
) => void;

/**
 * createTask 输入参数。
 */
export interface CreateBackgroundTaskInput {
  /** 调度方（发起调用）的会话 ID */
  parentSessionId: string | null;
  /** 被调用 Agent 的完整聊天会话 ID */
  childSessionId: string;
  /** assistant 工具的续聊句柄 */
  conversationId: string;
  /** 调度方 Agent 的来源描述 */
  callerAgent: MessageOrigin;
  /** 被调用 Agent 的来源描述 */
  targetAgent: MessageOrigin;
  /** 父任务 ID（多层委托场景，Phase 1 通常为空） */
  parentTaskId?: string;
  /** 当前任务的控制归属主体 */
  owner: BackgroundTaskOwner;
  /** 同一 child session 的生成、追加消息与取消共享的执行 lane */
  executionLaneKey: string;
  /** lane 已被占用时先进入 queued；未提供时保持历史 running 行为 */
  initialState?: "queued" | "running";
  /** 任务所处阶段（可选，默认 "started"） */
  phase?: string;
}

/**
 * appendActivity 输入参数。
 */
export interface AppendActivityInput {
  /** 活动类型 */
  kind: BackgroundActivityKind;
  /** 活动主体 */
  actor: MessageOrigin;
  /** 面向展示的摘要文本 */
  summary: string;
  /** 关联的当前操作 */
  operation?: BackgroundTaskOperation;
  /** 供 UI 展开查看的受限信息引用 */
  detailRef?: string;
}

/**
 * updateTaskState 的可选补丁。
 */
export interface UpdateTaskStatePatch {
  /** completed 终态的结果 */
  result?: BackgroundTaskResult;
  /** failed/cancelled 终态的错误信息 */
  error?: BackgroundTaskError;
  /** 停滞标记 */
  stale?: boolean;
  /** 停滞原因 */
  staleReason?: BackgroundTaskStaleReason;
  /** 需要关注标记 */
  attention?: BackgroundTaskAttention;
  /** 任务所处阶段 */
  phase?: string;
}

/**
 * listTasks 的过滤条件。
 */
export interface ListTasksFilter {
  /** 仅保留处于这些状态的任务 */
  states?: BackgroundTaskState[];
  /** 仅保留指定父任务下的子任务 */
  parentTaskId?: string;
}
