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
 * 工具执行结果中携带的自包含任务关系快照（T3.4）。
 *
 * 派遣卡片过去只从 `resultMetadata.backgroundTask` 读到 `taskId` 与
 * `childSessionId`，再从 registry 读取实时快照；当历史消息、任务已被
 * 持久化上限淘汰、或 registry 尚未加载时，卡片会整体消失。本快照在
 * ask 返回时把状态与双方身份一并写入工具节点，使卡片在缺少实时快照时
 * 仍能降级展示任务关系。
 *
 * 它是“返回时刻”的快照，不是实时事实来源：registry 快照可用时，UI
 * 必须以实时值为准覆盖这里的状态与摘要。
 */
export interface BackgroundTaskLinkSnapshot {
  /** 任务控制与观察 ID */
  taskId: string;
  /** 被调用 Agent 的完整聊天会话 ID */
  childSessionId: string;
  /** assistant 工具侧的续聊句柄 */
  conversationId?: string;
  /** 调度方会话 ID（无主会话的后台调用为 null） */
  parentSessionId: string | null;
  /** 返回时刻的任务状态 */
  state: BackgroundTaskState;
  /** 返回时刻的任务阶段 */
  phase?: string;
  /** 调度方身份快照 */
  callerAgent: MessageOrigin;
  /** 被调用 Agent 身份快照 */
  targetAgent: MessageOrigin;
  /** 返回时刻的最后操作摘要 */
  lastOperationSummary?: string;
  /** 快照写入时间（ISO 8601 字符串） */
  updatedAt: string;
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

// ==================== Phase 4：可续投递、执行链与可靠通知 ====================
//
// 以下类型对应设计文档 §4.2。它们是 runtime-neutral 的数据契约：由持久化
// 队列保存，供未来 task runner / transport adapter 消费。当前阶段只落地
// 数据模型与持久化边界，不包含执行器消费逻辑。

/**
 * 任务消息投递方式。
 *
 * - `append_only`：仅把消息写入子会话，不请求执行（当前 `send_task_message` 语义）；
 * - `next_turn`：当前 execution lane 空闲后创建 follow-up task，读取该消息进入下一轮；
 * - `after_current_step`：由 runner 在工具调用、审批返回或模型轮次的安全点消费。
 */
export type TaskMessageDelivery =
  "append_only" | "next_turn" | "after_current_step";

/** 需要真正驱动执行的投递方式（不含 append_only）。 */
export type ExecutableTaskMessageDelivery = Exclude<
  TaskMessageDelivery,
  "append_only"
>;

/**
 * 排队消息的投递状态。
 *
 * - `queued`：队列记录已持久化，等待 runner 消费；
 * - `waiting_safe_point`：已到达消费时机但仍在等待安全点；
 * - `delivered`：消息已被消费，`followUpTaskId` 指向承接执行的尝试；
 * - `failed`：消费失败，`error` 说明可展示原因；
 * - `cancelled`：投递请求被取消。
 */
export type QueuedTaskMessageState =
  "queued" | "waiting_safe_point" | "delivered" | "failed" | "cancelled";

/**
 * 排队消息记录。
 *
 * 消息本体先写入 `childSessionId` 的消息树，本记录只引用 `messageNodeId`，
 * 从而让消息身份、会话导出和恢复后的执行读取同一份事实（设计文档 §4.2）。
 */
export interface QueuedTaskMessage {
  /** 投递记录 ID（去重与查询主键） */
  deliveryId: string;
  /** 请求投递的源任务 ID */
  sourceTaskId: string;
  /** 消息所在子会话 ID */
  childSessionId: string;
  /** 投递必须落在同一执行 lane，避免并发写入同一消息树 */
  executionLaneKey: string;
  /** 消息本体在子会话消息树中的节点 ID */
  messageNodeId: string;
  /** 消息来源（用户介入或调度 Agent 指令，由调用上下文派生） */
  origin: MessageOrigin;
  /** 投递方式（不含 append_only） */
  delivery: ExecutableTaskMessageDelivery;
  /** 投递状态 */
  state: QueuedTaskMessageState;
  /** 幂等键：同一键重复入队返回原记录 */
  idempotencyKey: string;
  /** 入队时间（ISO 8601 字符串） */
  enqueuedAt: string;
  /** 实际投递时间（ISO 8601 字符串） */
  deliveredAt?: string;
  /** 承接该消息执行的 follow-up task ID */
  followUpTaskId?: string;
  /** 投递失败原因 */
  error?: BackgroundTaskError;
}

/**
 * 任务执行链关联。
 *
 * 每次续投递、重试和人工接管都产生新的 taskId，并通过这些字段显式关联
 * 到原尝试，保证“始终表示一次执行尝试”。
 */
export interface TaskExecutionLink {
  /** 本次尝试续接的任务（next_turn / 追加指导产生） */
  continuationOfTaskId?: string;
  /** 本次尝试是对哪个任务的重试 */
  retryOfTaskId?: string;
  /** 本次尝试接管了哪个任务 */
  takeoverOfTaskId?: string;
}

/**
 * 可靠通知类型。
 *
 * - `task_terminal`：任务到达终态；
 * - `approval_required`：需要用户审批；
 * - `attention_required`：需要用户关注（等待输入、停滞等）。
 */
export type TaskNotificationKind =
  "task_terminal" | "approval_required" | "attention_required";

/**
 * 可靠通知记录。
 *
 * 父会话可用时投影为 `system_event` 消息；父会话未加载时停留在队列，
 * 由任务中心或父会话加载后补发。`idempotencyKey` 保证同一事件只投影一次。
 */
export interface TaskNotification {
  /** 通知 ID */
  notificationId: string;
  /** 关联任务 ID */
  taskId: string;
  /** 目标父会话 ID（无父会话时为 null） */
  parentSessionId?: string | null;
  /** 通知类型 */
  kind: TaskNotificationKind;
  /** 面向用户的摘要 */
  summary: string;
  /** 幂等键：同一事件重复入队返回原记录 */
  idempotencyKey: string;
  /** 创建时间（ISO 8601 字符串） */
  createdAt: string;
  /** 投影到父会话的时间（ISO 8601 字符串） */
  deliveredAt?: string;
  /** 用户确认时间（ISO 8601 字符串） */
  acknowledgedAt?: string;
}

/** 通知入队输入。 */
export interface EnqueueTaskNotificationInput {
  taskId: string;
  parentSessionId?: string | null;
  kind: TaskNotificationKind;
  summary: string;
  idempotencyKey: string;
}

/** 排队消息入队输入。 */
export interface EnqueueTaskMessageInput {
  sourceTaskId: string;
  childSessionId: string;
  executionLaneKey: string;
  messageNodeId: string;
  origin: MessageOrigin;
  delivery: ExecutableTaskMessageDelivery;
  idempotencyKey: string;
}
