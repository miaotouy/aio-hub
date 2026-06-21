# Window Automator 函数调用式（低代码组件）重构计划

**状态**: Draft (草案)  
**版本**: v1.0  
**最后更新**: 2026-06-21

---

## 1. 背景与动机

在当前的施工版本中，步骤流是**扁平、线性**的，跳转逻辑全靠 `goto`、`colorCheck`、`counter` 等步骤的 `targetStepId` 实现。当步骤超过 20 步时，逻辑会变得像毛线球一样混乱，极难维护。

为了解决这个问题，本计划引入**子流程/自定义函数（Sub-flow / Function）**的概念，让用户可以把常用的操作（如"打坐回血"、"自动买药"、"跑图"）封装成一个函数，然后在主流程或其他函数里直接"调用"它，执行完再"返回"。

### 核心收益

- **步骤复用**：同一套逻辑（如"检查气血"）可以在多个地方调用，无需复制粘贴。
- **主流程清晰**：主流程从几十步的毛线球简化为几个函数调用的骨架，可读性大幅提升。
- **低代码组件化**：用户自己封装的函数就是"自定义组件"，可以在左侧工具箱中像基础步骤一样被拖拽/点击添加。

---

## 2. 核心设计理念

### 2.1. 自包含设计 (Self-contained)

子流程（`subFlows`）直接保存在当前 `ActionFlow` 方案的 JSON 文件中。这样，方案在导入、导出、分享时是一个完整的单元，不会出现跨文件引用丢失的问题。

### 2.2. 运行时调用栈 (Call Stack)

执行器引入轻量级调用栈。当遇到 `call` 步骤时：

1. 将当前执行上下文（当前流程 ID + 步骤索引）压入调用栈。
2. 跳转到目标子流程的第一步开始执行。
3. 子流程执行完毕后，自动出栈并返回调用处的下一步继续执行。

支持**嵌套调用**（函数 A 调用函数 B），限制最大调用深度为 10 层以防止死循环。

### 2.3. 左侧工具箱函数库 (Toolbox Functions)

自定义函数作为"高级工具组件"，在左侧工具箱（`StepToolbox.vue`）中作为一个独立分类展示，与"点击"、"按键"等基础步骤并列。用户可以直接点击函数行来追加 `call` 步骤，或点击编辑/删除按钮管理函数。

---

## 3. 数据结构设计 (`types.ts`)

### 3.1. 新增 `SubFlow` 定义

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
  /** 用户自定义名称（如"打坐回血"） */
  name: string;
  steps: FlowStep[];
}
```

### 3.2. 扩展 `ActionFlow`

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

### 3.3. 新增 `call` 步骤类型

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
  /** 调用的子流程 ID（对应 ActionFlow.subFlows[].id） */
  targetSubFlowId: string;
}

// 扩展 StepParams 联合类型
export type StepParams =
  // ... 现有类型 ...
  { type: "call"; params: CallStepParams };
```

---

## 4. 执行器与调用栈设计

### 4.1. 运行时上下文扩展

```typescript
interface CallFrame {
  /** 调用发生时的流程 ID（null 表示主流程，否则为子流程 ID） */
  flowId: string | null;
  /** 调用发生时的步骤索引 */
  stepIndex: number;
}
```

### 4.2. 执行循环改造

`useFlowExecutor.ts` 的 `runLoop` 需要重构以支持调用栈：

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
      压栈 (currentFlowId, nextIndex)
      currentFlowId = targetSubFlowId
      currentSteps = targetSubFlow.steps
      nextIndex = 0
      continue
    }

    正常执行 step → 获取跳转目标
    更新 nextIndex
  }
```

### 4.3. 关键约束

- **跳转范围限制**：`goto`、`colorCheck`、`counter`、`ocr` 等步骤的跳转只能在**当前流程**（主流程或当前子流程）内部进行，不能跨流程跳转。
- **最大调用深度**：限制为 10 层，防止死循环导致栈溢出。
- **`__STOP__` 信号**：任何步骤返回 `__STOP__` 时，立即终止整条动作流（包括所有嵌套调用）。

---

## 5. UI/UX 交互设计

### 5.1. 左侧工具箱 (`StepToolbox.vue`) — 新增"函数库"分类

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
│ 📦 函数库                  [+ 新建函数] │
│ ┌────────────────────────────────────┐ │
│ │ ⚙️ 打坐回血             [✏️] [🗑️]   │ │
│ ├────────────────────────────────────┤ │
│ │ ⚙️ 自动买药             [✏️] [🗑️]   │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

**交互逻辑**：

- **点击函数行**：在当前步骤流末尾追加一个 `call` 步骤，`targetSubFlowId` 自动绑定为该函数的 ID。
- **点击 `[✏️ 编辑]`**：右侧编辑器切换到编辑该函数的步骤。
- **点击 `[🗑️ 删除]`**：弹窗确认后删除该函数，并自动清理所有调用了该函数的 `call` 步骤。
- **点击 `[+ 新建函数]`**：弹窗输入名称，在当前方案中新建一个空函数。

### 5.2. 右侧编辑器 (`FlowEditor.vue`) — 顶部面包屑

当用户在左侧点击 `[✏️ 编辑]` 切换到某个函数时，右侧编辑器顶部显示当前编辑上下文：

- **编辑主流程时**：`步骤流 (主流程) (9)`
- **编辑函数时**：`步骤流 (函数: 打坐回血) (5)` `[↩️ 返回主流程]`

### 5.3. 调用配置组件 (`CallConfig.vue`)

新建步骤配置组件，提供一个 `el-select` 下拉框，列出当前方案中所有的 `subFlows`。如果还没有定义任何函数，显示提示："暂无自定义函数，请先在左侧工具箱创建函数"。

### 5.4. 状态管理升级 (`windowAutomator.store.ts`)

在 store 中引入：

- `currentEditingSubFlowId: string | null`：当前正在编辑的子流程 ID。`null` 表示正在编辑主流程。

`FlowEditor.vue` 中的 `steps` 计算属性根据此状态自适应读写主流程或子流程的步骤列表，所有拖拽排序、增删步骤逻辑零改动直接复用。

---

## 6. 实施步骤

### 第一步：数据结构与 Store 升级

1. 修改 `types.ts`：
   - 新增 `SubFlow` 接口定义。
   - 扩展 `StepType` 增加 `"call"`。
   - 新增 `CallStepParams` 接口。
   - 扩展 `StepParams` 联合类型。
   - 扩展 `ActionFlow` 增加 `subFlows?: SubFlow[]`。

2. 修改 `stores/flowFactories.ts`：
   - 在 `createDefaultStepParams` 中增加 `call` 类型的默认参数。
   - 在 `defaultStepLabel` 中增加 `call` 的默认标签。

3. 修改 `stores/windowAutomator.store.ts`：
   - 增加 `currentEditingSubFlowId` 状态。
   - 增加子流程 CRUD 方法：`createSubFlow`、`deleteSubFlow`、`updateSubFlow`。
   - 修改 `duplicateFlow`：确保子流程被正确克隆，且内部引用（包括 `call` 步骤的 `targetSubFlowId`）需要重新映射。
   - 修改 `deleteFlow`：确保清理子流程相关状态。
   - 修改 `clearDeletedRefs`：增加对 `call` 步骤的引用清理。

### 第二步：执行器（Executor）升级

1. 修改 `useFlowExecutor.ts`：
   - 重构 `runLoop`，引入 `callStack` 调用栈。
   - 支持 `call` 步骤的压栈跳转和子流程跑完后的自动出栈返回。
   - 限制最大调用深度为 10 层。

2. 修改 `stepExecutors.ts`：
   - 在 `executeStep` 调度入口中增加 `case "call"` 分支。
   - `call` 步骤本身不执行具体操作，返回一个特殊标记（如 `"__CALL__"`）让 `runLoop` 处理压栈逻辑。

### 第三步：左侧工具箱 (`StepToolbox.vue`) 改造

1. 在 `StepToolbox.vue` 中新增"函数库"分类。
2. 实现"新建函数"、"编辑函数"、"删除函数"以及"点击函数行追加 `call` 步骤"的交互。
3. 新增事件：`edit-sub-flow`、`delete-sub-flow`、`create-sub-flow`。

### 第四步：右侧编辑器 (`FlowEditor.vue`) 适配

1. 在顶部 `editor-header` 增加"当前编辑上下文"展示和"返回主流程"按钮。
2. 新建 `CallConfig.vue` 步骤配置组件。
3. 在 `FlowEditor.vue` 中注册 `CallConfig`，并在 `typeMeta` 中增加 `call` 步骤的元数据。
4. 修改 `FlowDetail.vue` 传递新的事件和状态。

---

## 7. 风险与注意事项

1. **嵌套调用深度**：虽然限制了 10 层，但用户仍可能配置出无限递归（函数 A 调用函数 B，函数 B 又调用函数 A）。执行器需要在运行时检测循环调用并报错。

2. **子流程删除后的引用清理**：删除子流程时，必须遍历所有步骤（主流程 + 其他子流程），将所有指向已删除子流程的 `call` 步骤的 `targetSubFlowId` 置空，并提示用户。

3. **导入导出兼容性**：旧版方案 JSON 中没有 `subFlows` 字段，加载时需要做空值处理（`subFlows ?? []`）。

4. **跳转范围限制**：子流程内部的 `goto` / `colorCheck` 等步骤的跳转目标必须在当前子流程的 `steps` 列表内。UI 层面需要在配置下拉框中过滤掉跨流程的选项。

---

## 8. 后续迭代方向（不在本期范围）

- **参数传递**：支持向子流程传递参数（如"打坐回血(次数=5)"）。
- **返回值**：子流程执行完毕后可以返回一个值给调用方。
- **提取为函数**：在 `FlowEditor.vue` 中支持多选步骤后右键"提取为函数"，自动创建子流程并替换为 `call` 步骤。
- **函数库导入导出**：支持将函数导出为独立的 `.json` 文件，在其他方案中导入复用。
