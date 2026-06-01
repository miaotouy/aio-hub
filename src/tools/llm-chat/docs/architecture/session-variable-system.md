# 会话变量系统 (Session Variable System)

会话变量系统是一套与宏引擎并行、面向"剧情数值/状态机"场景设计的轻量级状态管理机制。它允许在普通消息正文中通过自闭合 XML 标签直接声明状态变更，由专门的 [`variable-processor`](../../core/context-processors/variable-processor.ts)（priority 500）在上下文管道中解析，并把每条消息节点产生的变更与快照写入元数据，从而支持沿对话历史**确定性回溯**变量状态。

该系统与宏引擎中的 `{{setvar}}` / `{{getvar}}` 局部变量是**两套互相独立的机制**：前者是消息级、持久化、可回放的快照模型，后者是宏管线内部一次性使用的临时 Map。

## 1. 系统定位 (Positioning)

- **配置入口**: 每个智能体在 [`ChatAgent.variableConfig`](../../types/agent.ts) 字段中声明自己的变量集合，与宏引擎、世界书、知识库等并列为可选子系统。`VariableConfig.enabled` 关闭时整个处理器直接早退。
- **作用域 (Scope)**: 变量值绑定到**消息节点元数据**，因此天然以"会话 + 树分支"为作用域 —— 不同会话、同会话不同分支之间的快照完全隔离，跟随 `lastSelectedChildId` 自动切换。
- **回放能力 (Replay)**: 处理器从消息末尾倒查最近一个 `sessionVariableSnapshot` 作为起点，再向前重放所有 `<svar>` 标签，因此即便用户在树状历史中切换分支、删除消息、做 Regenerate，变量状态都能被一致地重建。

## 2. `<svar>` 标签语法 (Write Syntax)

- **形式**: 形如 `<svar name="player.hp" op="-" value="10" />` 的自闭合标签，由 [`SVAR_REGEX`](../../core/context-processors/variable-processor.ts:17) 与属性正则解析；`name` 与 `path` 是同义别名。
- **支持的操作符**: 类型 [`VariableOperator`](../../types/sessionVariable.ts:4) 定义为 `"=" | "+" | "-" | "*" | "/" | "set" | "add" | "sub"`，`op` 缺省时按 `=` 处理。
- **值解析**: 字符串值会按 "JSON → 数字 → 原始字符串" 顺序尝试解析；数值类型在写入前会对照变量定义的 `min`/`max` 自动裁剪（边界处理位于 [`variable-processor.ts:146-149`](../../core/context-processors/variable-processor.ts:146)）。
- **可见性**: 标签本身**不会被移除**，会保留在消息内容中（UI 渲染层可以按需做样式化展示）。

## 3. `$[path]` 取值语法 (Read Syntax)

- **基础替换**: [`REPLACE_REGEX`](../../core/context-processors/variable-processor.ts:24) 形如 `$[player.hp]`，会被替换为当前快照中对应路径的字符串值；未命中时保留原始占位符不变。
- **格式化导出**: `$[svars::json]`、`$[svars::table]`、`$[svars::list]` 由 [`formatVariables()`](../../core/context-processors/variable-processor.ts:212) 实现，分别输出 JSON、Markdown 表格或无序列表，仅导出未设置 `hidden` 的变量，可直接嵌入提示词中作为"状态面板"。
- **执行时机**: 替换在标签解析之后、同一处理器内完成，因此**同一条消息内先 `<svar>` 后 `$[path]`** 即可读到更新后的值。

## 4. 数据结构 (Type Definitions)

核心类型集中在 [`types/sessionVariable.ts`](../../types/sessionVariable.ts)，关键字段如下：

### 4.1 [`VariableConfig`](../../types/sessionVariable.ts:42)

智能体级配置容器。

- `enabled: boolean` — 全局开关。
- `definitions: VariableTreeNode[]` — 树形定义（支持分组）。
- `customStyles?: string` — 可选的 UI 样式覆盖。

### 4.2 [`VariableTreeNode`](../../types/sessionVariable.ts:18)

递归节点。

- `key: string` / `type: "group" | "variable"` — 节点身份与类型。
- `displayName?` / `description?` — UI 展示文案。
- `children?: VariableTreeNode[]` — 仅 `group` 节点使用，构成嵌套结构。
- `initialValue?: any` — 变量初始值（数值类字符串会自动转 `Number`，见 [`variable-processor.ts:48-56`](../../core/context-processors/variable-processor.ts:48)）。
- `min?` / `max?: number` — 数值边界，用于运算后的裁剪。
- `hidden?: boolean` — 是否对 `$[svars::…]` 与 UI 隐藏。

### 4.3 其他类型

- **[`FlatVariableDefinition`](../../types/sessionVariable.ts:54)**：运行时由 [`flattenDefinitions`](../../utils/variableUtils.ts) 把树形结构压成 `path` 索引的扁平定义，供处理器快速查询初始值/边界。
- **[`VariableChange`](../../types/sessionVariable.ts:68)**：单次 `<svar>` 触发的变更记录（`path` / `op` / `opValue` / `oldValue` / `newValue`），用于审计与回放。
- **[`SessionVariableSnapshot`](../../types/sessionVariable.ts:85)**：写入消息元数据的快照，包含 `values: Record<string, any>`、`changes?: VariableChange[]` 与 `timestamp?`。

## 5. 元数据与快照策略 (Snapshot Strategy)

- **写入位置**：处理器把快照塞入 [`ChatMessageNode.metadata.sessionVariableSnapshot`](../../types/message.ts:362)，与上下文压缩节点、虚拟时间线等其它元数据共存。
- **增量更新**：只有"该条消息产生了变更"或"该条消息是压缩节点（`isCompressionNode`）"时才会写入新快照；后者作为强制锚点确保压缩前后的状态不丢失（见 [`variable-processor.ts:166-181`](../../core/context-processors/variable-processor.ts:166)）。
- **初始值兜底**：处理流程开始时会按定义初始化默认状态，再叠加最近快照与后续变更，保证未显式写过的变量也有合理初值。

## 6. 与宏引擎 / UI 的关系 (Integration)

- **与 `variables` 类宏的关系**：宏引擎中的 [`registerVariableMacros`](../../macro-engine/macros/variables.ts:13) 仅在宏执行期间通过 `context.variables` Map 提供 `{{setvar}}` / `{{getvar}}` 等临时变量，作用域只到本次宏管线结束；它**不会**写入 `sessionVariableSnapshot`，与会话变量系统是平行而非派生关系。需要持久、可在树状历史中回放的状态时应使用 `<svar>` 而非宏。
- **与 `injection-assembler` 的执行顺序**：`variable-processor`（priority 500）排在 `injection-assembler`（priority 400）之后，因此可以解析由预设/世界书注入到消息体里的 `<svar>` 标签，并把替换结果一并送给后续的 Token 限制器与格式化器。
- **UI 展示**：上下文分析器内置 [`VariablesView.vue`](../../components/context-analyzer/VariablesView.vue)，从 `ContextPreviewData.finalMessages` 末尾回溯最近的 `sessionVariableSnapshot`，以表格形式展示当前变量路径、值与类型，并标注快照时间戳。
