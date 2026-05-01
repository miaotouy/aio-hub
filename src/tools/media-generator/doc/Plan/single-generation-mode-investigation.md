# 单次生成模式与任务系统解耦调研报告（修订版）

## 1. 需求背景

用户希望增加一个"单次生成模式"（Single Generation Mode），专门针对那些不需要上下文、直接提交任务的模型（如文生图、文生视频）。

但本次工作不仅仅是一个功能新增。更深层的问题是：**当前任务系统与会话系统深度耦合**，导致以下后果：

- 任何任务都必须依附于一个会话（Session）才能存在，无法独立运行。
- `useMediaGenerationManager`（执行器）无法被 Agent、批量脚本、或未来的流水线直接复用。
- 随着功能膨胀，`mediaGenStore` 正在变成"上帝对象"，混杂了会话管理、节点树、任务调度、持久化等多种职责。

因此本次目标分为两层：

| 层次       | 目标                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| **架构层** | 将任务系统（Task Core）从会话系统（Session Tree）中解耦，让任务成为可独立运作的一等公民 |
| **功能层** | 基于解耦后的架构，派生"单次生成模式"和"批量生成"界面                                    |

---

## 2. 现状分析：耦合链路全追踪

### 2.1 当前的数据流全景

以下是用户点击"发送"按钮后，一条生成任务经历的完整路径：

```
MediaGenerationInput.handleSend()
  → useMediaGenerationManager.startGeneration(options, type)
    → 构造 MediaTask 对象（含 prompt、modelId、翻译结果等）
    → mediaStore.addTask(task)                         // ← 第一处耦合
      → taskActionManager.addTaskNode(task, attachments)
        → nodeManager.createNode({ role: "user" })     // 创建 User 节点
        → nodeManager.addNodeToSession(...)             // 插入会话树
        → nodeManager.createNode({ role: "assistant" }) // 创建 Assistant 节点
        → nodeManager.addNodeToSession(...)             // 再次插入会话树
        → syncActiveLeaf()                              // 更新活跃叶子节点
    → executeGeneration(task)                           // 实际 API 调用
      → 读取 mediaStore.messages 构造上下文              // ← 第二处耦合
      → sendRequest(...)
      → mediaStore.updateTaskStatus(...)                 // ← 第三处耦合
        → taskManager.updateTaskStatus(...)              // 更新任务池
        → nodes.value[taskId].metadata.taskSnapshot = ... // 手动同步节点状态
        → nodes.value[taskId].status = "complete"       // 手动同步节点状态
```

每一步的源码位置如下：

| 步骤      | 文件                                                                          | 行号    | 说明                                      |
| --------- | ----------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| UI 触发   | [`MediaGenerationInput.vue`](../components/MediaGenerationInput.vue)          | 185     | `startGeneration(options, mediaType)`     |
| 构造任务  | [`useMediaGenerationManager.ts`](../composables/useMediaGenerationManager.ts) | 224-266 | `startGeneration()` 内部                  |
| **耦合①** | [`useMediaGenerationManager.ts`](../composables/useMediaGenerationManager.ts) | 266     | `mediaStore.addTask(task)` 硬编码         |
| 创建节点  | [`useTaskActionManager.ts`](../composables/useTaskActionManager.ts)           | 54-110  | `addTaskNode()` 完整逻辑                  |
| **耦合②** | [`useMediaGenerationManager.ts`](../composables/useMediaGenerationManager.ts) | 117     | 从 `mediaStore.messages` 读取上下文       |
| API 调用  | [`useMediaGenerationManager.ts`](../composables/useMediaGenerationManager.ts) | 48-219  | `executeGeneration()`                     |
| **耦合③** | [`mediaGenStore.ts`](../stores/mediaGenStore.ts)                              | 176-195 | `updateTaskStatus()` 同时更新任务池和节点 |

### 2.2 耦合点逐一分析

#### 耦合①：`startGeneration` 硬编码 `store.addTask`

```typescript
// useMediaGenerationManager.ts:266
const startGeneration = async (options, type) => {
  // ...构造 task...
  mediaStore.addTask(task); // ← 无论什么场景，都走会话模式提交
  await executeGeneration(task);
};
```

**问题**：`startGeneration` 是 `useMediaGenerationManager` 的公共入口，但它内部强制调用了 `store.addTask`。这意味着：

- 任何想用这个执行器的调用方（Agent、批量脚本），都会被迫创建一个会话节点。
- `useMediaGenerationManager` 对 `mediaGenStore` 形成了**硬依赖**，无法独立测试或复用。

#### 耦合②：`executeGeneration` 依赖 `mediaStore.messages` 构造上下文

```typescript
// useMediaGenerationManager.ts:117-154
const executeGeneration = async (task) => {
  // ...
  let contextMessages = mediaStore.messages.filter((m) => m.id !== taskId);
  // 根据 includeContext / contextMessageIds 进行裁切...
  // 构造多轮对话的 messages 数组发给 API
};
```

**问题**：上下文裁切逻辑直接读取 `mediaStore.messages`——这是会话节点树的数据。在单次模式下，没有会话节点树，`messages` 为空数组，裁切逻辑虽然会自然跳过，但：

- 这个隐式依赖让 `executeGeneration` 无法脱离 `mediaGenStore` 运行。
- 如果未来有"基于历史任务结果迭代"的需求（如用上一张图的资产 ID 作为参考图），当前设计只能通过节点树查找，无法从任务池直接获取。

#### 耦合③：`updateTaskStatus` 手动双向同步

```typescript
// mediaGenStore.ts:176-195
const updateTaskStatus = (taskId, status, updates) => {
  taskManager.updateTaskStatus(taskId, status, updates); // 写任务池
  const task = taskManager.getTask(taskId);
  if (task) {
    const node = nodes.value[taskId];
    if (node) {
      node.metadata.taskSnapshot = { ...task }; // 写节点快照
      if (status === "completed") node.status = "complete"; // 写节点状态
      // ...
    }
  }
};
```

**问题**：任务状态的变化需要**手动同步**到对应的节点上。这是一种典型的"双向绑定"反模式：

- 新增状态字段时，两个地方都要改。
- 如果没有节点（单次模式），这个函数仍然会正常执行，但"同步到节点"那部分是死代码——这倒不会报错，但暴露了设计问题。

#### 耦合④：`removeTask` 依赖会话上下文

```typescript
// mediaGenStore.ts:200-213
const removeTask = (taskId) => {
  const fullSession = currentFullSession.value;
  if (!fullSession) return; // ← 没有会话就直接返回，任务不会被删除！
  taskManager.removeTask(taskId);
  branchManager.deleteMessage(fullSession, taskId);
  // ...
};
```

**问题**：在没有活跃会话的场景下（如单次模式），`currentFullSession.value` 为 `null`，`removeTask` 直接 `return`，**任务从任务池中也无法被移除**。这是当前代码的一个功能性 bug，必须修复。

### 2.3 现有基础设施评估

| 组件/模块                                                                  | 耦合情况                                            | 复用潜力     |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ------------ |
| [`useMediaTaskManager`](../composables/useMediaTaskManager.ts)             | ✅ 完全独立，全局单例，有自己的持久化               | 直接复用     |
| [`MediaTaskList.vue`](../components/MediaTaskList.vue)                     | ✅ 直接订阅 `taskManager.tasks`，不依赖会话         | 直接复用     |
| [`useMediaGenerationManager`](../composables/useMediaGenerationManager.ts) | ⚠️ 执行逻辑独立，但入口依赖 store                   | 需改造       |
| [`MediaGenerationInput.vue`](../components/MediaGenerationInput.vue)       | ⚠️ 硬编码调用 `startGeneration`，而后者又依赖 store | 需改造       |
| [`GenerationStream.vue`](../components/GenerationStream.vue)               | ❌ 深度绑定会话（SessionManager、分支切换）         | 会话模式专用 |
| [`useTaskActionManager`](../composables/useTaskActionManager.ts)           | ❌ 职责是"创建任务+节点"，与会话树绑定              | 会话模式专用 |

---

## 3. 解耦方案设计

### 3.1 核心思想：任务系统作为基础设施，会话作为消费者

问题不在于"有两种模式需要切换"，而在于**当前根本没有独立的任务系统**。所以我们要做的不是增加一个 `mode` 参数在内部做分支判断，而是：

1. 把任务执行能力从 Store 中**提取**出来，形成纯粹的底层能力（Task Core）。
2. 让会话系统（Session）作为 Task Core 的**消费者**，在任务创建后"订阅"其状态。
3. 让单次模式 UI 作为 Task Core 的另一个**消费者**，直接展示任务池。

```
              ┌─────────────────────────┐
              │    Task Core (底层)      │
              │  - createTask()         │
              │  - executeGeneration()  │
              │  - getTaskStatus()      │
              │  - removeTask()         │
              └───────────┬─────────────┘
                          │ 通过 taskId 引用
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌─────────┐ ┌──────────┐
        │ 会话模式  │ │单次模式  │ │ Agent    │
        │(Session) │ │(Quick)  │ │ 调用     │
        └──────────┘ └─────────┘ └──────────┘
```

### 3.2 Task Core 重构

#### 3.2.1 `useMediaGenerationManager` —— 剥离 Store 依赖

**当前问题**：

- `startGeneration` 内部调用 `mediaStore.addTask`
- `executeGeneration` 内部读取 `mediaStore.messages`

**重构后**：

- `startGeneration` **不再调用 `mediaStore.addTask`**。它只负责构造 `MediaTask` 对象，然后调用 `execute`。**任务的"提交到何处"由调用方决定**。
- `executeGeneration` 的上下文构造逻辑改为**接收一个可选的上下文参数**，而非隐式读取 `mediaStore.messages`。

```typescript
// useMediaGenerationManager.ts（重构后）

export function useMediaGenerationManager() {
  const taskManager = useMediaTaskManager(); // 仅依赖任务池

  /**
   * 构造任务对象（纯函数，无副作用）
   */
  const buildTask = (options: MediaGenerationOptions, type: MediaTaskType): MediaTask => {
    const taskId = uuidv4();
    return {
      id: taskId,
      type,
      status: "pending",
      input: {
        /* 从 options 提取 */
      },
      progress: 0,
      createdAt: Date.now(),
    };
  };

  /**
   * 执行生成（核心）
   * @param task 要执行的任务
   * @param contextMessages 可选的上下文消息列表（会话模式传入，单次模式不传）
   */
  const execute = async (task: MediaTask, contextMessages?: MediaMessage[]) => {
    taskManager.updateTaskStatus(task.id, "processing");

    // 上下文裁切：使用传入的 contextMessages，而非从 store 读取
    let finalContext: MediaMessage[] | undefined;
    if (contextMessages) {
      finalContext = applyContextRules(contextMessages, task);
    }

    // ...API 调用、资产入库等逻辑不变...
    taskManager.updateTaskStatus(task.id, "completed", { resultAsset });
  };

  return { buildTask, execute, abort };
}
```

**关键变化**：`execute` 不再依赖 `mediaStore`，只依赖 `taskManager`。上下文通过参数显式传入。

#### 3.2.2 `mediaGenStore` —— 缩减为会话调度者

**当前问题**：

- `addTask` 是唯一的任务提交入口，强制走节点创建路径。

**重构后**：

- 删掉 `addTask` 这个模糊的方法。
- 会话模式下的发送流程，由 Store 的 action 手动编排："注册任务 → 创建节点 → 执行生成"。

```typescript
// mediaGenStore.ts（重构后）

/**
 * 会话模式下提交任务
 * 职责：在任务池注册 + 在节点树占位 + 启动执行
 */
const submitTaskInSession = async (options: MediaGenerationOptions, type: MediaTaskType) => {
  // 1. 构造任务
  const task = genManager.buildTask(options, type);

  // 2. 注册到任务池
  taskManager.addTask(task);

  // 3. 在会话树中创建节点（关联 taskId）
  taskActionManager.addTaskNode(task, attachmentManager.attachments.value);

  // 4. 构造上下文（从节点树读取）
  const contextMessages = buildContextFromNodeTree(task);

  // 5. 启动执行
  await genManager.execute(task, contextMessages);
};
```

#### 3.2.3 `updateTaskStatus` —— 单向通知

**当前问题**：双向同步——任务池和节点树都要手动更新。

**重构后**：任务池是唯一的状态归属（Single Source of Truth）。节点树通过 `computed` 或 `watch` 被动观测任务池变化。

```typescript
// 删除 mediaGenStore.updateTaskStatus 中对 nodes 的手动同步
// 改为在组件层通过 computed 或 watch 自动关联

// 示例：ChatMessage.vue 中展示任务状态
const taskStatus = computed(() => {
  return taskManager.getTask(props.messageId)?.status;
});
```

#### 3.2.4 `removeTask` —— 修复无会话场景

```typescript
// mediaGenStore.ts（重构后）
const removeTask = (taskId: string) => {
  // 1. 始终从任务池移除（修复当前 bug）
  taskManager.removeTask(taskId);
  generatingNodes.value.delete(taskId);

  // 2. 如果当前有会话上下文，同步清理节点
  const fullSession = currentFullSession.value;
  if (fullSession) {
    branchManager.deleteMessage(fullSession, taskId);
    persistence.persist(true);
  }
};
```

---

## 4. UI 层：派生单次模式

### 4.1 单次模式的提交路径

单次模式下不创建节点，任务直接进入任务池并执行：

```typescript
// 单次模式提交（在 QuickTaskView 或 MediaGenerationInput 中）
const submitTaskSingle = async (options: MediaGenerationOptions, type: MediaTaskType) => {
  const task = genManager.buildTask(options, type);
  taskManager.addTask(task);
  await genManager.execute(task); // 不传 contextMessages
};
```

### 4.2 `MediaWorkbench` 改造

中间区域不再固定为 `GenerationStream`，而是根据 `workbenchMode` 动态切换：

```
┌──────────────┬─────────────────────────┬──────────────┐
│  参数面板    │  [会话模式 | 单次模式]   │  资产画廊    │
│ (可折叠)     │  ────────────────────   │ (可折叠)     │
│              │  GenerationStream       │              │
│              │  或 QuickTaskView       │              │
└──────────────┴─────────────────────────┴──────────────┘
```

使用 `<KeepAlive>` 保持两种模式的组件状态，避免切换时丢失。

### 4.3 `QuickTaskView` 组件

纯任务控制台，直接消费 `taskManager.tasks`：

```
┌─────────────────────────────────────┐
│  快速生成                           │
│  [清空已完成] [暂停全部]             │
├─────────────────────────────────────┤
│                                     │
│  ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 任务1 │ │ 任务2 │ │ 任务3 │ ...    │  ← MediaTaskList（复用）
│  └──────┘ └──────┘ └──────┘        │
│                                     │
├─────────────────────────────────────┤
│  [输入框: 描述你要生成的画面...] [发送] │  ← MediaGenerationInput（复用）
└─────────────────────────────────────┘
```

- **顶部工具栏**：批量操作按钮。
- **中部**：直接使用 `MediaTaskList`（已验证可直接复用）。
- **底部**：`MediaGenerationInput`，但隐藏"包含上下文"等会话专属选项。

### 4.4 `MediaGenerationInput` 适配

输入框本身已经是一个不错的"参数收集器"，只需增加一个 `mode` prop 来控制：

- **会话模式**：发送 → `store.submitTaskInSession()` 。
- **单次模式**：发送 → 直接调用 `genManager.buildTask()` + `taskManager.addTask()` + `genManager.execute()`。

---

## 5. 实施计划

### 5.1 第一阶段：Task Core 解耦

**目标**：将任务执行能力从 Store 中提取，形成可独立运行的底层能力。**不涉及任何 UI 改动**。

#### 步骤 1：重构 `useMediaGenerationManager`

**改动文件**：

- `src/tools/media-generator/composables/useMediaGenerationManager.ts`

**核心改造**：

1. 新增 `buildTask(options, type)` 纯函数，构造 `MediaTask` 对象（包含翻译逻辑）
2. 将 `executeGeneration` 改为接收可选的 `contextMessages` 参数，不再从 `mediaStore.messages` 读取
3. 移除对 `mediaStore` 的 import 和依赖，所有状态更新改为调用 `taskManager.updateTaskStatus`
4. 保留 `startGeneration` 作为向后兼容方法（内部调用 `buildTask` + `execute`）

**关键点**：

- 上下文裁切逻辑封装为独立函数 `applyContextRules(contextMessages, task)`
- `execute` 方法签名：`execute(task: MediaTask, contextMessages?: MediaMessage[])`

#### 步骤 2：重构 `mediaGenStore`

**改动文件**：

- `src/tools/media-generator/stores/mediaGenStore.ts`
- `src/tools/media-generator/components/MediaGenerationInput.vue`（调用方适配）

**核心改造**：

1. 删除 `addTask` 方法，新增 `submitTaskInSession` 方法，显式编排：
   - 调用 `genManager.buildTask()` 构造任务
   - 调用 `taskManager.addTask()` 注册到任务池
   - 调用 `taskActionManager.addTaskNode()` 创建节点
   - 从节点树构造 `contextMessages`
   - 调用 `genManager.execute(task, contextMessages)` 启动执行
   - 保留自动命名逻辑

2. 修复 `removeTask`：确保 `taskManager.removeTask()` 始终被调用，无论是否有会话

3. 简化 `updateTaskStatus`：只更新任务池，删除手动同步节点的代码

**关键点**：

- `MediaGenerationInput.vue` 的 `handleSend` 改为调用 `store.submitTaskInSession()`

**验收标准**：

- `useMediaGenerationManager` 不再 import `mediaGenStore`
- 现有会话模式功能完全正常
- 可以独立调用 `buildTask` + `addTask` + `execute` 完成生成

### 5.2 第二阶段：单次模式 UI

**改动文件**：

- `src/tools/media-generator/components/MediaWorkbench.vue`（增加模式切换）
- `src/tools/media-generator/components/QuickTaskView.vue`（新建）
- `src/tools/media-generator/components/MediaGenerationInput.vue`（增加 `mode` prop）

**核心改造**：

1. `MediaWorkbench` 增加模式切换按钮，使用 `useLocalStorage` 持久化状态
2. 中间区域根据模式动态切换 `GenerationStream` 或 `QuickTaskView`，使用 `<KeepAlive>` 保持状态
3. `QuickTaskView` 复用 `MediaTaskList` + `MediaGenerationInput`，顶部增加批量操作工具栏
4. `MediaGenerationInput` 增加 `mode` prop，单次模式下隐藏"包含上下文"等会话专属选项
5. 单次模式发送逻辑：直接调用 `genManager.buildTask()` + `taskManager.addTask()` + `genManager.execute()`

---

## 6. Agent 方法说明

本次重构**不包含** Agent 方法的直接实现，但第一阶段的解耦为 Agent 调用铺平了道路。

在 Task Core 独立后，`media-generator.registry.ts` 中实现 `generateMedia` 方法将变得非常直接——只需调用 `buildTask` + `addTask` + `execute` 即可，无需担心会话状态的副作用。

### 6.1 Agent 方法的 metadata 建议

未来实现时，需要注意以下 metadata 字段（基于 [`MethodMetadata` 类型](../../services/types.ts:20-57)）：

```typescript
{
  name: "generateMedia",
  agentCallable: true,
  executionMode: "async",       // 异步任务，避免 Agent 超时等待
  asyncConfig: {
    hasProgress: true,          // 支持通过 getTaskStatus 查询进度
    cancellable: true,
    estimatedDuration: 30,
  },
  // ...
}
```

`executionMode: 'async'` 是关键——没有它，Agent 框架会将 `generateMedia` 当作同步方法处理，在生成完成前就超时返回。

---

## 7. 风险评估

| 风险                                      | 等级 | 缓解措施                                         |
| ----------------------------------------- | ---- | ------------------------------------------------ |
| 重构 `useMediaGenerationManager` 引入回归 | 中   | 第一阶段不改 UI，确保现有调用方行为不变          |
| 删除双向同步导致 UI 状态不一致            | 中   | 通过 `computed` 从任务池派生状态，添加防御性日志 |
| 上下文裁切逻辑迁移遗漏边缘情况            | 中   | 将裁切逻辑封装为纯函数，在迁移前后编写对比测试   |
| 性能：大量任务时的列表渲染                | 低   | `MediaTaskList` 已有分页/筛选；未来可加虚拟滚动  |

---

## 8. 总结

本次重构的核心思想不是"增加一种提交模式"，而是**把任务系统从会话系统中解放出来**，让任务成为可以独立存在的一等公民。

- **会话模式**：`submitTaskInSession` 在 Task Core 之上包了一层节点树维护逻辑。
- **单次模式**：直接用 Task Core，不碰节点树。
- **Agent 调用**：直接用 Task Core，不碰 UI。
- **批量生成**：循环调用 Task Core，不碰任何额外逻辑。

这种"底层能力 + 上层消费"的架构，让每种使用场景都只依赖它需要的部分，不再互相污染。

---

**报告撰写时间**：2026-04-30
**撰写人**：咕咕（Kilo 架构师模式）
**状态**：修订完成，待评审
