# Window Automator 函数调用式（低代码组件）重构计划

**状态**: 全部落地（调用栈 + 函数库 + 参数传递 + 返回值）
**版本**: v1.2
**最后更新**: 2026-06-21

> 标记约定：`[x]` 已实现并通过现有代码验证；`[ ]` 未实现 / 待施工；`[~]` 部分实现或仅做兜底。

---

## 0. 施工进度概览

| 阶段               | 关键交付                                                 | 状态                                                              |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------- |
| §3 数据结构        | `SubFlow` / `call` 步骤 / `ActionFlow.subFlows`          | `[x]` 基础完成；参数/返回值字段（§8 §9）`[x]`                     |
| §4 执行器调用栈    | `runLoop` 重构 + `MAX_CALL_DEPTH` + 循环检测             | `[x]`                                                             |
| §5 左侧工具箱      | “函数库”分类 + 新建/编辑/删除/点击调用                   | `[x]`                                                             |
| §5 右侧编辑器      | 顶部面包屑 + “返回主流程”按钮                            | `[x]`                                                             |
| §5 步骤配置        | `CallConfig.vue` 下拉选函数                              | `[x]`                                                             |
| §6 Store 升级      | `currentEditingSubFlowId` / `editingSteps` / 子流程 CRUD | `[x]`                                                             |
| §7 风险兜底        | 循环检测 + 删除清理 call 引用 + 旧方案 `subFlows ?? []`  | `[x]`；跨流程跳转 UI 过滤由各步骤 config 使用 `editingSteps` 兜底 |
| §8 参数传递        | `SubFlowParamDefine` / `arguments` / 局部变量            | `[x]` 类型/运行时/UI 均已落地                                     |
| §9 返回值          | `returnVariableName` / `saveResultToVariable`            | `[x]` 类型/运行时/UI 均已落地                                     |
| §10 提取为函数     | 多选 + 一键提取 + 引用修复                               | `[~]` Store 核心已补引用修复；多选/UI 未接入                     |
| §11 函数库导入导出 | `.json` 导出 / 导入 + ID 重映射                          | `[~]` Store 导入重映射已补；文件 IO / 工具箱 UI 未接入           |

---

## 1. 背景与动机

在当前的施工版本中，步骤流是**扁平、线性**的，跳转逻辑全靠 `goto`、`colorCheck`、`counter` 等步骤的 `targetStepId` 实现。当步骤超过 20 步时，逻辑会变得像毛线球一样混乱，极难维护。

为了解决这个问题，本计划引入**子流程/自定义函数（Sub-flow / Function）**的概念，让用户可以把常用的操作（如“打坐回血”、“自动买药”、“跑图”）封装成一个函数，然后在主流程或其他函数里直接“调用”它，执行完再“返回”。

### 核心收益

- **步骤复用**：同一套逻辑（如“检查气血”）可以在多个地方调用，无需复制粘贴。
- **主流程清晰**：主流程从几十步的毛线球简化为几个函数调用的骨架，可读性大幅提升。
- **低代码组件化**：用户自己封装的函数就是“自定义组件”，可以在左侧工具箱中像基础步骤一样被拖拽/点击添加。

---

## 2. 核心设计理念

### 2.1. 自包含设计 (Self-contained) `[x]`

子流程（`subFlows`）直接保存在当前 `ActionFlow` 方案的 JSON 文件中。这样，方案在导入、导出、分享时是一个完整的单元，不会出现跨文件引用丢失的问题。

### 2.2. 运行时调用栈 (Call Stack) `[x]`

执行器引入轻量级调用栈。当遇到 `call` 步骤时：

1. 将当前执行上下文（当前流程 ID + 步骤索引）压入调用栈。
2. 跳转到目标子流程的第一步开始执行。
3. 子流程执行完毕后，自动出栈并返回调用处的下一步继续执行。

支持**嵌套调用**（函数 A 调用函数 B），限制最大调用深度为 10 层以防止死循环。

### 2.3. 左侧工具箱函数库 (Toolbox Functions) `[x]`

自定义函数作为“高级工具组件”，在左侧工具箱（`StepToolbox.vue`）中作为一个独立分类展示，与“点击”、“按键”等基础步骤并列。用户可以直接点击函数行来追加 `call` 步骤，或点击编辑/删除按钮管理函数。

---

## 3. 数据结构设计 (`types.ts`)

### 3.1. 新增 `SubFlow` 定义 `[x]`

```typescript
/**
 * 自定义函数 / 子流程。
 *
 * 归属于某个 ActionFlow（保存在 ActionFlow.subFlows 中），
 * 导入导出时与主流程一起作为完整单元迁移。
 *
 * 子流程的 steps 内部跳转只能在自身 steps 列表内进行，
 * 不能跨子流程跳转；调用通过 CallStep 实现。
 */
export interface SubFlow {
  /** nanoid 生成的唯一 ID */
  id: string;
  /** 用户自定义名称（如“打坐回血”） */
  name: string;
  steps: FlowStep[];
}
```

> 备注：`params` / `returnVariableName` 字段已在 §8 / §9 中落地，参见下方对应节的完整定义。

### 3.2. 扩展 `ActionFlow` `[x]`

```typescript
export interface ActionFlow {
  id: string;
  name: string;
  description: string;
  targetWindow: {
    title: string;
    className: string;
  } | null;
  steps: FlowStep[]; // 主流程步骤
  subFlows?: SubFlow[]; // 子流程/自定义函数列表（可选，向下兼容）
  createdAt: string;
  updatedAt: string;
}
```

### 3.3. 新增 `call` 步骤类型 `[x]`

```typescript
export type StepType =
  | "click"
  | "keypress"
  | "delay"
  | "colorCheck"
  | "goto"
  | "counter"
  | "log"
  | "ocr"
  | "call"; // 新增

export interface CallStepParams {
  /** 调用的子流程 ID（对应 ActionFlow.subFlows[].id）；空字符串表示未配置 */
  targetSubFlowId: string;
  /**
   * 实参键值对：key = 形参 name，value = 实际传入的值。
   * 支持变量插值，例如 { "targetHp": "{global_min_hp}" } 或 { "targetHp": "80" }。
   * 缺省或未列出的形参使用子流程定义的 defaultValue。
   */
  arguments?: Record<string, string>;
  /**
   * 可选：把子流程的返回值（returnVariableName 指向的局部变量）写入
   * 调用方作用域的哪个变量中。空字符串 / 缺省表示丢弃返回值。
   */
  saveResultToVariable?: string;
}

// 扩展 StepParams 联合类型
export type StepParams =
  // ... 现有类型 ...
  { type: "call"; params: CallStepParams };
```

---

## 4. 执行器与调用栈设计 `[x]`

### 4.1. 运行时上下文扩展

```typescript
interface CallFrame {
  /** 调用发生时的流程 ID（null 表示主流程，否则为子流程 ID） */
  flowId: string | null;
  /** 调用发生时的步骤索引 */
  stepIndex: number;
}
```

实现细节：当前 `useFlowExecutor.ts` 内的 `callStack` 元素是 `{ steps, subFlowId, stepIndex, mainHighlight }`，与计划略有差异 —— 额外维护 `mainHighlight` 用于在子流程执行期间保持主流程 call 卡片的高亮。

### 4.2. 执行循环改造

`useFlowExecutor.ts` 的 `runLoop` 已重构为支持调用栈：

```
初始化:
  currentFlowId = null (主流程)
  currentSteps = flow.steps
  nextIndex = 0
  callStack = []

主循环:
  while (running || paused) {
    if (nextIndex >= currentSteps.length) {
      if (callStack 不为空) {
        出栈 → 恢复 currentFlowId / currentSteps / nextIndex
        continue
      } else {
        执行完毕，结束
      }
    }

    step = currentSteps[nextIndex]

    if (step 是 call 类型) {
      压栈 (currentFlowId, nextIndex, mainHighlight)
      currentFlowId = targetSubFlowId
      currentSteps = targetSubFlow.steps
      nextIndex = 0
      continue
    }

    正常执行 step → 获取跳转目标
    更新 nextIndex
  }
```

### 4.3. 关键约束 `[x]`

- **跳转范围限制**：`goto`、`colorCheck`、`counter`、`ocr` 等步骤的跳转只能在**当前执行上下文**（主流程或当前子流程）的 `currentSteps` 内解析；UI 层面各 config 组件以 `store.editingSteps` 作为可选列表，天然只显示当前上下文内的步骤。
- **最大调用深度**：`MAX_CALL_DEPTH = 10`，超出会终止执行并写错误日志。
- **循环检测**：`hasRecursion(subFlowId)` 检查栈中是否已存在同一子流程 ID。
- **`__STOP__` 信号**：步骤执行失败立即终止整条动作流。
- **`__CALL__` 信号**：`call` 步骤无副作用，仅返回 `__CALL__` 让 `runLoop` 压栈。

### 4.4. 运行时状态扩展 `[x]`

`ExecutorRuntime` 增加：

```typescript
currentCallStack: ExecutorCallFrame[];
```

用于面包屑 / 日志 / UI 高亮；`ExecutorCallFrame` 暴露给 UI（详见 `types.ts`）。

---

## 5. UI/UX 交互设计

### 5.1. 左侧工具箱 (`StepToolbox.vue`) — 新增“函数库”分类 `[x]`

**实际渲染结构**：

```
┌────────────────────────────────────────┐
│ 🎯 目标窗口                            │
│ [ WindowSelector ]                     │
├────────────────────────────────────────┤
│ 🛠️ 添加步骤                            │
│ - [🖱️ 点击]                            │
│ - [⌨️ 按键]                            │
│ - [⏳ 延时]                            │
│ ...                                    │
├────────────────────────────────────────┤
│ 📦 函数库                  [ + 新建 ]  │
│ ┌────────────────────────────────────┐ │
│ │ ⚙️ 打坐回血  3步     [✏️] [🗑️]    │ │
│ ├────────────────────────────────────┤ │
│ │ ⚙️ 自动买药  5步     [✏️] [🗑️]    │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**交互逻辑** `[x]`：

- **点击函数行**：在**当前编辑上下文**（主流程或子流程）的步骤末尾追加一个 `call` 步骤，`targetSubFlowId` 自动绑定为该函数 ID，并按函数名设置默认 `label`。
- **点击 `[✏️ 编辑]`**：emit `edit-sub-flow`，由 `FlowDetail.vue` 调用 `store.enterSubFlow(id)` 切换编辑器上下文。
- **点击 `[🗑️ 删除]`**：`ElMessageBox` 确认后调用 `store.deleteSubFlow(id)`，自动清空所有指向该函数的 call 引用，并提示清理数量。
- **点击 `[+ 新建]`**：`ElMessageBox.prompt` 输入名称，调用 `store.addSubFlow(name)`。
- **当前正在编辑的函数**在工具箱上以高亮描边标记（`.library-item.editing`）。

### 5.2. 右侧编辑器 (`FlowEditor.vue`) — 顶部面包屑 `[x]`

当用户在左侧点击 `[✏️ 编辑]` 切换到某个函数时，右侧编辑器顶部显示当前编辑上下文：

- **编辑主流程时**：`步骤流 (主流程) (9)`
- **编辑函数时**：`[↩️ 返回] 步骤流 (函数: 打坐回血) (5)`

点击“返回”按钮调用 `store.exitSubFlow()` 清空编辑上下文。

### 5.3. 调用配置组件 (`CallConfig.vue`) `[x]`

提供一个 `el-select` 下拉框，列出当前方案中所有的 `subFlows`（来自 `store.currentFlow.subFlows`）。当：

- 还没有任何子流程：显示"暂无自定义函数，请先在左侧工具箱'函数库'中创建函数"。
- 已配置函数但未选：显示"请选择要调用的目标函数"提示（warn 颜色）。

§8 扩展：选完目标函数后，动态渲染该函数声明的形参输入表单，每个形参一行，支持 `{var}` 插值。留空表示使用函数默认值。

§9 扩展：在形参表下方提供"保存到变量名"输入框，调用方可指定将函数返回值存入哪个变量。同时展示目标函数声明的 `returnVariableName` 供参考。

### 5.4. 状态管理升级 (`windowAutomator.store.ts`) `[x]`

新增：

- `currentEditingSubFlowId: string | null` — 当前正在编辑的子流程 ID。`null` 表示正在编辑主流程。
- `currentEditingSubFlow` (computed) — 派生出当前子流程对象。
- `editingSteps` (computed) — 主/子流程步骤切换的单一入口；`FlowEditor.vue` 通过它实现零改动复用拖拽/选中/删除/更新逻辑。
- 子流程步骤 CRUD：`addSubFlowStep` / `updateSubFlowStep` / `deleteSubFlowStep` / `moveSubFlowStep` / `setSubFlowSteps`。
- 上下文切换：`enterSubFlow` / `exitSubFlow`。

---

## 6. 实施步骤

### 第一步：数据结构与 Store 升级 `[x]`

1. 修改 `types.ts`：新增 `SubFlow`、`CallStepParams`、扩展 `StepType` / `StepParams` / `ActionFlow`。`ExecutorRuntime` 与 `ExecutorCallFrame` 已同步扩展。
2. 修改 `stores/flowFactories.ts`：
   - `createDefaultStepParams` 增加 `call` 分支。
   - `defaultStepLabel` 增加 `"调用函数"`。
   - 新增 `createSubFlow` 工厂函数。
3. 修改 `stores/windowAutomator.store.ts`：
   - 增加 `currentEditingSubFlowId` 状态与相关 computed。
   - 子流程 CRUD：`addSubFlow` / `renameSubFlow` / `deleteSubFlow`（含 call 引用清理）。
   - `duplicateFlow` 同步重映射 `subFlow.id`、子流程步骤 ID 以及主流程 / 子流程内 `call` 步骤的 `targetSubFlowId`。
   - `clearDeletedRefs` 在 `call` 分支留有占位（call 不指向步骤 ID，但保留扩展点）。
   - 删除子流程时若正在编辑，自动切回主流程。

### 第二步：执行器（Executor）升级 `[x]`

1. 修改 `useFlowExecutor.ts`：
   - 引入 `callStack`、`findSubFlow`、`hasRecursion`、`syncRuntimeCallStack`。
   - `call` 步骤返回 `__CALL__` 时压栈、切换 `currentSteps`、检测循环与深度上限。
   - 出栈时恢复 `currentSteps` / `nextIndex`，主流程高亮回到调用方 call 步骤。
   - 每帧把栈快照写回 `store.runtime.currentCallStack` 供 UI 使用。
2. 修改 `stepExecutors.ts`：
   - `executeStep` 调度入口新增 `case "call"`。
   - `runCall` 仅校验 `targetSubFlowId` 非空后返回 `__CALL__`。

### 第三步：左侧工具箱 (`StepToolbox.vue`) 改造 `[x]`

1. 新增“函数库”分类及对应样式。
2. 实现“新建函数”、“编辑函数”、“删除函数”以及“点击函数行追加 call 步骤”的交互。
3. emit `edit-sub-flow` 事件，由 `FlowDetail` 接管上下文切换。

### 第四步：右侧编辑器 (`FlowEditor.vue`) 适配 `[x]`

1. 顶部 `editor-header` 增加当前编辑上下文标签 + “返回主流程”按钮。
2. 新建 `CallConfig.vue` 步骤配置组件。
3. `typeMeta` 中注册 `call` 步骤的颜色 / 图标 / 标签。
4. `describeStep` / `outboundTargets` 等处覆盖 `call` 分支。
5. `FlowDetail.vue` 透传 `edit-sub-flow` 事件至 `store.enterSubFlow`。

---

## 7. 风险与注意事项

1. **嵌套调用深度** `[x]`：限制为 10 层；额外加入 `hasRecursion` 循环检测，命中后立即停止并写错误日志。
2. **子流程删除后的引用清理** `[x]`：`deleteSubFlow` 遍历主流程 + 全部子流程，把指向被删函数的 `targetSubFlowId` 置空，并返回清理数量供 UI 提示。
3. **导入导出兼容性** `[x]`：旧版方案 JSON 没有 `subFlows`，`ensureSubFlows` / `createEmptyFlow` 均以空数组兜底；读取侧也用 `subFlows ?? []`。
4. **跳转范围限制** `[x]`：执行器在 `currentSteps` 内解析跳转目标；UI 层面 `GotoConfig` / `ColorCheckConfig` / `CounterConfig` / `OcrConfig` 接收的 `steps` 来自 `store.editingSteps`，天然只列出当前编辑上下文内的步骤，实现跨流程选项的兜底过滤。

---

## 8. 进阶设计：参数传递与局部作用域 (Parameter Passing & Local Scope) `[x]`

> 状态：**已实现**。类型/运行时/UI 均已落地。

为了让自定义函数真正具备“低代码组件”的复用能力，必须支持**参数传递**。例如，同一个“打坐回血”函数，在挂机点 A 需要回血到 80%，在挂机点 B 需要回血到 90%。

### 8.1. 数据结构扩展

#### 1. 子流程定义 (`SubFlow`) 增加形参列表

```typescript
export interface SubFlowParamDefine {
  /** 参数名（英文标识，用于变量插值，如 "targetHp"） */
  name: string;
  /** 显示名称（如 "目标血量百分比"） */
  label: string;
  /** 参数类型 */
  type: "number" | "string" | "boolean";
  /** 默认值 */
  defaultValue: string;
}

export interface SubFlow {
  id: string;
  name: string;
  steps: FlowStep[];
  /** 可选：形参定义列表 */
  params?: SubFlowParamDefine[];
}
```

#### 2. 调用步骤参数 (`CallStepParams`) 增加实参绑定

```typescript
export interface CallStepParams {
  targetSubFlowId: string;
  /**
   * 实参键值对：key = 形参 name, value = 实际传入的值。
   * 支持变量插值，例如 { "targetHp": "{global_min_hp}" } 或 { "targetHp": "80" }
   */
  arguments?: Record<string, string>;
}
```

### 8.2. 运行时局部作用域 (Local Scope)

为了防止函数内部修改全局变量导致副作用，引入**栈帧局部变量表**。

#### 1. 运行时调用栈帧 (`CallFrame`) 扩展

```typescript
interface CallFrame {
  steps: FlowStep[];
  subFlowId: string | null;
  stepIndex: number;
  mainHighlight: number;
  /** 当前帧的局部变量表（仅在当前函数执行期间有效） */
  localVariables: Record<string, string>;
}
```

#### 2. 变量解析优先级 (Scope Resolution)

在 `flowUtils.ts` 的 `interpolateVariables` 中，变量解析逻辑升级为：

1. **优先从当前调用栈顶帧的 `localVariables`** 中查找变量。
2. 若未找到，再从**全局变量表 `store.runtime.variables`** 中查找。
3. 若仍未找到，返回空字符串或保持原样。

#### 3. 进入函数时的参数绑定流程

当执行到 `call` 步骤，压入新栈帧时：

1. 初始化新栈帧的 `localVariables` 为空对象 `{}`。
2. 遍历目标子流程的 `params` 定义，写入默认值。
3. 解析 `call` 步骤中传入的 `arguments` 实参（解析其中的变量插值），并覆盖写入 `localVariables`。
4. 将当前执行上下文切换到子流程。

---

## 9. 进阶设计：函数返回值 (Return Value) `[x]`

> 状态：**已实现**。与 §8 联动，类型/运行时/UI 均已落地。

### 9.1. 数据结构扩展

#### 1. 子流程定义 (`SubFlow`) 增加返回值声明

```typescript
export interface SubFlow {
  // ... 现有字段 ...
  /** 可选：指定哪个局部变量的值作为返回值（如 "ocr_result"） */
  returnVariableName?: string;
}
```

#### 2. 调用步骤参数 (`CallStepParams`) 增加接收变量

```typescript
export interface CallStepParams {
  // ... 现有字段 ...
  /** 可选：将返回值存入调用方作用域的哪个变量中（如 "hp_status"） */
  saveResultToVariable?: string;
}
```

### 9.2. 运行时返回值传递流程

当子流程执行完毕，触发**出栈**时：

1. **读取返回值**：如果当前子流程定义了 `returnVariableName`，从即将销毁的栈顶帧的 `localVariables` 中读取该变量的值。
2. **执行出栈**：弹出栈顶帧，恢复上一级执行上下文。
3. **写入接收变量**：如果调用步骤配置了 `saveResultToVariable`，将读取到的返回值写入到**上一级栈帧的变量表**中（如果上一级是主流程，则写入全局变量表 `store.runtime.variables`）。

---

## 10. 进阶设计：一键“提取为函数” (Extract to Function) `[~]`

> 状态：**部分实现**。`windowAutomator.store.ts` 已有 `extractSelectedToSubFlow(stepIds, name)` 核心方法，并在 2026-06-21 复核时补齐跨提取范围跳转置空、重复 stepId 去重和引用清理测试；`FlowEditor.vue` 的多选交互与顶部触发按钮仍未接入。

### 10.1. 交互流程

1. **多选步骤**：在 `FlowEditor.vue` 中，卡片左侧的序号区在非运行态下支持复选框多选。
2. **触发重构**：多选后，编辑器顶部工具栏显示 `[📦 提取为函数]` 按钮。
3. **命名弹窗**：点击按钮，弹窗要求用户输入新函数名称（如“自动补药”）。
4. **重构执行**：
   - 在当前方案的 `subFlows` 中新建一个子流程。
   - 将选中的步骤**剪切**到该子流程中。
   - 在原主流程被剪切的起始位置，插入一个 `call` 步骤，`targetSubFlowId` 指向该新建子流程。
   - **跳转引用修复（关键）**：
     - 遍历被移动的步骤，如果步骤 A 跳转到步骤 B，且 A 和 B **都被移动**到了子流程中，则保持它们的跳转引用不变。
     - 如果步骤 A 跳转到步骤 C，且 C **留在主流程中**（未被移动），则将 A 的跳转目标置空，并向用户输出警告日志。
     - 如果主流程中未被移动的步骤 D 跳转到被移动的步骤 A，则将 D 的跳转目标置空并警告。

---

## 11. 进阶设计：函数库导入导出 (Function Import/Export) `[~]`

> 状态：**部分实现**。`windowAutomator.store.ts` 已有 `importSubFlow(imported)`，并在 2026-06-21 复核时调整为导入总是生成新 `subFlow.id`、重新生成步骤 ID 并修复内部跳转；Tauri 文件对话框、JSON 读写 composable、工具箱导入/导出按钮仍未接入。

### 11.1. 导出函数

- 在 `StepToolbox.vue` 的函数行右侧增加 `[📥 导出]` 按钮。
- 点击后，将该 `SubFlow` 对象（包含其内部的所有 `steps`）序列化为 JSON 文本，通过 Tauri `save` 对话框保存为 `.json` 文件。

### 11.2. 导入函数

- 在 `StepToolbox.vue` 的“函数库”标题右侧增加 `[📤 导入]` 按钮。
- 点击后，选择 `.json` 文件，解析并校验数据结构。
- **ID 冲突处理**：
  - 导入时，必须为该子流程重新生成一个全新的 `subFlow.id`（使用 `nanoid`）。
  - 遍历导入的步骤，重新生成所有 `step.id`。
  - **同步修复跳转引用**：建立旧 `step.id` -> 新 `step.id` 的映射表，同步修正子流程内部 `goto`、`colorCheck`、`counter`、`ocr` 步骤的跳转目标 ID，确保导入后内部逻辑不损坏。
- 将修复后的子流程追加到当前方案的 `subFlows` 中。

---

## 附录 A：未实现工单清单

按依赖顺序整理，方便后续分批施工：

1. **§10 提取为函数**
   - `FlowEditor.vue`：步骤多选（卡片左侧复选框） + 顶部 `[📦 提取为函数]` 按钮。
   - 已有 Store 核心方法：`windowAutomator.store.ts` 的 `extractSelectedToSubFlow(stepIds, name)`。
2. **§11 函数库导入导出**
   - `StepToolbox.vue`：函数行增加 `[📥 导出]` / `[📤 导入]` 按钮。
   - 新增 `composables/useSubFlowIO.ts`：调用 Tauri `save` / `open` 对话框 + JSON 读写；导入落库可复用已有 `store.importSubFlow(imported)`。

## 附录 C：2026-06-21 施工复核记录

- 修复执行器调用栈快照：`currentCallStack` 现在按真实活跃子流程链暴露，子流程运行高亮不再漏掉第一层调用。
- 修复递归检测：直接递归和互相递归都会在进入重复函数前被拦截。
- 修复函数局部作用域：OCR 的 `saveToVariable` 在子流程内写入局部变量，主流程仍写全局变量，保证 `returnVariableName` 能读到函数内结果。
- 修复复制/导入 ID 重映射：普通跳转引用会随步骤 ID 更新同步修复，导入函数始终生成新函数 ID。
- 修复提取为函数核心逻辑：被提取步骤跳到未提取步骤时清空目标，避免生成跨流程悬空引用。

---

## 附录 B：已落地的关键代码索引

- 数据结构：[`types.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\types.ts)（`SubFlow` / `CallStepParams` / `ExecutorCallFrame` / `ExecutorRuntime.currentCallStack`）。
- 工厂函数：[`flowFactories.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\stores\flowFactories.ts)（`createSubFlow` / `createDefaultStepParams('call')`）。
- Store：[`windowAutomator.store.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\stores\windowAutomator.store.ts)（`currentEditingSubFlowId` / `editingSteps` / 子流程 CRUD / `duplicateFlow` ID 重映射 / `deleteSubFlow` 引用清理）。
- 执行器：[`useFlowExecutor.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\composables\useFlowExecutor.ts)（`callStack` / `__CALL__` / 循环与深度检测 / 调用栈快照同步）。
- 步骤调度：[`stepExecutors.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\composables\stepExecutors.ts)（`runCall`）。
- 工具箱 UI：[`StepToolbox.vue`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\components\StepToolbox.vue)（“函数库”分类 + 交互）。
- 编辑器适配：[`FlowEditor.vue`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\components\FlowEditor.vue)（面包屑 / 返回按钮 / `editingSteps` 透传 / `call` 元数据）。
- 调用配置：[`CallConfig.vue`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\components\step-configs\CallConfig.vue)（函数选择 + §8 实参表单 + §9 返回值绑定）。
- 详情页串联：[`FlowDetail.vue`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\components\FlowDetail.vue)（`@edit-sub-flow` → `store.enterSubFlow`、编辑上下文透传到 `addStep`）。
- 变量插值 / 作用域解析：[`flowUtils.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\composables\flowUtils.ts)（`VariablesScope` / `interpolateVariables` 局部优先、`setLocalVariable`）。
- 执行器形参绑定：[`useFlowExecutor.ts`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\composables\useFlowExecutor.ts)（`currentLocalVariables`、`handleReturnValue`、形参默认值 + `arguments` 覆盖压栈）。
- 函数设置对话框：[`SubFlowSettingsDialog.vue`](E:\rc20\allinweb\aiohub-dev\src\tools\window-automator\components\SubFlowSettingsDialog.vue)（§8 形参编辑 + §9 返回值声明 + 函数重命名）。
