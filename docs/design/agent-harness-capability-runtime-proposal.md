# 面向 RP 对话与可组合 Agent Runtime 的 Cordis 风格架构构想提案

> 状态：构想提案（暂不实施）  
> 提出日期：2026-08-21  
> 适用范围：桌面端 JS/TypeScript 运行时、插件系统与 LLM Agent Harness

## 1. 提案摘要

AIO Hub 当前已经具备 JS、Native、Sidecar 三类插件适配能力，以及 `ToolRegistry`、统一执行器、Agent Extension 和上下文管道等扩展基础。但现有扩展模型主要是“固定宿主 + 注册工具/处理器 + 生命周期钩子”：插件可以在宿主预先开放的位置增加能力，却不能以统一方式声明依赖、提供能力、替换 Provider，或在卸载时自动撤销其影响。

本提案记录一个后续可展开的方向：在 JS/TypeScript 层引入 Cordis 或类似的能力运行时（Capability Runtime），将插件从“被宿主调用的扩展对象”提升为“可激活、可撤销、可组合的组件”。但 AIO Hub 的首要运行时形态不是 Coding Agent Harness，而是以角色扮演（RP）、角色关系、上下文连续性和可编辑对话世界为中心的 Conversation Runtime。长期目标应是让角色设定、用户身份、预设消息、开局问候、世界书、记忆/Recall、会话变量、虚拟时间、媒体转写、上下文处理器、模型和可选工具都可以通过统一的能力与依赖机制组合。Coding、Research 或 Workflow Loop 只是建立在这套会话运行时之上的可选行为模块，而不是默认骨架。

本提案不是立即执行计划，也不要求当前阶段替换现有插件系统或重写聊天核心。后续实施时应优先采用适配和渐进迁移，而不是一次性推倒重来。

## 2. 背景与问题

### 2.1 当前基础

当前相关实现主要位于：

- `src/services/plugin-types.ts`：插件清单、插件上下文和 `PluginProxy` 类型。
- `src/services/plugin-sdk.ts`：插件 SDK 与宿主能力封装。
- `src/services/plugin-loader.ts`：插件发现与加载。
- `src/services/plugin-manager.ts`：插件启用、禁用、UI 注册和运行时管理。
- `src/services/js-plugin-adapter.ts`：JS 插件适配。
- `src/services/registry.ts`：`ToolRegistryManager` 工具注册表。
- `src/services/executor.ts`：统一工具执行入口。
- `src/tools/llm-chat/`：聊天上下文、工具调用、会话和 Agent 执行链。

现有系统已经支持初始化、销毁、热重载、工具发现、上下文处理器注册和插件 UI 贡献，因此具备演进为更强运行时的基础。

### 2.2 当前模型的边界

当前插件大致遵循以下模型：

```text
插件 activate(context)
        │
        ├── 注册工具
        ├── 注册上下文处理器
        ├── 注册设置项
        ├── 注册 UI
        └── deactivate() 时手动清理
```

这种模型存在以下限制：

1. `PluginContext` 暴露的是按领域划分的宿主 API，而不是统一的能力与资源模型。
2. 插件可以注册能力，但不能规范声明“我提供什么、我依赖什么”。
3. 注册动作与插件生命周期之间缺少统一资源 Scope，卸载时容易遗漏监听器、定时器、后台任务和 UI 贡献。
4. `ToolRegistryManager` 是按工具 ID 管理的平面注册表，不能表达 Provider 替换和依赖图。
5. 聊天执行链对模型、上下文、工具调用、会话 Store 和默认会话执行流程存在较多直接依赖。
6. 当前的 Hook/Processor 机制适合观察和修改固定流程，但不适合作为可替换 Agent Harness 的唯一基础。

### 2.3 实机定位：AIO Hub 更接近 RP-first Conversation Runtime

当前实机形态已经明确表现出 RP/角色卡式对话，而不是以工具执行为中心的 Coding Harness：

- `ChatAgent` 被定义为可复用的“对话角色”配置，核心内容是预设消息、人格表达、开局消息、模型参数、世界书、用户档案和显示偏好。
- `presetMessages` 支持 `system`、`user`、`assistant` 多角色示例，承担 Few-shot、角色扮演和上下文锚点的作用。
- `greetings` 在创建会话时实例化为真实消息树节点，多个开局可以形成兄弟分支。
- 会话历史是非破坏性的树结构，重新生成、编辑和切换分支本身就是 RP 探索体验的一部分。
- `UserProfile` 描述的是用户在对话中扮演的身份，而不是普通账户资料。
- 世界书、Recall、变量、虚拟时间、正则和转写都服务于“维持一个可持续的对话世界”。
- 统一上下文管道的主流程是会话加载、内容清洗、转写、世界书、注入、思绪/Recall、变量、Token 管理和消息格式化，而不是工具调用循环。

因此，未来 Runtime 的基本单位应从“一个 Agent Loop”调整为：

```text
一次对话轮次（Turn）
  = 当前会话分支
  + 角色与用户身份
  + 预设 / 开局 / Few-shot
  + 世界书与记忆
  + 变量与虚拟时间
  + 多模态与转写
  + 上下文注入与预算
  + 模型请求
  + 可选的工具或动作循环
```

工具调用只是某些 Agent 的附加能力；RP 的核心价值在于状态连续、角色一致、上下文可解释和分支可回溯。

## 3. 目标

### 3.1 近期目标

建立一个不破坏现有插件和工具的 JS 能力运行时，优先解决：

- 能力提供与依赖声明。
- 插件 Scope 和资源自动回收。
- 插件激活、停用和失败回滚。
- Provider 的替换、失效和重新绑定。
- 旧 `ToolRegistry` 与新能力运行时之间的兼容。

### 3.2 长期目标

逐步使以下对象成为可组合 Provider：

```text
Character / Persona Provider
User Identity Provider
Preset and Greeting Provider
Worldbook Provider
Memory / Recall Provider
Variable and Virtual-Time Provider
Context Assembly Provider
Transcription / Media Provider
Model Provider
Session / Branch Provider
Optional Tool / Action Provider
Response Presentation Provider
UI / Command Contribution
```

默认的运行时组合应更接近 RP 对话：

```text
Roleplay Conversation
 = Character Definition
 + User Persona
 + Preset / Few-shot Messages
 + Greeting Branch
 + Worldbook Resolver
 + Memory / Recall
 + Variables / Virtual Time
 + Context Assembly
 + Model Provider
 + Session Tree
 + Optional Tools
```

同一套运行时也应能够承载其他形态：

```text
Coding Conversation = RP/Conversation Runtime + Coding Action Provider
Research Conversation = RP/Conversation Runtime + Research Action Provider
Workflow Conversation = RP/Conversation Runtime + Workflow Action Provider
```

替换其中一个组件时，不要求修改聊天 UI、消息树或其他无关模块；但必须保证角色设定、用户身份、上下文来源和消息元数据可以被追踪和复现。

### 3.3 非目标

本提案暂不承诺：

- 立即引入或绑定某个具体 Cordis 版本。
- 立即重写所有 Vue 组件。
- 立即让所有插件运行在强隔离沙箱中。
- 立即把 Rust、Native 和 Sidecar 运行时全部统一到同一进程模型。
- 立即把现有聊天流程拆成多个生产可用的 Conversation Runtime 实现。
- 用能力运行时替代所有普通 TypeScript `import`。

能力运行时主要服务于动态组合、插件解耦和运行时替换；稳定的内部逻辑仍可直接导入。

## 4. 核心设计原则

### 4.1 能力优先，而不是对象优先

插件不应依赖另一个插件的具体类或单例，而应依赖命名能力：

```text
character:definition
user:identity
preset:messages
greeting:provider
worldbook:resolver
memory:recall
context:assembler
session:tree
model:chat
tool:optional
```

能力的具体提供者可以是内置模块、JS 插件、Sidecar 或 Native 插件。

### 4.2 每次注册都必须产生可撤销资源

注册工具、命令、事件、处理器、UI、定时器和后台任务时，运行时应返回 `Disposable` 或将资源自动纳入插件 Scope：

```ts
const scope = runtime.createScope("my-plugin");

scope.add(runtime.tools.register(tool));
scope.add(runtime.events.on("message", handler));
scope.add(runtime.commands.register(command));

await scope.dispose();
```

插件停用不能只调用 `deactivate()` 并假设插件作者记得清理所有副作用。

### 4.3 依赖图优先于加载顺序

插件应声明 `provides` 与 `requires`。运行时负责：

- 校验必需能力是否存在。
- 按依赖关系激活组件。
- 处理能力提供者替换。
- 找出受影响的依赖者。
- 在卸载或替换后重新绑定、重启或标记不可用。

### 4.4 Hook 作为兼容层，而不是最终抽象

Hook 和事件仍然有价值，适合：

- 观测运行过程。
- 提供通知机制。
- 对固定协议做轻量预处理。

但需要避免把所有扩展需求都转化为更多 Hook。能够独立提供和替换的能力，应使用 Provider/Capability；只有流程观察和广播才使用事件。

### 4.5 RP 对话优先，行为循环可插拔

Runtime 的主抽象应是“如何构造和推进一轮对话”，而不是“如何连续执行工具直到结束”。角色扮演场景需要优先保证：

- 角色卡和用户身份的稳定注入。
- 预设消息、Few-shot 和开局消息的可选择性。
- 世界书、Recall、变量和虚拟时间的可解释组合。
- 对话树、分支和开局的非破坏性回溯。
- 每条消息所使用的 Agent、User Profile、模型和上下文快照可追踪。

工具调用编排可以作为 `ActionLoop` 或 `ToolTurnExtension` 挂载在一次对话轮次中；它不应反过来规定所有 Agent 都必须采用 Coding 式循环。

### 4.6 Runtime 与 UI 解耦

Cordis 或类似运行时应位于业务服务层，不应让 Vue 组件直接依赖底层容器实现。推荐保持：

```text
Vue UI
  ↓
Composable / Store
  ↓
Capability Runtime API
  ↓
Provider / Plugin
```

这样未来可以在分离窗口、测试环境或移动端使用不同的运行时适配器。

## 5. 目标架构草图

```text
┌──────────────────────────────────────────────┐
│                  UI / Composables             │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│            Application Facades / Adapters      │
│  Conversation API · Context API · Session API  │
│  Persona API · Tool API · UI API                │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│              Capability Runtime                │
│  Registry · Dependency Graph · Scope · Events  │
│  Provider Resolution · Activation Transaction   │
└───────────────┬───────────────┬───────────────┘
                │               │
       ┌────────▼───────┐ ┌─────▼──────────────┐
       │ Built-in        │ │ External Plugins   │
       │ Providers       │ │ JS / Native /     │
       │                 │ │ Sidecar           │
       └─────────────────┘ └────────────────────┘
```

建议新增的基础模块（实际路径可在实施阶段调整）：

```text
src/services/runtime/
  capability-registry.ts
  dependency-graph.ts
  resource-scope.ts
  activation-transaction.ts
  provider-resolution.ts
  runtime.ts
  runtime-types.ts
```

## 6. 关键接口草案

### 6.1 插件清单

```ts
interface RuntimePluginManifest {
  id: string;
  version: string;
  provides?: CapabilityDescriptor[];
  requires?: CapabilityRequirement[];
  permissions?: string[];
}
```

### 6.2 插件激活

```ts
interface RuntimePlugin {
  manifest: RuntimePluginManifest;
  activate(context: PluginContext): Promise<void | Disposable | Disposable[]>;
}
```

实现上应优先让 `PluginContext` 的注册 API 自动纳入当前 Scope，减少插件手动返回清理函数的负担。

### 6.3 能力注册与解析

```ts
interface CapabilityRuntime {
  provide<T>(
    id: string,
    provider: T,
    options?: ProvideOptions
  ): CapabilityLease;
  require<T>(id: string): CapabilityHandle<T>;
  optional<T>(id: string): CapabilityHandle<T> | undefined;
  createScope(ownerId: string): ResourceScope;
  activate(plugin: RuntimePlugin): Promise<ActivationHandle>;
}

interface ConversationRuntime {
  resolve(input: ConversationInput): Promise<ConversationSnapshot>;
  runTurn(
    input: TurnInput,
    snapshot: ConversationSnapshot
  ): AsyncIterable<ConversationEvent>;
}

interface ConversationSnapshot {
  agent: AgentDefinitionSnapshot;
  user: UserIdentitySnapshot | null;
  presetMessages: ResolvedPresetMessage[];
  greeting?: ResolvedGreeting;
  worldbook: ResolvedWorldbookContext;
  memory: ResolvedMemoryContext;
  variables: ResolvedSessionVariables;
  model: ResolvedModel;
}

interface ConversationEvent {
  type:
    | "context-preview"
    | "assistant-delta"
    | "tool-call"
    | "tool-result"
    | "branch-created"
    | "completed"
    | "error";
  payload: unknown;
}
```

能力 ID 应采用稳定、可读、可版本化的命名方式，例如：

```text
service:file-operator
model:chat
session:runtime
agent-loop:default
pipeline:context
command:quick-action
```

最终的命名规范、版本兼容规则和多 Provider 选择策略需要在正式设计阶段单独确定。

## 7. 与当前实现的映射

| 当前实现                  | 目标方向                              | 迁移策略                                                |
| ------------------------- | ------------------------------------- | ------------------------------------------------------- |
| `PluginContext`           | Capability Runtime Context            | 扩展 API，保留旧字段                                    |
| `PluginProxy`             | Runtime Plugin Adapter                | 保留代理，新增 Scope 与依赖状态                         |
| `ToolRegistryManager`     | Tool Capability Adapter               | 作为 Legacy Registry 兼容层                             |
| `executor.ts`             | Capability Resolver / Invocation API  | 先兼容旧 service ID，再支持 capability ID               |
| `activate/deactivate`     | Scoped Activation                     | 激活时创建 Scope，停用时统一撤销                        |
| `useToolCallOrchestrator` | Optional Action / Tool Turn Extension | 保持调用协议，作为可选行动扩展接入                      |
| `useChatExecutor`         | Default Conversation Turn Adapter     | 先包装现有上下文构建和请求流程，再拆分 RP 运行时        |
| `useChatHandler`          | Turn / Branch Coordinator             | 保留消息树、开局和分支语义，减少对具体 Store 的直接编排 |
| `contextPipelineStore`    | Context Assembly Provider             | 处理器注册归属 Scope，并保留确定的注入顺序              |
| `worldbook-processor`     | Worldbook Context Adapter             | 将匹配和配置解析逐步下沉到 `worldbook:resolver`         |
| `transcription-processor` | Media Context Adapter                 | 通过 `transcription:service` 接入，不直接拥有任务队列   |
| `sessionRuntimeManager`   | Session Tree Provider                 | 先抽接口，不改变消息树和持久化格式                      |
| `plugin-ui.ts`            | UI Contribution Provider              | 增加自动注销和贡献归属                                  |

## 8. 分阶段迁移构想

### 阶段 A：建立运行时内核

范围：

- `CapabilityRegistry`。
- `DependencyGraph`。
- `ResourceScope`。
- Provider 生命周期和激活事务。
- 基础运行时事件与诊断。

验收重点：

- 插件能声明依赖和提供能力。
- 注册资源可统一撤销。
- 激活失败可以回滚，不留下半注册状态。
- 旧插件仍可通过适配器运行。

### 阶段 B：接入现有插件与工具注册

范围：

- `plugin-types.ts`、`plugin-sdk.ts`。
- `plugin-manager.ts`、`js-plugin-adapter.ts`。
- `registry.ts`、`executor.ts`。
- 自动注册与启动项管理。

验收重点：

- `ToolRegistry` 自动映射为能力 Provider。
- 旧 service ID 的调用行为保持兼容。
- 插件禁用后工具、处理器、UI、监听器和后台任务都能回收。
- Provider 缺失时返回可诊断的能力不可用状态。

### 阶段 C：接入上下文、工具调用与会话

范围：

- 上下文处理器纳入 Scope。
- Tool Calling 的发现和执行改为通过 Runtime 解析。
- Session Runtime 抽象与当前 Store 解耦。
- 保留现有消息、会话和持久化格式。

验收重点：

- 插件可增加上下文能力而不直接操作全局 Store。
- 工具调用在 Provider 替换后仍能正确生成定义和执行。
- 会话中途发生能力变更时有明确行为，不破坏已有消息记录。

### 阶段 D：抽出默认 RP Conversation Runtime

范围：

- `useChatHandler`：消息节点、用户消息快照、开局和分支协调。
- `useChatExecutor`：一次请求的 Agent/User/Session 解析和执行快照。
- `useSingleNodeExecutor`：一轮对话的上下文构建、模型请求和响应事件。
- `useToolCallOrchestrator`：作为可选 Action/Tool Turn Extension，而非默认运行时骨架。
- `contextPipelineStore`：上下文组装和处理器生命周期。
- `llmChatService`：模型请求和流式响应边界。

策略：

1. 先把现有“会话树 + 预设/开局 + User Profile + 世界书 + Recall/变量 + 转写 + 上下文管道 + 模型请求”包装成 `conversation-runtime:default`。
2. UI 只依赖统一的 Conversation Runtime 事件和上下文预览结果。
3. 将 Coding、Research、Workflow 等行为循环作为可选 Action Provider，挂载到对话轮次，而不是替换 RP 主骨架。
4. 最后再视实际需求拆分 Model、Session、Memory、Worldbook、Transcription 和 Persistence Provider。

### 阶段 E：组件级热更新与自组合

这是长期方向，暂不承诺实施。可能包括：

- Provider 级热替换。
- 依赖链局部重启。
- 组件状态迁移。
- Agent 自检当前运行时结构。
- 受权限约束的插件生成与实验。

## 9. 预计影响范围

### 9.1 必然涉及的 JS/TS 区域

```text
src/services/plugin-*.ts
src/services/registry.ts
src/services/executor.ts
src/services/auto-register.ts
src/services/startup-manager.ts
src/tools/tool-calling/
src/tools/llm-chat/composables/chat/
src/tools/llm-chat/services/
src/tools/llm-chat/stores/contextPipelineStore.ts
src/tools/llm-chat/stores/session/
```

### 9.2 第一阶段可以暂不修改的区域

- 大部分 Vue 页面和展示组件。
- 现有会话持久化文件格式。
- Tauri Rust 命令与 Native/Sidecar 的底层协议。
- 不需要动态替换的纯内部工具函数。
- 与运行时无关的移动端 UI。

### 9.3 风险较高的边界

- 多窗口运行时：主窗口和分离窗口的 Provider 状态是否共享。
- Agent 运行中卸载工具：已有调用、流式请求和 AbortController 的处理。
- Provider 替换时的状态兼容和消息记录一致性。
- 插件权限与任意 JS 执行之间的安全边界。
- 多个插件提供同一能力时的优先级、版本和冲突策略。
- Vue 响应式对象进入通用运行时时的生命周期泄漏。

## 10. 实施前需要做出的决定

1. 使用 Cordis 作为底层依赖，还是实现 AIO Hub 自己的最小 Capability Runtime。
2. 能力 ID 的命名、版本和兼容规则。
3. 一个能力是否允许多个 Provider 同时存在。
4. Provider 替换时采用优先级、显式选择还是依赖方绑定。
5. 依赖能力暂时消失时，依赖者是暂停、销毁、重启还是进入降级状态。
6. 插件 Scope 是否允许创建子 Scope。
7. 是否需要把事件、命令、工具、UI、定时器都统一成 Resource Lease。
8. JS 插件的安全模型：可信插件、权限声明、隔离 Worker 或独立 Sidecar 的边界。
9. 多窗口是否共享同一个 Runtime，还是每个窗口拥有本地 Runtime 并通过同步层协调。
10. Conversation Runtime 的事件协议是否与当前消息节点协议分离。
11. RP 上下文快照如何记录角色、用户、世界书、Recall、变量和模型来源。
12. 工具/行动循环如何作为可选 Turn Extension 接入，而不污染默认 RP 流程。

## 11. 暂不展开的工作项

以下内容等有明确工期和实施窗口后再建立独立计划：

- Cordis 选型与 API 对照验证。
- Runtime 类型设计与单元测试。
- 现有插件迁移清单。
- Tool Registry 兼容适配器。
- Tool Calling 接入 Capability Runtime。
- Session Runtime 抽象。
- Default RP Conversation Runtime 拆分。
- 角色、用户身份、预设、开局和消息树快照协议。
- 插件热更新和依赖重连 E2E。
- 权限、安全和恶意插件防护。
- 迁移期间的文档、示例插件和版本兼容策略。

## 12. 结论

AIO Hub 不需要通过不断增加 Hook 数量来获得“游戏 Mod 式”的扩展能力，也不应把 Coding Agent 的连续工具循环误认为所有 Agent 的共同骨架。更合适的长期方向是：保留一个稳定、较小的运行时内核，把角色、用户身份、预设、开局、世界书、记忆、变量、会话树、上下文组装、模型和可选行动能力逐步提升为可声明依赖、可撤销、可替换、可重组的能力 Provider。

默认实现应首先服务 RP/角色扮演对话：围绕一次对话轮次解析角色与用户身份、构造可解释上下文、维护世界状态、生成模型响应并保留分支与快照。Coding、Research、Workflow 等循环是可选的行为扩展。迁移应从 JS/TypeScript 插件运行时开始，以 `ResourceScope + Capability Registry + Dependency Graph` 为最小核心，通过适配器兼容现有 `ToolRegistry` 和插件 API；在运行时稳定后，再逐步把当前 `llm-chat` 的 RP 上下文与会话执行链纳入组合模型。

## 附录 A：从 `llm-chat` 拆出的模块调研

本节补充调研四个已经从 `llm-chat` 中物理拆出的能力域：多模态转写、世界书、Agent 配置与 User Profile。它们对未来 Capability Runtime 的意义不完全相同：有些已经完成了工具层拆分，但仍保留聊天侧编排；有些已经拥有独立存储和 UI，但其运行时语义仍由聊天上下文管道解释。

### A.1 调研结论：物理拆分不等于运行时解耦

这几个模块已经形成了类似下面的结构：

```text
独立工具 / Store / Storage
          ↑
       Chat Adapter
          ↑
      llm-chat Pipeline
```

当前拆分解决了目录归属、UI 复用和数据存储问题，但还没有完全解决以下运行时问题：

- `llm-chat` 仍然知道模块的具体 Manager 或 Store。
- 模块的全局配置、Agent 覆盖和会话临时状态还混在聊天设置或 Agent 配置中。
- Context Processor 仍然承担一部分领域算法，而不只是把领域能力接入聊天。
- 模块可以作为工具被调用，但还没有统一的 Provider/Capability 契约。
- 模块卸载、替换和异步任务清理尚未统一纳入插件 Scope。

因此，后续重构不应再次把这些模块“搬回 Runtime”，而应保留其独立工具边界，补齐：

```text
领域服务
  + Runtime Capability
  + Chat Context Adapter
  + 配置解析 / 选择策略
  + 生命周期与任务 Scope
```

### A.2 多模态转写模块

#### 当前结构

主要实现位于：

```text
src/tools/transcription/
src/tools/llm-chat/composables/features/useTranscriptionManager.ts
src/tools/llm-chat/core/context-processors/transcription-processor.ts
src/llm-apis/transcription-types.ts
```

转写工具自身已经具备较完整的领域分层：

```text
transcription.registry.ts       外部工具门面
transcriptionStore.ts           任务状态与配置
useTranscriptionManager.ts      队列、并发、重试和调度
engines/*                       图片、音频、视频、PDF、DOCX 引擎
utils/persistence.ts             转写衍生数据持久化
```

它还与资产管理和 Tauri 后端存在稳定边界：

- 转写结果作为资产衍生数据保存。
- 视频转写可能调用 Rust/FFmpeg 进行预处理。
- 音频可能使用多模态 Chat 或专用 STT 端点。
- 任务具有排队、处理中、完成、失败、取消和重试等状态。

`llm-chat` 侧仍保留两类职责：

1. 根据消息附件、模型能力和聊天设置决定是否需要转写。
2. 通过 `transcription-processor` 将转写结果接入上下文消息，并处理占位符和附件标注。

因此，转写模块已经是“独立领域服务 + Chat Adapter”，但 `Chat Adapter` 仍直接依赖转写 Manager 和聊天配置。

#### 运行时方向

建议暴露以下能力，而不是让聊天侧直接获取 Store：

```text
transcription:service
transcription:engine:image
transcription:engine:audio
transcription:engine:video
transcription:engine:document
asset:derived-data
media:preprocessor
```

聊天侧只依赖一个稳定的请求接口：

```ts
interface TranscriptionCapability {
  getCached(assetId: string): Promise<TranscriptionResult | null>;
  ensure(input: TranscriptionRequest): Promise<TranscriptionResult>;
  cancel(taskId: string): Promise<void>;
}
```

`transcription-processor` 未来应保留为 Chat Context Adapter，负责：

- 识别当前请求中的附件。
- 生成转写请求。
- 将结果转换为模型上下文内容。
- 保留附件占位符和可见性语义。

而以下内容应留在转写领域服务内部：

- 引擎选择。
- 并发和速率限制。
- 任务队列。
- 临时文件清理。
- 衍生数据保存。
- 重试和任务恢复。

#### 配置归属建议

当前转写默认配置位于 `llm-chat` 的聊天设置中，未来应明确区分：

```text
转写模块默认值       transcription domain config
用户全局转写偏好     user/runtime settings
Agent 的转写覆盖     agent definition override
本次请求的临时覆盖   request context
```

不建议把完整转写配置塞进每个 Agent；Agent 只保存必要的策略覆盖，例如：

```text
是否强制转写
使用哪个转写 Profile
图片 / 音频 / 文档的策略
```

### A.3 世界书模块

#### 当前结构

主要实现位于：

```text
src/tools/st-worldbook-manager/
src/tools/llm-chat/core/context-processors/worldbook-processor.ts
src/tools/llm-chat/types/...
src/tools/llm-chat/composables/settings/useChatSettings.ts
```

`st-worldbook-manager` 已经负责：

- 世界书索引和内容存储。
- 世界书导入、导出、复制、重命名和删除。
- 世界书编辑器和选择器。
- 世界书内容缓存。

但世界书的运行时匹配逻辑目前仍主要位于：

```text
src/tools/llm-chat/core/context-processors/worldbook-processor.ts
```

该 Processor 会直接读取：

- `sharedData.loadedWorldbooks`。
- 当前 `agentConfig`。
- `context.settings.worldbook`。
- Agent 的 `worldbookIds` 和 `worldbookSettings`。
- 当前消息与历史文本。

并在聊天上下文管道中完成：

- 关键词和正则匹配。
- 选择性匹配。
- 角色过滤。
- 递归扫描。
- 插入位置和优先级处理。
- 激活条目记录。

这说明世界书已经完成“管理工具拆分”，但没有完成“运行时语义拆分”。目前它更接近：

```text
独立世界书数据管理器
        +
聊天侧内置的世界书解释引擎
```

#### 运行时方向

可以拆成三个能力层：

```text
worldbook:repository
worldbook:resolver
worldbook:context-provider
```

其中：

- `worldbook:repository`：加载、缓存和保存世界书。
- `worldbook:resolver`：根据 Agent、User、Session 和消息历史计算激活条目。
- `worldbook:context-provider`：将激活条目转换成上下文片段。

未来 `WorldbookProcessor` 应更多地扮演适配器角色：

```ts
const resolver = runtime.require<WorldbookResolver>("worldbook:resolver");
const activated = await resolver.resolve({
  agent,
  user,
  messages,
  settings,
});

context.sharedData.set("activatedWorldbookEntries", activated);
```

匹配算法可以继续放在当前文件附近，也可以独立成可替换 Provider；关键是不要让 Processor 同时承担存储访问、配置合并和全部匹配策略。

#### 特别需要保留的语义

世界书不是简单的“文本检索插件”，未来拆分时必须保留：

- Agent 覆盖优先于全局设置的规则。
- 递归扫描的深度和开关。
- 条目位置、优先级和选择性逻辑。
- 角色名称和标签过滤。
- 激活条目对当前请求的可追踪性。
- 当前消息、历史消息和系统提示的扫描边界。

这些规则应该成为 `WorldbookResolver` 的明确输入和输出，而不是依赖某个 Pinia Store 的隐式状态。

### A.4 Agent 配置模块

#### 当前结构

主要实现位于：

```text
src/tools/agent-manager/types/agent.ts
src/tools/agent-manager/stores/agentStore.ts
src/tools/agent-manager/composables/storage/
src/config/agent-presets/
```

当前 `ChatAgent` 是一个较大的配置聚合对象，包含：

- 模型 Profile ID 和 Model ID。
- 预设消息和人格信息。
- 工具调用配置。
- Agent Extension 配置。
- 世界书 ID 和世界书设置。
- 知识库权限。
- Recall 配置。
- 会话变量。
- 资产和快捷操作。
- 用户档案 ID。
- 输出、正则和交互设置。

这类结构适合作为持久化和编辑表单模型，但不适合直接作为所有运行时模块的依赖对象。当前多个聊天处理器可以直接从 `agentConfig` 读取字段，导致 Agent 配置逐渐成为跨模块的隐式总线。

#### 运行时方向

建议区分三个对象：

```text
AgentDefinition      持久化、可编辑的声明式配置
AgentSelection       当前会话选择的 Agent 与覆盖项
AgentRuntimeContext  当前一次运行解析后的能力快照
```

例如：

```ts
interface AgentRuntimeContext {
  agentId: string;
  model: ResolvedModel;
  tools: ResolvedToolSet;
  user: ResolvedUserContext | null;
  worldbook: WorldbookSelection;
  extensions: ResolvedExtensionSet;
  variables: SessionVariables;
}
```

Agent 配置未来不应直接持有某个 Provider 实例，而应持有选择信息：

```text
modelId
profileId
worldbookIds
userProfileId
toolCallConfig
extensionConfig
```

Runtime 在启动一次 Agent 运行时，根据这些 ID 和覆盖项解析真正的 Provider。这样才能支持：

- 同一 Agent 在不同会话使用不同 Provider。
- Provider 替换而不修改 Agent 文件。
- 插件提供新的 Loop、工具集或上下文模块。
- Agent 配置迁移和运行时实现解耦。

#### 配置边界建议

```text
AgentDefinition       稳定的用户意图和选择
AgentRuntimeContext   当前运行的解析结果
SessionRuntime        本次会话的可变状态
Plugin Scope           本次插件实例的资源
```

不能把运行时生成的 Provider、AbortController、任务队列或响应式对象写回 Agent 配置。

### A.5 User Profile 模块

#### 当前结构

用户档案已经从 `llm-chat` 物理迁移到：

```text
src/tools/user-profile-manager/
```

其独立 Store 和 Storage 负责：

- 多档案的增删改查。
- 全局默认档案。
- 启用/禁用状态。
- 档案持久化和历史数据迁移。
- 档案头像、样式和附加配置。

`llm-chat` 仍保留桥接文件：

```text
src/tools/llm-chat/composables/storage/useUserProfileStorage.ts
```

该文件将旧导入路径重定向到 `user-profile-manager`，以减少迁移期间的调用方改动。当前有效档案选择大致遵循：

```text
Agent.userProfileId
        ↓ 未指定或找不到
全局 globalProfileId
        ↓ 未找到
无 User Profile
```

这说明 User Profile 已完成存储和门户解耦，但聊天仍然需要一个“有效档案解析器”。

#### 运行时方向

建议提供：

```text
user-profile:repository
user-profile:resolver
user-context:current
```

Chat 不应直接读取 `userProfileStore`，而应请求一个只读的、已经解析好的快照：

```ts
interface UserContextResolver {
  resolve(input: {
    agentUserProfileId?: string | null;
    sessionOverride?: string | null;
  }): Promise<ResolvedUserContext | null>;
}
```

其中 `ResolvedUserContext` 可以包含：

- 用户背景文本。
- 当前档案 ID。
- 可供上下文注入的内容。
- 样式和展示偏好。
- 需要传给特定 Processor 的结构化元数据。

档案 Store 继续负责 CRUD 和持久化；Runtime 只负责在一次 Agent 运行开始时解析快照，避免聊天过程中因为全局 Store 变化而产生不可追踪的上下文漂移。

### A.6 四个模块共同暴露出的配置分层

这几次拆分说明，AIO Hub 需要明确区分四类配置：

| 层级            | 典型内容                                             | 生命周期          |
| --------------- | ---------------------------------------------------- | ----------------- |
| 模块默认配置    | 转写默认批次、世界书默认扫描深度                     | 模块版本 / 安装   |
| 用户全局配置    | 全局 User Profile、全局世界书设置、转写偏好          | 用户配置          |
| Agent 配置      | Agent 选择的模型、世界书、User Profile、工具和覆盖项 | Agent 实例        |
| 会话 / 请求覆盖 | 临时模型、临时附件转写、当前消息分支设置             | Session / Request |

配置解析应遵循：

```text
模块默认值
  → 用户全局配置
    → Agent 配置
      → 会话覆盖
        → 单次请求覆盖
```

但不能把所有设置都简单地合并成一个大对象。不同模块应保留自己的配置 Schema，并由 Runtime 在创建 `AgentRuntimeContext` 时完成有边界的解析。

### A.7 对后续迁移的直接建议

1. **先定义 Chat Adapter 契约**：转写和世界书先不搬算法，只让 `llm-chat` 通过稳定能力接口访问它们。
2. **先定义 Runtime Snapshot**：Agent、User、Worldbook 和 Transcription 的运行时输入输出先结构化，减少对 Pinia Store 的直接读取。
3. **保留旧桥接路径**：User Profile 已有兼容桥接，不宜在 Runtime 首轮改造中删除。
4. **把配置解析从 Processor 中移出**：Processor 只处理上下文阶段，不负责决定全部全局/Agent/Session 合并规则。
5. **异步转写优先接入 Scope**：任务、取消、重试和临时文件清理由任务 Scope 管理，是最适合验证资源生命周期的试点。
6. **世界书优先拆 Resolver**：世界书存储已经相对独立，下一步最有价值的是把匹配算法和配置解析从 `WorldbookProcessor` 中抽出。
7. **Agent Store 继续作为持久化入口**：暂不把 Agent Store 改造成 Runtime 容器，先增加 `resolveAgentRuntimeContext()` 之类的边界服务。
8. **User Profile 作为只读运行时快照输入**：避免让聊天流程直接依赖全局档案 Store 的响应式状态。

### A.8 研究判断

这几个“从 Chat 长出来再拆分”的模块，不应被视为需要重新合并的遗留物。更准确的判断是：

```text
物理边界已经初步拆出
领域服务已经部分独立
Chat Adapter 仍然偏重
Runtime Capability 尚未统一
配置解析边界尚未稳定
```

因此，它们适合作为 Capability Runtime 迁移的第一批真实试点：

- **User Profile** 验证只读快照和选择解析。
- **Worldbook** 验证 Resolver 与上下文 Provider 的拆分。
- **Transcription** 验证异步任务、取消、重试和资源 Scope。
- **Agent Config** 验证声明式配置到运行时能力组合的解析过程。

这四个模块能够覆盖同步能力、异步任务、上下文处理、持久化配置和运行时选择等关键场景，比单独从一个简单工具开始更能验证整体架构。

## 附录 B：RP-first 形态修订说明

本提案原先使用 Coding Agent 作为主要组合示例，这会把“Agent 可扩展性”错误地收窄为“工具调用循环可替换”。根据当前 AIO Hub 实机代码和 `llm-chat` 架构，默认产品形态应改为 RP-first：

```text
角色扮演对话不是一个等待工具调用结束的 Loop，
而是一套围绕角色、用户、世界和会话分支持续组装上下文的 Turn Runtime。
```

### B.1 RP 的核心运行对象

```text
Character / Agent Definition
User Profile / User Persona
Preset Messages / Few-shot
Greeting Branch
Conversation Tree
Worldbook Entries
Recall / Memory
Session Variables
Virtual Time
Media / Transcription
Context Pipeline
Model Request
Optional Action / Tool Turn
Message Snapshot
```

其中，`presetMessages`、`greetings`、`worldbookIds`、`worldbookSettings`、`userProfileId`、`variableConfig`、`virtualTimeConfig`、`recallConfig` 和 Agent 私有资产并不是附属配置，而是 RP 运行时的主要组成部分。

### B.2 默认轮次的建议数据流

```text
用户输入 / 当前分支
        ↓
解析 Agent 与 User Profile 快照
        ↓
装配预设消息、开局消息和 Few-shot
        ↓
加载世界书、Recall、变量与虚拟时间
        ↓
处理附件与转写
        ↓
执行确定顺序的 Context Pipeline
        ↓
Token 预算与模型格式化
        ↓
模型响应流
        ↓
保存消息元数据、上下文来源和分支状态
        ↓
可选：执行工具 / 行动扩展并继续下一轮
```

### B.3 对 Capability Runtime 的影响

Capability Runtime 首批应优先支持以下能力，而不是先围绕 Coding 工具设计：

```text
character:definition
user:identity
preset:messages
greeting:provider
session:tree
worldbook:resolver
memory:recall
variables:session
time:virtual
media:transcription
context:assembler
model:chat
action:optional
```

每次运行应生成可追踪的 `ConversationSnapshot`，至少能够说明：

- 使用了哪个 Agent 配置版本。
- 使用了哪个 User Profile 版本。
- 采用了哪些预设和开局分支。
- 哪些世界书条目、Recall 结果和变量被注入。
- 转写和附件处理使用了什么结果。
- 最终使用了哪个模型和参数。
- 是否发生了工具/行动扩展。

这样才能保证 RP 对话在切换配置、修改世界书或重载插件后仍然可解释、可回放，而不是只记录“某个 Loop 执行成功”。

### B.4 Coding 方向的正确位置

Coding Agent 仍然是有价值的目标，但应定义为一种可选组合：

```text
Coding Action Provider
  → 提供文件、终端、Git、测试等能力
  → 可在某个对话轮次中触发工具循环
  → 不拥有角色、用户、会话树和上下文装配的最终控制权
```

因此，后续文档和实现中应优先使用“Conversation Runtime”“Turn Runtime”“Context Assembly”和“Action Extension”等概念；只有在讨论具体工具自动执行场景时，才使用 `Agent Loop` 或 `Coding Loop`。
