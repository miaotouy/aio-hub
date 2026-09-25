# 后台 Agent 可观测性与人工介入设计

> 状态：Phase 3 的服务端契约、会话作用域、伴生视图外壳与派遣卡片主体已于 2026-09-24 落地；伴生视图的严格只读约束与目标会话一致性仍待修复，T3.3 视觉目标未完成，验收状态见 §12.7；Phase 4 可恢复运行时与有效介入待启动
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

## 1.2. 功能范围保护与回补原则（2026-09-24）

施工复盘用于校准承诺边界，不得把运行时尚未具备的能力从产品目标中静默移除。以下能力构成本方案的完整功能范围，并由后续 Phase 继续交付：

1. **可观察**：用户和调度 Agent 能找到任务、读取有限状态与活动、追溯完整子会话；
2. **可有效介入**：用户或调度 Agent 的补充消息可在明确时机进入后续执行，保持发送者身份，并可查询投递结果；
3. **可恢复地推进**：进程或 runtime 变化后，系统能依据持久化执行记录、会话状态与幂等命令继续、重试或清晰地交给用户处理；
4. **可持续透视**：用户可在不离开主会话工作区的前提下阅读子会话，宽屏伴生视窗与窄屏画中画共享一致的会话作用域；
5. **可控且安全**：停滞、等待输入、审批、暂停、继续、紧急叫停和接管均具备来源明确、幂等且可审计的状态转换；
6. **结果可靠可达**：任务终态及需要处理的事件保存在可靠通知队列中，父会话暂未加载时仍能在随后关联和呈现。

当前的 append-only、进程内订阅和观察型恢复属于阶段性契约。每项阶段性契约都要在文档中写出对应的目标能力、承接 Phase、持久化数据和验收场景；接口参数、状态名称和 UI 操作只承诺已经兑现的语义。已有兼容字段在过渡期返回实际生效的 `delivery` 与可读说明，避免调用方把预留能力当作已完成能力。

为避免实现便利性改变产品能力，后续设计遵循以下约束：

- `BackgroundAgentTask` 始终表示一次执行尝试；续投递、重试和人工接管产生新的尝试 ID，并通过显式关联字段串成执行链；
- 任何跨重启需要兑现的操作都要落为持久化命令或记录，内存 Map、UI 选中态和事件监听器不能作为唯一事实来源；
- 伴生视图优先建立明确的会话作用域，再开放编辑、继续生成和分支操作；在此之前提供只读伴生视图，避免为了复用组件而误写主会话；
- 暂未有执行器生产者的 `stale`、`attention`、`paused` 等字段仅作为内部预留模型，UI 不把它们包装成可执行承诺；
- 完成功能时同步更新本计划的“已交付 / 尚未交付 / 验收”记录，确保施工状态与设计目标可追溯。

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
- `conversationId`：`sub-agent` 兼容层的续聊别名；现在由 `SubAgentRegistry` 持久化为 `conversationId → agentId + childSessionId` 索引，但它仍不是任务主键，也不能单独恢复一次正在执行的任务。
- `childSessionId`：完整聊天记录的存储 ID，是会话恢复与任务中心打开子会话的稳定关联；索引命中但会话不可用时，续聊会明确失败并要求创建新对话。
- `parentSessionId`：发起调用时的主会话 ID。无当前主会话的后台调用允许为空，不能用空字符串伪装成有效会话。
- `parentTaskId`：子任务由另一个后台任务调度时建立的关系；当前仍限制单层委托。
- `executionLaneKey`：同一 `childSessionId` 的生成与追加消息必须进入同一执行 lane；当前由 `SubAgentRegistry` 提供进程内串行实现，后续 runtime adapter 仍需复用该键。

任务、会话和续聊别名是三个不同层次：任务描述“这一次运行”，会话保存“全部对话”，别名只负责兼容现有工具调用。任何需要跨重启恢复的能力都必须依赖持久化的会话索引，而不能只依赖 `conversationId`。

### 3.2. 任务状态与观察状态

当前可依赖的状态流转：

```text
created → queued → running → completed / failed / cancelled / interrupted
created → running → completed / failed / cancelled / interrupted
```

`queued` 只表示同一子会话已有生成占用进程内 execution lane，等待当前轮次释放；排队中的任务可以取消，取消不会中止正在运行的其他任务。`waiting_input`、`awaiting_approval`、`paused` 仍为协议预留，尚无等待点、审批路由和幂等控制。

`stale` 也不是静态字段一出现就成立的能力。只有存在持续 heartbeat/watchdog，并定义阈值、清除条件和与 `interrupted` 的转换规则后，才可以对外暴露“可能停滞”。当前实现没有独立 watchdog；重启恢复时写入 `runtime_heartbeat_lost` 只是明确说明“上次运行已丢失”，不能据此推导运行中的任务已经停滞。

`cancelled` 表示取消请求已被 registry 接受，并触发当前执行器的 best-effort abort；它不是对底层模型、工具或外部副作用的强制回滚保证。终态保护仍然有效：后续旧执行回调不能把任务改回成功或失败。

### 3.3. 所有权与执行 lane

- `owner` 是权限字段，表达谁可以查询或控制任务；`callerAgent` / `targetAgent` 只表达调用关系和展示身份，不能代替权限判断。
- 一个 `childSessionId` 同时只允许一个生成轮次持有执行权。追加用户指导、Agent 追加指令和继续对话与生成共享同一个 lane，取消仍通过任务状态和该会话的 abort 句柄关联，避免多个后台任务并发写入同一消息树。
- 当前 `send_task_message` 明确是 append-only：消息追加与同一 child session 的生成共享 execution lane，但不会自动启动生成；`delivery` 仅为旧调用方保留，不再代表已兑现的时机承诺。
- 真正的 `enqueue_task_message` 仍待执行器队列契约补齐后实现，不能用 append-only 接口冒充下一轮投递。
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
  executionLink?: TaskExecutionLink;

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

### 4.2. 可续投递、执行链与可靠通知模型

`send_task_message` 保留为只追加到子会话的轻量接口；需要影响执行时，调用方使用独立的 `enqueue_task_message`。两者分别表达“保存一条消息”和“请求调度一次后续执行”，不能共用一个含糊的成功结果。

```ts
export type TaskMessageDelivery =
  "append_only" | "next_turn" | "after_current_step";

export interface QueuedTaskMessage {
  deliveryId: string;
  sourceTaskId: string;
  childSessionId: string;
  executionLaneKey: string;
  messageNodeId: string;
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

约束：

- 追加消息先写入 `childSessionId` 的消息树，并保存 `messageNodeId`、`origin` 与用户档案快照；队列记录引用该节点，从而让消息身份、会话导出和恢复后的执行读取同一份事实；
- `next_turn` 在当前 lane 空闲后创建一个新的 follow-up task，并以 `continuationOfTaskId` 关联原任务；新的任务读取已保存消息节点发起生成；
- `after_current_step` 由 task runner 在工具调用、审批返回或模型轮次的安全点消费。安全点前保持 `waiting_safe_point`，不会抢占或截断正在进行的工具操作；
- `deliveryId + idempotencyKey` 是跨重启和重复请求的去重依据。重复调用返回原队列记录或原 follow-up task；
- 队列、执行链和通知队列持久化在 runtime-neutral storage 中。消息节点丢失、会话不可读或执行器拒绝时，记录明确失败原因并保留可处理入口；
- 父会话可用时，通知投影为 `system_event` 消息；父会话未加载时通知停留在队列，加载、任务中心和主会话工具卡片都可补发或确认。

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

Phase 4 在 runner 与持久化队列到位后扩展以下 Agent-facing 方法：

```text
enqueue_task_message(taskId, message, { delivery: "next_turn" | "after_current_step", idempotencyKey? })
get_task_delivery(deliveryId)
pause_task(taskId, requestId)
resume_task(taskId, requestId)
retry_task(taskId, idempotencyKey?)
interrupt_task(taskId, requestId, reason?)
resolve_task_approval(taskId, requestId, decision)
```

`enqueue_task_message` 成功仅表示队列记录已持久化；返回值包含 `deliveryId`、当前 delivery state、消息节点引用和已知的 follow-up task。`get_task_delivery` 用于查询投递、消费、失败与重试结果。控制类方法通过 `requestId`、owner/capability 与幂等键校验当前执行尝试，过期请求返回可读的当前状态。

未来需要跨 runtime 时，再增加 `background_task.*` transport 协议：协议必须包含 owner、runtime generation、执行 lane、幂等 requestId 和可恢复的事件/快照游标；不能直接把当前 in-process `subscribe` 改名为 IPC 事件流。

### 5.2.1. 后续 runtime adapter 的完整职责

Phase 4 的 task runner 以可替换 adapter 形式承接主进程、Hidden WebView、Rust command 或 Node.js sidecar。载体可以按部署条件选择，以下能力属于统一契约：

```text
start(taskId, requestId)
abort(taskId, requestId, reason?)
pause(taskId, requestId)
resume(taskId, requestId)
enqueueTaskMessage(deliveryId)
inspect(taskId)
recover(runtimeGeneration)
subscribeSnapshot(cursor?)
```

- runner 持有当前 execution lane、请求句柄、工具安全点和 heartbeat；registry 保留快照、队列、执行链与通知记录；
- 所有控制命令携带 `taskId`、`requestId`、owner/capability 和幂等键。过期回调只能写入仍持有该请求句柄的尝试；
- `recover()` 读取持久化执行记录、消息树和队列后，为每项未决工作选择继续、重试、转为 `interrupted` 并提供重试入口，决策及其依据写入活动记录；
- `subscribeSnapshot(cursor?)` 使用“先快照、后增量”语义。cursor 不连续、runtime generation 变化或跨窗口重连时自动重新读取快照；
- watchdog 根据 heartbeat、`lastProgressAt`、当前操作类型和安全点状态生成 `stale`。恢复进展、完成、暂停或终止时清除对应标记；
- 审批和等待输入由 runner 产生带 `requestId` 的状态与活动，控制端通过同一命令链回复，避免 UI 直接改写任务快照。

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

> **当前实现边界（Phase 3 主体已落地，伴生视图验收待修复）**：任务中心、打开子会话、标题栏活动胶囊、查询状态/活动、取消任务、append-only 补充指导、工具调用消息中的任务关系卡片、伴生视图外壳（宽屏侧栏 / 窄屏画中画）以及派遣卡片的活动时间轴、叫停、插话均已接线；会话作用域契约随本次交付。伴生视图当前仍存在外置 Header 布局下可见消息操作栏，以及快速切换目标时异步加载结果覆盖的问题，暂不满足“严格只读、始终对应当前 childSessionId”的验收条件。当前轮自动投递、强制中断与审批条待 Phase 4/5 执行器与控制契约。

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

在主会话中，子智能体调用以派遣卡片（[`BackgroundTaskDispatchLink.vue`](src/tools/sub-agent/components/BackgroundTaskDispatchLink.vue:1)）呈现，并充分使用现有消息头部与身份识别资产：

1. **复用 `MessageHeader` 动态身份映射**：
   - 派遣卡片直接复用 [`useResolvedAgentAvatar`](src/tools/llm-chat/composables/useResolvedAgentAvatar.ts:1) 解析逻辑，支持响应式图谱、预设与 AppData 协议转换；
   - **任务关系头部（派遣卡片）**：并列显示 `[调度方 Agent 头像+名字] → [子 Agent 头像+名字]`，让任务卡片一眼呈现派遣关系；
   - **外置头像布局适配**：在气泡模式且设置 `avatarPlacement: outside` 时，派遣卡片根节点外露子 Agent 头像，与标准 `ChatMessage.vue` 视觉流完全拉齐。
2. **生命力微动效与阶段流水**：
   - **状态指示器**：复用 `MessageHeader` 中的 `message-status` 胶囊（旋转小圆圈、等待中、完成勾选），结合呼吸光晕表现运行态；
   - **操作流水胶囊（Activity Ticker）**：单行轮播最近操作（例如 `正在查阅: src/utils/logger.ts`），点击可向下平滑展开微抽屉时间轴。
3. **卡片内微介入操作（Inline Steer）与伴生透视切换**：
   - 卡片底部集成快捷操作条：
     - **互斥透视按钮组**：提供「侧栏透视」（`PanelRight`）与「悬浮透视」（`PictureInPicture2`）两个显式切换按钮（详见 §6.2.1 互斥状态机规范）；
     - **「叫停（Halt）」**：紧急打断执行（二次确认防误触）；
     - **「插话（Whisper）」**：卡片内原地展开便签输入框（**严格遵循 Ctrl+Enter 发送规范，单回车仅换行，防止误发**）。

### 6.2. Level 2：伴生视窗 —— 互斥双模透视与 100% 结构性让位

用户需要细看子 Agent 完整的执行流与推理细节时，直接复用现有的 `MessageList.vue`。

**重要交互原则修订**：

> 彻底废除“根据屏幕宽度/断点自动猜测并退化为画中画”的不确定性设计。用户在桌面工作区的心智是明确的：直接提供「侧栏分栏」与「悬浮窗」两种显式透视按钮，由用户根据当前多任务意图自主选择。
> 两种打开方式在逻辑上**严格互斥**（打开一种自动关闭另一种），且按钮具有**状态切换式持久激活高亮**。

#### 6.2.1. 互斥透视状态机与操作按钮规范

在派遣卡片（`BackgroundTaskDispatchLink.vue`）、任务详情页（`BackgroundTaskDetail.vue`）以及标题栏浮层中，统一部署伴生透视控制组：

```text
[ 侧栏透视 (PanelRight) ]   [ 悬浮透视 (PictureInPicture2) ]
```

1. **互斥状态机逻辑**：
   - 初始态：`isOpen = false`，两按钮均无激活态；
   - 点击「侧栏透视」：
     - 若当前未开启或正处于悬浮态，则切换为 `isOpen = true, mode = "sheet"`，同时自动关闭悬浮窗；
     - 若当前已处于侧栏态（同一任务），则再次点击表示收起，置为 `isOpen = false`；
   - 点击「悬浮透视」：
     - 若当前未开启或正处于侧栏态，则切换为 `isOpen = true, mode = "pip"`，同时自动收起侧栏；
     - 若当前已处于悬浮态（同一任务），则再次点击表示关闭，置为 `isOpen = false`；
   - 切换不同任务：若伴生视图已处于开启态（如侧栏），点击任务 B 的「侧栏透视」，保持侧栏开启并就地装载任务 B 的会话。
2. **按钮高亮对齐规范**：
   - 对齐 [`CodeBlockHeader.vue`](src/tools/rich-text-renderer/components/nodes/code-block/CodeBlockHeader.vue:24) 的 `.action-btn-active` 规范；
   - 当 `isOpen && targetTaskId === currentTaskId && mode === 'sheet'` 时，「侧栏透视」按钮赋予 `.action-btn-active` 类名；
   - 当 `isOpen && targetTaskId === currentTaskId && mode === 'pip'` 时，「悬浮透视」按钮赋予 `.action-btn-active` 类名；
   - 激活样式：
     ```css
     .action-btn-active {
       color: var(--primary-color);
       background-color: color-mix(
         in srgb,
         var(--primary-color) 16%,
         transparent
       );
       border-color: var(--primary-color);
     }
     ```

#### 6.2.2. DOM 挂载拓扑与布局结构性让位（杜绝 Fixed 强行覆盖）

严禁使用 `position: fixed` 将伴生侧栏强行浮动覆盖在右侧遮挡主对话内容。必须实现结构性 Flex 挤压让位：

```text
ChatArea.vue
 └─ .main-content (display: flex; flex: 1; min-width: 0;)
     ├─ .chat-content (flex: 1; min-width: 0; flex-direction: column;)
     │   ├─ .message-list-wrapper (MessageList)
     │   └─ .chat-message-input (MessageInput)
     └─ CompanionSessionSheet (侧栏形态挂载点，作为 .chat-content 同级兄弟)
         (width: 420px; flex-shrink: 0; border-left: 1px solid var(--border-color);)
```

1. **侧栏分栏（Companion Sheet）的宿主归位与槽位解耦**：
   - 详细解耦与靶点实现计划详见独立方案：[`chat-companion-dock-slot.md`](src/tools/sub-agent/docs/Plan/chat-companion-dock-slot.md:1)；
   - 宿主侧由 [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue:520) 内部的 `.main-content` 容器提供标准伴生分栏外壳（`.chat-companion-dock`）与 DOM 靶点（`#chat-companion-dock-slot`），天然掌控 Flex 挤压收缩动画与调宽手柄；
   - `sub-agent` 侧通过定向 Teleport 注入，实现 100% 结构性 Flex 让位且保持两个模块间零代码耦合；
2. **画中画悬浮窗（Floating PiP）的全局宿主**：
   - 画中画需要支持用户在切换到其他页面（如资产管理器、设置）时依然能够悬停透视，因此悬浮窗组件继续挂载在应用顶层 [`TitleBar.vue`](src/components/TitleBar.vue:1)（`Teleport to body`）；
   - 使用 [`DraggablePanel`](src/components/common/DraggablePanel.vue:66) 承载，启用毛玻璃（`backdrop-filter: blur(var(--ui-blur))`）与视口吸附，记住拖拽位置。

#### 6.2.3. 严格只读能力防线（Strict Readonly Guard）

为彻底杜绝伴生视图因复用 `MessageList` 而误写子会话数据的风险，建立三层只读防线：

1. **属性契约（Props Contract）**：
   - `MessageList.vue` 显式接受 `readonly?: boolean` prop（伴生视图中固定传入 `readonly="true"`）；
   - 当 `readonly === true` 时，`MessageList` 及其子组件全面下发只读指令；
2. **操作工具栏隐匿（Menubar Suppression）**：
   - 修复现有漏传漏洞：无论外置 Header 分支还是气泡内部，当 `readonly` 或 `screenshotMode` 为 true 时，一律强制隐藏编辑、删除、分支定位、继续生成等写操作菜单；
3. **事件拦截与断流（Event Interception）**：
   - 伴生视窗内部**不监听** `MessageList` 冒泡的任何写事件（如 `@edit-message`、`@delete-message`、`@branch-switch` 等）；
   - 通过 Vue `provide` 注入 `isSessionReadOnly: true` 上下文，子组件内有写请求时直接被拦截降级，严禁调用 `useLlmChatStore` 的任何变更接口。

#### 6.2.4. 异步加载版本守卫（Load Version Guard）

针对快速在任务 A、B 之间切换导致旧请求覆盖新数据的异步时序缺陷，`useCompanionSession.ts` 必须加入版本号追踪机制：

```ts
let currentLoadVersion = 0;

async function loadSessionData(): Promise<void> {
  const thisVersion = ++currentLoadVersion;
  const sessionId = childSessionId.value;
  // ...
  const detail = await store.ensureSessionDetailLoaded(sessionId);
  // 加载完成后进行版本与会话双重校验
  if (
    thisVersion !== currentLoadVersion ||
    childSessionId.value !== sessionId
  ) {
    logger.debug("丢弃已过期的伴生会话异步加载结果", {
      thisVersion,
      currentLoadVersion,
    });
    return;
  }
  // 确认版本一致后再写入 sessionIndex / sessionDetail / messages
}
```

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
| **顺口叮嘱 (Steer / Whisper)** | 补充要求或轻微纠偏（如“记得用 TypeScript 严格模式”） | 卡片底部“插话”便签   | 任务中心详情内原地展开文本框；当前 append-only 接口会在同一会话的生成结束后写入消息，提示用户“供后续对话查看”；**使用 Ctrl+Enter 追加，单回车换行**。                           |
| **紧急叫停 (Halt & Takeover)** | 发现死循环、高危工具或严重跑偏                       | 卡片右上角制动按钮   | 立即终止当前 step 执行，状态置为 `interrupted`。卡片转为“已接管”形态，允许用户重新发起轮次或就地编辑。                                                                          |
| **敏感审批 (Approval)**        | 子 Agent 触发了高危工具操作                          | 卡片内原地浮起审批条 | 复用现有 [`ToolCallingApprovalBar.vue`](src/tools/llm-chat/components/message-input/ToolCallingApprovalBar.vue:130) 设计规范，展开参数 Diff，支持“单次放行”、“拒绝并告知原因”。 |

Phase 3 先提供 append-only 的补充指导输入；当前轮次不会读取追加消息，后续执行器队列契约落地后再提供自动投递。Phase 4 在具备可中断执行、`requestId` 路由与权限校验后提供紧急叫停和敏感审批。这里的“已接管”是卡片展示语义，持久化状态为 `interrupted`，并追加一条 `user_intervention` 活动记录；接管权属由任务控制字段补充。

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

### Phase 3：消息来源、会话作用域与执行 lane（主体已落地，伴生视图验收待修复）

本阶段完成身份、任务关系和安全透视的基础，不以简化 UI 或复用现有全局会话操作替代会话作用域：

1. 为任务增加明确 `owner` 与 `executionLaneKey`，把同一 `childSessionId` 的生成、追加消息和取消串行化；（已完成基础接入）
2. 持久化 `conversationId → agentId + childSessionId` 的会话索引，明确跨重启续聊失败/恢复语义；（已完成索引与失败边界）
3. 将消息来源从“消息类型”改为“调用上下文派生”：用户介入是 `user/user_intervention`，调度 Agent 指令是 `agent/sub_agent`；（已完成追加消息与本轮消息 metadata 接入）
4. 已完成 `MessageList` 的会话作用域契约，分支、编辑、删除、继续生成等操作均可绑定到传入的 `sessionDetail.id`；宽屏 Companion Sheet 与窄屏 `DraggablePanel` 画中画已挂载。伴生视图的严格只读验收仍待修复：外置 Header 的 `ChatMessage` 分支漏传 `screenshotMode`，会露出可写操作；异步加载还缺少目标版本校验，快速切换任务时旧请求可能覆盖当前目标会话；
5. 完成主会话派遣卡片的任务关系、实时状态、最近活动入口、打开伴生视图和任务中心入口。卡片内控制只展示已经兑现语义的操作；
6. 保持 `send_task_message` 的 append-only 明确语义与真实来源渲染。`enqueue_task_message` 的持久化队列和执行消费由 Phase 4 task runner 交付，避免在缺少安全点与恢复机制时伪造投递成功。

### Phase 4：可恢复运行时与有效介入

- 将执行权从 `llmChatService` 适配为明确的 task runner/lane，建立 heartbeat、watchdog、requestId 和可恢复执行记录；
- 交付 `enqueue_task_message`：支持 `next_turn` 与 `after_current_step`，持久化 delivery、消息节点引用、幂等键和 follow-up task 链；
- 运行时重建时根据执行器句柄、会话状态和持久化队列选择继续、重试或转为 `interrupted`，每种结果提供可追溯活动和后续操作入口；
- 定义 pause/resume/interrupt/retry 的幂等语义，以及工具审批和等待输入的 requestId 路由；
- 将快照、事件游标和控制命令抽象为可替换 transport，接入符合桌面部署条件的 Hidden WebView、Rust command 或 Node.js sidecar adapter；
- 构建父会话结果与 attention 的可靠通知队列，实现已加载会话即时投影和未加载会话后续补发。

### Phase 5：多层编排与安全控制

- 通过任务深度和 capability 管理多层委托，并维护 parent task、continuation、retry、takeover 的执行链；
- 落地紧急叫停、“已接管”、敏感审批和恢复后的权限复核；
- 在所有 runtime adapter 上保持一致的 snapshot / command / event / notification 契约；
- 对调度、投递、重试、审批和通知补发提供可审计活动记录与最小必要的用户可行动入口。

### 9.1. 完整功能回补验收

以下场景与 Phase 3-5 对应，作为完整方案的功能验收，避免阶段施工把用户能力长期停留在“仅能看到”：

- 用户在任务运行期间选择 `next_turn` 追加指导后，系统持久化该 delivery；当前 lane 释放时创建关联的 follow-up task，子 Agent 在新轮次读取该消息并保留用户身份；
- 用户选择 `after_current_step` 时，任务在工具或模型轮次安全点消费消息；活动记录展示等待、投递、follow-up task 与失败原因；
- 进程重启发生在生成、队列等待或通知待投影期间时，runner 依据持久化执行记录恢复队列和未决通知，并给每项工作提供继续、重试或中断后的可行动入口；
- 主会话未加载时，终态和 attention 通知仍进入可靠队列；用户随后打开任务中心或父会话时能看到且只收到一次对应投影；
- 宽屏用户可在主会话旁边查看只读子会话，窄屏可打开画中画；后续启用编辑或继续生成时，所有操作只作用于该伴生会话；
- watchdog 触发后展示可解释的停滞原因；审批、暂停、恢复、紧急叫停和接管均通过带 requestId 的幂等控制命令完成；
- 任务链中每次续投递、重试和接管都拥有独立 taskId，并可从任意一项回溯初始委托、相关会话和完整执行链。

## 10. 下一步建议

下一步沿着完整功能链补齐基础契约，阶段性边界服务于后续能力回补：

1. 完成 `MessageList` 会话作用域并交付只读伴生视图，保持主会话与子会话的操作边界；
2. 落地 runtime-neutral 的 queued delivery、执行链和通知队列数据模型，明确消息节点引用、幂等键、delivery 状态和 follow-up task 关系；
3. 抽取 task runner/lane，接管 generation、工具安全点、cancel、heartbeat 和 requestId；
4. 用 runner 消费 `enqueue_task_message`，实现下一轮与当前步骤后的真实投递，以及重启后的队列恢复；
5. 在统一 command/event/snapshot 契约上交付暂停、恢复、重试、审批、紧急叫停、接管和可靠通知。

当前主链路已完成的观察、查询、取消与身份呈现继续保持；后续施工以 §9.1 的有效介入、恢复、持续透视和可靠到达场景为完成标准。

## 11. 行为验收场景

当前阶段只验收已经存在且可定位的行为：

- `ask({ mode: "background" })` 返回任务 handle，父 Agent 可以继续执行；
- 任务中心和 `get_task_status` 能看到同一个任务快照，活动变化后重新读取即可得到最新状态；
- 后台任务创建与运行不会切换父 Agent 的当前生成上下文；当前“打开子会话”是显式会话跳转，Phase 3 伴生视图完成后提供不离开主工作区的透视；
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

### 12.3. Phase 3 基础服务契约（已完成；伴生视图验收待修复，2026-09-24）

#### 已交付

- `BackgroundTaskSnapshot` 与 `CreateBackgroundTaskInput` 增加 `owner` 和 `executionLaneKey`；旧持久化快照恢复时按 `callerAgent` 与 `childSessionId` 补齐兼容值。
- `SubAgentRegistry` 持久化 `conversationId → agentId + childSessionId` 索引；指定旧 `conversationId` 但子会话不可用时明确失败，不悄悄创建同名新会话。
- 同一 `childSessionId` 的前台/后台生成与 `send_task_message` 追加操作共享进程内串行 lane。
- `send_task_message` 收敛为 append-only；消息来源依据调用上下文派生，并写入追加节点、活动记录与本轮消息 metadata。`user_intervention` 追加消息保存用户档案名称与头像快照。
- `MessageHeader` 与气泡外置头像按 `origin` 显示调度 Agent 与用户身份；阅读型 Markdown 导出使用来源名称，JSON 备份沿用原始 metadata。
- 任务中心提供仅在活动任务可用的补充指导输入；Ctrl+Enter 写入子会话并保留用户档案来源，明确提示需要后续对话读取。默认详情优先展示状态、活动与可操作入口。
- `ask` 的工具调用返回标准 `ToolMethodResult` 信封，任务与子会话关系写入工具节点的 `resultMetadata`；主会话工具卡片从该结构化关系读取快照并显示双方身份、状态、摘要和打开子会话入口。直接调用 `ask` 仍返回 JSON 字符串。
- 会话作用域契约、伴生视图外壳（宽屏侧栏 / 窄屏画中画）与派遣卡片的活动时间轴、叫停、插话已接线。伴生视图仍待完成严格只读与目标会话一致性修复，详见 §12.7。

#### 尚未交付（转 Phase 4/5）

- `enqueue_task_message` 的真实下一轮/当前步骤后投递、队列恢复与 follow-up task 链；当前实现不会由 `send_task_message` 自动触发生成。
- task runner / heartbeat / watchdog / pause / resume / interrupt / retry、审批与等待输入的 `requestId` 路由。
- 可靠父会话通知队列与 attention 投影补发。
- `resultMetadata.backgroundTask` 的自包含关系快照（T3.4）与伴生视图的写操作。

#### 验证

- `bun run check:frontend`
- `bun run test:run -- src/services/__tests__/backgroundTaskRegistry.test.ts`
- 2026-09-24 追加：T1/T2/T3 交付后的验证记录见 §12.7。

#### 伴生视窗阻塞记录（已解除，2026-09-24）

本节原描述的阻塞已通过 T1 会话作用域契约与 T2 只读伴生视图解除：`MessageList` 的消息操作现可显式绑定到传入的 `scopeSessionId`，主会话保持选中时也能安全渲染子会话。以下保留原阻塞分析与设计依据：

`MessageList.vue` 虽接收 `sessionIndex`、`sessionDetail` 和 `messages`，但其分支定位、同胞查询、删除、编辑、继续生成等事件仍直接调用 `useLlmChatStore()` 的当前会话方法。主会话保持选中时把子会话 props 交给第二个 `MessageList`，交互会作用到主会话；直接挂载完整伴生视窗存在改错会话数据的风险。

解决路径即 T1：把 `MessageList` 的这些操作显式绑定到传入的 `sessionDetail.id`，并先交付明确只读的独立子会话视图（T2）。首版保留“打开子会话”跳转作为次级操作。执行器队列、恢复与审批仍需独立契约设计（Phase 4）。

### 12.4. 施工复盘后的设计结论

Phase 1/2 的偏差已转化为设计约束：当前链路以进程内快照为事实来源，任务恢复只恢复观察；`conversationId` 已有持久化索引但不具备执行恢复能力；消息追加不等于调度执行；父会话通知不具备可靠投递保证。后续实现按 §9 的 Phase 3/4/5 重新拆分，不再以原 §5.2 的 runtime/IPC 草案作为当前实现验收标准。

### 12.5. 功能目标回补记录（2026-09-24）

本次更新补全了施工复盘后容易被阶段性边界掩盖的完整功能目标，并为每项能力明确了承接位置：

- `enqueue_task_message`、安全点投递、follow-up task、delivery 去重与队列恢复归入 Phase 4；
- task runner、heartbeat/watchdog、pause/resume/interrupt/retry、审批路由与 runtime recovery 归入 Phase 4；
- 可靠通知队列在 Phase 4 落地基础投影，并在 Phase 5 扩展到多层编排与恢复后的权限复核；
- Companion Sheet、PiP 和会话作用域改造归入 Phase 3，交付顺序为只读视图再到完整会话操作；
- 派遣卡片保留为主会话就地感知和操作入口，卡片控制随底层命令语义逐项开放。

本记录只补充设计与验收范围，当前“已交付 / 尚未交付”仍以 §12.3 的施工状态为准。

### 12.6. Phase 3 剩余施工任务清单（2026-09-24 规划，已施工）

> 目的：把 §12.3「尚未交付」与「伴生视窗阻塞记录」拆成可独立派发、可验证的施工单元。
> 依赖顺序：T1 先行 → T2 依赖 T1；T3 与 T1 并行（T3.2 的 Peek 需等 T2）。
> 施工边界：所有改动只兑现已明确的服务端语义；`send_task_message` 仍为 append-only，不伪造下一轮投递。
> 完成状态：T1、T3.1、T3.2 与 T4 已交付；T2 的伴生视图外壳已接线但严格只读与目标会话一致性验收待修复；T3.3 仅完成运行态圆点，身份头像与外置头像目标未完成；T3.4 未实施。施工记录与偏差见 §12.7。

#### T1 会话作用域契约（只读基础，先行）

- [x] T1.1 `sessionLifecycleManager` 导出 `ensureSessionDetail`，`llmChatStore` 暴露按会话 id 的只读 API：
      `getSessionIndexById(sessionId)`、`getSessionDetailById(sessionId)`、`getActivePathBySessionId(sessionId)`、`ensureSessionDetailLoaded(sessionId): Promise<ChatSessionDetail | null>`。
      契约：不改变 `currentSessionId`；detail 缺失时按需加载；加载失败返回 `null`，不抛出。
- [x] T1.2 store 提供按会话作用域的图查询：`getSiblingsInSession(nodeId, sessionId)`、`isNodeInActivePathInSession(nodeId, sessionId)`、`reparseNodeToolsInSession(nodeId, sessionId, options?)`；现有无 `sessionId` 版本行为保持不变（回退当前选中会话）。
- [x] T1.3 `MessageList.vue` 接受可选 `scopeSessionId`；`getSiblings` / `isNodeInActivePath` / `reparseNodeTools` 在传入时使用作用域版本；写操作显式传 `sessionDetail.id`，不再只依赖 nodeId 兜底。
- [x] T1.4 `MessageMenubar.vue`（`recalculateNodeTokens`、`ExportBranchDialog` 的 session 参数）与 `MessageDataEditor.vue`（按 id 读取节点）去除对 `currentSessionDetail` / `currentFullSession` 的隐含依赖，改按作用域读取。

#### T2 只读伴生视图（依赖 T1）

- [x] T2.1 `useCompanionSession` 单例状态：`targetTaskId` / `childSessionId` / `mode: "sheet" | "pip"` / `visible` 与打开、关闭、切换模式方法。
- [~] T2.2 `CompanionSessionSheet.vue`：宽屏（>1100px）右侧滑出、按 `childSessionId` 挂载 `MessageList` 的外壳已实现；严格只读验收未完成。`headerPlacement: outside` 的 `ChatMessage` 分支漏传 `screenshotMode`，会显示消息操作栏；异步加载未校验目标版本，快速切换任务时旧请求可能覆盖当前会话数据。
- [~] T2.3 窄屏 / 独立悬浮：`DraggablePanel`、毛玻璃背景与同一 `MessageList` 挂载已实现；继承 T2.2 的严格只读和目标会话一致性问题，暂不作为完成验收。
- [x] T2.4 入口接线：任务中心、派遣卡片、标题栏胶囊均可打开伴生视图；保留“跳转到完整会话”作为次级操作。

#### T3 派遣卡片补全（可与 T1 并行）

- [x] T3.1 活动时间轴（Activity Ticker 单行轮播 + 点击展开微抽屉），数据来自 `snapshot.recentActivity`。
- [x] T3.2 卡片内控制：透视 Peek（打开伴生视图，依赖 T2）、叫停 Halt（`cancel_task`，二次确认）、插话 Whisper（append-only，Ctrl+Enter 发送、单回车换行）。
- [~] T3.3 运行态呼吸圆点与双方身份文字已实现；头像仍使用 `resolveAgentAvatarPath`，未复用 `useResolvedAgentAvatar`，派遣卡片也未支持 `avatarPlacement: outside`。
- [ ] T3.4 `resultMetadata.backgroundTask` 扩展为携带 `state` 与双方身份快照，降低对即时快照的依赖（同步更新 `sub-agent.registry` 测试断言）。（未实施，卡片仍从 registry 快照读取）

#### T4 验证与记录

- [x] T4.1 `bun run check:frontend` 与 `bun run build:vite` 通过。
- [x] T4.2 `backgroundTaskRegistry` / `sub-agent.registry` 相关单测通过。
- [x] T4.3 施工摘要与偏差写回 §12.3 / §12.6。

### 12.7. Phase 3 剩余任务施工与验收记录（2026-09-24）

#### 交付物

| 任务组 | 提交        | 主要文件                                                                                                                                                                                             |
| :----- | :---------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | `18b074809` | `stores/session/sessionLifecycleManager.ts`、`stores/llmChatStore.ts`、`components/message/MessageList.vue`、`MessageMenubar.vue`、`MessageDataEditor.vue`、`ChatMessage.vue`、`ToolCallMessage.vue` |
| T3     | `e98681c6b` | `components/BackgroundTaskDispatchLink.vue`                                                                                                                                                          |
| T2     | `474f07ce1` | `composables/useCompanionSession.ts`（新增）、`components/CompanionSessionSheet.vue`（新增）、`components/BackgroundTaskDetail.vue`、`BackgroundTaskDispatchLink.vue`、`src/components/TitleBar.vue` |
| 规划   | `ddec35a6c` | 本文档 §12.6                                                                                                                                                                                         |

#### 已交付

- **伴生分栏槽位（2026-09-25）**：`ChatArea` 提供可持久化调宽的 `#chat-companion-dock-slot`，主聊天区通过同级 Flex 分栏让位；伴生视图在目标存在时定向 Teleport，目标缺失时回落 PiP。`TitleBar` 不再挂载该视图，主窗口与分离 ChatArea 窗口分别在自身上下文挂载消费方。- **会话作用域契约（T1）**：`llmChatStore` 提供 `getSessionIndexById` / `getSessionDetailById` / `getActivePathBySessionId` / `ensureSessionDetailLoaded` 与 `getSiblingsInSession` / `isNodeInActivePathInSession` / `reparseNodeToolsInSession`；`MessageList` 增加 `scopeSessionId`，作用域内的读写、分支与重解析显式绑定目标会话，旧的全局版本行为不变。伴生视窗不再依赖“先切换全局选中会话”。
- **伴生视图外壳（T2）**：`useCompanionSession` 按 `childSessionId` 装载 sessionIndex / sessionDetail / activePath；`CompanionSessionSheet` 在宽屏以右侧滑出侧栏、窄屏或独立悬浮以 `DraggablePanel` 承载 `MessageList`。应用级挂载在 `TitleBar`（`Teleport to body`），任务详情、派遣卡片、标题栏胶囊均可打开；既有“跳转到完整会话”路径保留。严格只读与目标会话一致性尚未验收。
- **派遣卡片主体（T3）**：运行态呼吸圆点（`prefers-reduced-motion` 降级）、Activity Ticker 与可展开活动时间轴、叫停（二次确认 + `cancelTask`）、插话便签（Ctrl+Enter、append-only）已实现。头像解析与外置头像仍未达到 T3.3 目标。

#### 尚未交付 / 待修复

- **Phase 3：伴生视图严格只读（P0 待修复）**。在 `MessageList.vue` 显式接入 `readonly: boolean` prop，全面补齐外置 Header 与气泡内部的写操作阻断，禁止任何分支露出编辑、删除、重生成等入口；
- **Phase 3：伴生视图目标一致性（P0 待修复）**。在 `useCompanionSession.ts` 中实现 `currentLoadVersion` 版本守卫，异步完成时若版本已过期直接丢弃，彻底消除任务切换串位缺陷；
- **Phase 3：双模透视入口与状态切换按钮（P0 待修复）**。派遣卡片与任务详情仍需提供「侧栏透视」与「悬浮透视」两个互斥按钮，激活状态对齐 `CodeBlockHeader.vue` 的 `.action-btn-active` 规范；分栏槽位与 Flex 结构性让位已于 2026-09-25 交付。
- **Phase 3：T3.3 身份视觉（P1 待修复）**。派遣卡片全面接入 `useResolvedAgentAvatar`，并在气泡模式 `avatarPlacement: outside` 下支持外置头像；
- **Phase 3：标题栏胶囊补全（P2 待修复）**。当前胶囊补齐子 Agent 迷你头像与任务列表内的快速定位跳转。
- `enqueue_task_message` 的真实下一轮/当前步骤后投递、队列恢复与 follow-up task 链（Phase 4）。
- task runner / heartbeat / watchdog / pause / resume / interrupt / retry、审批与等待输入的 `requestId` 路由（Phase 4）。
- 可靠父会话通知队列与 attention 投影补发（Phase 4/5）。
- T3.4：`resultMetadata.backgroundTask` 仍只携带 `{ taskId, childSessionId }`，卡片从 registry 快照读取状态与身份，未扩展为自包含关系快照。

#### 施工偏差与风险

1. **伴生分栏已结构性让位**：2026-09-25 起由 `ChatArea` 的同级 Flex 槽位承载，宽度动画收缩主聊天区；分离 ChatArea 窗口也会在自身上下文挂载消费方。
2. **严格只读当前失效**：`screenshotMode` 仅是 UI 级信号，且外置 Header 的 `ChatMessage` 分支漏传该信号，会露出编辑、删除、分支和生成等可写操作。修复前伴生视图只能视作带有已知写入风险的透视外壳。
3. **异步加载会话可能串位**：`loadSessionData()` 在异步加载完成后未确认目标仍是同一 `childSessionId`。用户快速从任务 A 切换到任务 B 时，A 的旧请求可能覆盖 B 的消息列表，造成任务标题、状态与会话内容不一致。
4. **伴生视图渲染配置回落**：未向 `MessageList` 传 `richTextStyleOptions` / `llmThinkRules`，使用其内部默认值，可能与子 Agent 自身配置不完全一致。
5. **实时刷新依赖任务事件**：伴生视图订阅 `backgroundTaskRegistry`（约 350ms 合并节流）触发刷新；子会话产生新消息但不产生任务活动事件时，需手动重开刷新。
6. **PiP 位置共享**：所有任务共用同一 `persistence-key="companion-session-pip"` 的悬浮位置/尺寸。
7. **T3.3 收窄**：沿用既有 `resolveAgentAvatarPath` 与卡片身份布局，未引入 `useResolvedAgentAvatar` 与 `avatarPlacement: outside`。
8. **标题栏胶囊为简化入口**：当前未渲染子 Agent 迷你头像，也没有快速取消、暂停或定位原派遣卡片；暂停属于 Phase 4，其他视觉与导航项需在后续 Phase 3 修订中决定是否回补。

#### 验证

- 第一波（T1 + T3）：`bun run check:frontend` 通过；`bun run build:vite` 通过；`backgroundTaskRegistry` + `llm-chat/stores` + `llm-chat/composables/ui` + `sub-agent` 共 6 文件 / 45 测试通过。
- 第二波（T2）：`bun run check:frontend` 通过；`bun run build:vite` 通过；`sub-agent.registry.test.ts` 4/4 通过。
- 2026-09-24 复核：`bun run test:run -- src/tools/sub-agent/__tests__/sub-agent.registry.test.ts` 4/4 通过。现有测试没有覆盖伴生视图的只读分支、异步切换乱序或任务事件之外的消息刷新。
- 已知预存在失败（与本阶段无关）：`llm-chat/config/__tests__/parameter-config.test.ts` 的 Gemini `includeThoughts` 用例。
- 2026-09-25 伴生分栏槽位：un run check:frontend 与 un run build:vite 通过。
