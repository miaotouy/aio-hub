# 窗口同步与分离架构

本文档详细介绍了 AIO Hub 的多窗口架构，包括窗口间的状态同步、通信机制以及拖拽分离系统的实现。

## 1. 架构概览

在 Tauri 应用中，每个窗口都是独立的 Webview 进程，拥有独立的内存空间。为了实现流畅的多窗口体验（如将工具拖出独立使用），我们需要一个可靠的同步机制。

AIO Hub 采用了**基于事件总线 (Event Bus)** 的架构，实现了松耦合的跨窗口通信。

### 核心设计原则

- **多数据源 (Multi-Source of Truth)**: 任何窗口（主窗口或独立工具窗口）都可以作为数据的"所有者"和"单一事实来源"。
- **广播通信**: 消息默认广播给所有窗口，由感兴趣的接收者处理。
- **生命周期管理**: 自动处理窗口的连接、断开、心跳和重连。

## 2. 核心组件：WindowSyncBus

`WindowSyncBus` (`src/composables/useWindowSyncBus.ts`) 是整个系统的神经中枢。它是一个单例对象，运行在每个窗口进程中。

### 2.1 消息类型

系统定义了几种核心消息类型：

- **`handshake`**: 窗口启动时发送，宣告自己的存在（类型、ID）。
- **`state-sync`**: 数据所有者广播状态更新（全量或增量 Patch）。
- **`action-request`**: 消费者请求执行操作（如"发送消息"）。
- **`heartbeat`**: 定期发送心跳，用于检测窗口存活状态。
- **`request-initial-state`**: 新窗口请求获取当前最新状态。

### 2.2 窗口类型

系统识别三种类型的窗口：

1.  **Main (`main`)**: 主窗口，通常是大部分全局状态的所有者。
2.  **Detached Tool (`detached-tool`)**: 独立运行的工具窗口（如独立的 LLM Chat）。它**拥有**自己的状态，是数据源。
3.  **Detached Component (`detached-component`)**: 仅作为 UI 显示的组件窗口（如独立的图表视图）。它**不拥有**状态，仅消费来自主窗口或工具窗口的数据。

## 3. 同步流程

### 3.1 状态同步 (State Sync)

当数据源（如主窗口的 Pinia Store）发生变化时：

1.  Store 触发 `syncState` 方法。
2.  `WindowSyncBus` 将状态序列化并通过 Tauri 事件广播。
3.  其他窗口收到 `state-sync` 消息。
4.  接收端根据 `stateType` 更新本地的 Store 或组件状态。

### 3.2 操作请求 (Action Request)

当分离的组件需要执行操作（如用户点击"发送"按钮）时：

1.  组件调用 `requestAction`。
2.  消息被广播到所有窗口。
3.  拥有该操作处理器的窗口（通常是数据源窗口）捕获请求。
4.  执行操作并返回结果（`action-response`）。

## 4. 分离管理器 (DetachedManager)

`useDetachedManager` (`src/composables/useDetachedManager.ts`) 负责管理窗口的物理生命周期。

- **状态追踪**: 维护所有已分离窗口的列表 (`detachedWindows`)。
- **窗口创建**: 调用 Rust 后端创建新窗口。
- **位置管理**: 可选的自动位置调整，确保窗口不飞出屏幕。
- **统一关闭**: 提供统一的接口关闭并重新附着窗口。

## 5. 拖拽分离机制 (Drag-to-Detach)

`useDetachable` (`src/composables/useDetachable.ts`) 实现了直观的拖拽分离交互。

- **交互逻辑**:
  - 监听鼠标按下和移动。
  - 计算拖拽距离，超过阈值（如 50px）触发分离意图。
  - 调用 Rust 端的 `start_drag_session` (基于 `rdev`) 接管鼠标事件。
- **视觉反馈**: 拖拽过程中显示半透明的窗口快照（由 Rust 端实现）。
- **无缝切换**: 鼠标释放时，如果满足分离条件，自动创建新窗口并传递初始状态。

## 6. 开发指南

### 6.1 注册可分离组件

可分离组件通过工具注册表 (`ToolRegistry`) 进行动态注册。

1.  **定义组件**: 在工具目录中创建你的 Vue 组件。
2.  **实现逻辑钩子**: 创建一个适配器或钩子，返回 `{ props, listeners }`，用于在分离窗口中连接状态。
3.  **在 Registry 中注册**:
    在你的工具注册类（例如 `LlmChatRegistry`）中，实现 `detachableComponents` 属性：

    ```typescript
    // src/tools/your-tool/your.registry.ts
    public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
      // 使用命名空间 ID: 'tool-id:component-name'
      'your-tool:component-name': {
        component: () => import('./components/YourComponent.vue'),
        logicHook: useYourDetachedLogic, // 或适配器函数
        initializeEnvironment: () => { /* 初始化逻辑，如状态同步 */ },
      },
    };
    ```

### 6.2 在 UI 中使用

1.  **触发分离**: 使用 `useDetachable` 的 `startDetaching` 方法，传入注册的 ID。
    ```typescript
    startDetaching({
      id: "your-tool:component-name",
      // ... 其他配置
    });
    ```

### 6.3 添加新的同步状态

1.  在 `src/types/window-sync.ts` 中定义新的 `StateKey`。
2.  在数据源窗口（如主窗口）监听状态变化并调用 `bus.syncState`。
3.  在消费者窗口监听 `state-sync` 消息并更新本地状态。
