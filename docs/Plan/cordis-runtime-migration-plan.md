# AIO Hub 引入 Cordis 风格能力运行时重构计划

> 状态：计划中（待评审）
> 提出日期：2026-08-29
> 修订日期：2026-08-29
> 适用范围：桌面端 JS/TypeScript 运行时、插件系统与生命周期管理

## 1. 计划摘要

AIO Hub 当前的插件系统（JS、Native、Sidecar）采用“固定宿主 + 注册处理器 + 生命周期钩子”模型。虽然能满足基本功能，但存在以下痛点：

1. **资源清理困难**：插件禁用时需要作者在 `deactivate()` 中手动注销所有监听器、定时器和 UI 贡献，容易遗漏并导致内存泄漏。
2. **依赖关系缺失**：插件可以声明部分 manifest 依赖，但运行时尚未统一表达“我提供什么、我依赖什么”，也缺少能力上线、下线和 Provider 替换策略。
3. **耦合度高**：聊天上下文管道和执行链对具体的 Store、Manager 和注册表存在直接依赖，不利于向 RP-first（角色扮演优先）对话运行时演进。

AIO Hub 当前仍处于内测开发阶段（用户量极小），没有需要长期维护的外部第三方插件兼容承诺，因此本次可以接受一次性破坏性重构。迁移将在独立的 `feature/cordis-runtime` 分支上进行，不建设旧插件协议的长期双栈兼容层。

本计划的核心策略是：

1. 先用一个新的内部测试插件验证 Runtime、Scope 和依赖模型。
2. 直接调整仓库内插件和 SDK，使其对齐新的契约。
3. 保留现有 Tool Registry / Executor 的桥接路径，避免把生命周期重构和工具调用链重写绑定在一起。
4. 将 Cordis 作为候选实现，通过最小技术验证决定采用准确的包版本、API 组合，或在项目内实现所需的核心子集。
5. 首轮只建立插件能力运行时基础，不提前承诺完整的 RP-first Service 集合；实际 Service 边界在接入真实模块时再确定。

重构后，插件应当拥有可托管的生命周期、可撤销的注册行为和声明式依赖能力，并为后续的 Conversation Runtime / RP-first Runtime 提供基础设施。插件本身的业务逻辑（如 OCR 算法、转写引擎、Sidecar 进程等）原则上保持不变，但其 JS 入口、桥接层和生命周期接入方式需要迁移。

---

## 2. 技术选型与待验证事项

### 2.1 候选方案

当前保留以下候选，不在文档阶段假定某个 API 一定可用：

- **候选 A：直接依赖 Cordis 核心包**：复用其 Context、Service、Scope/Fork 和依赖注入机制。
- **候选 B：实现 AIO Hub 所需的核心子集**：在 `src/services/runtime/` 下实现 Context、Effect Scope、Service Registry 和依赖通知，避免引入不必要的上游 API 面。

候选方案必须通过阶段零的最小 Spike 决定。无论最终选择哪个方案，项目内部只能保留一套稳定的 Runtime API。

### 2.2 必须先通过 Spike 确认的事项

1. 最终依赖包名、精确版本和 import 路径。
2. `Context`、`plugin/apply`、`provide/inject`、Service 和 Scope dispose 的真实类型契约。
3. 定时器、Tauri `listen()`、异步任务和取消信号如何纳入 Scope。
4. Cordis Scope 与 Vue/Pinia、Tauri 多 WebView 的边界。
5. Native/Sidecar 服务是否由前端 Context 持有，还是由主窗口或 Rust 后端统一持有。
6. 同名 Service/Provider 冲突时的首版策略。

在 Spike 通过前，不应在正式插件示例中使用未经验证的 `ctx.setInterval()`、顶层 `using`、`Fork` 或具体 `Service.start/stop` 写法。

### 2.3 运行环境

- 包管理器：使用 Bun。
- 运行环境：兼容 Tauri v2 桌面端。
- 前端构建：必须通过仓库现有的 TypeScript 检查和 Vite 构建。
- 真实窗口、IPC、Native、Sidecar 和 Tauri Event 行为以 Tauri 运行态为准，普通浏览器只能用于明确支持 fallback 的纯前端逻辑。

---

## 3. 重构边界与文件清单

本次重构是一次内部破坏性迁移，重点是插件 Runtime 和桥接层，不主动重写插件算法、二进制协议或聊天 UI。

### 3.1 主要修改区域

| 文件路径                                                                                 | 当前职责                                       | 重构后职责                                                                 |
| :--------------------------------------------------------------------------------------- | :--------------------------------------------- | :------------------------------------------------------------------------- |
| [`src/services/plugin-types.ts`](../../src/services/plugin-types.ts)                     | 定义 `PluginContext`、插件清单和 `PluginProxy` | 定义新版 Runtime Context、能力契约、Scope-aware 注册接口和迁移后的插件类型 |
| [`src/services/plugin-manager.ts`](../../src/services/plugin-manager.ts)                 | 插件启用、禁用、UI 注册和状态管理              | 管理 Runtime 所有权、插件 Scope、产品状态与 Runtime 状态映射               |
| [`src/services/js-plugin-adapter.ts`](../../src/services/js-plugin-adapter.ts)           | 包装 JS 插件为 `PluginProxy`                   | 将新的 `apply(ctx)` 入口接入 Runtime，并将插件资源纳入 Scope               |
| [`src/services/sidecar-plugin-adapter.ts`](../../src/services/sidecar-plugin-adapter.ts) | 管理 Sidecar 进程生命周期与 RPC 调用           | 保持 Transport/RPC 能力不变，增加 Runtime Service 包装和 Scope 关闭桥接    |
| [`src/services/native-plugin-adapter.ts`](../../src/services/native-plugin-adapter.ts)   | 管理 Native 动态库加载与调用                   | 保持 Tauri IPC 和 Native ABI 能力不变，增加 Runtime Service 包装和卸载桥接 |
| [`src/services/plugin-loader.ts`](../../src/services/plugin-loader.ts)                   | 发现插件、读取 manifest、动态导入              | 加载新的 JS 模块格式，并在启用前完成依赖和兼容性检查                       |
| [`src/services/plugin-sdk.ts`](../../src/services/plugin-sdk.ts)                         | 汇总并导出插件 SDK                             | 导出新的 Runtime 类型、能力服务和稳定的插件 SDK 边界                       |
| [`src/services/registry.ts`](../../src/services/registry.ts)                             | 管理 Tool Registry 生命周期                    | 首轮继续作为工具调用桥接层，不与 Cordis Runtime Registry 混为一谈          |
| `src/services/runtime/`                                                                  | 当前不存在或尚未形成统一 Runtime               | 存放 Runtime Context、Effect Scope、Service 注册和内部适配工具             |

### 3.2 需要同步调整的区域

- `plugins/` 下需要继续维护的 JS、Native 和 Sidecar 插件入口。
- 插件开发指南、SDK 示例和 manifest 类型说明。
- `src/tools/llm-chat/` 的 Context Pipeline 注册桥接。
- Smart OCR、Tool Calling 和其他读取 `pluginStates` 或 `PluginProxy` 的模块。
- 插件管理页面中直接调用 `enable()`、`disable()` 和 UI 注册的路径。

`plugins/` 下的插件是独立仓库。迁移各插件时，应进入对应插件仓库操作，并遵循该仓库及 [`plugins/AGENTS.template.md`](../../plugins/AGENTS.template.md) 的约束。

### 3.3 原则上不主动修改的区域

- 插件内部的 Python 脚本、Rust 动态库、C++ 可执行文件和既有业务算法。
- Sidecar RPC、Native ABI 和已有的任务/取消协议。
- 聊天界面的视觉结构和展示组件。
- 世界书 JSON、用户档案、消息树等持久化格式。

这些区域不是绝对不可修改：如果 Runtime 边界验证发现需要增加取消、状态或上下文字段，应以最小桥接改动为准，并同步更新对应文档。

---

## 4. Runtime 设计原则

### 4.1 Context 与 Scope

每次插件启用都应获得一个独立 Scope。插件通过 Runtime API 注册的资源必须归属于该 Scope：

```text
Plugin enable
    ↓
Plugin Scope
    ├── events / Tauri listeners
    ├── processors / hooks
    ├── settings contributions
    ├── UI contributions
    ├── timers
    ├── background tasks
    └── Sidecar / Native transport handles
    ↓
Plugin disable → dispose Scope → reverse cleanup
```

资源清理应满足：

- disposer 幂等。
- 激活中途失败时自动回滚已完成的注册。
- 一个资源清理失败不能阻止其他资源清理。
- 禁用后不能继续向插件回调事件或提交 UI 更新。
- 异步任务应支持取消或至少拒绝新的工作提交。

Runtime 只负责托管明确接入 Scope 的资源，不宣称能够自动发现任意第三方副作用。

### 4.2 能力服务与插件状态分离

Runtime Service 表达“当前某个能力是否可用”；产品状态表达“用户是否希望启用、插件是否损坏、是否兼容以及 UI 应显示什么”。两者不能合并为同一个 Registry：

```text
PluginStateService / pluginStates
    ├── desired enabled state
    ├── compatibility state
    ├── broken / failure diagnostics
    └── cross-window and UI observable state

Runtime Scope / Service Registry
    ├── active plugin scope
    ├── provided capabilities
    ├── dependency activation
    └── disposal notifications
```

当前 `pluginStates` 被 Smart OCR、Extension Registry 和插件管理 UI 使用，首轮应保留它，并增加与 Runtime Scope 的明确映射。后续确认没有调用方依赖后，才考虑进一步合并模型。

### 4.3 插件依赖与能力依赖分离

需要区分两种依赖：

```text
Plugin Package Dependency
    dependencies / optionalDependencies / incompatibleWith
    → 安装、版本、冲突与加载许可

Capability Dependency
    inject / require / capability name
    → Runtime Service 上线、下线、挂起与恢复
```

manifest 中已有或文档中约定的插件依赖字段需要补回 `PluginManifest` 类型并在加载器中实际检查。首版至少需要处理：

- 缺失依赖。
- 禁用依赖。
- 循环依赖。
- 不满足版本范围。
- 可选依赖不存在时的降级。
- 冲突插件同时启用时的诊断。

Provider 动态替换不是首轮必做能力。首轮可以直接拒绝同名 Service 的重复提供，并记录可诊断错误；是否支持优先级、替换和故障转移，留到真实能力接入后决定。

### 4.4 多窗口 Runtime 所有权

前端单例只能保证单个 WebView 内唯一。由于应用存在分离窗口和跨窗口状态同步，正式实现前必须在 Spike 中决定以下方案之一：

- **主窗口持有唯一 Runtime**：其他窗口通过 IPC 请求主窗口操作插件。
- **每个窗口拥有独立 JS Scope**：Native/Sidecar 由主窗口或 Rust 后端统一管理。
- **Rust 后端持有进程级 Runtime**：前端只管理 JS/UI 能力。

在所有权确定前，不能把“全局唯一 RootContext”作为已完成设计。

---

## 5. 详细实施步骤

### 阶段零：技术 Spike 与边界决策

1. 建立最小 `src/services/runtime/` 实现或引入候选 Cordis 包。
2. 编写最小运行时测试：创建 Context、注册 Service、激活插件、创建依赖 Scope、dispose Scope。
3. 验证一个事件监听器、一个定时器和一个异步任务能否被可靠清理。
4. 验证 Tauri/Vite 构建和模块导入方式。
5. 决定包版本、Runtime API、多窗口所有权以及首版 Provider 冲突策略。
6. 将决策结果写回本计划；若选择自研子集，记录与 Cordis 的差异范围。

**阶段出口：** 能运行一个不依赖业务 Store 的最小 Runtime，并通过类型检查和 Vite 构建。

### 阶段一：建立 Scope-aware 宿主桥接

1. 创建 Runtime Context、Scope 和内部 Service Registry。
2. 将当前插件上下文中的注册动作逐步包装为 Scope-aware API：
   - Context Pipeline Processor。
   - Chat 设置分区和设置项。
   - UI Tool 注册。
   - Tauri Event listener。
   - 定时器和后台任务。
3. 每个注册 API 返回幂等 disposer，并在插件 Scope 内自动登记。
4. 保留现有 `PluginContext` 的产品能力（settings、storage、environment 等），不要因为引入 Context 而直接丢失这些 API。
5. 保留 `pluginStates`、`PluginStateService` 和 `ToolRegistryManager`，只增加 Runtime 映射。

### 阶段二：直接迁移 JS 插件协议

由于当前没有第三方插件兼容承诺，不建设长期双协议层。JS 插件直接迁移为新的模块格式，例如：

```typescript
export const name = "my-helper";
export const inject = ["chat:pipeline"] as const;

export function apply(ctx: RpContext) {
  const logger = ctx.logger("my-helper");

  ctx["chat:pipeline"].registerProcessor({
    id: "my-processor",
    name: "助手前置处理器",
    async process(context) {
      logger.info("正在处理消息上下文...");
    },
  });

  ctx.on("chat/session-created", (session) => {
    logger.info(`新会话已创建: ${session.id}`);
  });

  // 定时器必须使用阶段零验证过的 Runtime API。
  ctx.runtimeTimers.setInterval(() => {
    logger.debug("执行插件后台心跳...");
  }, 30000);
}
```

上面的 API 名称只是目标形态示意，必须以阶段零的实际 Spike 结果为准。特别是 `inject/using`、`logger`、定时器和 Scope 返回值不能在未验证前固化为 SDK 契约。

迁移步骤：

1. 创建一个新的内部 Runtime 测试插件，作为 JS 插件的唯一基准样例。
2. 用该测试插件一对一调整 Runtime、PluginManager、Loader 和 SDK。
3. 迁移仓库内需要保留的 JS 插件、示例插件和文档。
4. 删除旧的 `activate/deactivate` 入口及其无 Scope 的注册方式。
5. 通过现有 Tool Registry Bridge 保持插件方法仍能被 executor 调用。

### 阶段三：保留调用链的 Adapter Service 化

#### Sidecar

1. 将 Sidecar 的进程句柄、RPC 调用、事件监听和恢复逻辑封装为 Runtime Service。
2. Service dispose 必须调用现有 Sidecar Adapter 的 disable/stop 清理路径。
3. 保留常驻 Sidecar 的启动握手、崩溃恢复、超时和取消语义。
4. Sidecar 的 manifest methods 和 contributions 继续通过 Tool Registry Bridge 暴露。
5. Service 下线时，明确依赖它的能力是挂起、失败还是回退到其他 Provider。

#### Native

1. 将 Native Adapter 包装为 Runtime Service，但继续通过 Tauri command 管理动态库加载和卸载。
2. 不假设 JS 层可以直接执行 `dlopen`/`dlclose`。
3. `reloadable: false` 的插件禁用语义保持现有约束。
4. Service dispose 必须覆盖 Native unload 失败、调用中和重复 unload 场景。
5. Native 方法继续通过 Tool Registry Bridge 接入现有 executor。

### 阶段四：PluginManager 与 Loader 收敛

1. `PluginManager` 管理插件 Scope 和产品状态，不再让 Adapter 自己同时承担全部 Runtime 状态协调。
2. `PluginLoader` 在加载/启用前完成 manifest 依赖和兼容性诊断。
3. UI 注册、工具注册、能力注册和 Runtime Scope 建立明确的先后顺序。
4. 激活失败时回滚：Scope、UI、Tool Registry、进程/动态库和产品状态必须一致。
5. 明确启用、禁用、卸载、热重载和跨窗口同步时的并发保护。
6. 只有在所有调用方迁移完成后，才删除旧的无 Scope Context 和重复状态路径。

### 阶段五：轻量验证与真实运行态冒烟

验证以一个新测试插件和少量桥接测试为主，不默认执行全仓库回归矩阵。

#### JS Runtime 测试插件

测试插件至少覆盖：

1. `apply()` 激活。
2. 注册一个事件监听器。
3. 注册一个 Processor。
4. 注册一个设置或 UI 贡献。
5. 创建一个定时器或异步任务。
6. dispose 后验证这些资源不再触发或保留。
7. 激活中途抛错时，验证已完成的注册会回滚。

#### 依赖测试插件

创建两个极简插件：

- 插件 A：提供一个测试 Service。
- 插件 B：依赖并消费该 Service。

只验证首版必须成立的行为：

1. A 未激活时，B 不进入 active 状态。
2. A 激活后，B 可以激活并访问 Service。
3. A dispose 后，B 进入计划规定的挂起或失败状态。

#### Sidecar/Native 薄桥接测试

- 复用现有 Sidecar Adapter 测试，增加 Service dispose 到 Adapter disable 的桥接断言。
- Native 只验证 unload command 被调用以及重复/失败场景的状态回滚。
- 不在首轮为每种真实插件业务重新造完整测试环境。

#### 构建与冒烟

```powershell
bun run build:tsc
bun run build:vite
bun run test:run -- <Runtime 相关测试>
```

构建通过后，在真实 Tauri 环境完成一次：

```text
加载 → 启用 → 调用一个方法 → 禁用 → 再次确认资源和工具状态
```

多窗口、复杂 Provider 替换、长时间泄漏检测和完整插件生态回归属于后续根据实际问题追加的专项验证，不作为本次重构的默认门槛。

---

## 6. API 契约草案

以下接口用于说明目标边界，不代表阶段零之前已经确定的最终类型。

### 6.1 Runtime Context

```typescript
import type { Context } from "<selected-runtime-package>";
import type { SettingItem } from "@/types/settings-renderer";

export interface RpContext extends Context {
  // 现有插件能力应通过明确的 Service 或兼容字段继续暴露
  settings: PluginSettingsAPI;
  storage: PluginStorageAPI;
  environment: PluginEnvironmentAPI;

  "chat:pipeline": ChatPipelineService;
  "worldbook:resolver"?: WorldbookService;
  "user-profile:resolver"?: UserProfileService;
  "transcription:service"?: TranscriptionService;

  runtimeTimers: RuntimeTimerService;
}

export interface ChatPipelineService {
  registerProcessor(processor: ContextProcessor): Disposable;
  registerSettingItem(sectionTitle: string, item: SettingItem): Disposable;
}
```

首轮只要求真正接入的 Service 拥有明确实现。Worldbook、User Profile 和 Transcription 的能力边界不在本计划中一次性虚构，待对应模块准备迁移时再补充正式契约。

### 6.2 JS 插件模块

```typescript
export interface RuntimePluginModule {
  name: string;
  inject?: readonly string[];
  apply: (ctx: RpContext) => void | Promise<void>;
}
```

实际使用的依赖字段、配置参数、Service 类型和异步激活语义，以阶段零 Spike 和阶段二测试插件为准。

### 6.3 Tool Registry Bridge

Runtime Service 与现有工具调用链之间需要保留显式桥接：

```text
Cordis/Runtime Service
        ↓
Plugin Tool Registry Bridge
        ↓
ToolRegistryManager
        ↓
Executor / Tool Calling / Smart OCR / VCP
```

该桥接负责保留当前的插件 ID、manifest methods、ToolContext、任务取消、元数据和 contributions 语义。首轮不将 Tool Registry 直接替换成 Runtime Registry。

---

## 7. 风险控制、分支与回滚

### 7.1 分支策略

所有实现工作在独立的 `feature/cordis-runtime` 重构分支进行。该分支允许直接修改内部插件协议和仓库内插件；不要求为外部第三方插件保留兼容层。

插件子仓库仍需在各自仓库中迁移，不应把独立插件仓库的修改混入主应用仓库的无关提交。

### 7.2 回滚策略

1. 在重构分支中保留可运行的基线版本。
2. 阶段零、阶段二和阶段三分别设置可验证的阶段出口。
3. 若 Cordis 包或上游 API 不适合 Tauri/Vite，回退到 `src/services/runtime/` 的项目内最小实现，不改变上层目标 API。
4. 若 Sidecar/Native Service 化影响现有调用链，先保留 Tool Registry Bridge，禁止通过删除旧注册路径来掩盖问题。
5. 任何阶段失败时，以分支回退为主，不在主开发分支保留半完成的双重运行时。

---

## 8. 完成标准

本次重构完成的最低标准：

1. Runtime 方案和依赖版本已经通过阶段零 Spike 确认。
2. 新 JS 测试插件能够激活、注册能力并在 dispose 后清理资源。
3. A/B 依赖测试插件能够按预期激活和挂起。
4. 现有插件方法仍能通过 Tool Registry Bridge 被 executor 调用。
5. Sidecar 和 Native 的启用、调用、禁用路径在真实 Tauri 环境可用。
6. `pluginStates`、持久化启用状态、UI 和 Tool Registry 没有出现明显不一致。
7. `bun run build:tsc` 和 `bun run build:vite` 通过。
8. 旧 JS 插件入口和无 Scope 注册路径已删除，或已经明确标记为后续清理项。

---

## 9. 后续方向

本次完成后，再根据真实 Runtime 使用情况决定是否迁移以下能力：

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

这些能力应从真实模块边界和具体运行需求中逐步抽出，而不是在本次插件生命周期重构中一次性定义完毕。后续 RP-first Conversation Runtime 应能为每次对话轮次生成可追踪的上下文快照，但这属于后续架构工作，不作为本次迁移的完成条件。
