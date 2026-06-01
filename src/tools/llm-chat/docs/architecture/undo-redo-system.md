# 撤销/重做系统 (Undo/Redo System)

为了提供类似文本编辑器的流畅体验，系统实现了会话级别的撤销/重做功能。

## 1. 混合存储策略

采用**快照 (Snapshot)** 与 **增量 (Delta)** 相结合的方式。

- **Delta**: 对于轻量级操作（如编辑消息、切换分支），只记录变更的差异。
- **Snapshot**: 定期或在复杂操作后记录完整的会话状态，作为"存档点"。
- **触发阈值**: 由 [`useSessionNodeHistory.ts`](../../composables/session/useSessionNodeHistory.ts:42) 中的常量控制 — `SNAPSHOT_COMPLEXITY_THRESHOLD = 30`（受影响节点数）与 `SNAPSHOT_INTERVAL = 15`（自上一次快照后的 Delta 数），任一超过即生成新快照。
- **栈深限制**: `MAX_HISTORY_LENGTH = 50`，超长时优先清退首部的纯 Delta 条目，保留最早可达的快照锚点。

## 2. 支持的操作

编辑消息、删除消息、切换分支、节点移动、分支嫁接、启用/禁用节点等（来源：[`useGraphActions.ts`](../../composables/visualization/useGraphActions.ts:80) 调用 `recordHistory` 的全部 `HistoryActionTag`）。

## 3. 历史断点（清空逻辑）

发送新消息、重新生成回复、续写（continueGeneration）被视为"历史断点"，会清空当前的撤销栈。具体实现位于 [`llmChatStore.ts`](../../stores/llmChatStore.ts:886) 中：

- **触发位置在 Store 层**: `sendMessage` / `regenerateFromNode` / `continueGeneration` 在 `await chatHandler.*()` 完成之后调用 `historyManager.clearHistory()`，并非 `useChatHandler` 自身触发。
- **边界说明**:
  - ✅ 触发清空：`sendMessage`（[`llmChatStore.ts:886`](../../stores/llmChatStore.ts:886)）、`regenerateFromNode`（[`llmChatStore.ts:1008`](../../stores/llmChatStore.ts:1008)）、`continueGeneration`（[`llmChatStore.ts:928`](../../stores/llmChatStore.ts:928)）。
  - ✅ 工具调用迭代（`useToolCallOrchestrator`）作为 `sendMessage` / `regenerateFromNode` 的内部循环，整轮完成后由外层触发**一次**清空，不会逐次清空。
  - ❌ **不触发清空**：`reparseNodeTools`（重新解析既有助手节点的工具调用，[`llmChatStore.ts:1274`](../../stores/llmChatStore.ts:1274)）— 这是对已有节点的修补，不是新建对话轮次。
- **清空时不保留任何旧快照**: `clearHistory()` 直接用当前 `session.nodes` 构造一个全新的 `INITIAL_STATE` 快照条目，`history = [initialEntry]`，`historyIndex = 0`。
- **UI 同步**: `canUndo = historyIndex > 0`，`canRedo = historyIndex < history.length - 1`。清空后两者皆为 `false`，撤销/重做按钮通过 `computed` 自动禁用，无需手动同步状态。
