# 会话树图 V2 - 实施计划

本文档基于 `DESIGN_V2.md` 和对 V1 代码的调研，提供一个详细、分步的实施计划。

## 1. 核心思路

- **增量开发，平滑过渡**: V2 将作为一种新的视图模式（`force-graph`）被添加，与现有的 V1（`graph`）和线性视图（`linear`）共存。用户可以通过 `ViewModeSwitcher` 自由切换，直到 V2 功能完善并确认可以替换 V1。
- **逻辑迁移，而非重写**: V1 的 `useVisTreeGraph.ts` 中包含了大量与渲染无关的核心业务逻辑（如数据转换、颜色计算、头像解析、交互回调等）。V2 的 `useFlowTreeGraph.ts` 将迁移并改造这些逻辑，使其适配 Vue Flow 和 D3.js，避免重复劳动。

## 2. 任务分解 (Task Breakdown)

### 阶段一：环境与骨架搭建

1.  **安装依赖**:
    - 在 `package.json` 中添加以下依赖：
      ```json
      "dependencies": {
        // ...
        "@vue-flow/core": "^1.33.0",
        "d3-force": "^3.0.0"
      },
      "devDependencies": {
        // ...
        "@types/d3-force": "^3.0.9"
      }
      ```
    - 运行 `bun install`。

2.  **创建文件骨架 (新结构)**:
    - **Composable**: `src/tools/llm-chat/composables/useFlowTreeGraph.ts`
    - **主组件**: `src/tools/llm-chat/components/conversation-tree-graph/flow/FlowTreeGraph.vue`
    - **自定义节点**: `src/tools/llm-chat/components/conversation-tree-graph/flow/components/GraphNode.vue`

### 阶段二：核心逻辑实现 (`useFlowTreeGraph.ts`)

1.  **迁移基础逻辑**:
    - 从 `useVisTreeGraph.ts` 复制大部分代码到 `useFlowTreeGraph.ts`。
    - 重点迁移以下函数/逻辑，并做初步适配：
        - `truncateText`
        - `getRoleDisplay` (头像和名称解析)
        - `createThemePalette` 及 `MutationObserver` (动态主题适配)
        - `getNodeColor`, `getEdgeColor`
        - 交互回调函数 (`handleDoubleClick`, `handleDragEnd`, `handleContextMenu`) 的基本逻辑。

2.  **数据格式转换**:
    - 修改 `nodesData` 计算属性，使其返回 Vue Flow 格式的节点数组 (`Node[]`)。
        - 关键字段：`id`, `type: 'custom'`, `position: { x: 0, y: 0 }`, `data: { ... }`。
        - 将 V1 节点的所有业务数据（如 `_node`, `colors`, `isActiveLeaf` 等）都放入 `data` 对象中，传递给自定义节点。
    - 修改 `edgesData` 计算属性，使其返回 Vue Flow 格式的边数组 (`Edge[]`)。
        - 关键字段：`id`, `source`, `target`, `animated`, `style`。

3.  **集成 D3 力导向布局**:
    - 在 `init` 函数中，创建 `d3.forceSimulation()`。
    - 配置核心的“力”：`forceLink`, `forceManyBody`, `forceCollide`, `forceCenter`。
    - 将 Vue Flow 的节点和边数据提供给 D3 Simulation。
    - 监听 `simulation.on('tick', ...)` 事件，在每次 tick 时更新 Vue Flow 节点的 `position`。
    - 当模拟稳定后 (`simulation.on('end', ...)`), 停止 tick 更新。

### 阶段三：视图渲染 (Vue Flow Components)

1.  **自定义节点 (`GraphNode.vue`)**:
    - 存放于 `src/tools/llm-chat/components/conversation-tree-graph/flow/components/GraphNode.vue`。
    - 使用 `@vue-flow/core` 提供的 `Handle` 组件来定义连接点。
    - 从 `props.data` 中获取节点的所有业务数据。
    - 使用 `Avatar`, `ElTooltip` 等现有组件，复现 V1 的节点视觉效果，包括：
        - 头像、角色名、内容摘要。
        - 动态的背景色和边框色（基于 `props.data.colors`）。
        - 使用 `v-if` 显示特殊状态标记（如“当前活动节点”）。

2.  **主图表组件 (`FlowTreeGraph.vue`)**:
    - 存放于 `src/tools/llm-chat/components/conversation-tree-graph/flow/FlowTreeGraph.vue`。
    - 引入并使用 Vue Flow 的核心及辅助组件：
      ```typescript
      import { VueFlow, Background, MiniMap, Controls } from '@vue-flow/core';
      ```
    - 在模板中搭建完整的画布结构：
      ```vue
      <VueFlow>
        <Background />
        <MiniMap />
        <Controls />
        
        <template #node-custom="props">
          <GraphNode :data="props.data" />
        </template>
      </VueFlow>
      ```
    - 从 `useFlowTreeGraph.ts` 获取 `nodes` 和 `edges` 并进行 `v-model` 绑定。
    - 绑定 Vue Flow 的事件监听器 (`@node-double-click`, `@node-drag-stop`, `@node-context-menu`) 到 `useFlowTreeGraph.ts` 中的处理函数。
    - 复用 `ContextMenu.vue` 组件，用于显示右键菜单。

### 阶段四：集成与测试

1.  **更新 `ChatArea.vue`**:
    - 导入新的主组件: `import FlowTreeGraph from "./conversation-tree-graph/flow/FlowTreeGraph.vue";`
    - 在模板的视图切换逻辑中，添加 `v-else-if="viewMode === 'force-graph'"` 条件，用于渲染 `FlowTreeGraph` 组件。
    - 确保将 `llmChatStore.currentSession` 作为 `session` prop 传递给新组件。

2.  **功能验证**:
    - 打开 `ViewModeSwitcher`，切换到“高级树图视图”。
    - **验证布局**: 确认节点是否以力导向方式自然散开。
    - **验证视觉**: 确认节点颜色、头像、状态等是否与 V1 表现一致，并能响应主题切换。
    - **验证交互**:
        - 双击节点是否能切换分支。
        - 拖拽节点到另一个节点上是否能正确嫁接。
        - 右键单击节点是否能弹出功能正确的上下文菜单。
        - 拖拽、缩放、平移画布是否流畅。

## 3. 风险与预案

- **性能问题**: 复杂对话（节点 > 200）下，D3 模拟和 Vue Flow 渲染可能出现性能瓶颈。
  - **预案**:
    1.  优化 D3 模拟参数，适当减少迭代次数。
    2.  在 Vue Flow 中启用 `onlyRenderVisibleElements` 优化。
    3.  探索在拖拽时“重新加热”(`reheat`)模拟，而不是持续运行。
- **主题适配复杂性**: `useVisTreeGraph.ts` 中的主题适配逻辑与 `vis-network` 的配置项耦合较深。
  - **预案**: 迁移时仔细解耦，确保颜色计算逻辑是纯粹的，然后将计算结果应用到 Vue Flow 节点的 `style` 和 `class` 上，或者直接透传给 `GraphNode.vue` 组件处理。