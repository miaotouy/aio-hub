# 后台 Agent 可观测性与人工介入设计

> **状态**：Phase 1~3 全部交付（任务中心、标题栏胶囊、严格只读伴生分栏/PiP、互斥双模透视、卡片身份视觉、自包含关系快照已全量就绪）；Phase 4 第一步（排队投递/执行链/通知数据模型与持久化）已交付；Phase 4 核心（Task Runner 抽取、工具安全点消费、真实重发与 Watchdog）待启动。  
> **关联提交**：`18b074809`、`474f07ce1`、`e98681c6b`、`fee26e61e`、`7304e95ea`、`8302d33e`  
> **关联设计**：[`docs/design/地基迁移调查/webview2-migration-investigation.md`](../../../../../docs/design/地基迁移调查/webview2-migration-investigation.md) §4.6、[`src/tools/sub-agent/docs/Plan/chat-companion-dock-slot.md`](chat-companion-dock-slot.md)

---

## 1. 设计目标与核心工程准则

### 1.1. 设计目标

把“调用一次子智能体”从单次阻塞调用提升为**可观察、可介入、可恢复推进**的后台任务体系：

1. **可随时全局观测**：用户在任何界面均可通过标题栏胶囊或任务中心掌握任务进展，并随时无缝透视完整子会话；
2. **多智能体原生呈现**：子 Agent 与调度方 Agent 原生复用完整消息渲染体系，基于头像与名称自然呈现派遣关系；
3. **可控且有效介入**：调度方 Agent 或用户能向运行中的子任务安全追加指示，在安全点消费并维持原生身份；
4. **会话与编排双轨解耦**：聊天会话（`childSessionId`）保存完整对话和工具节点，后台任务（`taskId`）保存运行状态、操作摘要与控制句柄。

### 1.2. 核心工程准则

在历次架构演进中沉淀出的刚性设计约束：

1. **进程内优先，逐步抽取 Runtime**：当前任务执行权在主进程的 `llmChatService`，`BackgroundTaskRegistry` 负责快照、状态管理与持久化。Hidden WebView、Rust command、跨窗口通信作为后续 runtime adapter，不得作为当前链路的隐含前提；
2. **真实语义承诺**：接口与文档严格区分已交付行为与规划能力。当前 `send_task_message` 明确为 append-only，不排队、不抢占当前生成；跨轮次真正调度由 `enqueue_task_message` 与 Task Runner 承接；
3. **严格只读伴生防线**：伴生视图复用 `MessageList` 时必须在属性、菜单和事件层面做三重只读断流，杜绝误写主会话或子会话；
4. **会话作用域绝对隔离**：所有会话查询与状态写入必须显式绑定目标 `sessionId`，严禁依赖当前选中会话全局上下文；
5. **持久化双重去重与事实一致性**：跨重启恢复依赖会话索引与幂等队列（`deliveryId + idempotencyKey`），内存记录优先于持久化记录合并；
6. **任务快照为唯一事实源**：父会话结果通知属于尽力投影，父会话未激活时不阻断终态流转，通过可靠通知队列支持后续补发。

---

## 2. 参考实现与借鉴

### 2.1. OpenCode (`packages/opencode/src/tool/task.ts`)

- **借鉴点**：子会话通过 `parentID` 构成任务树，`taskId` 与 `sessionId` 稳定映射；后台模式立即返回 handle，完成时向父会话注入带状态标签的结果卡片；复用同一 `task_id` 续聊。
- **AIO Hub 适配**：完整消息树由 `ChatSessionDetail` 保存，来源元数据挂载在 `ChatMessageNode.metadata.origin`。

### 2.2. Pi Agent Harness (`packages/agent/src/harness/runtime/`)

- **借鉴点**：进度（流式帧）与最终结果（Snapshot）分离；运行时提供轻量快照查询；只有持有当前运行单元租约的 executor 允许写入进度；对外暴露有界进度信息。
- **AIO Hub 适配**：采用“轻量快照 + 变更失效通知”，UI 与调度 Agent 随时可同步最新状态。

---

## 3. 核心概念与实体关系

```text
主会话 / 调度 Agent
  └── BackgroundAgentTask (taskId)        一次执行尝试，负责观察与控制
        ├── childSessionId                完整聊天记录存储 ID（稳定关键键）
        ├── conversationId                sub-agent 工具层的续聊别名索引
        ├── executionLaneKey              执行车道键（当前为 childSessionId，串行执行）
        ├── owner                         控制权限主体（鉴权依据）
        ├── callerAgent / targetAgent     调度方与目标 Agent 身份元数据（展示依据）
        ├── parentSessionId?              调度方主会话 ID
        └── runtimeGeneration             运行时代次标识
```

### 3.1. 标识职责约束

- `taskId`：一次执行尝试的主键，同一子会话多次触发产生不同 `taskId`；
- `childSessionId`：聊天记录的物理存储主键，跨重启恢复与伴生视图加载的唯一稳定依据；
- `conversationId`：工具层别名，由 `SubAgentRegistry` 持久化维护 `conversationId → agentId + childSessionId` 映射；
- `executionLaneKey`：保证同一子会话的生成、追加和取消必须在同一执行车道内串行化。

### 3.2. 状态流转机

```text
created ──► running ──► completed
   │           │   ├──► failed
   │           │   ├──► cancelled (best-effort abort)
   │           │   └──► interrupted (重启恢复/外部叫停)
   └──► queued (等待执行车道释放)
```

- **终态保护**：一旦进入 `completed` / `failed` / `cancelled` / `interrupted`，任何旧执行回调的写入一律丢弃；
- **排队语义**：`queued` 表示等待前一生成轮次释放车道，支持幂等取消；
- **预留状态**：`waiting_input`、`awaiting_approval`、`paused` 为 Phase 4 协议预留，当前执行器尚未接入前不作为对外承诺。

---

## 4. 后台任务数据模型

### 4.1. 运行时任务快照 (`BackgroundTaskSnapshot`)

定义于 [`src/services/background-tasks/types.ts`](../../../../services/background-tasks/types.ts)：

```ts
export interface BackgroundTaskSnapshot {
  taskId: string;
  parentTaskId?: string;
  parentSessionId?: string;
  childSessionId: string;
  conversationId?: string;
  executionLaneKey: string;
  owner: MessageOrigin;
  callerAgent: MessageOrigin;
  targetAgent: MessageOrigin;
  state: BackgroundTaskState; // created | queued | running | completed | failed | cancelled | interrupted
  phase: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  lastActivityAt?: string;
  lastProgressAt?: string;
  currentOperation?: BackgroundTaskOperation;
  lastOperationSummary: string;
  recentActivity: BackgroundTaskActivity[]; // 内存与快照保留最近 8 条
  runtimeGeneration: number;
  result?: BackgroundTaskResult;
  error?: BackgroundTaskError;
  executionLink?: TaskExecutionLink;

  // Phase 4 预留能力字段（Watchdog / 审批机制落地后启用）
  stale?: boolean;
  staleReason?: "no_progress" | "runtime_heartbeat_lost";
  attention?: "awaiting_input" | "awaiting_approval";
}
```

#### 操作摘要 (`lastOperationSummary`) 生成规范

- **LLM 生成中**：`正在等待 <agentName> 生成回复，已持续 <duration>`；
- **工具执行中**：`正在执行工具 <toolName>：<脱敏参数摘要>`；
- **工具完成**：`工具 <toolName> 已完成，结果：<结果摘要>`；
- **发生错误**：`<toolName> 失败：<可展示错误>`；
- **展示控制**：摘要长度严格受控，原始入参及大段推理内容仅在详情页或伴生视窗中按需拉取。

### 4.2. 投递队列、执行链与可靠通知模型（Phase 4 已落地数据层）

承接服务：[`BackgroundTaskDeliveryQueue`](../../../../services/background-tasks/deliveryQueue.ts)（持久化至 `background-tasks/delivery-queue.json`）：

```ts
export type TaskMessageDelivery =
  "append_only" | "next_turn" | "after_current_step";

export interface QueuedTaskMessage {
  deliveryId: string;
  sourceTaskId: string;
  childSessionId: string;
  executionLaneKey: string;
  messageNodeId: string; // 仅引用消息节点，不冗余正文
  origin: MessageOrigin;
  delivery: Exclude<TaskMessageDelivery, "append_only">;
  state: "queued" | "waiting_safe_point" | "delivered" | "failed" | "cancelled";
  idempotencyKey: string;
  enqueuedAt: string;
  deliveredAt?: string;
  followUpTaskId?: string;
  error?: BackgroundTaskError;
}

export interface TaskExecutionLink {
  continuationOfTaskId?: string;
  retryOfTaskId?: string;
  takeoverOfTaskId?: string;
}

export interface TaskNotification {
  notificationId: string;
  taskId: string;
  parentSessionId?: string | null;
  kind: "task_terminal" | "approval_required" | "attention_required";
  summary: string;
  idempotencyKey: string;
  createdAt: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
}
```

---

## 5. Runtime 与协议契约

### 5.1. 进程内执行架构（现状）

- **执行器**：主窗口 `llmChatService`，负责会话创建、异步发送与中止句柄管理；
- **注册表 (`BackgroundTaskRegistry`)**：单例维护任务快照、最近活动、终态保护及磁盘持久化（`tasks.json` 上限 50 条）；
- **通知机制**：`subscribe(listener)` 提供“快照变更失效通知”（合并节流约 350ms），调用方以 `getSnapshot` 为准；
- **取消机制**：Registry 接受取消请求，标记 `cancelled` 终态，并联动 `llmChatService.abortSending` 进行 best-effort 强行中止。

### 5.2. Agent-Facing 工具接口规范

#### 现状已可用接口

- `ask({ mode: "foreground" | "background", agentId, message, conversationId? })`
- `get_task_status(taskId)`
- `get_task_activity(taskId, limit?)`
- `send_task_message(taskId, message)` —— 当前为 append-only 写入，记录活动但不排队执行；
- `cancel_task(taskId, reason?)`

#### Phase 4 规划接口

- `enqueue_task_message(taskId, message, { delivery: "next_turn" | "after_current_step", idempotencyKey })`
- `get_task_delivery(deliveryId)`
- `pause_task(taskId, requestId)` / `resume_task(taskId, requestId)`
- `retry_task(taskId, idempotencyKey)`
- `resolve_task_approval(taskId, requestId, decision)`

### 5.3. Task Runner 统一适配契约（Phase 4 目标）

后续抽取出的 Task Runner 具备以下统一接口：

- `start(taskId, requestId)`
- `abort(taskId, requestId, reason?)`
- `pause(taskId, requestId)` / `resume(taskId, requestId)`
- `enqueueTaskMessage(deliveryId)`
- `recover(runtimeGeneration)` —— 重建后恢复队列与未决任务
- `subscribeSnapshot(cursor?)` —— 先全量快照、后增量游标

---

## 6. 前端三层交互与呈现体系

前端交互围绕**全面复用并融入现有消息组件生态**展开，构建“原生流呈现 + 伴生透视”的体验：

```text
┌─────────────────────────────────────────────────────────────┐
│ Level 3. 全局托底：标题栏轻量活动胶囊 (TitleBar Activity Capsule) │
│          跨工具离开当前对话时依然可见，悬停/点击展开 Mini Popover   │
├─────────────────────────────────────────────────────────────┤
│ Level 2. 伴生视窗：复用完整 MessageList 的双模透视 (Sheet / PiP) │
│          直接以标准对话流视窗渲染子会话，Flex 让位 + 严格只读防线    │
├─────────────────────────────────────────────────────────────┤
│ Level 1. 就地感知：多智能体身份透视的派遣卡片 (Dispatch Card)   │
│          原生复用 MessageHeader 头像与名称体系，展示生命力与微介入    │
└─────────────────────────────────────────────────────────────┘
```

### 6.1. Level 1：就地感知 —— 原生消息流中的派遣卡片

位于主会话中的 [`BackgroundTaskDispatchLink.vue`](../../components/BackgroundTaskDispatchLink.vue)：

1. **多智能体身份识别**：复用 `useResolvedAgentAvatar`，头部并列显示 `[调度方 Agent 头像+名字] → [子 Agent 头像+名字]`；在气泡外置头像模式下，子 Agent 头像从卡片根节点外露展示；
2. **生命力微动效**：状态胶囊带呼吸光晕；单行轮播最近操作摘要（Activity Ticker），点击平滑展开微抽屉时间轴；
3. **卡片内微介入**：
   - 互斥透视按钮组：「侧栏透视」（`PanelRight`）与「悬浮透视」（`PictureInPicture2`）；
   - 「叫停」：二次确认后调用 `cancelTask`；
   - 「插话」：便签输入框（**严格遵循 Ctrl+Enter 发送，单回车仅换行**）。

### 6.2. Level 2：伴生视窗 —— 互斥双模透视与结构性让位

复用 [`MessageList.vue`](../../../llm-chat/components/message/MessageList.vue) 渲染完整子会话：

#### 6.2.1. 互斥状态机

- 用户根据意图显式切换分栏或画中画，两者逻辑严格互斥；
- 处于激活态的透视按钮赋予 `.action-btn-active` 高亮样式；对同一任务再次点击相同模式则收起。

#### 6.2.2. 挂载拓扑与 Flex 挤压让位（杜绝 Fixed 遮挡）

- **侧栏分栏 (Companion Sheet)**：挂载于 [`ChatArea.vue`](../../../llm-chat/components/ChatArea.vue) 内部的 `#chat-companion-dock-slot`。通过同级 Flex 容器（宽度 420px，支持拖拽调宽与收缩动画）挤压主聊天区，杜绝遮挡；
- **悬浮画中画 (Floating PiP)**：挂载于应用顶层 [`TitleBar.vue`](../../../../components/TitleBar.vue)，采用 [`DraggablePanel`](../../../../components/common/DraggablePanel.vue) 承载，支持跨工具悬停与毛玻璃视口吸附。

#### 6.2.3. 严格只读防线 (Strict Readonly Guard)

1. **Props 穿透**：`MessageList` 显式接受 `readonly="true"`；
2. **工具栏隐藏**：外置 Header 分支与气泡内部在 `readonly` 时一律强制隐藏编辑、删除、重生成等写操作菜单；
3. **事件断流与 Context 拦截**：伴生视窗不监听任何写事件，并通过 Vue Provide 注入 `isSessionReadOnly: true`，底层调用直接阻断。

#### 6.2.4. 异步加载版本守卫

`useCompanionSession` 维护单调递增的 `currentLoadVersion`，双重校验版本号与 `childSessionId`，彻底避免快速切换任务时的异步乱序覆盖。

### 6.3. Level 3：标题栏轻量活动胶囊

在 [`TitleBar.vue`](../../../../components/TitleBar.vue) 全局托底：

- **胶囊形态**：无任务时隐藏；有任务时显示子 Agent 头像、旋转进度环与极简摘要；
- **Mini Popover**：点击展开任务列表浮层，提供快捷透视入口与精准定位跳转（切回父会话并高亮原派遣卡片）。

---

## 7. 消息来源与显示 (`origin` 元数据)

```ts
export interface MessageOrigin {
  kind: "user" | "agent" | "tool" | "system";
  channel:
    | "main_chat"
    | "sub_agent"
    | "background_task"
    | "user_intervention"
    | "system_event";
  actorId?: string;
  actorName?: string;
  actorDisplayName?: string;
  taskId?: string;
  parentTaskId?: string;
  sourceMessageId?: string;
}
```

### 7.1. 场景映射矩阵

| 场景              | 消息 Role   | origin.kind | origin.channel      | 渲染呈现身份            |
| :---------------- | :---------- | :---------- | :------------------ | :---------------------- |
| 用户主会话输入    | `user`      | `user`      | `main_chat`         | 当前用户头像与昵称      |
| 调度方委派任务    | `user`      | `agent`     | `sub_agent`         | 调度方 Agent 头像与名称 |
| 子 Agent 回复     | `assistant` | `agent`     | `sub_agent`         | 子 Agent 头像与名称     |
| 子 Agent 执行工具 | `tool`      | `tool`      | `background_task`   | 工具卡片与调用参数      |
| 用户卡片插话/指导 | `user`      | `user`      | `user_intervention` | 用户头像与昵称快照      |
| 任务终态合成通知  | `system`    | `system`    | `system_event`      | 系统事件卡片            |

---

## 8. 权限、安全与隔离边界

1. **鉴权依据**：控制操作（取消、叫停、查询）严格以 `owner` 为准，调度 Agent 仅能操作自身及其派生任务；`callerAgent` 仅作展示；
2. **委托深度约束**：现阶段限制为单层委托，多层委托待 Phase 5 引入深度与 Capability 控制；
3. **身份不可伪造**：消息来源 `origin` 必须由运行时上下文派生，禁止通过外部入参覆盖真实身份；
4. **持久化隔离**：历史快照与队列淘汰策略相互独立（快照上限 50，队列与通知上限各 100），淘汰遵循“已终结优先”。

---

## 9. 演进路线与 Phase 4 实施分解

### 9.1. 演进阶段大纲

- **Phase 1：可观察任务壳**（已完成，2026-09-23）—— 快照注册表、进程内订阅、任务中心；
- **Phase 2：调度 Agent 可检查**（已完成，2026-09-23）—— 后台异步执行、Agent 检查工具、标题栏胶囊；
- **Phase 3：身份视觉、会话作用域与双模伴生透视**（已完成，2026-09-25）—— 作用域安全化、双模透视、槽位解耦、自包含关系快照；
- **Phase 4：Task Runner 抽取、真实介入与可靠通知**（第一步已就绪，核心实施中）；
- **Phase 5：多层编排与安全控制**（规划中）—— 深度限制、敏感工具审批路由、接管执行。

### 9.2. Phase 4 核心实施任务清单

- [x] **Phase 4.1 数据契约落地**（已交付，`8302d33e`）：
  - `QueuedTaskMessage`、`TaskExecutionLink`、`TaskNotification` 模型及单例 `backgroundTaskDeliveryQueue`；
  - 队列与通知持久化（`delivery-queue.json`）与幂等去重恢复机制。
- [ ] **Phase 4.2 Task Runner 抽取与执行接管**：
  - 从 `llmChatService` 剥离任务执行权，抽象 `TaskRunner` 接口；
  - 为子任务绑定专属 execution lane，提供 requestId 路由与 heartbeat 机制。
- [ ] **Phase 4.3 安全点消费与有效介入落地**：
  - 工具 action `enqueue_task_message` 接线；
  - Task Runner 在工具调用前/后安全点消费 `after_current_step`；在轮次结束时处理 `next_turn`，生成关联 follow-up task。
- [ ] **Phase 4.4 可靠通知队列与父会话补发**：
  - 任务到达终态时生成 `TaskNotification`；
  - 父会话加载时主动拉取未决通知并幂等投影为 `system_event`；任务中心支持手动确认。
- [ ] **Phase 4.5 Watchdog 与停滞告警**：
  - 基于 heartbeat 与 `lastProgressAt` 实现停滞检测，驱动 `stale` 状态更新与标题栏红点提示。

---

## 10. 统一行为验收场景

### 10.1. 可观测与透视验收（Phase 1~3 已就绪）

- `ask({ mode: "background" })` 立即返回 handle，主 Agent 保持流畅；
- 任务中心、标题栏胶囊与主会话派遣卡片实时同步最新状态与最近活动；
- 伴生视窗（侧栏/画中画）能完整渲染子会话，所有编辑、删除、重生成操作被严格拦截；快速在多任务间切换无内容错位或覆盖；
- 应用重启后，原活动任务安全置为 `interrupted`，历史会话仍可完整回溯。

### 10.2. 有效介入与执行链验收（Phase 4 目标）

- 用户选择 `next_turn` 插入指示，当前轮次释放后自动启动 follow-up task 续聊，子 Agent 在新轮次读取该消息并保留用户身份；
- 用户选择 `after_current_step` 时，子 Agent 在下一个工具安全点暂停并消费指示；
- 进程重启发生在队列等待期间，重启后恢复未决队列，并提供重试或取消入口；
- 父会话即使未加载，任务终态通知仍保留在队列中，再次打开父会话时一次性可靠补发。

---

## 11. 交付历史归档

| 阶段                 | 交付日期   | 核心交付物                                                                                                                                                                                        | 验证基准                                  |
| :------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------- |
| **Phase 1**          | 2026-09-23 | 任务快照系统、`BackgroundTaskRegistry`、任务中心（`BackgroundTaskCenter.vue`）、前台阻塞式任务化                                                                                                  | 单测 15/15；`check:frontend` 退出码 0     |
| **Phase 2**          | 2026-09-23 | `mode: "background"` 异步非阻塞执行、Agent 检查工具（`get_task_status` 等）、`TitleBar` 活动胶囊、尽力合成通知                                                                                    | 单测全过；类型检查通过                    |
| **Phase 3**          | 2026-09-25 | 会话作用域（`scopeSessionId`）、严格只读 `MessageList`、`ChatArea` 伴生分栏槽位解耦（`#chat-companion-dock-slot`）、互斥双模透视（Sheet / PiP）、派遣卡片与标题栏头像视觉、自包含关系快照（T3.4） | 6 模块 45 测试全部通过；`build:vite` 成功 |
| **Phase 4 (Step 1)** | 2026-09-25 | `QueuedTaskMessage`、`TaskExecutionLink`、`TaskNotification` 数据模型、`BackgroundTaskDeliveryQueue` 持久化队列与幂等恢复                                                                         | 队列单测 10/10，关联测试 29/29 全部通过   |
