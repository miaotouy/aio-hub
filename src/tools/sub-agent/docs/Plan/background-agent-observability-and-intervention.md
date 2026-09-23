# 后台 Agent 可观测性与人工介入设计

> 状态：已根据 Phase 1/2 施工复盘修订，待 Phase 3 实施
> 关联提交：`fee26e61e`、`7304e95ea`、`8302d33e`
> 关联方案：`docs/design/地基迁移调查/webview2-migration-investigation.md` §4.6、Phase 1

## 1. 设计目标

上一提交已经完成几项基础条件：

- Agent 可以通过 `subAgentConfig.enabled` 显式授权自己被其他 Agent 调用；
- `sub-agent` 工具可以创建独立聊天会话、发送消息并恢复调用方会话；
- Hidden Background JS WebView 已有最小 RPC、ready 和 heartbeat PoC，但尚未接入当前任务执行链。

下一步要把“调用一次子智能体”提升为可观察、可控制、并为未来恢复与人工介入留出边界的后台任务。核心目标有三项：

1. 用户随时能在前端找到正在运行的后台任务，查看它当前处于什么阶段，并打开完整子会话；
2. 调度方 Agent 能得到一份短、稳定、适合放进上下文的“最近操作摘要”，据此判断子任务是否在推进、完成或报错；停滞判断待 watchdog 契约补齐后再开放；
3. 用户给子 Agent 追加指导或介入时，消息原生归属于用户身份，通过头像与昵称自然辨识。

这里的“后台任务”是编排层对象。聊天会话保存完整对话和工具记录，后台任务保存运行关系、状态、进度摘要和控制句柄，两者通过 `childSessionId` 关联。

## 1.1. 施工复盘与设计修订（2026-09-23）

Phase 1/2 已经把最小链路跑通，但也暴露出原计划的几个前提过早：

- 当前任务执行权仍在主进程的 `llmChatService`，`BackgroundTaskRegistry` 负责快照、状态和持久化；Hidden WebView、Rust command、跨窗口事件尚未成为运行链路的一部分。它们应当作为未来的 runtime adapter，不再作为当前实现的隐含前提。
- `subscribe()` 是“有变化，请重新读取快照”的失效通知，不是可回放、可补齐的事件流；`seq` 目前只用于快照版本和本地诊断，不能宣称支持 `afterSeq` 续订。
- 持久化恢复的是观察记录。应用重启后，原先仍在运行的任务会被标为 `interrupted`，执行本身不会自动恢复。
- `conversationId` 目前是 `SubAgentRegistry` 进程内的续聊别名，实际映射保存在内存 `Map` 中；跨重启真正稳定的是 `childSessionId`，因此不能把 `conversationId` 当成可恢复控制句柄。
- `send_task_message` 当前只向子会话追加消息，不会把消息排队到下一轮，也不会触发新的生成；`delivery` 参数暂时只是保留字段。
- 父会话合成结果是尽力投递：父会话未加载时会跳过，当前没有通知队列。任务快照才是终态结果的唯一可靠来源。

因此，本设计从“先建完整 runtime 协议，再接入 UI”调整为“先把当前进程内执行链的契约说清楚，再抽取 runtime 边界”。后续设计不得把预留字段、未来状态或视觉方案写成当前已经具备的行为。

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
  └── BackgroundAgentTask(taskId)        一次执行尝试，负责观察与控制
        ├── childSessionId                完整聊天记录
        ├── conversationId                sub-agent 兼容层的续聊别名
        ├── executionLaneKey              当前为 childSessionId，同一会话需串行执行
        ├── owner                         控制权限主体
        ├── parentSessionId?              调度方会话，可为空
        └── runtimeGeneration             创建它的运行时代次
```

### 3.1. ID 与职责约束

- `taskId`：一次后台执行尝试的控制和观察 ID；同一子会话再次运行可以产生新的 `taskId`。
- `conversationId`：`sub-agent` 兼容层的续聊别名，当前只在 `SubAgentRegistry` 内存中解析；它不是跨重启的恢复凭证，也不是任务主键。
- `childSessionId`：完整聊天记录的存储 ID，是当前阶段最稳定的会话关联；任务中心打开子会话、恢复历史观察均以它为准。
- `parentSessionId`：发起调用时的主会话 ID。无当前主会话的后台调用允许为空，不能用空字符串伪装成有效会话。
- `parentTaskId`：子任务由另一个后台任务调度时建立的关系；当前仍限制单层委托。
- `executionLaneKey`：同一 `childSessionId` 的生成、取消和追加消息必须进入同一执行 lane。当前代码尚未把 lane 抽成独立服务，Phase 3/4 必须先补齐这一契约。

任务、会话和续聊别名是三个不同层次：任务描述“这一次运行”，会话保存“全部对话”，别名只负责兼容现有工具调用。任何需要跨重启恢复的能力都必须依赖持久化的会话索引，而不能只依赖 `conversationId`。

### 3.2. 任务状态与观察状态

当前真正可依赖的状态流转只有：

```text
created → running → completed / failed / cancelled / interrupted
```

以下状态先作为协议预留，尚未纳入当前行为契约：`queued`、`waiting_input`、`awaiting_approval`、`paused`。在执行器还没有对应的队列、等待点、审批路由和幂等控制前，UI 与 Agent 不应把它们当成已经可用的控制状态。

`stale` 也不是静态字段一出现就成立的能力。只有存在持续 heartbeat/watchdog，并定义阈值、清除条件和与 `interrupted` 的转换规则后，才可以对外暴露“可能停滞”。当前实现没有独立 watchdog；重启恢复时写入 `runtime_heartbeat_lost` 只是明确说明“上次运行已丢失”，不能据此推导运行中的任务已经停滞。

`cancelled` 表示取消请求已被 registry 接受，并触发当前执行器的 best-effort abort；它不是对底层模型、工具或外部副作用的强制回滚保证。终态保护仍然有效：后续旧执行回调不能把任务改回成功或失败。

### 3.3. 所有权与执行 lane

- `owner` 是权限字段，表达谁可以查询或控制任务；`callerAgent` / `targetAgent` 只表达调用关系和展示身份，不能代替权限判断。
- 一个 `childSessionId` 同时只允许一个生成轮次持有执行权。追加用户指导、Agent 追加指令和继续对话都必须经过同一个 lane，避免多个后台任务并发写入同一消息树。
- 当前 `send_task_message` 只做消息追加，尚未进入 lane，也不会自动启动生成；在正式队列实现前，不能把它描述成“下一轮投递”或“当前步骤后执行”。
- `runtimeGeneration` 只表示快照产生于哪个运行时代次；它不能单独证明任务可以恢复。恢复必须同时具备执行器句柄、会话状态和明确的重试语义。

## 4. 后台任务数据模型

第一版数据模型应区分“当前已实现字段”和“未来能力字段”，避免把预留状态误当成实现承诺。当前快照至少需要表达：

```ts
interface BackgroundTaskSnapshot {
  taskId: string;
  parentTaskId?: string;
  parentSessionId?: string;
  childSessionId: string;
  conversationId?: string;
  executionLaneKey: string;
  owner: MessageOrigin;
  callerAgent: MessageOrigin;
  targetAgent: MessageOrigin;
  state:
    | "created"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted";
  phase: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  lastActivityAt?: string;
  lastProgressAt?: string;
  currentOperation?: BackgroundTaskOperation;
  lastOperationSummary: string;
  recentActivity: BackgroundTaskActivity[];
  runtimeGeneration: number;
  result?: BackgroundTaskResult;
  error?: BackgroundTaskError;

  // 只有执行器契约补齐后才能成为对外行为
  stale?: boolean;
  staleReason?: "no_progress" | "runtime_heartbeat_lost";
  attention?: "awaiting_input" | "awaiting_approval";
}
```

约束：

- `recentActivity` 只保留固定条数（当前为最近 8 条）；完整消息和工具记录仍从 `childSessionId` 对应的会话读取。
- `owner`、`callerAgent`、`targetAgent` 的用途不同：前者做访问控制，后两者做任务关系和身份展示。
- `parentSessionId`、`conversationId` 可以缺省；缺失时任务仍可被观察，但不能伪造一个可恢复的上游会话。
- 任务快照持久化是观察数据持久化，不等价于执行上下文持久化。

### 4.1. “最后部分操作摘要”的生成规则

摘要由执行器事件归纳，并优先使用结构化数据：

- LLM 生成中：`正在等待 <agentName> 生成回复，已持续 <duration>`；
- 工具调用中：`正在执行工具 <toolName>：<安全参数摘要>`；
- 工具完成：`工具 <toolName> 已完成，结果：<结果摘要>`；
- 明确等待审批或输入：只有执行器提供对应等待事件时才使用相应文案；
- 最近发生错误：`<toolName> 失败：<可展示错误>`。

`lastOperationSummary` 面向 Agent 和列表卡片，控制长度并做敏感信息脱敏。工具原始参数、完整输出、推理文本和大段回复只通过详情页按需读取。读取不到工具节点时可以退化为 LLM 开始、回复完成或错误活动，不能编造工具进度。

## 5. Runtime 与协议

### 5.1. 当前实现的所有权边界

Phase 1/2 采用的是进程内链路：

- `llmChatService`：实际创建会话、发送消息、等待生成和中止生成的执行器；
- `BackgroundTaskRegistry`：任务快照、活动摘要、状态终态保护、持久化和变更失效通知；
- `SubAgentRegistry`：Agent-facing 适配器，负责把 `ask`、查询和取消映射到前两者；
- 主 WebView/UI：读取快照并投影为任务中心、标题栏活动胶囊和子会话入口。

因此当前 registry 不拥有生成执行权，UI 也不拥有执行权。取消是 registry 发出状态变更、适配器监听后调用 `abortSending` 的跨层联动，属于 best-effort 控制。

Hidden WebView、Rust command、Node.js sidecar 和跨窗口事件协议保留到后续 runtime 抽取阶段；在抽取前不得在设计或验收中把它们写成当前链路。

### 5.2. 当前可用的命令与事件语义

当前实现提供的稳定语义是：

```text
backgroundTaskRegistry.createTask(input)
backgroundTaskRegistry.getSnapshot(taskId)
backgroundTaskRegistry.listTasks(filter?)
backgroundTaskRegistry.subscribe(listener)
backgroundTaskRegistry.cancelTask(taskId)
```

`subscribe(listener)` 只表示“快照发生变化，请重新读取”；它不保存事件日志、不支持 `afterSeq` 回放，也不保证跨窗口送达。调用方应以 `getSnapshot/listTasks` 为事实来源，事件只用于刷新 UI。

Agent-facing adapter 当前提供：

```text
ask({ mode: "foreground" | "background" })
get_task_status(taskId)
get_task_activity(taskId, limit?)
send_task_message(taskId, message, delivery?)
cancel_task(taskId, reason?)
```

其中 `send_task_message` 当前是 append-only：消息写入子会话并记录活动，但不排队、不抢占当前生成、不启动下一轮。`delivery` 只有在真正接入执行 lane 后才能成为行为参数。

未来需要跨 runtime 时，再增加 `background_task.*` transport 协议：协议必须包含 owner、runtime generation、执行 lane、幂等 requestId 和可恢复的事件/快照游标；不能直接把当前 in-process `subscribe` 改名为 IPC 事件流。

### 5.3. 与现有 `sub-agent` 工具的衔接

保留当前 `ask` 的前台兼容行为，并增加任务化能力：

```ts
ask({
  agentId: string;
  message: string;
  conversationId?: string;
  mode?: "foreground" | "background";
}): Promise<string>
```

- `foreground`：等待当前子 Agent 轮次完成，任务中心仍可观察，取消为 best-effort；
- `background`：创建任务与子会话后立即返回 handle，父 Agent 继续执行；
- 使用已有 `conversationId` 时，当前进程内可以复用已解析的 `childSessionId`；跨重启前必须先补持久化会话索引；
- 任务完成后，尽力向仍加载的父会话追加 `system_event` 合成消息；父会话未加载时只保留任务快照，不声称存在通知队列；
- 旧执行回调必须检查任务是否仍为活动态，不能覆盖取消、中断等终态。

在正式 queue/lane、审批路由和可恢复执行器落地前，不提供 `pause`、`resume`、`interrupt`、`resolve_approval` 的行为承诺。

## 6. 用户前端交互设计（复用原生消息与伴生协作体系，分阶段落地）

> **当前实现边界（Phase 1/2）**：已落地的是任务中心、打开子会话、标题栏活动胶囊、查询状态/活动和取消任务。主会话派遣卡片、伴生 `MessageList` 视窗、顺口叮嘱、紧急叫停与审批条仍是后续设计，不应作为当前任务中心已有能力进行联动验收。

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
- **任务链路自然呈现**：消息卡片通过上下文流向与消息归属呈现任务关系，保持会话流的原生通透感。当前仅对已写入 `origin` 的消息成立，旧消息继续按 role/agentId 回退。

### 7.4. Agent 上下文处理

`origin` 是内部消息元数据，默认不直接发送给 Provider。构建上下文时保留必要的任务关系给编排层；若产品希望让子 Agent 知道“这条任务来自调度 Agent”，通过明确的系统提示或结构化工具输入传递，避免依赖 UI metadata 被意外透传。

## 8. 权限、恢复与边界

- 访问控制基于独立的 `owner`：调度 Agent 只能读取和控制自己创建的任务及其后代；用户界面可以查看当前应用内的任务；`callerAgent` 只用于展示，不能直接拿来当授权依据。
- 当前应用内 registry 的权限检查只能保护本进程调用，不代表跨窗口或跨 runtime 的安全边界。未来 IPC 必须在 transport 层重新校验 owner 和 capability。
- 当前阶段子 Agent 委托仍限制为单层；多层委托要等 parentTaskId、深度限制和 lane 关系真正接入后再开放。
- 用户追加指导与调度 Agent 追加指令必须区分 actor：不能因为工具名叫 `send_task_message` 就把 Agent 发出的消息标成 `user_intervention`。来源应由调用通道/上下文生成，调用参数不能伪造。
- 主窗口刷新或应用重启后，持久化快照可以恢复观察历史；原先处于活动态的任务统一标为 `interrupted`，不能声称仍在执行，也不能自动恢复。
- 父会话通知属于尽力投影，任务快照是终态事实来源。需要可靠补发时，另行设计通知队列和去重键。
- 旧会话没有 `origin` 时按既有 `role` 和 `agentId` 推导展示；消息来源补齐后仍需保留该回退路径。

## 9. 分阶段落地

### Phase 1：可观察任务壳（已完成，2026-09-23，见 §12）

- 建立任务快照、活动摘要、终态保护、持久化恢复和进程内订阅；
- `sub-agent.ask` 创建任务并记录 `childSessionId`、父会话和调用身份；
- 任务中心支持列表、详情和打开子会话。
- 该阶段的“恢复”仅恢复观察数据；活动任务重启后标为 `interrupted`。

### Phase 2：后台调度与 Agent 检查（已完成，2026-09-23，见 §12）

- `ask({ mode: "background" })` 返回任务 handle，父 Agent 不被子任务阻塞；
- 提供有限长度的状态和活动查询；
- 取消与当前 `llmChatService.abortSending` 联动，语义为 best-effort；
- 完成/失败后尽力向已加载父会话追加合成结果；
- 标题栏活动胶囊作为任务中心的轻量入口。

### Phase 3：消息来源与执行 lane（下一阶段）

先补契约，再做更丰富的 UI：

1. 为任务增加明确 `owner` 与 `executionLaneKey`，把同一 `childSessionId` 的生成、追加消息和取消串行化；
2. 持久化 `conversationId → agentId + childSessionId` 的会话索引，明确跨重启续聊失败/恢复语义；
3. 将消息来源从“消息类型”改为“调用上下文派生”：用户介入是 `user/user_intervention`，调度 Agent 指令是 `agent/sub_agent`；
4. 把 append-only 的 `send_task_message` 与真正的 `enqueue_task_message` 分开，只有后者承诺下一轮或当前步骤后的投递；
5. 让 `origin` 贯穿消息创建、持久化、渲染和导出，再实现派遣卡片、伴生视窗和用户介入输入。

### Phase 4：可恢复运行时

- 将执行权从 `llmChatService` 适配为明确的 task runner/lane，建立 heartbeat、watchdog 和 requestId；
- 定义 pause/resume/interrupt/retry 的幂等语义，以及工具审批等待点；
- 将快照、事件游标和控制命令抽象为可替换 transport，再接入 Hidden WebView、Rust command 或 Node.js sidecar；
- 运行时重建时根据执行器句柄和会话状态决定 interrupted、retry 或 resume，不能只凭 `runtimeGeneration` 自动恢复。

### Phase 5：多层编排与安全控制

- 通过任务深度和 capability 管理多层委托；
- 落地紧急叫停、“已接管”、敏感审批和可靠通知队列；
- 为 Node.js sidecar 保持与主进程一致的 snapshot/command/event 契约。

## 10. 下一步建议

不要直接从当前实现跳到“暂停/审批/恢复”或完整派遣卡片。下一步按以下顺序收紧基础契约：

1. 先把 `owner`、可空 `parentSessionId`、`executionLaneKey` 和 `conversationId` 的非持久化语义写入共享类型与 registry；
2. 给同一 `childSessionId` 增加单轮执行锁/队列，明确取消、追加消息与旧回调的竞态处理；
3. 将 `send_task_message` 的当前语义固定为 append-only，并另行设计真正的排队接口；
4. 补齐会话索引和用户档案快照后，再贯通 `origin` 的创建、持久化、渲染和导出；
5. 最后再抽取 runtime/IPC adapter，并以跨进程快照、事件游标和恢复测试重新定义 Phase 4。

这样当前主链路的承诺会收敛为：后台执行可被找到、状态可被查询、取消尽力生效、结果不会因 UI 未加载而丢失；更强的恢复和介入能力建立在真实执行器契约之上。

## 11. 行为验收场景

当前阶段只验收已经存在且可定位的行为：

- `ask({ mode: "background" })` 返回任务 handle，父 Agent 可以继续执行；
- 任务中心和 `get_task_status` 能看到同一个任务快照，活动变化后重新读取即可得到最新状态；
- 用户打开子会话不会切换父 Agent 的当前生成上下文；
- 取消任务会触发当前子会话的 best-effort abort，任务进入 `cancelled` 后不会被旧回调改写；
- 应用刷新/重启后，历史任务仍可查看；重启前处于活动态的任务显示为 `interrupted`，不会伪装成仍在运行；
- 父会话未加载时，合成结果消息可以缺席，但任务快照仍保留终态和结果摘要；
- `send_task_message` 只验证消息已追加到子会话，不验收“下一轮执行”或“当前步骤后执行”。

以下行为暂不作为当前阶段验收：暂停/恢复、停滞判断、审批、可靠父会话通知、跨重启续聊、用户介入的完整身份渲染、跨窗口事件回放和多层委托。

## 12. 实现进度记录

### Phase 1：可观察任务壳（已完成，2026-09-23）

#### 交付物

| 文件                                                    | 说明                                                                                                                                                                                  |
| :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/background-tasks/types.ts`                | `BackgroundTaskState`、`BackgroundActivityKind`、`BackgroundTaskOperation`、`BackgroundTaskActivity`、`BackgroundTaskSnapshot`、`MessageOrigin` 等类型                                |
| `src/services/background-tasks/registry.ts`             | 单例 `backgroundTaskRegistry`：`createTask`、`getSnapshot`、`listTasks`、`appendActivity`、`updateTaskState`、`setCurrentOperation`、`cancelTask`、`subscribe`、`loadFromPersistence` |
| `src/services/background-tasks/index.ts`                | 统一出口                                                                                                                                                                              |
| `src/services/__tests__/backgroundTaskRegistry.test.ts` | 15 个用例，覆盖创建/快照/过滤、活动截断与 `seq` 递增、状态流转与终态、取消幂等、持久化恢复                                                                                            |
| `src/tools/sub-agent/sub-agent.registry.ts`             | `ask` 埋点：创建任务、记录 caller/target origin 与当前操作、成功/失败收尾、取消打通、写入任务关系 metadata                                                                            |
| `src/tools/llm-chat/stores/llmChatStore.ts`             | 新增 `updateMessageMetadata(sessionId, nodeId, patch)`，仅增量扩展 metadata                                                                                                           |
| `src/tools/sub-agent/components/*`                      | `BackgroundTaskCenter.vue`、`BackgroundTaskList.vue`、`BackgroundTaskDetail.vue`、`backgroundTaskPresentation.ts`                                                                     |
| `src/tools/llm-chat/components/ChatAreaHeader.vue`      | 新增「后台任务中心」入口按钮（运行中任务数角标）                                                                                                                                      |

#### 行为

- `ask` 仍是前台阻塞调用，但会创建 `running` 任务，任务在 `childSessionId` 对应子会话上可被观察；
- 任务快照通过 `createConfigManager` 持久化到 `background-tasks/tasks.json`（上限 50 条，优先淘汰最旧终态任务）；registry 初始化时把非终态任务恢复为 `interrupted` + `staleReason: "runtime_heartbeat_lost"`；
- `recentActivity` 仅保留最近 8 条；`lastOperationSummary` 由当前操作派生并在超长时截断；
- 主窗口刷新后任务中心仍可看到历史任务，并支持打开对应 child session。

#### 施工复盘记录

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

| 文件                                                         | 说明                                                                                                                                                        |
| :----------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/sub-agent/sub-agent.registry.ts`                  | `ask` 新增 `mode` 参数与 background 分支；新增 `askInBackground`、`deliverSyntheticResult`、`assertTaskAccess`、`appendToolActivities`；新增四个工具 action |
| `src/tools/llm-chat/stores/llmChatStore.ts`                  | 新增 `createDetachedSession(agentId, name?)`（不切换当前会话）与 `appendMessageNode(sessionId, message)`（向指定会话追加节点）                              |
| `src/tools/llm-chat/types/message.ts`                        | `ChatMessageNode.metadata` 新增可选 `origin?: MessageOrigin`                                                                                                |
| `src/tools/sub-agent/composables/useBackgroundTaskCenter.ts` | 任务中心 UI 单例可见性状态，供聊天区入口与标题栏胶囊共享                                                                                                    |
| `src/components/TitleBar.vue`                                | 唯一挂载 `BackgroundTaskCenter` + 标题栏活动胶囊（含 Mini Popover）                                                                                         |
| `src/tools/sub-agent/components/BackgroundTaskDetail.vue`    | 新增「取消任务」按钮（二次确认）；状态展示补全等待/审批/暂停                                                                                                |
| `src/tools/llm-chat/components/ChatAreaHeader.vue`           | 入口按钮改为调用 `openTaskCenter()`，移除本地组件挂载                                                                                                       |

#### 行为

- `ask({ mode: "background" })` 立即返回 `{ taskId, conversationId, childSessionId, state }`，父 Agent 继续执行；默认 `foreground` 行为与 Phase 1 完全一致；
- 后台执行使用 `void (async () => { ... })()` 异步链，不阻塞调用方；执行期间照常记录活动、当前操作与终态；
- 任务到达任意终态后，尽力向已加载的父会话追加一条 `origin.channel = "system_event"` 的 `system` 合成结果消息（含状态、taskId、结果摘要）；父会话未加载则跳过，任务快照仍保留终态；
- 新增工具 action：`get_task_status(taskId)`、`get_task_activity(taskId, limit?)`（默认最近 5 条）、`send_task_message(taskId, message, delivery?)`、`cancel_task(taskId, reason?)`；其中 `send_task_message` 当前只是追加消息，`delivery` 尚未驱动排队，现有实现写入 `user_intervention` 来源，属于待 Phase 3 收紧的过渡行为；
- `assertTaskAccess` 做 owner 校验：调度 Agent 只能访问自己创建的任务及其 `parentTaskId` 后代；无 agent 上下文（用户/系统）放行；
- 后台子会话用 `createDetachedSession` 创建，不切换当前选中会话，避免干扰父 Agent 生成。

#### 施工复盘记录

1. **控制边界收窄**：服务层暂无可靠的 `pause`/`resume` 幂等语义，本阶段只开放取消，且取消是 best-effort。
2. **消息投递语义收窄**：`send_task_message` 当前只追加子会话节点，未进入执行 lane；`next_turn` / `after_current_step` 不能作为已实现行为。
3. **身份来源仍需修正**：当前实现将该工具追加的消息标记为 `user_intervention`，后续必须按调用上下文区分用户介入和 Agent 指令。
4. **合成结果是尽力投影**：父会话 detail 不在内存时跳过投递，不强行重开，也没有通知队列；任务快照是事实来源。
5. **工具活动按可读数据降级**：`appendToolActivities` 读取不到工具节点时只保留已有 LLM 活动，不编造工具进度。
6. **UI 分层顺延**：标题栏活动胶囊已落地；主会话派遣卡片、伴生视窗和完整 `origin` 渲染顺延到 Phase 3。

#### 验证

- `bun run check:frontend`（`vue-tsc --noEmit`）：退出码 0；
- `backgroundTaskRegistry.test.ts`：15/15 通过；
- `bun run build:vite`：构建成功（仅既有 chunk 体积提示）。

### 12.3. 施工复盘后的设计结论

Phase 1/2 的偏差已转化为设计约束：当前链路以进程内快照为事实来源，任务恢复只恢复观察，`conversationId` 不具备跨重启稳定性，消息追加不等于调度执行，父会话通知不具备可靠投递保证。后续实现按 §9 的 Phase 3/4/5 重新拆分，不再以原 §5.2 的 runtime/IPC 草案作为当前实现验收标准。
