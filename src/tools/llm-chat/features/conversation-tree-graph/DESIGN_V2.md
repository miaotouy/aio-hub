# 会话树图 V2 (Conversation Tree Graph V2) - 设计文档

本文档阐述了“会话树图”V2 版本的增强设计方案，旨在通过引入物理力导向布局，解决 V1 版本在复杂对话分支下的视觉局限性。

## 1. V2 核心目标

V2 方案的核心目标是**提升可视化效果和交互体验**。

1.  **自然布局**: 引入物理力导向布局，使节点分布更自然、有机，并能自动避免重叠，解决 V1 层级布局的拥挤和死板问题。
2.  **增强节点表现力**: 使用 Vue 组件作为自定义节点，使其能够承载更丰富的 UI 元素，如头像、状态图标、操作按钮等，提供更强的信息密度和交互能力。
3.  **流畅交互**: 优化拖拽、嫁接等核心交互，使其在物理模拟环境中表现得更流畅、直观。

## 2. V2 技术选型

- **渲染与交互引擎**: **Vue Flow (`@vue-flow/core`)**
  - **原因**:
    - **Vue 原生**: 允许使用标准的 `.vue` 文件作为自定义节点，可以轻松集成现有 UI 组件库和复杂的交互逻辑。
    - **高性能**: 专为 Vue 3 设计，具备高性能的渲染和状态管理。
    - **丰富的 API**: 提供简洁的 API 来处理视图控制（缩放/平移）、元素状态和事件。

- **物理布局引擎**: **D3.js (`d3-force`)**
  - **原因**:
    - **强大的物理模拟**: 提供多种可配置的“力”（如节点间斥力、连接线引力、碰撞检测），能自动计算出避免重叠的有机布局。
    - **与渲染解耦**: D3 只负责计算坐标，不关心渲染，可以完美地与 Vue Flow 结合。

## 3. V2 架构：D3 计算 + Vue Flow 渲染

新架构将遵循“计算与渲染分离”的原则，D3 负责布局算法，Vue Flow 负责渲染和交互。

```mermaid
graph TD
    A[ChatSession 数据] --> B{useFlowTreeGraph.ts};
    B --> C[创建 D3 Force Simulation];
    C -- 计算出 x, y 坐标 --> D[更新节点位置];
    D --> E{Vue Flow <VueFlow />};
    subgraph "Vue Component (FlowTreeGraph.vue)"
        E -- 渲染节点和边 --> F[自定义节点 (GraphNode.vue)];
        F -- 用户交互事件 --> B;
    end
    B -- 调用 Store Actions --> G[useLlmChatStore];
    G -- 状态变更 --> A;
```

- **`useFlowTreeGraph.ts`**: 新的 Composable，负责创建和管理 D3 物理模拟。它将 `ChatSession` 数据转换为 D3 需要的格式，并在模拟结束后将计算出的坐标同步给 Vue Flow 使用的节点数据。
- **`FlowTreeGraph.vue`**: 新的图表主组件，内部使用 `<VueFlow>`。它从 Composable 获取节点和边数据，并将其传递给 Vue Flow。
- **`GraphNode.vue`**: 一个自定义的 Vue Flow 节点组件。它将负责渲染单个消息节点的详细内容，包括头像、角色名、内容摘要、状态图标和操作按钮。

## 4. V2 核心功能实现

- **布局**:
  - D3 的 `forceSimulation` 将配置以下核心“力”：
    - `forceLink()`: 维持父子节点间的连接距离。
    - `forceManyBody()`: 使所有节点相互排斥，避免重叠。
    - `forceCollide()`: 设置节点的碰撞半径，提供更精确的防重叠。
    - `forceCenter()`: 将整个图吸引到视图中心。
- **交互**:
  - **拖拽**: 拖拽节点时，可以“重新加热”(`reheat`) D3 模拟，使周围节点动态适应新位置。
  - **嫁接**: 拖拽结束时，通过 Vue Flow 的 `onNodeDragStop` 事件获取被拖拽节点和其下方的目标节点，然后调用 `store.graftBranch`。
  - **分支切换**: 通过 `onNodeDoubleClick` 事件调用 `store.switchBranch`。
  - **右键菜单**: 复用现有的 `ContextMenu.vue` 组件，通过 `onNodeContextMenu` 事件触发。

## 5. V2 实施计划 (Roadmap)

1.  **依赖安装**: 安装 `@vue-flow/core` 和 `d3-force`。
2.  **组件骨架**: 创建 `FlowTreeGraph.vue`, `GraphNode.vue` 和 `useFlowTreeGraph.ts` 的基本文件结构。
3.  **D3 布局集成**: 在 `useFlowTreeGraph.ts` 中实现 D3 力导向模拟，并将计算出的布局应用到节点上。
4.  **Vue Flow 渲染**: 在 `FlowTreeGraph.vue` 中集成 `VueFlow`，并使用 `GraphNode.vue` 作为自定义节点进行渲染。
5.  **交互实现**: 逐一实现拖拽、双击和右键菜单等核心交互。
6.  **视图切换**: 在 `ViewModeSwitcher.vue` 中增加一个新选项（如“高级树图视图”），并更新 `ChatArea.vue` 的动态组件逻辑以支持新图表。
7.  **最终替换**: 在功能对等和体验优化后，V2 版本将完全替换 V1 的 `vis-network` 实现。