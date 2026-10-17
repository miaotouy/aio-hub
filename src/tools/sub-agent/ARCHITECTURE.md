# Sub-Agent 与后台任务系统：架构与设计规范

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/sub-agent`、`src/background-runtime`、`src/services/background-tasks`、`src/tools/llm-chat`、`src/tools/agent-manager`
> 参考方案：[`chat-companion-dock-slot.md`](./docs/Plan/chat-companion-dock-slot.md)、[`background-agent-observability-and-intervention.md`](./docs/Plan/background-agent-observability-and-intervention.md)、[`builtin-baseline-subagent.md`](./docs/Plan/builtin-baseline-subagent.md)（已实施）
> 相关架构：[工具自动审批仲裁](../../../docs/architecture/tool-approval-arbitration.md)

---

## 1. 系统定位与核心价值

`sub-agent` 工具模块是 AIO Hub 面向多智能体协同、异步长时间任务与后台长效自治运行的专项基础设施。

传统 LLM 对话以单会话为主，前台生成具有强阻断性，无法满足耗时长、步骤复杂、跨智能体协作以及在用户切换页面或关闭主窗口时持续运行的需求。`sub-agent` 与 `background-runtime` 组合解决了以下核心问题：

1. **会话与编排双轨解耦**：子会话聊天数据保存在标准的 `ChatSessionDetail` 中，任务调度、状态机与进度指标由 `BackgroundTaskRegistry` 与 `sub-agent.registry` 独立维护。
2. **全局可观测与实时透视**：支持在主界面任务中心（`BackgroundTaskCenter`）、标题栏胶囊以及 Chat 主工作区的伴生分栏（`chat-companion-dock-slot`）中实时透视子任务的完整消息流与活动时间轴。
3. **安全人工干预与叫停**：提供追加指导叮嘱（在下一个安全执行点消费）与紧急中止叫停的能力。
4. **后台长效运行时 Bridge**：通过 `src/background-runtime` 与 Tauri 后台无头 JS 运行时 Bridge，支持脱离前台 UI 视窗的后台独立生命周期执行。
5. **开箱即用与审批闭环**：内置基线子智能体按需释出（Materialization Pattern），模型晚绑定解析保证开箱可用；子任务工具调用统一经审批仲裁收口，后台任务承接人工审批与仲裁状态回放。

---

## 2. 核心架构图

```
┌─────────────────────────────────────────────────────────────┐
│                 主会话 / 调度 Agent                          │
│   调用 sub-agent 工具: ask / tell / cancel / status / ...   │
└──────────────────────────────┬──────────────────────────────┘
                               │ (VCP Tool Request)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│          SubAgentRegistry (src/tools/sub-agent)             │
│   conversationId 路由、子会话生命周期管理、参数与指令投递    │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│   BackgroundTaskRegistry     │ │    llmChatService          │
│   任务状态机、快照、持久化、通知│ │    子会话真实推理与工具执行│
└──────────────┬───────────────┘ └─────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│ 可观测性与交互层              │ │ Background JS Runtime (PoC)│
│ - BackgroundTaskCenter 面板   │ │ - src/background-runtime   │
│ - CompanionSessionSheet 分栏 │ │ - Tauri IPC Bridge 保活    │
│ - DispatchLink 卡片与时间轴   │ │ - 脱离前台窗口生命周期     │
│ - SubagentControlPanel 管理   │ └────────────────────────────┘
│ - BackgroundTaskDetail 审批   │
└──────────────────────────────┘
```

---

## 3. 核心概念与数据模型

### 3.1 关键标识 (Identifiers)

- **`taskId`**：单次后台任务执行尝试的唯一标识（格式通常为 `task_{timestamp}_{random}`），用于状态跟踪、观测与叫停。
- **`childSessionId`**：子会话的物理存储主键，由 `llm-chat` 管理，保存完整的消息节点树（`nodes`）与上下文。
- **`conversationId`**：工具层对外暴露的续聊别名，`SubAgentRegistry` 内部维护 `conversationId → agentId + childSessionId` 的持久化映射表。
- **`executionLaneKey`**：执行车道键（当前为 `childSessionId`），确保同一子会话内的多条消息和追加指令串行有序执行，避免并发污染。

### 3.2 子智能体配置契约 (`SubAgentConfig`)

定义于 `src/tools/agent-manager/types/agent.ts`：

- `enabled`：是否允许作为子智能体被调度（`DEFAULT_SUB_AGENT_CONFIG` 默认 `false`）；
- `modelBindingMode`：模型绑定偏好，`inherit_caller`（跟随父会话，默认）或 `prefer_self`（优先自身模型）；
- `maxDelegationDepth`：最大委托深度，默认 1，全局硬上限 `MAX_DELEGATION_DEPTH_LIMIT = 3`；
- `isBuiltinBaseline`：是否为系统内置基线子智能体（UI 标识）；
- `onlySubVisible`：仅作为子智能体可见（主聊天侧边栏列表中隐藏，默认 `false`）。

### 3.3 任务状态机 (Task State Machine)

```text
created ──► running ──► completed
   │           │   ├──► awaiting_approval ──► running (审批全部结算后恢复)
   │           │   ├──► failed
   │           │   ├──► cancelled (手动中止/叫停)
   │           │   └──► interrupted (重启恢复/异常中断)
   └──► queued (等待车道释放)
```

- **终态保护**：一旦进入 `completed` / `failed` / `cancelled` / `interrupted`，任何迟到的流式帧或执行回调均被丢弃，防止状态逆流。
- **持久化自愈**：应用崩溃或重启恢复时，未完成的任务自动被标记为 `interrupted`，并同步通知调度方。
- **审批等待**：子会话工具调用升级人工时任务进入 `awaiting_approval` 并标记 `attention`，全部未决审批结算后恢复 `running`（见第 5 节）。

### 3.4 内置基线子智能体释出

内置子智能体采用“随包预设 + 用户本地物理实体”的释出型模式。当前基线由 `public/agent-presets/builtin-subagent/config.json` 提供，并在 `src/config/agent-presets/index.ts` 的 `builtinPresets` 静态索引中注册；预设目录不会被运行时自动扫描。

`SubAgentBaselineService.ensureBaselineMaterialized()` 在 `list_available_agents()` 和 `ask()` 入口按需触发，执行以下契约：

1. 先加载用户本地 Agent 列表，以稳定 ID `builtin-subagent` 判断是否缺失；
2. 缺失时通过预设索引的 `configUrl` 读取配置，校验分类并强制基线配置为 `enabled: true`，以 `customId` 物理化创建 Agent；
3. 创建后调用 `ensurePresetAssetsImported()` 完成本地资源导入；已存在实体无论启用或禁用均绝不覆盖；
4. 用户删除实体后，下次触发才重新释出干净母版，删除等价于重置；用户修改或禁用实体不会被自动回滚；
5. 并发触发共享同一进行中的释出 Promise，完成后清空 Promise，以同时保证并发去重和删除后的再次释出。

释出后的 Agent 是可在智能体大厅管理的一等本地实体。`SubagentControlPanel` 展示所有带 `subAgentConfig` 的物理实体（包括禁用项），支持切换 `enabled`、`onlySubVisible`，并提供仅补全缺失基线的操作；该面板由 `BackgroundTaskCenter` 的子智能体配置视图挂载。主聊天侧边栏按 `onlySubVisible` 过滤，智能体大厅仍展示完整实体。

### 3.5 模型晚绑定与调度边界

`resolveSubAgentModel()` 在实际派发前检查 `enabledProfiles` 中的 Profile/Model 是否仍有效：

- `prefer_self` 且目标 Agent 自身绑定仍有效时，使用自身模型，来源为 `self`；
- 其他情况优先使用调用方父会话的有效模型，来源为 `caller`；
- 调用方模型不可用时回退到第一个启用 Profile 的首选模型，来源为 `fallback`；若系统没有可用 Profile/Model，则抛出明确的配置指引错误。

解析结果通过 `temporaryModel` 注入 `llmChatService.sendMessage()`，不要求预设携带具体 `profileId` / `modelId`。前台 `foreground` 与后台 `background` 两种模式均创建或复用 detached 子会话，并将递增后的 `delegationDepth` 透传到子会话；同一 `executionLaneKey` 内串行执行。自调用分身由深度链控制，最大深度按目标 Agent 配置读取并限制在 1～3。

---

## 4. 可观测性与伴生视图 (Companion View)

### 4.1 Chat 工作区伴生分栏槽位 (Companion Dock Slot)

- **定位**：`src/tools/llm-chat` 在主工作区右侧提供原生的平台级挂载槽位（`#chat-companion-dock-slot`）。
- **零依赖 Teleport 模式**：`ChatArea.vue` 不引入任何 `sub-agent` 业务代码，仅维护外壳宽度与动画；`CompanionSessionSheet.vue` 自主 Teleport 到该 DOM 靶点。
- **100% 结构性 Flex 让位**：伴生分栏展开时，主会话消息流自然挤压收缩，彻底告别遮挡式浮层抽屉；支持 360px ~ 720px 手柄拖拽调宽。

### 4.2 三重只读断流防线

透视子会话时复用 `llm-chat` 的 `MessageList` 核心组件，但在以下三个层面严格断流：
1. **属性只读**：传递 `readonly: true` 与 `isSessionReadOnly: true`，禁止行内编辑；
2. **菜单屏蔽**：隐藏重新生成、编辑、分支嫁接、删除等破坏性操作菜单；
3. **事件拦截**：子会话发送事件不绑定任何执行器，确保只读浏览不干扰子任务状态。

---

## 5. 后台任务与前台审批接续

子智能体的工具调用不另起一套后台审批协议。无论 `foreground` 还是 `background` 模式，子会话都复用 `llm-chat` 编排器并进入 `toolCallingStore.requestApproval()`；审批仲裁统一由 [`tool-approval-arbitration.md`](../../../docs/architecture/tool-approval-arbitration.md) 定义。该统一入口同时覆盖规则自动放行、JEV 仲裁、普通 LLM 审批、升级人工、超时和取消。

### 5.1 后台任务侧的归属与状态投影

- `BackgroundTaskApprovalBridge` 根据审批请求的 `childSessionId` 解析当前执行中的 `taskId`。同一子会话可能同时存在运行任务与排队任务，因此优先匹配该执行车道上实际执行的任务；无法唯一确定时放弃关联，避免误挂到排队任务；
- 仲裁进行中更新任务当前操作为审批，升级人工时将任务置为 `awaiting_approval`，设置 `attention: "awaiting_approval"`，追加 `approval_requested` 活动并投递可去重的 `approval_required` 通知；
- 审批结算后把最终决定、来源、引擎、风险、原因和模型证据写入任务快照的 `approvals`。一批审批全部结算后才恢复 `running`，终态任务不再回写；
- `taskId` 关联依赖活动执行车道和请求所属子会话，而不是假设同一子会话只有一个非终态任务。`requestId` 是审批请求、任务审计和通知幂等关联的主键。

### 5.2 前台人工处理边界

`BackgroundTaskCenter` 的 `BackgroundTaskDetail` 读取任务关联的未决审批和已结算审批历史。未决项展示实际工具参数、解析验证错误及仲裁意见，并直接调用 `toolCallingStore.approveRequest()` / `rejectRequest()`；因此用户无需切换到子会话，后台任务即可在前台完成接管。父会话的审批提示仍可作为通知入口，最终处理状态以共享审批 store 与后台任务快照为准。

任务中心只负责任务级可见性、人工操作和历史回放，不复制工具执行器、模型仲裁或工具安全策略。用户批准/拒绝后，原子会话中的审批请求继续沿同一编排链结算；迟到的仲裁结果遵循取消和终态保护，不能重新执行已结束任务。

### 5.3 双引擎仲裁契约

- **JEV**：通过既有问答接口输出风险、意图和裁决概率，按概率阈值决定自动批准、拒绝或升级人工；任务详情保留 JEV 动作及有效概率；
- **普通 LLM**：通过 `useLlmRequest().sendRequest()` 使用独立审批提示词和非流式请求，实际执行参数与工具说明以 JSON 数据传入，凭证字段和二进制载荷先脱敏；响应必须严格符合 `action / riskLevel / matchesUserIntent / explicitlyAuthorized / reason` 契约；
- 仅低风险且意图一致的普通 LLM 批准可自动执行；强制审批、外部来源限制、上下文超预算、格式异常或判断矛盾均升级人工。普通 LLM 的离散风险与授权判断、JEV 的概率证据及最终人工决定均写入审计；
- 前台审批条、消息卡片和 `BackgroundTaskDetail` 按仲裁引擎区分展示，但不改变共享的批准/拒绝语义。

---

## 6. 后台 JS 运行时 (Background JS Runtime Bridge)

位于 `src/background-runtime/`：
- **无头窗口生命周期**：由 Tauri 后台以 `background-js-runtime` 独立窗口启动，脱离前台主视窗的关闭与最小化影响。
- **IPC 通信协议**：定义 `BACKGROUND_JS_RUNTIME_EVENTS`（`request`, `response`, `ready`），通过心跳机制（`background_runtime_heartbeat`）与健康探测（`runtime.ping`）确保后台服务高可用。
- **演进目标**：逐步将重型长效任务、爬虫、定时工作流下沉至后台运行时独立执行。
