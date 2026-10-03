# Sub-Agent 与后台任务系统：架构与设计规范

> 状态：Active | 最后更新：2026-10-04  
> 关联模块：`src/tools/sub-agent`、`src/background-runtime`、`src/services/background-tasks`、`src/tools/llm-chat`  
> 参考方案：[`chat-companion-dock-slot.md`](./docs/Plan/chat-companion-dock-slot.md)、[`background-agent-observability-and-intervention.md`](./docs/Plan/background-agent-observability-and-intervention.md)

---

## 1. 系统定位与核心价值

`sub-agent` 工具模块是 AIO Hub 面向多智能体协同、异步长时间任务与后台长效自治运行的专项基础设施。

传统 LLM 对话以单会话为主，前台生成具有强阻断性，无法满足耗时长、步骤复杂、跨智能体协作以及在用户切换页面或关闭主窗口时持续运行的需求。`sub-agent` 与 `background-runtime` 组合解决了以下核心问题：

1. **会话与编排双轨解耦**：子会话聊天数据保存在标准的 `ChatSessionDetail` 中，任务调度、状态机与进度指标由 `BackgroundTaskRegistry` 与 `sub-agent.registry` 独立维护。
2. **全局可观测与实时透视**：支持在主界面任务中心（`BackgroundTaskCenter`）、标题栏胶囊以及 Chat 主工作区的伴生分栏（`chat-companion-dock-slot`）中实时透视子任务的完整消息流与活动时间轴。
3. **安全人工干预与叫停**：提供追加指导叮嘱（在下一个安全执行点消费）与紧急中止叫停的能力。
4. **后台长效运行时 Bridge**：通过 `src/background-runtime` 与 Tauri 后台无头 JS 运行时 Bridge，支持脱离前台 UI 视窗的后台独立生命周期执行。

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
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 3. 核心概念与数据模型

### 3.1 关键标识 (Identifiers)

- **`taskId`**：单次后台任务执行尝试的唯一标识（格式通常为 `task_{timestamp}_{random}`），用于状态跟踪、观测与叫停。
- **`childSessionId`**：子会话的物理存储主键，由 `llm-chat` 管理，保存完整的消息节点树（`nodes`）与上下文。
- **`conversationId`**：工具层对外暴露的续聊别名，`SubAgentRegistry` 内部维护 `conversationId → agentId + childSessionId` 的持久化映射表。
- **`executionLaneKey`**：执行车道键（当前为 `childSessionId`），确保同一子会话内的多条消息和追加指令串行有序执行，避免并发污染。

### 3.2 任务状态机 (Task State Machine)

```text
created ──► running ──► completed
   │           │   ├──► failed
   │           │   ├──► cancelled (手动中止/叫停)
   │           │   └──► interrupted (重启恢复/异常中断)
   └──► queued (等待车道释放)
```

- **终态保护**：一旦进入 `completed` / `failed` / `cancelled` / `interrupted`，任何迟到的流式帧或执行回调均被丢弃，防止状态逆流。
- **持久化自愈**：应用崩溃或重启恢复时，未完成的任务自动被标记为 `interrupted`，并同步通知调度方。

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

## 5. 后台 JS 运行时 (Background JS Runtime Bridge)

位于 `src/background-runtime/`：
- **无头窗口生命周期**：由 Tauri 后台以 `background-js-runtime` 独立窗口启动，脱离前台主视窗的关闭与最小化影响。
- **IPC 通信协议**：定义 `BACKGROUND_JS_RUNTIME_EVENTS`（`request`, `response`, `ready`），通过心跳机制（`background_runtime_heartbeat`）与健康探测（`runtime.ping`）确保后台服务高可用。
- **演进目标**：逐步将重型长效任务、爬虫、定时工作流下沉至后台运行时独立执行。
