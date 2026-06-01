# 消息数据编辑器 (Message Data Editor)

为高级用户和开发者提供了一个强大的调试工具，允许直接查看和修改任意消息节点的底层 JSON 数据结构。组件位于 [`components/message/MessageDataEditor.vue`](../../components/message/MessageDataEditor.vue)，节点编辑入口通过 [`MessageMenubar`](../../components/message/MessageMenubar.vue) 与树图模式下的 [`GraphNodeMenubar`](../../components/conversation-tree-graph/flow/components/GraphNodeMenubar.vue) 共享。

## 1. 核心功能

基于 [`RichCodeEditor`](../../../../components/common/RichCodeEditor.vue) 的 Monaco 引擎渲染 `JSON.stringify(node, null, 2)`，支持折叠、行号、查找替换；右上角提供"复制 JSON"按钮（通过 `useClipboard` 写入剪贴板），footer 为"取消 / 保存"。

## 2. 数据校验（保存流程）

[`handleSave()`](../../components/message/MessageDataEditor.vue:107) 与 [`updateNodeData()`](../../composables/visualization/useGraphActions.ts:45) 协同完成，**当前实现是"轻量结构保护 + JSON 语法校验"，没有字段级 schema 校验**：

- **JSON 语法校验**：保存时先 `JSON.parse(jsonData)`，失败则把 `error.message` 写入 `parseError` 并在编辑器下方红色框展示，同时调用 `errorHandler.error()` 弹出 toast；解析成功才继续后续逻辑。
- **没有字段级 schema 校验**：不会检查 `role` 是否为合法枚举值、`status` 是否在允许集合内、`metadata.usage.promptTokens` 是否为数字等，业务侧保存后由统一上下文管道自行容错；这是一项设计上的取舍——把"原始 JSON"语义保留给高级用户。
- **核心字段保护（部分保存策略）**：[`updateNodeData()`](../../composables/visualization/useGraphActions.ts:64) 在应用 `Object.assign(node, safeUpdates)` 前**强制剥离 `id` / `parentId` / `childrenIds`** 三个结构性字段，其它任何字段（包括 `metadata`、`role`、`content`、`attachments`、`isEnabled` 等）都允许整体覆盖；`updatedAt` 缺省时自动补当前时间。
- **预设节点禁止编辑**：当 `nodeId.startsWith("preset-")` 时直接 `logger.warn` 并 return，编辑器层面也不应触发到这条路径——预设消息的编辑入口走 Agent 配置而非节点数据编辑器。
- **变更检测**：保存前对比剥离了 `id / parentId / childrenIds / updatedAt` 的"可比较副本"，无变化时只提示"未检测到数据更改"，不进入历史栈，避免空 Delta 污染撤销栈。
- **错误反馈位置**：JSON 语法错误显示在编辑器正下方的红色 `.error-message` 区块（含完整 `Error.message`）；保存阶段 `updateNodeData` 抛错则统一走 `errorHandler.error` 弹出顶部 toast。**没有针对具体字段的内联高亮/定位**，需要用户自行查看错误信息排错。

## 3. 撤销支持

编辑器修改最终通过 [`historyManager.recordHistory("NODE_DATA_UPDATE", deltas, ...)`](../../composables/visualization/useGraphActions.ts:81) 写入会话级撤销栈：

- **HistoryActionTag**：使用专属标签 `"NODE_DATA_UPDATE"`（定义在 [`types/history.ts:12`](../../types/history.ts:12)），与普通的 `"NODE_EDIT"`（仅编辑 `content` / `attachments`）区分，便于撤销栈 UI 在历史列表中显示更精确的操作描述。
- **记录方式：Delta（不是 Snapshot）**：写入一条 `HistoryDelta = { type: "update", payload: { nodeId, previousNodeState, finalNodeState } }`，两份状态都是 `JSON.parse(JSON.stringify(toRaw(node)))` 深拷贝快照——属于"带前后全量节点状态的细粒度 Delta"，不同于树形结构性操作（嫁接 / 移动）会产生多条 Delta 的批量记录。
- **与树形操作撤销栈的合并策略**：**完全共用同一条 `historyManager` 栈，无特殊合并**——`NODE_DATA_UPDATE` 与 `NODE_EDIT` / `BRANCH_GRAFT` / `NODE_MOVE` 等所有 `HistoryActionTag` 平等地进入同一历史时间轴，受统一的快照阈值（`SNAPSHOT_COMPLEXITY_THRESHOLD = 30` / `SNAPSHOT_INTERVAL = 15`）与 `MAX_HISTORY_LENGTH = 50` 栈深限制约束；撤销时直接走 Delta 反向应用 `previousNodeState`，不区分操作类型。
- **副作用**: 保存成功后会调用 [`recalculateNodeTokens()`](../../utils/chatTokenUtils.ts) 重新计算该节点的 Token 缓存（因为 `content` / `metadata` 都可能影响 Token 数），再通过 `sessionManager.persistSession` 落盘。
