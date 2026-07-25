# Guided Flow 引导模块设计方案

> 状态：Phase 1 通用容器与 Phase 2 版本升级流程已实现；Phase 2 真实 Tauri 安装后重启验收待补；Phase 3–4 待后续接入
>
> 日期：2026-07-25
>
> 关联方案：[知识库迁移方式重构方案](../../src/tools/knowledge-base/docs/Plan/knowledge-base-guided-migration-refactor-plan.md)

## 1. 背景与目标

AIO Hub 目前可以在关于页检查版本更新，也有若干模块自己的配置、导入和迁移流程，但缺少统一的用户引导基础设施。版本更新说明、首次启动设置、新手教程和不可逆数据迁移因此容易各自实现，产生以下问题：

- 用户不知道版本升级后发生了什么；
- 需要用户确认的数据变更可能在启动阶段静默执行；
- 各模块重复实现弹窗、步骤、进度和错误恢复；
- 用户中途关闭窗口后无法继续上次流程；
- 关于页不能重新打开已经看过的版本说明或迁移报告。

本方案引入通用的 **Guided Flow（分步引导流程）** 模块。它负责流程展示、步骤导航、状态持久化、恢复和结果反馈；具体业务流程负责定义步骤内容和业务动作。

目标是让下列场景共用一套运行时：

- 新用户首次使用引导；
- 首次设置模型、主题、数据目录等基础配置；
- 版本升级说明；
- 旧知识库迁移；
- 某个工具或插件的首次使用说明；
- 需要多步确认的高风险操作。

### 1.1 适用范围与暂不纳入

本方案当前只面向桌面端。移动端有独立的产品、交互和架构演进路线，不要求与桌面端共用 Guided Flow 的 UI、目录结构或实现，也不在本方案中设计移动端同步方案。移动端后续如需要类似能力，应另行形成移动端设计。

当前 PC 端尚未接入 i18n，因此流程标题、描述和按钮文案先使用桌面端现有的静态文本模型。未来接入 i18n 时，可以在展示层统一增加文案解析能力，再评估是否扩展流程定义类型；本方案当前不为了尚未落地的多语言能力引入 getter、翻译 key 或跨端文案协议。

本方案不定义消息发送场景，也不引入“Ctrl+Enter 发送”一类与消息输入相关的通用约束。流程中的表单控件遵循自身组件和原生表单语义；涉及迁移、清理等高风险动作时，必须使用明确的按钮和确认步骤，不能依赖回车快捷键直接触发。

弹窗、错误提示、日志记录和错误上报遵循仓库已有的常驻规范，不在 Guided Flow 中重新定义一套规则：

- 通用弹窗和 `BaseDialog` 契约见 [`src/components/common/README.md`](../../src/components/common/README.md)；
- 日志和错误处理见 [`日志与错误处理指南`](../guide/logging-error-handling.md)；
- 配置存储按数据特征选择已有方案，见 [`配置管理指南`](../guide/config-management.md)。

## 2. 设计原则

### 2.1 流程容器与业务动作分离

Guided Flow 只负责：

- 展示标题、步骤、按钮和进度；
- 管理前进、后退、关闭和恢复；
- 保存流程状态；
- 统一处理校验、加载和错误展示。

它不负责理解知识库、模型或版本迁移的业务语义。迁移、备份、校验等动作由具体流程通过服务调用完成。

### 2.2 检测、预览、执行、校验、清理分离

涉及数据写入或不可逆操作的流程必须明确区分：

1. **Detect**：只读检测是否需要操作；
2. **Preview**：展示影响范围、风险和将要发生的变化；
3. **Confirm**：用户明确确认；
4. **Execute**：执行实际动作；
5. **Verify**：校验结果并生成报告；
6. **Cleanup**：另一个独立的、可再次确认的动作。

“打开流程”不能等价于“执行迁移”。

### 2.3 可延后，但不能静默绕过风险

流程可以根据定义允许“稍后处理”，但关闭引导不等于确认操作。对于未完成的关键迁移，相关模块可以保持待处理、只读或不可用状态；不应因为用户关闭了流程就自动在后台继续执行。

### 2.4 版本化且可恢复

流程定义和流程状态都必须有版本。用户中途退出、应用崩溃或动作部分成功后，下一次启动应能恢复、重试或重新检测，而不是从头静默执行。

### 2.5 先做稳定运行时，不做通用流程编辑器

第一阶段只提供代码注册的流程定义和通用容器，不建设拖拽式流程编辑器、远程下发流程或脚本执行引擎。避免为了“通用”而引入难以测试的复杂度。

### 2.6 流程运行时与呈现方式分离

Guided Flow 的流程定义、状态、导航和业务动作不能依赖“弹窗”“路由页面”或“Tauri 独立窗口”等具体呈现方式。步骤组件是由流程外壳承载的普通内容视图，不自行创建弹窗，也不直接控制宿主窗口生命周期。

第一阶段使用主 WebView 内的模态呈现，但组件边界应保留以后增加沉浸式全屏容器或其他呈现适配器的可能，不能把 `Dialog` 写入流程模型、Manager 或 Persistence 的核心语义。

## 3. 总体架构

```text
┌──────────────────────────────────────────────┐
│                 GuidedFlowHost                │
│  选择当前流程，并挂载具体呈现适配器             │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│       GuidedFlowModal + GuidedFlowShell       │
│  BaseDialog 适配层 + 与呈现无关的步骤布局       │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             GuidedFlowManager                 │
│  注册、触发、排队、恢复、完成和重新打开流程     │
└──────────────┬────────────────┬───────────────┘
               │                │
┌──────────────▼──────┐ ┌───────▼──────────────┐
│ GuidedFlowRegistry   │ │ GuidedFlowPersistence │
│ 流程定义和步骤注册    │ │ 状态持久化与恢复       │
└──────────────┬──────┘ └──────────┬─────────────┘
               │                   │
     ┌─────────▼─────────┐ ┌──────▼──────────────┐
     │ Onboarding Flow   │ │ Upgrade Flow        │
     │ 首次使用/初始设置   │ │ 版本说明/升级引导    │
     ├───────────────────┤ ├─────────────────────┤
     │ Module Intro Flow │ │ Knowledge Migration │
     │ 模块首次使用        │ │ 知识库迁移           │
     └───────────────────┘ └─────────────────────┘
```

建议的代码落点：

```text
src/components/common/GuidedFlow/
  GuidedFlowHost.vue
  GuidedFlowModal.vue
  GuidedFlowShell.vue
  GuidedFlowStepper.vue
  GuidedFlowProgress.vue
  GuidedFlowFooter.vue

src/services/guided-flow/
  types.ts
  guidedFlowManager.ts
  guidedFlowRegistry.ts
  guidedFlowPersistence.ts

src/stores/guidedFlowStore.ts

src/flows/
  onboarding/
  upgrade/
  knowledge-migration/
```

具体目录可根据现有组件组织调整，但应保持通用容器、流程定义和业务服务分离。

## 4. 核心模型

### 4.1 流程定义

```ts
export interface GuidedFlowDefinition<TContext = Record<string, unknown>> {
  id: string;
  version: string;
  title: string;
  description?: string;

  trigger: GuidedFlowTrigger;
  priority: number;
  resumable: boolean;
  dismissible: boolean;
  dismissLabel?: string;
  skippable?: boolean;
  skipLabel?: string;
  blockingScope?: "none" | "module" | "application";

  createContext?: () => Promise<TContext> | TContext;
  onCompleted?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  onSkipped?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  onDeferred?: (
    event: GuidedFlowTerminalEvent<TContext>
  ) => Promise<void> | void;
  steps: GuidedFlowStep<TContext>[];
}
```

`id` 标识业务流程，`version` 标识流程定义版本。运行时不会在版本不匹配时自动恢复旧步骤状态；恢复队列会忽略该旧状态，后续手动打开或重新触发时会通过 `createContext` 重新初始化。需要迁移旧状态的具体流程应在自己的领域服务中先完成状态检测或转换，再显式触发新的流程版本。

`dismissible` 表示流程能否延后，`skippable` 表示能否明确写入 `skipped` 终态，两者不能混用。终态回调由 Manager 在统一状态转换路径中触发，使生命周期服务不依赖某个最终步骤组件是否被展示。

### 4.2 步骤定义

```ts
export interface GuidedFlowStep<TContext> {
  id: string;
  title: string;
  description?: string;
  nextLabel?: string;
  backLabel?: string;
  component: Component;

  when?: (context: TContext) => boolean;
  onEnter?: (context: TContext) => Promise<void> | void;
  validate?: (context: TContext) => Promise<boolean> | boolean;
  onNext?: (context: TContext) => Promise<void> | void;
  onBack?: (context: TContext) => Promise<void> | void;
}
```

步骤可以根据检测结果动态显示。例如没有旧知识库时，不显示“备份确认”和“迁移执行”步骤；没有模型配置时，初始设置流程才显示模型设置步骤。

实现中的步骤组件会接收 `context`、`flowState` 和 `updateContext` 三个 props。步骤应通过 `updateContext` 保存可恢复的小型上下文；不能直接把 API Key、完整正文、向量或其他领域大对象写入该上下文。

### 4.3 流程状态

```ts
export interface GuidedFlowState {
  flowId: string;
  flowVersion: string;
  status:
    "pending" | "in-progress" | "completed" | "skipped" | "failed" | "deferred";

  currentStepId?: string;
  completedStepIds: string[];
  context?: Record<string, unknown>;

  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  lastError?: string;
}
```

运行时还会标记当前呈现是 `persistent` 还是 `replay`。`replay` 使用临时状态，从首个可见只读步骤开始，关闭或完成后均不覆盖上表中的持久化终态。

状态持久化至少需要支持：

- 当前步骤；
- 已完成步骤；
- 业务上下文的安全子集；
- 最近错误；
- 延后状态；
- 流程版本；
- 最后更新时间。

不得把 API Key、完整文档正文、完整向量或其他敏感大对象直接写入通用流程状态。业务服务应保存自己的详细状态，流程只保存引用、摘要和可恢复所需的信息。

## 5. 触发和排队

### 5.1 触发类型

```ts
export type GuidedFlowTrigger =
  | "first-install"
  | "version-changed"
  | "pending-migration"
  | "module-first-use"
  | "manual";
```

应用启动完成后，`GuidedFlowManager` 根据应用生命周期、模块状态和迁移检测结果生成待处理流程队列。

### 5.2 版本升级识别

应用生命周期状态与 Guided Flow 运行状态分开保存。生命周期状态只描述“应用启动过哪些版本、哪些版本说明已明确处理”，不复制当前步骤、队列或业务迁移状态：

```ts
interface AppLifecycleState {
  schemaVersion: 1;
  lastLaunchedVersion?: string;
  releaseNotes: Record<
    string,
    {
      status: "completed" | "skipped";
      acknowledgedAt: string;
    }
  >;
}
```

判断依据是当前应用版本和上次启动版本是否变化，而不是是否刚刚使用了应用内更新器。这样可以覆盖手动安装、便携版、离线更新和开发环境启动。`lastLaunchedVersion` 只用于识别版本转换，不能代替版本说明确认状态；用户延后版本说明后，即使随后又升级了应用，尚未处理且仍在本地资源目录中的版本说明也应继续进入候选集合。

版本说明只有在流程完成或用户明确选择“跳过本版本说明”后，才写入 `releaseNotes`。普通关闭只产生 `deferred` 流程状态，不得提前标记为已读。同一版本的版本说明只自动展示一次，但可以从关于页以只读回放模式永久重新打开。开发环境应提供显式的测试重置方式，不应通过每次启动自动重复弹出解决。

### 5.3 排队策略

同一时间只展示一个流程。建议优先级：

1. 必须处理的应用级流程；
2. 用户明确相关的模块级迁移；
3. 版本说明；
4. 首次设置；
5. 模块首次使用教程。

版本说明和迁移有关时，优先合并成一个升级流程，而不是连续打开多个弹窗。

## 6. UI 交互规范

### 6.1 呈现形态

第一阶段采用 **主 WebView 内的模态引导**，而不是新建 Tauri 独立窗口，也不把流程实现成一个需要跳转的业务路由页面：

- 模态层能在不破坏当前工具、路由和表单上下文的前提下阻止用户误操作底层界面；
- 自动触发、排队和关于页重新打开都可以进入同一个全局 `GuidedFlowHost`；
- Tauri 独立窗口需要额外处理多 WebView 状态同步、窗口关闭拦截、焦点、父子窗口关系和恢复，且默认不能真正阻止主窗口继续操作；
- 路由页面会把流程生命周期与导航栈、`keep-alive` 和返回行为耦合，不适合作为启动后自动出现的统一入口。

这里的“模态”只是一种呈现适配器，不是流程模型的一部分。推荐组件职责如下：

- `GuidedFlowHost`：位于主应用全局层，只选择并承载当前流程；
- `GuidedFlowModal`：使用 `BaseDialog` 提供遮罩、层级和尺寸边界；
- `GuidedFlowShell`：提供标题、步骤、内容、错误区和底部操作区，不依赖 `BaseDialog`；
- 具体步骤组件：只渲染当前步骤内容，不自行嵌套 `BaseDialog`，也不把自己实现成路由页面。

如果以后出现必须长期与主界面并行操作、需要跨路由常驻或内容规模确实无法由模态层承载的流程，可以新增沉浸式全屏或独立窗口适配器；第一阶段不为这些尚未出现的场景增加多窗口复杂度。窄窗口下可以让同一个模态适配器接近全屏，而不是切换成另一套流程实现。

### 6.2 `BaseDialog` 能力边界

现有 `BaseDialog` 已提供 Teleport、动态层级、主题样式、头部/内容/底部插槽、内容滚动、加载态、尺寸和最大尺寸约束、遮罩关闭开关以及关闭后销毁，足以作为第一阶段的基础模态外壳。

但 Guided Flow 不能直接把 `BaseDialog` 的默认关闭行为当作流程取消协议：

- `BaseDialog` 当前没有异步 `beforeClose` 或可否决的关闭请求；
- 高风险步骤执行中、存在未保存输入或流程不可延后时，需要由 Flow Manager 决定能否退出；
- 原生应用窗口关闭、崩溃和重启恢复不属于 Vue 弹窗的职责；
- 焦点圈定、初始焦点和关闭后焦点恢复需要在实现和 UI 测试中专门验证，不能只依赖视觉遮罩。

因此 `GuidedFlowModal` 应关闭默认的遮罩点击退出，并根据流程状态控制关闭入口。需要关闭按钮时，优先在 `GuidedFlowShell` 中发出 `requestClose`，由 Manager 完成校验、持久化和退出；不要让步骤组件直接修改 `BaseDialog` 的 `v-model`。若后续确认关闭拦截或可访问性能力对其他弹窗也普遍有用，再以向后兼容方式增强 `BaseDialog`。

Guided Flow 仍应复用项目主题变量和通用按钮规范，不得把 `el-dialog` 的专有属性直接传给 `BaseDialog`。具体基础契约以 [`通用组件说明`](../../src/components/common/README.md) 为准。

### 6.3 通用布局

建议包含：

- 顶部标题、应用或模块标识；
- 步骤指示器；
- 当前步骤编号，例如“第 2 步，共 5 步”；
- 中间内容区域；
- 底部操作区；
- 异步操作时的加载和错误区域；
- 最终结果摘要。

### 6.4 两种进度必须分开

**流程进度**表示用户位于哪个步骤：

```text
第 3 步，共 5 步
```

**任务进度**表示当前步骤内的实际工作量：

```text
正在迁移条目 128 / 1286
██████░░░░░░ 10%
```

迁移、导入、索引重建等任务不得只使用流程进度条代替真实任务进度。

### 6.5 操作按钮

按钮语义应明确：

- `上一步`：返回前一步，不执行隐式回滚；
- `下一步`：校验当前输入后进入下一步；
- `稍后处理`：仅在流程允许延后时显示，写入 `deferred`；
- `跳过本版本说明`：仅在流程明确允许跳过时显示，写入 `skipped`；
- `关闭`：只读 replay 的退出动作，不修改持久化终态；
- `开始迁移`、`确认清理`：对高风险动作使用明确动词；
- `重新检测`：放弃不可信的旧上下文并重新读取事实状态；
- `完成`：确认用户已经看到结果，并关闭流程。

不可逆操作的确认文案不能使用模糊的“确定”或“继续”。

## 7. 恢复、失败和取消

### 7.1 可恢复流程

流程中途关闭后：

- `resumable: true` 的流程下次打开时恢复当前步骤；
- `resumable: false` 的流程下次打开时必须重新检测；
- 业务动作是否可重试由业务服务决定；
- 流程容器不应假设“重新点击”一定安全。

### 7.2 错误展示

错误展示遵循仓库现有的日志与错误处理规范，见 [`日志与错误处理指南`](../guide/logging-error-handling.md)。Guided Flow 负责把业务错误转换成当前步骤可理解的操作选项，不重复实现日志和错误上报机制。

错误页面应包含：

- 当前阶段；
- 已完成的数量或步骤；
- 可重试、重新检测或退出选项；
- 指向详细报告的入口；
- 不包含正文、API Key 或完整向量的诊断摘要。

实现时使用 `createModuleLogger` 和 `createModuleErrorHandler`，同一个 `catch` 中不得同时重复记录 logger 与 error handler；具体记录策略以常驻规范为准。

### 7.3 部分成功

部分成功必须是显式状态，不得显示为普通成功。用户应看到：

- 成功处理数量；
- 跳过数量；
- 待重建数量；
- 问题列表；
- 下一步恢复建议。

## 8. 持久化方案

流程状态的存储方式根据数据形态、修改频率和事实所有权选择，不强制所有流程使用同一个存储实现。大数据、复杂索引、长时间任务和迁移报告仍归属各自领域存储。

建议分层：

| 数据                             | 所有者            | 存储建议                                                                                           |
| -------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| 当前流程、当前步骤、流程终态     | Guided Flow       | 低频、扁平状态可使用项目配置管理能力；具体实现遵循 [`配置管理指南`](../guide/config-management.md) |
| 应用版本转换、已处理版本说明     | 应用生命周期服务  | 独立的低频扁平配置；不与步骤状态或远程 updater 状态混存                                            |
| 高频任务进度                     | 业务任务/迁移领域 | 使用任务或领域状态；必要时再考虑 `saveDebounced`，不默认写入通用流程配置                           |
| 迁移任务状态、source fingerprint | 迁移领域          | Recall/Knowledge 数据库                                                                            |
| 详细迁移报告                     | 迁移领域          | 领域数据库或报告文件                                                                               |
| 版本说明正文                     | 发布资源          | 应用内静态资源                                                                                     |

通用流程状态只保存领域记录的 ID、摘要或恢复标记，避免把领域真相复制到应用配置中。是否使用 `createConfigManager`、`saveDebounced` 或领域专用存储，由具体流程按实际数据特征决定。

## 9. 与应用初始化的集成

现有应用初始化入口为 `src/stores/appInitStore.ts`。建议在基础服务和工具注册完成、应用进入 ready 状态后执行：

```text
加载配置
  ↓
初始化主题、工具和基础服务
  ↓
应用 ready
  ↓
只读解析版本生命周期和待处理迁移
  ↓
生成 Guided Flow 队列
  ↓
显示第一个流程
```

不要把耗时迁移、备份或索引重建放在应用首屏初始化链路中。启动阶段只做必要的只读检测；真正的数据动作应在用户确认后执行。

## 10. 安全和边界

- 引导流程不能绕过领域服务的权限、路径和输入校验；
- 不能通过通用流程上下文传递敏感凭据；
- 不得用前端按钮状态作为迁移完成的唯一依据；
- 领域服务必须自己验证 source fingerprint、状态和目标数据；
- 应用级流程状态损坏时，应允许清除流程状态并重新检测，不得删除业务数据；
- 所有高风险清理操作必须再次校验事实状态，不能只相信上一次预览结果；
- Guided Flow 不承担跨端同步、消息发送或通用快捷键策略；这些问题由对应端和对应业务组件自行处理。

## 11. 测试要求

### 11.1 单元测试

- 流程步骤条件计算；
- 前进、后退和跳过规则；
- 流程版本升级；
- 状态持久化和恢复；
- 失败、重试和部分成功状态；
- 队列优先级和去重；
- 同一版本说明只自动展示一次。

### 11.2 UI 测试

- 首次安装流程；
- 版本升级流程；
- 中途关闭后继续；
- 异步步骤加载、进度和错误；
- 主题、窄窗口、接近全屏形态和长文本布局；
- 不可延后或异步执行中的流程无法通过遮罩、Escape 或关闭按钮绕过；
- 焦点进入流程、在流程内移动，并在关闭后合理恢复；
- 关于页重新打开已完成流程。

### 11.3 真实 Tauri 验证

涉及 Tauri IPC、窗口生命周期、原生文件和迁移任务时，不能只依赖普通浏览器验证。应按照仓库的工具测试、Tauri E2E 和 Windows UI Automation 说明执行真实验证。

## 12. Phase 2：版本升级流程详细设计

### 12.1 定位与边界

Phase 2 处理的是**当前版本已经安装并启动后**的升级说明与相关待办，不替代现有的在线更新检查和安装能力。三个概念必须分开：

| 概念           | 事实来源                                  | 主要入口                     | 是否属于 Guided Flow          |
| -------------- | ----------------------------------------- | ---------------------------- | ----------------------------- |
| 当前已安装版本 | 根 `package.json` 经 Tauri 暴露的应用版本 | 应用启动、关于页             | 是升级识别输入                |
| 线上可更新版本 | Tauri updater / GitHub Releases           | 关于页“检查更新”             | 否，继续由 `app-updater` 负责 |
| 已安装版本说明 | 随应用打包的本地发布资源                  | 启动自动展示、关于页重新打开 | 是                            |

因此：

- `src/services/app-updater.ts` 继续负责检查、下载、安装和重启，不把远程 `Update` 对象放入 Guided Flow 上下文；
- GitHub Release 正文只用于“发现可更新版本”弹窗，不能作为已安装版本说明的唯一来源；
- 应用完成安装并重启后，再由版本生命周期服务触发本地升级流程；
- 网络不可用、GitHub 不可达或 updater 检查失败，不影响用户查看当前已安装版本的说明；
- Phase 2 不执行知识库迁移，但要提供稳定的升级事项贡献契约，供 Phase 3 接入。

### 12.2 现有实现的复用与调整

| 当前实现                                     | Phase 2 处理方式                                         |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/services/app-updater.ts`                | 保留更新通道、远程检查、下载安装和重启职责               |
| `src/composables/useAppUpdater.ts`           | 保留远程更新状态；不与升级流程状态合并                   |
| `src/views/Settings/about/AboutSettings.vue` | 将“检查更新”和“查看当前版本说明”拆成两个明确入口         |
| `src/services/guided-flow/`                  | 复用注册、排队、恢复和通用外壳，并补充回放与终态事件能力 |
| `guided-flow-state.json`                     | 继续保存流程运行状态，不保存发布说明正文和领域迁移报告   |
| 新增应用生命周期配置                         | 保存版本转换和已处理版本集合，不能由关于页组件自行维护   |

现有关于页更新弹窗可以继续展示远程版本正文和安装进度。它与升级流程即使使用相似视觉组件，也不能共享同一份状态，避免“检查到了新版本”被误记成“用户已经看过已安装版本说明”。

### 12.3 建议代码结构

```text
src/flows/upgrade/
  index.ts
  upgradeFlowComposer.ts
  upgradeContributionRegistry.ts
  appLifecycleService.ts
  releaseNotesRegistry.ts
  types.ts
  components/
    UpgradeOverviewStep.vue
    UpgradeReleaseNotesStep.vue
    UpgradeActionsStep.vue
    UpgradeCompleteStep.vue
  releases/
    index.ts
    v0.7.0.md
    v0.7.0.ts

src/services/guided-flow/
  types.ts                    # 增加 replay 与终态事件契约
  guidedFlowManager.ts        # 支持不污染持久化状态的只读回放
```

版本资源目录按真实版本逐步增加，不要求预先补齐所有历史版本。文件名只是组织方式，版本匹配必须以 manifest 中的规范化 `version` 为准。

### 12.4 本地版本说明资源

版本说明采用“类型化 manifest + 本地 Markdown 正文”。Markdown 通过 Vite 静态导入随应用打包，不能在应用启动时从远程下载：

```ts
interface ReleaseNoteManifest {
  version: string;
  revision: number;
  channel: "stable" | "prerelease";
  title: string;
  summary: string;
  publishedAt: string;
  body: string;
  highlights?: string[];
  contributionIds?: string[];
  unknownBaselinePolicy?: "manual-only" | "show-current";
}
```

字段约束：

- `version` 使用去掉 `v` 前缀后的应用 SemVer，并与对应发布包版本一致；
- `revision` 只表示同一应用版本内的流程资源修订，开发阶段修改步骤或正文结构时递增；正式发布后不得远程替换本地正文；
- `body` 是可信的仓库内 Markdown，不允许携带可执行脚本；渲染继续复用 `RichTextRenderer` 的安全边界；
- `contributionIds` 声明该版本希望展示的升级事项，实际是否出现仍以贡献方的只读检测结果为准；
- `unknownBaselinePolicy` 默认 `manual-only`。只有首次引入生命周期记录或包含必须告知事项的版本，才显式使用 `show-current`。

发布构建应增加一致性检查：生产版本必须存在与根 `package.json` 匹配的 manifest，版本号不可重复，Markdown 文件必须可导入，`contributionIds` 必须能在内置贡献注册表中解析。该检查应接入现有检查或发布链路，具体脚本名称在施工时按根 `package.json` 的当前结构确定。

### 12.5 升级流程上下文

流程上下文只保存可序列化的展示快照和领域记录引用：

```ts
interface UpgradeFlowContext {
  mode: "automatic" | "manual-replay";
  currentVersion: string;
  previousLaunchedVersion?: string;
  releaseVersions: string[];
  primaryReleaseVersion: string;
  transition: "upgrade" | "downgrade" | "same-version" | "unknown-baseline";
  contributions: Record<
    string,
    {
      instanceKey: string;
      status: "pending" | "completed" | "unavailable";
      snapshot: unknown;
      reportRef?: string;
    }
  >;
}
```

不得放入上下文的内容包括 Vue 组件实例、函数、Tauri updater 的 `Update` 对象、数据库连接、大体积报告正文、密钥和用户业务正文。贡献方的 `snapshot` 必须是经过裁剪的只读摘要；详细事实仍由领域服务和领域存储持有。

### 12.6 流程实例版本

Phase 1 当前以固定 `flowId` 保存一份状态。升级流程不能只使用固定的定义版本，否则用户完成一次后，后续应用版本会被误判为同一已完成流程。Phase 2 组装定义时应生成稳定的实例版本：

```text
app-upgrade@<flow-schema>/<current-app-version>/<release-fingerprint>/<contribution-fingerprint>
```

其中：

- `flow-schema` 在步骤语义或上下文结构不兼容时递增；
- `current-app-version` 确保每个安装版本有独立流程实例；
- `release-fingerprint` 由本次聚合的所有 `version + revision` 稳定生成，支持同版本开发期资源调整；
- `contribution-fingerprint` 由已检测到的贡献项 `id + revision + instanceKey` 稳定生成，不包含随机值和时间戳。

`flowId` 仍固定为 `app-upgrade`，以便关于页、队列和测试使用稳定入口。若定义版本变化，Phase 1 的既有规则会重新创建通用流程状态；领域贡献必须依靠自己的 `instanceKey`、migration ID 和 fingerprint 保证业务动作幂等，不能只依赖 Guided Flow 的定义版本。

### 12.7 启动判定与状态提交顺序

启动后的只读探测顺序如下：

```text
应用 ready
  ↓
读取当前应用版本与 AppLifecycleState
  ↓
规范化并比较 current / lastLaunchedVersion
  ↓
收集尚未处理的本地版本说明
  ↓
执行升级贡献项的只读 detect
  ↓
组装 upgrade definition 与 context
  ↓
先持久化 pending Guided Flow，再更新 lastLaunchedVersion
  ↓
进入全局队列
```

先写入待处理流程、再更新 `lastLaunchedVersion`，是为了避免应用在两次写入之间退出后永久丢失自动展示机会。若第二次写入失败，下次启动可以再次执行探测；Manager 的队列去重和既有 pending 状态应避免同一运行期重复入队。

判定规则：

| 场景                       | 自动行为                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `current > lastLaunched`   | 收集升级路径中未处理且本地存在的版本说明，并检测贡献项                 |
| `current === lastLaunched` | 不创建新的纯版本说明流程；恢复既有 pending/deferred/failed 流程        |
| `current < lastLaunched`   | 记录降级，不自动把升级说明当作新版本弹出；仍检测独立的高风险待办       |
| 无生命周期基线             | 按当前 manifest 的 `unknownBaselinePolicy` 决定是否展示当前版本        |
| 当前版本缺少本地 manifest  | 记录警告并跳过纯说明自动弹窗；不能用远程正文静默替代                   |
| 跨多个版本升级             | 将未处理的本地说明聚合到同一流程，当前版本优先展示，历史版本可折叠查看 |

`releaseNotes[version]` 只在以下终态写入：

- 用户走到升级流程完成页：`completed`；
- 用户点击明确的“跳过本版本说明”：`skipped`。

关闭、Escape 请求、应用退出、执行失败和普通延后都不能写入已处理状态。包含未完成的阻塞型贡献项时，不显示“跳过整个升级流程”，只能延后或按领域规则继续处理。

### 12.8 升级事项贡献机制

为了让版本说明与知识库迁移等事项在同一升级体验中呈现，Phase 2 增加只面向内置模块的贡献注册表：

```ts
interface UpgradeContributionDefinition<TSnapshot> {
  id: string;
  revision: number;
  order: number;
  appliesTo(releases: ReleaseNoteManifest[]): boolean;
  detect(input: {
    currentVersion: string;
    previousLaunchedVersion?: string;
  }): Promise<{
    instanceKey: string;
    snapshot: TSnapshot;
    blockingScope: "none" | "module" | "application";
  } | null>;
  steps: GuidedFlowStep<UpgradeFlowContext>[];
}
```

约束如下：

- `detect` 必须只读、可重入，并且适合在 ready 后的后台启动任务中执行；
- `instanceKey` 必须来自领域事实，例如 `migrationId + sourceFingerprint`，不能使用当前时间；
- 贡献步骤可以调用领域服务，但不可把迁移事实写回通用生命周期配置；
- 贡献项没有被检测到时，其步骤通过 `when` 隐藏；
- 多个贡献按 `order` 稳定排序，阻塞范围取所有待处理贡献中的最高级别；
- 插件动态贡献、远程下发贡献和脚本化步骤不属于 Phase 2；第一版只支持仓库内置模块。

Phase 2 先实现注册、检测、组装和只读事项摘要。Phase 3 的知识库迁移再提供具体 contribution、步骤组件和领域动作。这样 Phase 3 不需要修改升级中心的生命周期和关于页入口。

### 12.9 步骤编排

升级流程的基础步骤为：

1. **升级概览**：显示从哪个版本进入当前版本、聚合了多少份说明、是否存在必须处理的事项；
2. **版本说明**：展示当前版本正文，跨版本升级时提供历史版本折叠区；
3. **升级事项**：仅在检测到 contribution 时显示，列出影响模块、风险、预计动作和阻塞范围；
4. **贡献步骤**：按贡献注册顺序插入检测、预览、确认、执行、校验和报告步骤；
5. **完成摘要**：区分说明已读、事项已完成、事项已延后、部分成功和报告入口。

交互规则：

- 纯版本说明流程可关闭和明确跳过，按钮文案使用“稍后查看”和“跳过本版本说明”；
- 只要存在未完成的模块级或应用级贡献项，关闭只能产生 `deferred`，不能把整个流程标记为 `skipped`；
- 贡献步骤执行中沿用 Manager 的 busy 锁，禁用返回、关闭和重复提交；
- 流程步骤进度显示“当前处于第几步”，迁移任务进度仍由贡献组件使用 `GuidedFlowProgress` 单独展示；
- 完成页从领域报告引用读取最新摘要，不把第一次检测快照伪装成最终结果。

### 12.10 手动重开与只读回放

关于页“查看当前版本说明”不能直接使用当前的 `open(flowId, { restart: true })`。当前实现会覆盖已完成状态；如果用户随后关闭，流程会变成 `deferred`，导致下一次启动错误地再次自动排队。

Phase 2 需要给通用运行时增加明确的回放模式：

```ts
interface GuidedFlowOpenOptions {
  mode?: "resume" | "restart" | "replay";
}
```

- `resume`：恢复持久化状态，是默认行为；
- `restart`：丢弃旧运行状态并重新创建，仅供显式重新执行或开发测试；
- `replay`：从首个只读步骤打开临时运行态，不修改原有 completed/skipped 状态，不参与下次启动恢复。

`replay` 还必须满足：

- 不持久化临时步骤位置和关闭状态；
- 不展示会重复执行业务写入的贡献步骤；
- 已完成贡献只展示报告摘要和“前往模块”入口；
- 发现贡献仍处于 pending/failed 时，引导用户切换到正式 `resume`，而不是在回放态执行；
- 关闭后恢复打开前的焦点，不改变自动展示判定。

此外，Manager 需要提供完成、跳过、延后三类终态回调或事件。生命周期服务只监听 `completed` 和 `skipped` 写入版本处理记录；`deferred` 只保留恢复资格。不能把这些写入逻辑塞进最终 Vue 步骤组件，否则遮罩关闭、快捷关闭和未来其他呈现适配器会绕过状态同步。

### 12.11 关于页与升级入口

关于页调整为三个互不混淆的动作：

1. **查看当前版本说明**：始终读取本地 manifest，以 `replay` 打开；
2. **继续待处理升级事项**：仅在存在 pending/deferred/failed 的升级流程或贡献项时显示，以 `resume` 打开；
3. **检查更新**：继续调用 `useAppUpdater()`，展示远程可用版本并执行安装或跳转下载。

关于页不直接读写 `app-lifecycle.json`，而是调用升级流程服务暴露的查询和打开方法。现有按住 Alt 强制展示远程更新弹窗的调试能力即使保留，也不能承担重置生命周期或重复触发本地版本说明的职责。开发环境应提供独立的“重置当前版本说明状态”测试入口或测试辅助函数，并限制在开发构建中。

后续如果增加独立“升级中心”页面，该页面也只能作为查询和打开入口；流程执行仍由全局 `GuidedFlowHost` 承载，不能再实现一套步骤状态机。

### 12.12 初始化集成

升级流程的注册与触发安排在现有 `appInitStore` 进入 ready 后的后台任务中：

1. 基础配置、主题、工具和服务注册完成；
2. 注册内置 release manifests 与 upgrade contributions；
3. 初始化 Guided Flow Manager，先恢复已有流程；
4. 执行版本生命周期和 contribution 的只读探测；
5. 仅在需要时组装并注册当前会话唯一的升级流程定义，然后触发；
6. 由 Manager 与其他流程一起按优先级排队。

必须避免 `GuidedFlowHost` 自己承担版本探测。Host 只负责展示；生命周期服务负责事实判断；`appInitStore` 或独立 startup task 负责启动时序。探测失败不阻塞应用 ready，只记录模块化错误并保留关于页手动重试入口。

### 12.13 失败与降级策略

- 生命周期配置损坏：备份或重置该配置，按 unknown baseline 处理，不删除 Guided Flow 或领域数据；
- 单份历史 Markdown 缺失：跳过该历史正文并在概览标记“说明资源不可用”，仍展示当前版本；
- 当前版本 manifest 缺失：不自动弹出空流程，关于页显示“此构建未包含本地更新说明”；
- contribution 检测失败：该事项显示为“暂时无法检测”，不得默认视为无需处理；
- 版本字符串无法比较：记录原值，按 unknown transition 处理，不通过字符串大小猜测升级或降级；
- 用户切换 stable/prerelease 更新通道：只影响远程更新检查，不改写已安装版本说明和生命周期记录；
- 应用离线：本地说明和本地领域检测正常工作，仅远程检查更新不可用。

### 12.14 Phase 2 测试矩阵

除第 11 节的通用测试外，Phase 2 至少覆盖：

- `0.7.0 -> 0.7.1` 自动展示一次，完成后同版本重启不再展示；
- 用户关闭后状态为 deferred，下次启动从正确步骤恢复；
- 用户明确跳过后不再自动展示，但关于页仍可 replay；
- `0.7.0 -> 0.8.0` 能聚合中间未处理且本地存在的说明；
- prerelease 到 stable、stable 到 prerelease 依据 SemVer 和本地 manifest 正确选择；
- 降级启动不把旧版本错误识别成新升级；
- 生命周期文件缺失时分别验证 `manual-only` 和 `show-current`；
- 当前版本 manifest 缺失时不弹空白流程；
- replay 不修改原 completed/skipped 状态，也不会在重启后入队；
- contribution fingerprint 变化时能重新组装流程，业务动作仍由领域幂等校验保护；
- 远程检查失败不影响本地版本说明；
- 关于页三个入口的加载、禁用、错误和焦点恢复行为；
- Vite 生产构建能正确打包 Markdown 资源和动态步骤组件；
- 真实 Tauri 环境中验证版本获取、安装后重启和启动触发时序。

### 12.15 施工顺序

1. 新增 release manifest、生命周期服务和对应单元测试；
2. 为 Guided Flow 增加 `replay` 运行态与终态事件，并补齐 Manager 测试；
3. 新增 contribution registry 和升级流程 composer；
4. 实现基础四步 UI，并接入全局注册/启动任务；
5. 重构关于页入口，保留现有 updater 职责；
6. 增加发布资源一致性检查、Vite 构建验证和真实 Tauri smoke test；
7. Phase 3 再注册知识库迁移 contribution，不在 Phase 2 中提前实现领域迁移。

截至 2026-07-25，前六项的代码、单元测试、类型检查、本地版本资源检查和 Vite 生产构建已经完成。普通浏览器不能替代 Tauri WebView、应用版本 API 和安装后重启链路，因此真实 Tauri smoke test 保留到发布候选包验收。

## 13. 分阶段实施

### Phase 1：通用容器（已实现）

- 类型、注册表和状态模型；
- `GuidedFlowHost`、`GuidedFlowModal` 与呈现无关的 `GuidedFlowShell`；
- 基于 `requestClose` 的前进、后退、关闭、恢复和完成；
- 默认禁止遮罩点击退出，按 `dismissible` 和运行状态提供明确关闭入口；
- 应用配置中的流程状态。

当前实现位于 `src/services/guided-flow/`、`src/stores/guidedFlowStore.ts` 和
`src/components/common/GuidedFlow/`。通用运行时支持按优先级排队、可恢复流程、
流程版本失配后的重新初始化、条件步骤重算、明确延后、显式跳过、终态事件和不污染
持久化终态的只读回放。当前已注册版本升级流程；知识库迁移和首次设置仍待接入。

### Phase 2：版本升级流程（已实现）

- 已增加独立的版本生命周期记录和 `0.7.0-alpha.1` 本地 release manifest；
- 已按当前应用版本、资源 revision 和贡献 fingerprint 生成流程实例版本；
- 已增加升级事项 contribution registry，为 Phase 3 预留组合入口；
- 已补充 Guided Flow 的只读 `replay`、显式跳过、终态事件和并发初始化去重；
- 已在关于页拆分“版本说明”“继续升级事项”和“检查更新”；
- 已增加 release manifest 构建一致性检查及生命周期、跨版本、降级和回放测试；
- Vite 生产构建已通过，真实 Tauri 安装后重启 smoke test 待发布候选包补验。

### Phase 3：知识库迁移流程

- 只读检测；
- 迁移预览；
- 明确确认；
- 执行、校验、报告和恢复；
- 独立的旧数据清理确认。

### Phase 4：首次设置和模块引导

- 首次安装流程；
- 模型和主题初始设置；
- 模块首次使用教程；
- 将现有零散引导逐步迁入通用容器。

## 14. 验收标准

- 同一版本只自动展示一次版本说明；
- 关于页可以随时打开当前版本说明；
- 关闭流程后能按策略恢复或重新检测；
- 未经用户确认，不执行不可逆业务数据操作；
- 迁移的任务进度与流程步骤进度分开显示；
- 领域迁移失败或部分成功时，用户能看到明确结果和恢复入口；
- 同一流程不会因为开发环境重复启动而无条件重新执行。
