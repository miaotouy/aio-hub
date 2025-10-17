# 组件分离功能实现指南 (v3.1 - 窗口池方案)

## 1. 核心思想

为了实现组件拖拽分离过程中的“零延迟”响应和“无闪烁”的丝滑体验，我们采用 **“窗口池” (Window Pool)** 架构。

该方案的核心是预先创建并维护一个隐藏的窗口池。当用户开始拖拽组件时，我们直接从池中取出一个已存在的窗口作为预览窗口，从而完全规避了实时创建窗口所带来的性能开销和视觉延迟。

拖拽成功后，该窗口转换为固定的可交互状态；若拖拽取消，窗口将被“软回收”至池中，等待下一次使用。

## 2. 总体设计

-   **后端窗口管理器**: 在 Rust 后端实现一个有状态的 `ComponentWindowManager`，单例管理，负责窗口池的完整生命周期（初始化、获取、回收、销毁）。
-   **N+1 策略**: 系统将始终保持池中至少有一个备用窗口。如果当前有 N 个已分离的组件窗口，管理器将确保池中存在第 N+1 个隐藏的备用窗口。
-   **状态转换**: 窗口的生命周期将在以下几种状态间转换：
    -   `AvailableStandby`: 可用状态，窗口已创建但隐藏，并加载了一个空白的"待机页"。
    -   `InPreview`: 预览状态，窗口被用于展示拖拽中的组件，半透明且事件穿透。
    -   `Active`: 固定状态，窗口已成为一个标准的可交互窗口。

### 2.1. 窗口外观设计

**所有分离组件窗口都采用无边框透明设计**，不使用系统标题栏，完全依靠内部的操作头部来提供窗口管理功能。

#### 2.1.1. 窗口特性
- **无边框** (`decorations: false`): 去除系统标题栏和边框
- **透明背景** (`transparent: true`): 允许自定义窗口形状和样式
- **预览模式**: 半透明、事件穿透、不显示在任务栏
- **固定模式**: 完全不透明、可交互、显示在任务栏

#### 2.1.2. 内嵌操作头部 (ComponentHeader)

每个可分离组件必须集成一个操作头部组件，提供以下功能：

**核心功能**:
- **拖拽手柄**: 用于移动窗口（data-tauri-drag-region）
- **操作菜单**: 包含关闭窗口、重新附着到主窗口等操作
- **收起/展开**: 默认可收起为小图标，悬停或点击展开完整菜单

**位置配置**:
组件可通过 props 配置头部的位置：
- `top`: 顶部（默认）
- `bottom`: 底部
- `left`: 左侧
- `right`: 右侧

**集成方式**:
```vue
<!-- 方式一：作为独立组件使用 -->
<ComponentHeader
  position="top"
  :collapsible="true"
  @close="handleClose"
  @reattach="handleReattach"
>
  <template #drag-region>
    <div class="custom-drag-handle">拖动我</div>
  </template>
</ComponentHeader>

<!-- 方式二：在组件内部深度融合样式 -->
<!-- 组件内部自行实现操作头部，遵循统一的接口和样式规范 -->
```

**设计原则**:
1. **最小化干扰**: 默认收起状态，不占用过多空间
2. **一致性**: 所有组件的操作头部保持统一的交互模式
3. **灵活性**: 允许组件根据自身特点调整头部位置和样式
4. **响应式**: 根据窗口尺寸自适应显示内容

#### 2.1.3. 设计决策：内嵌式 vs. 容器式操作

在设计组件的操作功能（拖拽、关闭等）时，我们评估了两种主流方案：

1.  **容器式集成**: 由外部的容器组件（Wrapper）提供统一的操作栏。
    *   **优点**: 实现简单，将操作逻辑与业务组件解耦。
    *   **缺点**: 严重限制了内部组件的视觉形态。为了让操作栏与组件对齐，内部组件只能是标准的矩形轮廓，这与我们采用无边框透明窗口的初衷相悖，无法实现异形或高度自定义的组件外观。

2.  **内嵌式集成**: 由组件自行在其内部实现和管理操作手柄和菜单。
    *   **优点**: 提供了最大的设计灵活性。操作控件可以与组件自身的 UI 设计完美融合，无论组件是圆形、不规则形状，还是有复杂的边框设计，都能找到最协调的集成方式，从而达到最佳的视觉一体性。
    *   **缺点**: 需要组件自身承担一部分集成工作，略微增加了组件的复杂度。

**结论**:

考虑到我们架构的核心优势在于 **无边框透明窗口**，为了最大化发挥这一特性，我们最终选择 **“内嵌式集成”** 作为首选和推荐的实现方式。这确保了未来组件设计的自由度，能够创造出更具吸引力和沉浸感的用户体验。

## 3. 详细执行方案

### 后端 (Rust / Tauri)

`ComponentWindowManager` 将作为核心，管理所有相关窗口。

#### 3.1. `ComponentWindowManager` 结构体

```rust
// src-tauri/src/commands/window_manager.rs (示意)
pub struct ComponentWindowManager {
    windows: Mutex<HashMap<String, WindowState>>,
    available_windows: Mutex<Vec<String>>, // 备用窗口label栈
    app_handle: AppHandle,
}
```

#### 3.2. Tauri 启动时初始化

在 `main.rs` 的 `setup` 钩子中，初始化 `ComponentWindowManager` 并创建第一个备用窗口。

#### 3.3. Tauri 命令 (Commands)

1.  **`request_preview_window(config: ComponentConfig) -> String`**
    *   **逻辑**:
        1.  从 `available_windows` 栈中弹出一个备用窗口的 `label`。
        2.  如果池为空（异常情况），则同步创建一个作为应急。
        3.  **关键顺序**:
            a. 根据 `config` 设置窗口的目标 URL、尺寸和初始位置。
            b. 设置窗口为预览模式属性（`decorations(false)`, `transparent(true)`, `set_skip_taskbar(true)`, `set_ignore_cursor_events(true)`）。
            c. **最后调用 `window.show()`**。
        4.  返回该窗口的 `label` 给前端。
        5.  **异步**在后台创建下一个备用窗口，以补充窗口池。

2.  **`update_preview_position(label: &str, x: f64, y: f64)`**
    *   **逻辑**: 根据 `label` 高频调用以更新指定窗口的位置。

3.  **`finalize_preview_window(label: &str)`**
    *   **逻辑**:
        1.  根据 `label` 找到窗口。
        2.  将其从“预览模式”转换为“固定模式”：
            *   `set_ignore_cursor_events(false)` (恢复交互)
            *   `set_skip_taskbar(false)` (在任务栏显示)
            *   `set_decorations(true)` (如果需要自定义标题栏，则保持false)
        3.  更新 `ComponentWindowManager` 中该窗口的状态为 `Active`。
        4.  向该窗口的前端发送 `finalize-component-view` 事件。
        5.  向主窗口发送 `component-detached` 全局事件。

4.  **`cancel_preview_window(label: &str)`**
    *   **逻辑 (关键的回收顺序)**:
        1.  **`window.hide()`**: **立即隐藏窗口，这是防止闪烁的第一要务。**
        2.  **后台处理**:
            a. `window.navigate("/component-standby")`: 将窗口内容导航至待机页，以清理状态。
            b. 将窗口 `label` 压回 `available_windows` 栈中。
            c. 更新 `ComponentWindowManager` 中该窗口的状态为 `AvailableStandby`。

#### 3.4. 窗口关闭事件处理 (硬回收)

-   监听所有组件窗口的 `on_close_requested` 事件。
-   当事件触发时，调用 `ComponentWindowManager` 的方法，将该窗口从 `windows` `HashMap` 中移除，并确保其被彻底销毁，防止内存泄漏。

### 前端 (Vue / TypeScript)

#### 4.1. 路由 (`src/router/index.ts`)

```typescript
{
  path: "/detached-component",
  name: "DetachedComponent",
  component: () => import("../views/DetachedComponentContainer.vue"),
},
{
  path: "/component-standby",
  name: "ComponentStandby",
  component: () => import("../views/ComponentStandby.vue"), // 新建一个空白待机组件
}
```

#### 4.2. 视图

1.  **`DetachedComponentContainer.vue`**
    *   根据路由 `query` 参数或 Tauri 事件来切换内部UI。
    *   通过监听 `finalize-component-view` 事件，移除预览样式（如半透明、提示文字），并显示自定义标题栏等最终UI。

2.  **`ComponentStandby.vue`**
    *   一个极其轻量的组件，可以只包含一个空的 `<div>`，用于回收窗口时清空内容。

#### 4.3. 拖拽源组件 (`src/tools/llm-chat/components/MessageInput.vue`)

*   **`handleDragStart`**:
    *   调用 `invoke('request_preview_window', ...)`。
    *   将返回的 `label` 存入本地 state (`activeDragLabel.value`)。
*   **`mousemove`**:
    *   调用 `invoke('update_preview_position', { label: activeDragLabel.value, ... })`。
*   **`mouseup`**:
    *   判断拖拽是否有效（例如，移动了足够距离）。
    *   若有效，调用 `invoke('finalize_preview_window', { label: activeDragLabel.value })`。
    *   若无效或取消，调用 `invoke('cancel_preview_window', { label: activeDragLabel.value })`。
    *   最后，清空 `activeDragLabel.value`。

## 5. 最终交互流程 (Mermaid图)

```mermaid
sequenceDiagram
    participant App as 主应用
    participant Backend as (Tauri + WindowManager)
    participant Pool as 窗口池
    participant User
    participant Comp as 源组件
    participant Win as 窗口实例

    App->>Backend: 启动时
    Backend->>Pool: 创建一个备用窗口 (Win1, 隐藏, 位于待机页)

    User->>Comp: mousedown (长按)
    Comp->>Backend: request_preview_window(config)
    Backend->>Pool: 取出 Win1
    Backend->>Win: **激活** (设置内容/尺寸/位置, 设为预览模式, 显示)
    Win-->>Backend: 加载 /detached-component
    Backend-->>Comp: 返回 Win1 的 label
    
    Note right of Backend: 异步创建新的备用窗口 Win2 以补充池

    User->>Comp: mousemove (拖拽中)
    Comp->>Backend: update_preview_position(Win1, pos)
    Backend->>Win: set_position(pos)

    User->>Comp: mouseup (松手)
    alt 拖拽成功
        Comp->>Backend: finalize_preview_window(Win1)
        Backend->>Win: **转换** (变为固定模式, 可交互)
        Backend->>Win: emit('finalize-view')
        Backend->>Comp: emit('component-detached')
    else 拖拽取消
        Comp->>Backend: cancel_preview_window(Win1)
        Backend->>Win: **立即隐藏**
        Backend->>Win: (后台) 导航至 /component-standby
        Backend->>Pool: (后台) 回收 Win1
    end