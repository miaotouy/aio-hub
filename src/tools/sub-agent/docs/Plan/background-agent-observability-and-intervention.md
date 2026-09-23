# 后台 Agent 可观测性与人工介入设计

> 状态：设计中  
> 关联提交：`fee26e61e feat(agent-manager): 新增子智能体交互工具及配置`  
> 关联方案：`docs/design/地基迁移调查/webview2-migration-investigation.md` §4.6、Phase 1

## 1. 设计目标

上一提交已经完成几项基础条件：

- Agent 可以通过 `subAgentConfig.enabled` 显式授权自己被其他 Agent 调用；
- `sub-agent` 工具可以创建独立聊天会话、发送消息并恢复调用方会话；
- Hidden Background JS WebView 已有最小 RPC、ready 和 heartbeat PoC。

下一步要把“调用一次子智能体”提升为可观察、可恢复、可人工介入的后台任务。核心目标有三项：

1. 用户随时能在前端找到正在运行的后台任务，查看它当前处于什么阶段，并打开完整子会话；
2. 调度方 Agent 能得到一份短、稳定、适合放进上下文的“最近操作摘要”，据此判断子任务是否在等待、推进、报错或可能停滞；
3. 用户给子 Agent 追加指导或介入时，消息原生归属于用户身份，通过头像与昵称自然辨识。

这里的“后台任务”是编排层对象。聊天会话保存完整对话和工具记录，后台任务保存运行关系、状态、进度摘要和控制句柄，两者通过 `childSessionId` 关联。

## 2. 参考实现与可借鉴点

### 2.1. OpenCode

参考：

- `E:/git/opencode/packages/opencode/src/tool/task.ts`
- `E:/git/opencode/packages/session-ui/src/components/message-part.tsx`
- `E:/git/opencode/packages/app/e2e/regression/subagent-child-navigation.spec.ts`

可借鉴的结构：

- 子会话使用 `parentID` 建立任务树，任务 ID 与会话 ID 可以稳定互相定位；
- 工具返回 `sessionId`、`parentSessionId`、`jobId` 等 metadata，UI 可以从工具卡片打开子任务；
- 后台模式立即返回运行中结果，完成后向父会话注入带状态标签的合成结果；
- 同一个 `task_id` 可继续已有子任务并复用已有会话。

AIO Hub 的完整消息树由 `ChatSessionDetail` 保存；后台任务聚焦编排和观察，消息来源元数据挂在现有 `ChatMessageNode.metadata`。

### 2.2. Pi Agent Harness

参考：

- `E:/git/pi/packages/agent/src/harness/runtime/progress.ts`
- `E:/git/pi/packages/agent/src/harness/runtime/lane.ts`
- `E:/git/pi/packages/agent/docs/work-packages/09-lane-snapshot-settled-tools.md`

可借鉴的结构：

- 进度与最终结果分开存储，流式帧不会取代最终状态；
- 运行时提供可读取的 snapshot，调用方不必依赖瞬时事件才能知道当前状态；
- 只有仍然拥有当前操作的运行单元可以写入进度，避免旧任务在恢复后覆盖新任务状态；
- 对外暴露有界的进度信息，完整输出仍留在持久化会话中。

采用“事件流 + 当前快照”的组合：事件驱动实时更新，当前快照支持 UI 与调度 Agent 随时获取状态。

## 3. 核心概念与关系

```text
主会话 / 调度 Agent
  └── BackgroundAgentTask(taskId)
        ├── parentSessionId       调度方当前会话
        ├── childSessionId        被调用 Agent 的完整聊天会话
        ├── parentTaskId?         后续允许多层委托时使用
        ├── runtimeGeneration     创建它的后台运行时代次
        └── activitySnapshot      最近操作摘要
```

### 3.1. ID 约束

- `taskId`：后台任务的控制和观察 ID，生命周期内不变；
- `conversationId`：`sub-agent` 工具的用户/Agent 侧续聊句柄，解析到当前 task/run；它与 `taskId` 不是永久一对一关系；
- `childSessionId`：完整聊天记录的存储 ID，允许被同一续聊句柄的多次 task/run 复用；
- `parentSessionId`：发起调用的会话 ID；
- `parentTaskId`：子任务由另一个后台任务调度时建立的父子关系。

这些 ID 分别承担控制、续聊、存储和层级关系职责。一个聊天会话可以被多次运行、暂停或恢复，因此 `taskId` 与 `childSessionId` 分别保持稳定的控制和存储语义。

### 3.2. 任务状态

建议持久化以下终态和运行态：

```text
created → queued → running
                    ├── waiting_input
                    ├── awaiting_approval
                    ├── paused
                    └── completed / failed / cancelled / interrupted
```

`stalled` 作为根据 `lastProgressAt`、当前操作类型和运行时 heartbeat 推导出的观察状态，用于区分“模型生成较慢”与失败。UI 显示“可能停滞”，调度 Agent 获得 `stale: true` 及判断依据。

`waiting_input` 与 `awaiting_approval` 表示任务明确等待外部动作，并通过独立的 `attention` 字段提示处理方；`staleReason` 描述没有进展或 runtime 心跳丢失。
runtime 心跳丢失时先以 `staleReason = "runtime_heartbeat_lost"` 暴露观察结果，超过恢复窗口后再把任务状态转换为 `interrupted`。

## 4. 后台任务数据模型

第一版建议新增共享类型，例如 `src/services/background-tasks/types.ts`：

```ts
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

export type BackgroundActivityKind =
  | "task_created"
  | "message_sent"
  | "llm_started"
  | "llm_progress"
  | "tool_started"
  | "tool_progress"
  | "tool_finished"
  | "approval_requested"
  | "user_intervention"
  | "state_changed"
  | "error";

export interface BackgroundTaskOperation {
  kind: "llm_generation" | "tool_call" | "approval" | "waiting";
  name?: string;
  requestId?: string;
  startedAt: string;
  summary: string;
}

export interface BackgroundTaskActivity {
  id: string;
  taskId: string;
  kind: BackgroundActivityKind;
  actor: MessageOrigin;
  timestamp: string;
  summary: string;
  operation?: BackgroundTaskOperation;
  /** 供 UI 展开查看的受限信息；Agent 摘要按需省略。 */
  detailRef?: string;
}

export interface BackgroundTaskSnapshot {
  taskId: string;
  /** 任务事件序号；snapshot 与增量订阅通过它衔接。 */
  seq: number;
  parentTaskId?: string;
  parentSessionId: string;
  childSessionId: string;
  conversationId: string;
  callerAgent: MessageOrigin;
  targetAgent: MessageOrigin;
  state: BackgroundTaskState;
  phase: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  lastActivityAt?: string;
  lastProgressAt?: string;
  currentOperation?: BackgroundTaskOperation;
  lastOperationSummary: string;
  stale: boolean;
  staleReason?: "no_progress" | "runtime_heartbeat_lost";
  attention?: "awaiting_input" | "awaiting_approval";
  recentActivity: BackgroundTaskActivity[];
  runtimeGeneration: number;
  result?: { summary: string; completedAt: string };
  error?: { code: string; message: string; failedAt: string };
}
```

实现时 `recentActivity` 只保留固定条数，例如最近 8 条；完整操作记录通过 `childSessionId` 和工具消息读取。这样调度 Agent 的上下文不会随任务长度增长。

### 4.1. “最后部分操作摘要”的生成规则

摘要由运行时事件归纳，并优先使用结构化数据：

- LLM 生成中：`正在等待 <agentName> 生成回复，已持续 <duration>`；
- 工具调用中：`正在执行工具 <toolName>：<安全参数摘要>`；
- 工具完成：`工具 <toolName> 已完成，结果：<结果摘要>`；
- 等待审批：`等待用户批准 <toolName>`；
- 等待输入：`等待用户补充信息`；
- 最近发生错误：`<toolName> 失败：<可展示错误>`。

`lastOperationSummary` 面向 Agent 和列表卡片，控制长度并做敏感信息脱敏。工具原始参数、完整输出、推理文本和大段回复只通过详情页按需读取。

## 5. Runtime 与协议

### 5.1. 运行时所有权

- Background JS Runtime 持有活跃任务、事件序号和运行时操作句柄；
- Rust 负责窗口生命周期、持久化快照、跨窗口事件转发和必要的系统能力；
- 主 WebView 只持有订阅和 UI 投影，不拥有任务执行权；
- 运行时重建后先读取持久化快照，再将任务标记为 `interrupted` 或尝试恢复，不能把旧任务误当成仍在执行。

Hidden WebView 阶段可先使用 Rust command 保存任务快照。未来切换到 Node.js sidecar 时保留同一份协议，替换 transport 和 runtime adapter。

### 5.2. 命令与事件

建议将调用分为任务控制和任务观察两组：

```text
background_task.create
background_task.get_snapshot(taskId)
background_task.list({ states?, parentTaskId? })
background_task.subscribe({ taskId?, afterSeq? })
background_task.cancel(taskId)
background_task.pause(taskId)
background_task.resume(taskId)
background_task.send_message(
  taskId,
  message,
  { delivery: "next_turn" | "after_current_step" }
)
background_task.interrupt(taskId, reason?)
background_task.resolve_approval(taskId, requestId, decision)
```

`background_task.*` 是 runtime/IPC 层协议，`sub-agent` 工具只是 Agent-facing adapter；两者共用同一个 task registry，不能各自维护一份任务状态。`send_message` 的 `origin` 由调用通道和权限上下文生成，调用方不能通过参数伪造任意来源。

事件至少包括：

```text
background-task:created
background-task:updated
background-task:activity
background-task:completed
background-task:failed
background-task:interrupted
```

订阅采用“先 snapshot、后增量事件”的语义：

1. UI 或调度 Agent 请求 snapshot，并得到当前 `seq`；
2. 从该 `seq` 订阅后续事件；
3. 发现序号不连续时重新拉取 snapshot；
4. 主窗口刷新、窗口重建或 runtime generation 变化时重复上述流程。

这套语义能覆盖窗口刷新、多窗口观察和事件丢失，不要求调用方保存一份完整运行状态。

### 5.3. 与现有 `sub-agent` 工具的衔接

保留当前 `ask` 的前台兼容行为，并增加任务化能力：

```ts
ask({
  agentId,
  message,
  conversationId?,
  mode?: "foreground" | "background",
}): Promise<string>
```

这里的返回值按现有工具协议仍是 JSON 字符串；`background` 模式返回的 `taskId`、`conversationId`、`childSessionId` 和状态是字符串内的结构化 payload。

建议行为：

- `foreground`：继续等待子 Agent 完成，返回现有 `conversationId + response`；内部仍创建 `BackgroundAgentTask`，便于 UI 观察和取消；
- `background`：创建任务后立即返回 `taskId + conversationId + childSessionId + status`，父 Agent继续执行；
- `conversationId` 指向已有任务时，续聊动作写入同一个 task 和 child session；
- 任务完成后，运行时向父会话投递一条合成结果，写入 `origin.channel = "system_event"` 以及 `taskId` metadata，内容包含状态、任务 ID 和最终摘要；
- 父会话已结束时，结果保留在任务中心和通知队列，不强行重新打开主会话。

新增 Agent 可调用方法：

```text
get_task_status(taskId)
get_task_activity(taskId, limit?)
send_task_message(taskId, message, delivery?)
interrupt_task(taskId, reason?)
resolve_task_approval(taskId, requestId, decision)
cancel_task(taskId)
```

其中 `get_task_status` 返回单个紧凑 snapshot；`get_task_activity` 默认返回最近 5 条结构化活动。完整 transcript 由用户界面按需查看，调度 Agent 使用有界的任务上下文。

## 6. 用户前端交互设计（复用原生消息与伴生协作体系，分阶段落地）

系统中已经非常成熟强大的消息渲染体系（如 `MessageList`、`MessageHeader` 自带的头像、名称、模型副标题、气泡布局、富文本渲染与外置头像能力）

被调用的子智能体拥有专属头像、名称与完整人格。前端交互围绕**全面复用并融入现有消息组件生态**展开，构建“原生消息流呈现 + 伴生透视”的自然体验：

```text
┌─────────────────────────────────────────────────────────────┐
│ Level 3. 全局托底：标题栏轻量活动胶囊 (TitleBar Activity Capsule) │
│          跨工具离开当前对话时依然可见，悬停/点击展开 Mini Popover   │
├─────────────────────────────────────────────────────────────┤
│ Level 2. 伴生视窗：复用完整 MessageList 的画中画/侧栏           │
│          直接以标准对话流视窗渲染子会话，保留头像/富文本/分支/气泡    │
├─────────────────────────────────────────────────────────────┤
│ Level 1. 就地感知：多智能体身份透视的派遣卡片 (Dispatch Card)   │
│          原生复用 MessageHeader 头像与名称体系，展示生命力与微介入    │
└─────────────────────────────────────────────────────────────┘
```

### 6.1. Level 1：就地感知 —— 融入生动身份的原生消息卡片

在主会话中，子智能体调用以派遣卡片呈现，并充分使用现有消息头部与身份识别资产：

1. **复用 `MessageHeader` 动态身份映射**：
   - 派遣卡片直接复用或对齐 [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue:1) 的头像解析逻辑（`useResolvedAgentAvatar`）；
   - **任务关系头部（派遣卡片）**：并列显示 `[调度方 Agent 头像+名字] → [子 Agent 头像+名字]`，让任务卡片一眼呈现派遣关系；
   - 支持气泡模式（Bubble Mode）下的外置头像（`avatarPlacement: outside`），使子 Agent 的形象自然站立在消息气泡外侧。
2. **生命力微动效与阶段流水**：
   - **状态指示器**：复用 `MessageHeader` 中的 `message-status` 胶囊（旋转的小圆圈、等待中、完成勾选），结合呼吸光晕表现运行态；
   - **操作流水胶囊（Activity Ticker）**：单行轮播最近操作（例如 `正在查阅: src/utils/logger.ts`），点击可向下平滑展开微抽屉时间轴。
3. **卡片内微介入操作（Inline Steer）**：
   - 卡片底部集成快捷介入条：
     - **「透视（Peek）」**：点击直接在侧边滑出完整的子会话面板；
     - **「叫停（Halt）」**：紧急打断执行；
     - **「插话（Whisper）」**：卡片内原地展开便签输入框（**严格遵循 Ctrl+Enter 发送规范，防止单回车误发**）。

### 6.2. Level 2：伴生视窗 —— 100% 复用现有 `MessageList` 核心组件

用户需要细看子 Agent 完整的执行流与推理细节时，直接复用现有的 `MessageList.vue`：

1. **双栏伴生视窗（Companion Sheet）**：
   - 宽屏（> 1100px）下，主对话区向左平滑腾出空间，右侧滑出伴生视窗；
   - 伴生视窗内部**直接挂载 [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:1)**；任务详情先依据 `childSessionId` 从会话 Store 取得 `sessionIndex`、`sessionDetail` 和消息列表，再按现有 props 契约渲染，`MessageList` 本身不直接接收 `childSessionId`；
   - 自动继承原汁原味的能力：
     - **完整的 Agent 头像与名字展示**；
     - 完整的 Markdown 渲染、代码高亮、复制与思考块折叠；
     - 气泡模式与卡片模式样式自适应；
     - 底部锁定跟随与虚拟滚动能力。
2. **画中画悬浮窗（Floating PiP via `DraggablePanel`）**：
   - 窄屏或点击“独立悬浮”时，将上述挂载了 `MessageList` 的伴生视窗嵌入 [`DraggablePanel`](src/components/common/DraggablePanel.vue:66)；
   - 用户可以拖拽到屏幕任意角落，半透明毛玻璃背景（`backdrop-filter: blur(var(--ui-blur))`）；
   - 用户在主窗口正常与主 Agent 交流，眼角余光看着画中画里子 Agent 顶着自己的头像和名字不断吐字。
3. **多源消息的自然视觉识别**：
   - 在伴生 `MessageList` 中，以头像与名称清晰区分角色：
     - 调度方发来的委托：`MessageHeader` 直接展示调度方 Agent 的专属头像与名称；
     - 子 Agent 自身回复：正常展示子 Agent 头像与名称；
     - 用户插话/顺口叮嘱：`MessageHeader` 优先渲染消息创建时保存的用户档案快照（`userProfileId`、名称和图标），找不到快照时再通过 `userProfileStore` 解析当前档案，与日常群聊心智一致且不改变历史消息身份。

### 6.3. Level 3：标题栏轻量活动胶囊（Live Activity Capsule）

当用户切换到其他工具（如 OCR、资产管理器、设置）时，提供轻量全局托底感知：

1. **标题栏形态（在 [`TitleBar.vue`](src/components/TitleBar.vue:633) 中集成）**：
   - 无后台任务时完全隐藏，保证标题栏整洁；
   - 有后台任务时显示为药丸形圆角胶囊：
     - 左侧：子 Agent 迷你头像 + 旋转加载圈；
     - 中间：极简状态摘要（如 `代码审查中 45%` 或 `2个后台任务运行`）；
     - 右侧：若有待审批或停滞，显示高亮提示点。
2. **浮层控制卡片（Flyout Popover）**：
   - 点击胶囊弹出类似下载管理器的 Mini 列表面板（宽度约 360px）；
   - 展示任务关系、微进度条、快速取消/暂停；
   - 点击一键精准定位跳转到原主会话的对应派遣卡片位置。

### 6.4. 人类介入的分级人机工学

为避免机械弹窗带来的打断感，介入操作分为三种明确的行为语义：

| 介入类型                       | 触发意图                                             | 交互入口             | 界面表现与反馈规范                                                                                                                                                              |
| :----------------------------- | :--------------------------------------------------- | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **顺口叮嘱 (Steer / Whisper)** | 补充要求或轻微纠偏（如“记得用 TypeScript 严格模式”） | 卡片底部“插话”便签   | 卡片内原地展开文本框；输入框带提示“将在当前动作结束后追加”；**强制使用 Ctrl+Enter 发送，严格禁止单回车发送**。                                                                  |
| **紧急叫停 (Halt & Takeover)** | 发现死循环、高危工具或严重跑偏                       | 卡片右上角制动按钮   | 立即终止当前 step 执行，状态置为 `interrupted`。卡片转为“已接管”形态，允许用户重新发起轮次或就地编辑。                                                                          |
| **敏感审批 (Approval)**        | 子 Agent 触发了高危工具操作                          | 卡片内原地浮起审批条 | 复用现有 [`ToolCallingApprovalBar.vue`](src/tools/llm-chat/components/message-input/ToolCallingApprovalBar.vue:130) 设计规范，展开参数 Diff，支持“单次放行”、“拒绝并告知原因”。 |

Phase 3 提供顺口叮嘱；Phase 4 在具备可中断执行、`requestId` 路由与权限校验后提供紧急叫停和敏感审批。这里的“已接管”是卡片展示语义，持久化状态为 `interrupted`，并追加一条 `user_intervention` 活动记录；接管权属由任务控制字段补充。

### 6.5. 视觉规范与人机工学约束

1. **容器装饰规范（遵循 [`semantic-decoration.md`](.kilocode/rules/semantic-decoration.md)）**：
   - 派遣卡片作为普通结构容器，**严禁使用粗左线**；
   - 使用 1px 全边框 + `--card-bg` + 毛玻璃，状态由 6px 呼吸圆点与微型 Badge 表达。
2. **防误触强制约束**：
   - 任何涉及输入发送的组件，默认使用 **Ctrl+回车** 发送，单回车换行，严禁单回车直接触发。
3. **渲染性能保护**：
   - 高频状态与微进度条采用定宽数字与 CSS transform，避免触发聊天列表的全局 Reflow。

## 7. 消息来源与显示

### 7.1. 消息正文保持原样

来源信息保存在 `ChatMessageNode.metadata` 中：

```ts
export type MessageOriginKind = "user" | "agent" | "tool" | "system";

export interface MessageOrigin {
  kind: MessageOriginKind;
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

现有 `metadata.agentId` 等字段继续保留，`origin` 作为新增的关系和来源信息。这样旧会话仍可正常读取，新会话可以准确表达“哪一个 Agent 代表谁发送了这条消息”。

### 7.2. 来源映射

| 场景                           | 消息 role          | origin.kind | origin.channel      |
| ------------------------------ | ------------------ | ----------- | ------------------- |
| 用户在主会话输入               | `user`             | `user`      | `main_chat`         |
| 调度 Agent 发给子 Agent 的任务 | `user`             | `agent`     | `sub_agent`         |
| 子 Agent 的回复                | `assistant`        | `agent`     | `sub_agent`         |
| 子 Agent 调用工具              | `tool`             | `tool`      | `background_task`   |
| 用户给后台任务追加指导         | `user`             | `user`      | `user_intervention` |
| 任务完成/失败合成通知          | `system` 或 `tool` | `system`    | `system_event`      |

“调度 Agent 发给子 Agent 的任务”在聊天协议里仍然是 `user` role，来源 metadata 才说明它来自另一个 Agent。这样既保留 Provider 的角色契约，又能在 UI 和内部审计中区分角色。

### 7.3. UI 展示（以头像与名称识别身份）

遵循专业桌面端高信噪比原则，界面通过头像与名称呈现消息来源：

- **以头像与名称为主体识别**：
  - 用户介入的消息，其 `MessageHeader` 直接显示当前登录用户的头像与昵称，视觉体验与主会话中用户发话完全一致；
  - 调度方 Agent 委派的消息，显示调度方 Agent 的头像与名称；
  - 子 Agent 回复显示子 Agent 本身的头像与名称；
- **任务链路自然呈现**：消息卡片通过上下文流向与消息归属呈现任务关系，保持会话流的原生通透感。

### 7.4. Agent 上下文处理

`origin` 是内部消息元数据，默认不直接发送给 Provider。构建上下文时保留必要的任务关系给编排层；若产品希望让子 Agent 知道“这条任务来自调度 Agent”，通过明确的系统提示或结构化工具输入传递，避免依赖 UI metadata 被意外透传。

## 8. 权限、恢复与边界

- 调度 Agent 只能读取自己创建的任务及其后代任务；
- 用户可以查看当前应用内所有任务，但任务详情中的工具参数和输出仍按现有敏感信息规则脱敏；
- 当前阶段，子 Agent 的委托范围为单层；Phase 4 通过任务深度与 capability 配置管理委托范围；
- 取消、暂停、追加指导使用 task owner 和 capability 检查，不能只凭 `taskId` 放行；
- runtime heartbeat 丢失时，任务标为 `interrupted`，恢复后通过任务快照和 child session 决定是否可继续；
- 主窗口关闭或刷新不改变任务 owner；应用进程退出后，Hidden WebView 任务只能恢复到明确的中断状态，不能声称仍在执行；
- 旧会话没有 `origin` 时按既有 `role` 和 `agentId` 推导展示，迁移不要求回填历史来源。

## 9. 分阶段落地

### Phase 1：可观察任务壳（已完成，2026-09-23，见 §12）

- 新增 `BackgroundTaskSnapshot`、`BackgroundTaskActivity`、`MessageOrigin` 类型；
- `sub-agent.ask` 创建 task，并把 `childSessionId`、`parentSessionId` 写入 metadata；
- runtime 提供 snapshot、取消和事件订阅；
- 主窗口增加只读任务列表和任务详情，支持打开 child session；
- 主窗口刷新后通过 snapshot 恢复观察。

### Phase 2：调度 Agent 可检查（已完成，2026-09-23，见 §12）

- `ask({ mode: "background" })` 立即返回 task handle；
- 增加 `get_task_status` 和 `get_task_activity`；
- 把工具调用、LLM 生成、审批等待和错误归纳成最近操作摘要；
- 子任务完成后向父会话投递合成结果，并保留 task handle。
- 主会话派遣卡片先展示任务关系、状态和最近操作；标题栏活动胶囊作为任务中心的轻量入口，并在这一阶段开放取消、暂停等任务控制。

### Phase 3：多源身份归属与用户介入

- `ChatMessageNode.metadata.origin` 落地并贯穿消息创建、持久化、渲染和导出（用于后端路由与前端提取对应 actor 的头像/名字）；
- 任务详情支持追加指导/顺口叮嘱，默认排队到下一轮；
- 伴生视窗复用会话 Store 与 `MessageList`，主会话的工具卡片、任务通知和任务中心复用同一 task detail 入口；
- 用户介入消息通过发送时保存的用户档案快照原生呈现，并沿用头像与昵称完成身份识别。
- Phase 3 提供排队到下一轮的顺口叮嘱；Phase 4 提供紧急叫停和敏感审批。

### Phase 4：运行时恢复与多层编排

- 快照写入稳定持久化存储，处理 runtime generation 变化；
- 明确暂停/恢复/重试的幂等语义；
- 用配置化任务深度和 capability 管理多层委托；
- 为 Node.js sidecar 保持相同的命令、事件和快照协议。
- 落地 `interrupt_task`、审批决策和“已接管”展示语义。

## 10. 下一步建议

Phase 1 与 Phase 2 已完成（落地记录见 §12）。下一步推进 Phase 3：

1. 让 `ChatMessageNode.metadata.origin` 贯穿消息创建、持久化、渲染与导出；
2. 任务详情支持追加指导/顺口叮嘱，默认排队到下一轮；
3. 伴生视窗复用会话 Store 与 `MessageList`，主会话工具卡片、任务通知和任务中心复用同一 task detail 入口；
4. 用户介入消息通过发送时保存的用户档案快照原生呈现，沿用头像与昵称完成身份识别。

这样可以先验证“后台执行不会丢、用户能找到并打开、调度 Agent 能看到最近活动”这条主链路，消息来源和干预能力在同一任务模型上自然扩展。

## 11. 行为验收场景

- 主窗口刷新时，正在运行的子任务仍可在任务中心看到，详情能打开原 child session；
- 调度 Agent 查询任务时，只得到有限长度的状态和最近活动，不会收到完整历史；
- 子 Agent 卡在工具审批或长时间没有进展时，调度 Agent 能看到 `awaiting_approval` 或 `stale` 及原因；
- 用户从主会话工具卡片打开任务详情，不会改变主会话当前输入状态；
- 用户追加指导后，子会话直接以用户本人的头像与昵称呈现该消息，调度方、用户和子 Agent 三方角色一目了然且无多余标签干扰；
- 任务完成、失败、取消和 runtime 中断在任务中心有明确状态，父会话收到的合成通知能关联回 task。

## 12. 实现进度记录

### Phase 1：可观察任务壳（已完成，2026-09-23）

#### 交付物

| 文件 | 说明 |
| :--- | :--- |
| `src/services/background-tasks/types.ts` | `BackgroundTaskState`、`BackgroundActivityKind`、`BackgroundTaskOperation`、`BackgroundTaskActivity`、`BackgroundTaskSnapshot`、`MessageOrigin` 等类型 |
| `src/services/background-tasks/registry.ts` | 单例 `backgroundTaskRegistry`：`createTask`、`getSnapshot`、`listTasks`、`appendActivity`、`updateTaskState`、`setCurrentOperation`、`cancelTask`、`subscribe`、`loadFromPersistence` |
| `src/services/background-tasks/index.ts` | 统一出口 |
| `src/services/__tests__/backgroundTaskRegistry.test.ts` | 15 个用例，覆盖创建/快照/过滤、活动截断与 `seq` 递增、状态流转与终态、取消幂等、持久化恢复 |
| `src/tools/sub-agent/sub-agent.registry.ts` | `ask` 埋点：创建任务、记录 caller/target origin 与当前操作、成功/失败收尾、取消打通、写入任务关系 metadata |
| `src/tools/llm-chat/stores/llmChatStore.ts` | 新增 `updateMessageMetadata(sessionId, nodeId, patch)`，仅增量扩展 metadata |
| `src/tools/sub-agent/components/*` | `BackgroundTaskCenter.vue`、`BackgroundTaskList.vue`、`BackgroundTaskDetail.vue`、`backgroundTaskPresentation.ts` |
| `src/tools/llm-chat/components/ChatAreaHeader.vue` | 新增「后台任务中心」入口按钮（运行中任务数角标） |

#### 行为

- `ask` 仍是前台阻塞调用，但会创建 `running` 任务，任务在 `childSessionId` 对应子会话上可被观察；
- 任务快照通过 `createConfigManager` 持久化到 `background-tasks/tasks.json`（上限 50 条，优先淘汰最旧终态任务）；registry 初始化时把非终态任务恢复为 `interrupted` + `staleReason: "runtime_heartbeat_lost"`；
- `recentActivity` 仅保留最近 8 条；`lastOperationSummary` 由当前操作派生并在超长时截断；
- 主窗口刷新后任务中心仍可看到历史任务，并支持打开对应 child session。

#### 与设计文档的偏差

1. **取消能力提前实现**：文档将可中断执行排在 Phase 4，本次经 `useLlmChatStore().abortSending(childSessionId)` 与 `backgroundTaskRegistry.cancelTask` 打通（`ask` 订阅任务 `state_changed`，收到 `cancelled` 即中止生成并以 `cancelled` 收尾）；未引入 Tauri 命令层。
2. **`callerAgent` 显示名缺失**：当前 `ToolContext.agent` 只暴露 `{ id, knowledgeAccess? }`，故 `actorId` 与 `actorName` 均取 `context.agent.id`；无 `context.agent` 时回落为 `{ kind: "user", channel: "main_chat" }`。
3. **任务中心入口**：文档 §6.3 建议的 TitleBar 全局胶囊属后续阶段，Phase 1 入口暂放 `ChatAreaHeader` 工具栏；未采用 §5.2 的 `background_task.*` Tauri 命令层与跨窗口事件通道（当前为进程内单例 + 监听器订阅）。
4. **头像解析**：列表循环中改用纯函数 `resolveAgentAvatarPath`，未使用 `useResolvedAgentAvatar` composable。
5. **类型补充**：因原 §4 代码块存在损坏文本，按语义重构时补回 `"paused"` 状态，并新增 `BackgroundTaskResult`、`BackgroundTaskError`、`BackgroundTaskChangeEvent` 等辅助类型；`createTask` 额外支持可选 `parentTaskId`，为多层委托预留。
6. **终态保护**：对终态任务调用 `updateTaskState` 返回 `null`，避免回写历史状态。

#### 验证

- `bun run check:frontend`（`vue-tsc --noEmit`）：退出码 0；
- `backgroundTaskRegistry.test.ts`：15/15 通过；
- `bun run build:vite`：通过；
- `oxlint` 与 `prettier --check`：新增/改动文件无告警。

### Phase 2：调度 Agent 可检查（已完成，2026-09-23）

#### 交付物

| 文件 | 说明 |
| :--- | :--- |
| `src/tools/sub-agent/sub-agent.registry.ts` | `ask` 新增 `mode` 参数与 background 分支；新增 `askInBackground`、`deliverSyntheticResult`、`assertTaskAccess`、`appendToolActivities`；新增四个工具 action |
| `src/tools/llm-chat/stores/llmChatStore.ts` | 新增 `createDetachedSession(agentId, name?)`（不切换当前会话）与 `appendMessageNode(sessionId, message)`（向指定会话追加节点） |
| `src/tools/llm-chat/types/message.ts` | `ChatMessageNode.metadata` 新增可选 `origin?: MessageOrigin` |
| `src/tools/sub-agent/composables/useBackgroundTaskCenter.ts` | 任务中心 UI 单例可见性状态，供聊天区入口与标题栏胶囊共享 |
| `src/components/TitleBar.vue` | 唯一挂载 `BackgroundTaskCenter` + 标题栏活动胶囊（含 Mini Popover） |
| `src/tools/sub-agent/components/BackgroundTaskDetail.vue` | 新增「取消任务」按钮（二次确认）；状态展示补全等待/审批/暂停 |
| `src/tools/llm-chat/components/ChatAreaHeader.vue` | 入口按钮改为调用 `openTaskCenter()`，移除本地组件挂载 |

#### 行为

- `ask({ mode: "background" })` 立即返回 `{ taskId, conversationId, childSessionId, state }`，父 Agent 继续执行；默认 `foreground` 行为与 Phase 1 完全一致；
- 后台执行使用 `void (async () => { ... })()` 异步链，不阻塞调用方；执行期间照常记录活动、当前操作与终态；
- 任务到达任意终态后，向父会话追加一条 `origin.channel = "system_event"` 的 `system` 合成结果消息（含状态、taskId、结果摘要）；父会话未加载则跳过，结果仍保留在任务中心；
- 新增工具 action：`get_task_status(taskId)`、`get_task_activity(taskId, limit?)`（默认最近 5 条）、`send_task_message(taskId, message, delivery?)`（默认 `next_turn`，写入 `origin.channel = "user_intervention"`）、`cancel_task(taskId, reason?)`；
- `assertTaskAccess` 做 owner 校验：调度 Agent 只能访问自己创建的任务及其 `parentTaskId` 后代；无 agent 上下文（用户/系统）放行；
- 后台子会话用 `createDetachedSession` 创建，不切换当前选中会话，避免干扰父 Agent 生成。

#### 与设计文档的偏差

1. **暂停/恢复未提供**：服务层暂无可靠的 `pause`/`resume` 幂等语义（设计排在 Phase 4），本阶段任务控制仅开放「取消」，按钮对终态任务禁用。
2. **`send_task_message` 仅投递不排队**：当前把用户介入消息以 `user_intervention` origin 追加到子会话，正式「排队到下一轮/当前步骤」的投递调度留待 Phase 3。
3. **合成结果投递依赖父会话已加载**：父会话 detail 不在内存时跳过投递（不强行重开），符合 §5.3 的降级要求。
4. **工具活动为尽力而为**：`appendToolActivities` 从子会话节点读取工具调用，读取不到时仅保留 `llm_started`/`llm_progress`，不深挖。
5. **派遣卡片与标题栏胶囊**：标题栏活动胶囊已落地；主会话内「派遣卡片」的原生身份透视属 §6.1，与 `origin` 渲染一同顺延到 Phase 3 统一处理。

#### 验证

- `bun run check:frontend`（`vue-tsc --noEmit`）：退出码 0；
- `backgroundTaskRegistry.test.ts`：15/15 通过；
- `bun run build:vite`：构建成功（仅既有 chunk 体积提示）。
