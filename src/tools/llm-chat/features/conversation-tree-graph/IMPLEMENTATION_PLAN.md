# 会话树图 - 实施任务清单

本文档为 `code` 模式提供一个清晰、可执行的任务清单，用于实现“会话树图”功能。

## Phase 1: 核心 API 扩展 (嫁接功能)

**目标**: 为“嫁接”功能补充所需的底层 API。

1.  **修改 `src/tools/llm-chat/composables/useNodeManager.ts`**:
    - 新增函数 `reparentSubtree(session: ChatSession, nodeId: string, newParentId: string): boolean`。
    - **实现逻辑**:
        - 验证 `nodeId` 和 `newParentId` 的存在性。
        - 验证 `newParentId` 不是 `nodeId` 的子孙，防止循环引用 (可使用 `getAllDescendants` 辅助)。
        - 从旧父节点的 `childrenIds` 数组中移除 `nodeId`。
        - 更新 `session.nodes[nodeId].parentId = newParentId`。
        - 将 `nodeId` 添加到新父节点的 `childrenIds` 数组中。
        - 返回 `true` 表示成功。

2.  **修改 `src/tools/llm-chat/composables/useBranchManager.ts`**:
    - 新增函数 `graftBranch(session: ChatSession, nodeId: string, newParentId: string): boolean`。
    - **实现逻辑**:
        - 内部调用 `useNodeManager().reparentSubtree(...)`。
        - 添加相应的日志记录。

3.  **修改 `src/tools/llm-chat/store.ts`**:
    - 在 `actions` 中新增 `graftBranch(nodeId: string, newParentId: string): void`。
    - **实现逻辑**:
        - 获取 `currentSession`。
        - 调用 `useBranchManager().graftBranch(session, nodeId, newParentId)`。
        - 如果成功，调用 `sessionManager.persistSession(...)` 持久化。

## Phase 2: UI 框架与视图模式

**目标**: 搭建视图切换的框架，并创建所需的 UI 组件。

1.  **修改 `src/tools/llm-chat/composables/useLlmChatUiState.ts`**:
    - 新增 `const viewMode = ref<'linear' | 'graph'>('linear')`。
    - 将 `viewMode` 添加到持久化和跨窗口同步的逻辑中。

2.  **创建文件 `src/tools/llm-chat/components/message/ViewModeSwitcher.vue`** (新):
    - **职责**: 提供一个下拉菜单，用于切换视图模式。
    - **实现**: 使用 `ElDropdown`，包含“线性视图”和“树图视图”选项。绑定 `useLlmChatUiState().viewMode`。

3.  **修改 `src/tools/llm-chat/components/message/MessageHeader.vue`**:
    - 引入并使用 `ViewModeSwitcher.vue`，替换掉原先设想的独立按钮。

4.  **创建文件 `src/tools/llm-chat/components/conversation-tree-graph/ConversationTreeGraph.vue`** (新):
    - **Props**: `session: ChatSession`。
    - **职责**: 渲染 ECharts 画布。
    - **实现骨架**:
        - 引入 `useConversationGraph` Composable (下一步创建)。
        - 在 `onMounted` 中初始化图表。
        - `watch` `props.session` 的变化来更新图表。

5.  **修改 `src/tools/llm-chat/components/ChatArea.vue`**:
    - 在 `<template>` 中，使用 `<component :is="activeViewComponent">` 来动态渲染视图。
    - 在 `<script>` 中：
        - 引入 `MessageList.vue` 和 `ConversationTreeGraph.vue`。
        - 从 `useLlmChatUiState` 获取 `viewMode`。
        - 创建一个计算属性 `activeViewComponent`，根据 `viewMode.value` 返回对应的组件。

6.  **创建文件 `src/tools/llm-chat/composables/useConversationGraph.ts`** (新):
    - **职责**: 封装 ECharts 的 option 生成和事件处理逻辑。
    - **导出**: `function useConversationGraph(session: Ref<ChatSession | null>)`。
    - **实现骨架**:
        - `graphOption: Ref<ECOption>`: 一个计算属性，此时可以先返回一个空的 option。
        - `init(element: HTMLElement)`: 初始化 ECharts 实例。
        - `destroy()`: 销毁实例。

## Phase 3: 交互功能实现

**目标**: 在 `useConversationGraph.ts` 中实现所有交互逻辑，让图“活”起来。

1.  **完善 `useConversationGraph.ts` 的 `graphOption`**:
    - 实现将 `session.nodes` 转换为 ECharts `nodes` 和 `links` 的完整逻辑。
    - **实现高亮与状态反馈**:
        - 遍历所有节点，使用 `BranchNavigator.isNodeInActivePath` 判断节点是否在当前活动路径上。
        - 根据节点的 `isEnabled`, `isNodeInActivePath`, `id === session.activeLeafId` 等状态，为其分配不同的 `itemStyle` (颜色、边框、透明度)。
        - 对 `links` 也进行类似处理。

2.  **实现分支切换**:
    - 在 `init()` 函数中，为 ECharts 实例绑定 `'dblclick'` 事件。
    - 在事件回调中，获取被点击的节点 ID，调用 `store.switchBranch(nodeId)`。

3.  **实现剪枝与状态切换 (右键菜单)**:
    - 为 ECharts 实例绑定 `'contextmenu'` 事件。
    - 在回调中，阻止默认事件，并使用一个全局服务或组件（如 `ContextMenu.show(...)`）来显示自定义菜单。
    - 菜单项绑定 `store.deleteMessage(nodeId)` 和 `store.toggleNodeEnabled(nodeId)`。

4.  **实现嫁接**:
    - 为 ECharts 实例绑定 `'dragend'` 事件。
    - 在回调中：
        - 获取被拖拽的节点 (`draggedNode`)。
        - 使用 ECharts API (`convertFromPixel`) 获取鼠标松开位置对应的图表坐标，并找到该坐标下的目标节点 (`targetNode`)。
        - **执行校验**: 确保 `targetNode` 存在，且不是 `draggedNode` 的子孙。
        - 调用 `store.graftBranch(draggedNode.id, targetNode.id)`。

---

**任务完成标志**: 所有 Phase 1-3 的功能实现完毕，用户可以在 `ChatArea` 中通过视图切换器在“线性视图”和“树图视图”之间无缝切换，并能在树图视图中通过双击、右键、拖拽等方式进行分支切换、剪枝和嫁接操作。