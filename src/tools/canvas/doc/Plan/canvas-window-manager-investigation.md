# 画布窗口管理器调查报告：独立 Rust 模块方案

> **状态**: RFC (Request for Comments)
> **日期**: 2025-04-13
> **最后更新**: 2025-04-13
> **触发**: 用户反馈"对悬浮窗口组件的适配程度过于乐观"
> **决策方向**: 独立 Rust 模块 (`canvas_window.rs`)

## 1. 问题陈述

当前 Canvas 实施计划（[`canvas-implementation-plan.md`](canvas-implementation-plan.md) §3.1）假设画布预览窗口可以完全复用现有的 `detached-component` 悬浮窗系统。经深入调查，**该假设不成立**。现有系统从 Rust 后端到前端全链路都是 **1:1 映射**（一个组件类型 = 一个窗口实例），无法支持画布的多实例需求。

## 2. 调查发现：现有悬浮窗系统的全链路限制

### 2.1 Rust 端 — 窗口标签硬编码为 1:1

**文件**: [`src-tauri/src/commands/window_manager.rs`](../../../../src-tauri/src/commands/window_manager.rs)

| 位置     | 代码                                                                                                                    | 问题                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| L225     | `preview_label = format!("detached-{}", &config.id)`                                                                    | `start_drag_session` 中 label 由 id 决定                           |
| L499     | `preview_label = format!("detached-{}", &config.id)`                                                                    | `begin_detach_session` 同样硬编码                                  |
| L721-724 | `if let Some(existing_window) = app.get_webview_window(&config.label) { existing_window.set_focus()... return Ok(()) }` | `create_tool_window` 发现同 label 窗口直接聚焦，**拒绝创建新窗口** |
| L585-587 | `FINALIZED_DETACHED_WINDOWS: HashMap<String, DetachedWindowInfo>`                                                       | 用 label 做 key，label = `detached-{id}`，天然去重                 |

**结论**: Rust 端将 `config.id` 视为窗口的唯一标识。同一个 `id` 只能存在一个窗口实例。

### 2.2 `create_tool_window` 的副作用污染

**文件**: [`window_manager.rs`](../../../../src-tauri/src/commands/window_manager.rs) L718-758

`create_tool_window()` 内部会调用 `finalize_window_internal()`，产生以下副作用：

1. 将窗口注册到 `FINALIZED_DETACHED_WINDOWS` 全局 HashMap
2. 广播 `window-detached` 事件到所有窗口
3. 前端的 `useDetachedManager` 会捕获此事件并将窗口纳入管理

**这意味着**：即使前端用独立的 `useCanvasWindowManager` 管理画布窗口，只要底层调用 `create_tool_window`，画布窗口就会被"污染"进分离窗口体系。

### 2.3 `lib.rs` 窗口关闭事件的耦合

**文件**: [`src-tauri/src/lib.rs`](../../../../src-tauri/src/lib.rs) L754-761

```rust
// 如果关闭的是分离窗口（非主窗口），调用统一的关闭命令
if window_label != "main" {
    let app_handle = window.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = commands::close_detached_window(app_handle, window_label).await {
            log::error!("Error closing detached window: {}", e);
        }
    });
}
```

**问题**：**所有非主窗口**关闭时都会调用 `close_detached_window()`，它会：

1. 从 `FINALIZED_DETACHED_WINDOWS` 中移除记录
2. 发送 `window-attached` 事件

如果画布窗口不在 `FINALIZED_DETACHED_WINDOWS` 中，`close_detached_window` 会返回 `Window 'canvas-win-xxx' not found` 错误。虽然错误被 `log::error!` 吞掉不会崩溃，但这是**设计上的不干净**。

### 2.4 前端 `useDetachable.ts` — 拖拽系统是全局单例

**文件**: [`src/composables/useDetachable.ts`](../../../../src/composables/useDetachable.ts)

| 位置   | 代码                                                                  | 问题                                                   |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------ |
| L35-45 | `const isDragging = ref(false)` + `const dragState = reactive({...})` | **模块顶层**声明，全局共享。同一时刻只能有一个拖拽会话 |
| L254   | `sessionId: \`detached-${config.id}\``                                | `detachByClick` 中 sessionId 硬编码，与 Rust 端一致    |

### 2.5 前端 `useDetachedManager.ts` — 查询逻辑假设 1:1

**文件**: [`src/composables/useDetachedManager.ts`](../../../../src/composables/useDetachedManager.ts)

| 位置     | 代码                                                 | 问题                                                          |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| L276-283 | `isDetached(id)`: 遍历找**第一个**匹配的 id 就返回   | 假设一个 id 只有一个窗口                                      |
| L242-270 | `closeWindow(id)`: 同样找**第一个**匹配的 id         | 如果有多个同 id 窗口，只能关闭第一个                          |
| L34      | `detachedWindows = ref<Map<string, DetachedWindow>>` | Map 以 label 为 key，但所有查询方法按 id 做"找到第一个就返回" |

### 2.6 前端路由 & 组件加载 — 静态注册表

**文件**: [`src/config/detachable-components.ts`](../../../../src/config/detachable-components.ts)

| 位置   | 代码                                                                | 问题                                                         |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| L28-31 | `getDetachableComponentConfig(id)`: 从 `allComponents[id]` 精确查找 | 注册表的 key 是**静态的组件类型名**（如 `"canvas:preview"`） |

**文件**: [`src/views/DetachedComponentContainer.vue`](../../../../src/views/DetachedComponentContainer.vue)

| 位置 | 代码                                                         | 问题                                              |
| ---- | ------------------------------------------------------------ | ------------------------------------------------- |
| L64  | `const { id } = config` → `getDetachableComponentConfig(id)` | 从 URL 解析出的 id 必须**精确匹配**注册表中的 key |

**文件**: [`src/tools/canvas/canvas.registry.ts`](../../../../src/tools/canvas/canvas.registry.ts)

| 位置   | 代码                                                  | 问题                                    |
| ------ | ----------------------------------------------------- | --------------------------------------- |
| L22-36 | `detachableComponents: { "canvas:preview": { ... } }` | 只注册了一个静态 key `"canvas:preview"` |

### 2.7 Canvas 当前的尝试 — 已经意识到问题但解法不通

**文件**: [`src/tools/canvas/composables/useCanvasSync.ts`](../../../../src/tools/canvas/composables/useCanvasSync.ts)

```typescript
// L118-131: 已经尝试用动态 ID
case "open-window": {
  const { detachByClick } = useDetachable();
  return detachByClick({
    id: `canvas:preview:${canvasId}`,  // 动态 ID！
    displayName: `画布预览 - ${canvasId}`,
    type: "component",
    ...
  });
}
```

**这段代码的问题**:

1. Rust 端会生成 label = `detached-canvas:preview:{canvasId}`
2. 前端路由会导航到 `/detached-component/canvas:preview:{canvasId}?config=...`
3. `DetachedComponentContainer.vue` 解析出 `id = "canvas:preview:{canvasId}"`
4. 调用 `getDetachableComponentConfig("canvas:preview:{canvasId}")` → **找不到**！因为注册表中只有 `"canvas:preview"`
5. **窗口创建成功但组件加载失败**，显示"组件加载失败"错误页面

### 2.8 前端同步总线 — 身份识别硬编码

**文件**: [`src/composables/useWindowSyncBus.ts`](../../../../src/composables/useWindowSyncBus.ts)

| 位置   | 代码                                                          | 问题                                                                              |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| L82-86 | `if (currentPath.startsWith("/detached-component/")) { ... }` | **身份识别依赖 URL 路径前缀**。若画布使用独立路由，会被误判为 `detached-tool`。   |
| L157   | `componentId: ... replace("component-", "")`                  | **握手协议耦合 Label 前缀**。硬编码剥离 `component-`，不兼容 `canvas-win-` 前缀。 |
| L486   | `handleReconnect()` 逻辑分支                                  | 如果身份被误判为 `tool`，重连时会尝试广播状态而非请求初始状态，导致同步失效。     |

### 2.9 前端环境初始化 — 依赖路由结构

**文件**: [`src/views/DetachedComponentContainer.vue`](../../../../src/views/DetachedComponentContainer.vue)

| 位置   | 代码                                                                                          | 问题                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| L45-55 | `const lastPart = parts[parts.length - 1]; ... appInitStore.initDetachedApp(priorityToolId);` | **工具环境初始化依赖 URL 结构**。分离窗口必须通过此逻辑加载画布对应的 Pinia Store，否则白屏。 |

## 3. 核心矛盾总结

```
现有系统的设计假设:
  一个组件类型 (如 "canvas:preview") = 一个窗口实例

Canvas 的需求:
  一个组件类型 (如 "canvas:preview") = N 个窗口实例 (每个画布项目一个)

冲突点 (全链路):
  ┌──────────────────────────────────────────────────────────────┐
  │  Rust 端                                                      │
  │  ├─ label = f("detached-{id}")         → 1:1 映射             │
  │  ├─ create_tool_window → finalize      → 污染分离窗口注册表   │
  │  └─ lib.rs on_close → close_detached   → 硬编码清理路径       │
  │                                                                │
  │  前端                                                          │
  │  ├─ 注册表: allComponents[id]          → 静态 key              │
  │  ├─ 查询: isDetached(id)/closeWindow   → 找第一个              │
  │  └─ 拖拽系统: 全局单例状态             → 同时只能一个          │
  └──────────────────────────────────────────────────────────────┘
```

## 4. 方案对比

### 4.1 方案 A：前端独立管理器 + 复用 `create_tool_window`（原方案）

**思路**：前端创建 `useCanvasWindowManager.ts`，但底层仍调用 Rust 的 `create_tool_window`。

**问题**：

- ❌ `create_tool_window` 内部调用 `finalize_window_internal`，会把画布窗口注册到 `FINALIZED_DETACHED_WINDOWS` 并广播 `window-detached` 事件
- ❌ 前端 `useDetachedManager` 会捕获事件并尝试管理画布窗口
- ❌ `lib.rs` 的 `on_window_event` 关闭时会调用 `close_detached_window`，产生不必要的错误日志
- ❌ 画布窗口的位置/大小持久化会被 `FINALIZED_DETACHED_WINDOWS` 的生命周期影响
- ⚠️ 需要在前端做大量"过滤"来屏蔽分离系统的干扰

**优势**：

- ✅ 零 Rust 改动

### 4.2 方案 B：独立 Rust 模块 `canvas_window.rs`（推荐方案）

**思路**：在 Rust 端新建一个专用于画布的窗口管理模块，拥有独立的窗口注册表、生命周期事件和命令集。

**优势**：

- ✅ **全链路干净**：画布窗口完全不进入分离窗口体系，零事件污染
- ✅ **独立注册表**：`CANVAS_WINDOWS` 只管理画布窗口，查询/遍历无噪声
- ✅ **专用事件**：`canvas-window-opened` / `canvas-window-closed`，前端无需过滤
- ✅ **生命周期自治**：`lib.rs` 的 `on_window_event` 可以按 label 前缀分流，画布窗口走自己的清理路径
- ✅ **窗口配置复用**：`window_config.rs` 基于 label 工作，完全独立于 `window_manager.rs`，画布窗口自动享有位置/大小记忆
- ✅ **未来扩展性**：画布窗口可以有自己的特殊行为（如默认置顶策略、窗口间通信优化等）

**代价**：

- ⚠️ 需要新建一个 Rust 文件（约 150-200 行）
- ⚠️ 需要修改 `lib.rs` 的 `on_window_event` 分流逻辑（约 5 行改动）
- ⚠️ 需要在 `commands.rs` 注册新模块（1 行）

### 4.3 方案 C：改造现有分离系统支持多实例

**代价极高，不推荐**：

需要同时修改 Rust 端 (`window_manager.rs`) + 前端 4 个文件 (`useDetachable.ts`, `useDetachedManager.ts`, `detachable-components.ts`, `DetachedComponentContainer.vue`)，影响所有已有的分离窗口（LLM Chat、媒体生成器等），引入回归风险。

## 5. 推荐方案详细设计：独立 Rust 模块

### 5.1 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Rust 后端                                  │
│                                                                    │
│  ┌────────────────────────────┐  ┌────────────────────────────┐   │
│  │  window_manager.rs         │  │  canvas_window.rs (新建)    │   │
│  │  (分离窗口体系)             │  │  (画布窗口体系)             │   │
│  │                            │  │                             │   │
│  │  FINALIZED_DETACHED_WINDOWS│  │  CANVAS_WINDOWS             │   │
│  │  create_tool_window()      │  │  create_canvas_window()     │   │
│  │  close_detached_window()   │  │  close_canvas_window()      │   │
│  │  window-detached 事件      │  │  canvas-window-opened 事件  │   │
│  │  window-attached 事件      │  │  canvas-window-closed 事件  │   │
│  └────────────────────────────┘  └────────────────────────────┘   │
│                                                                    │
│  ┌────────────────────────────┐                                   │
│  │  window_config.rs (共用)    │  ← 两个体系都复用                │
│  │  save_window_config_sync() │                                   │
│  │  apply_window_config()     │                                   │
│  └────────────────────────────┘                                   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  lib.rs on_window_event (修改)                              │   │
│  │                                                             │   │
│  │  if label == "main" { ... 托盘逻辑 ... }                    │   │
│  │  else if label.starts_with("canvas-win-") {                 │   │
│  │      canvas_window::handle_canvas_window_close(...)         │   │
│  │  } else {                                                   │   │
│  │      close_detached_window(...)  // 现有逻辑不变             │   │
│  │  }                                                          │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
          │                                        │
          ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────┐
│  前端分离窗口体系     │              │  前端画布窗口体系     │
│  useDetachable.ts    │              │  useCanvasWindowMgr  │
│  useDetachedManager  │              │  (composable)        │
│  DetachedComponent   │              │  CanvasWindowContainer│
│  Container.vue       │              │  .vue                │
└──────────────────────┘              └──────────────────────┘
```

### 5.2 Rust 端：`canvas_window.rs` 设计

#### 5.2.1 数据结构

```rust
// src-tauri/src/commands/canvas_window.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 画布窗口信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasWindowInfo {
    pub label: String,
    pub canvas_id: String,
    pub title: String,
}

/// 画布窗口注册表（独立于 FINALIZED_DETACHED_WINDOWS）
static CANVAS_WINDOWS: once_cell::sync::Lazy<Arc<Mutex<HashMap<String, CanvasWindowInfo>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// 画布窗口标签前缀
const CANVAS_WINDOW_PREFIX: &str = "canvas-win-";
```

#### 5.2.2 核心命令

```rust
/// 判断一个窗口标签是否属于画布窗口
pub fn is_canvas_window(label: &str) -> bool {
    label.starts_with(CANVAS_WINDOW_PREFIX)
}

/// 从标签中提取 canvasId
fn extract_canvas_id(label: &str) -> Option<&str> {
    label.strip_prefix(CANVAS_WINDOW_PREFIX)
}

/// 创建画布预览窗口
#[tauri::command]
pub async fn create_canvas_window(
    app: AppHandle,
    canvas_id: String,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    let label = format!("{}{}", CANVAS_WINDOW_PREFIX, canvas_id);
    let width = width.unwrap_or(1200.0);
    let height = height.unwrap_or(800.0);

    // 已存在则聚焦并返回
    if let Some(existing) = app.get_webview_window(&label) {
        existing.set_focus().map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        existing.unminimize().map_err(|e| e.to_string())?;
        return Ok(label);
    }

    // 创建窗口
    let url = format!("/canvas-window/{}", canvas_id);
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(width, height)
        .min_inner_size(400.0, 300.0)
        .decorations(false);

    #[cfg(target_os = "macos")]
    { builder = builder.title_bar_style(tauri::TitleBarStyle::Transparent); }

    #[cfg(target_os = "windows")]
    { builder = builder.transparent(true); }

    let _window = builder.build().map_err(|e| e.to_string())?;

    // 应用保存的窗口配置（复用 window_config 模块）
    let window_clone = _window.clone();
    let apply_result = crate::commands::window_config::apply_window_config(window_clone).await;
    if let Err(e) = apply_result {
        log::warn!("[CANVAS_WINDOW] 应用窗口配置失败（可能是首次打开）: {}", e);
    }

    // 注册到画布窗口表
    let info = CanvasWindowInfo {
        label: label.clone(),
        canvas_id: canvas_id.clone(),
        title,
    };
    {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.insert(label.clone(), info.clone());
    }

    // 发送画布专用事件
    app.emit("canvas-window-opened", &info)
        .map_err(|e| e.to_string())?;

    log::info!("[CANVAS_WINDOW] 已创建画布窗口: label={}, canvasId={}", label, canvas_id);
    Ok(label)
}

/// 关闭指定画布窗口
#[tauri::command]
pub async fn close_canvas_window(app: AppHandle, canvas_id: String) -> Result<(), String> {
    let label = format!("{}{}", CANVAS_WINDOW_PREFIX, canvas_id);

    let info = {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.remove(&label)
    };

    if let Some(info) = info {
        app.emit("canvas-window-closed", &info)
            .map_err(|e| e.to_string())?;
    }

    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 关闭所有画布窗口
#[tauri::command]
pub async fn close_all_canvas_windows(app: AppHandle) -> Result<u32, String> {
    let labels: Vec<String> = {
        let windows = CANVAS_WINDOWS.lock().unwrap();
        windows.keys().cloned().collect()
    };

    let count = labels.len() as u32;
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    // 清空注册表
    {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.clear();
    }

    log::info!("[CANVAS_WINDOW] 已关闭所有画布窗口 ({}个)", count);
    Ok(count)
}

/// 获取所有打开的画布窗口
#[tauri::command]
pub async fn get_canvas_windows(_app: AppHandle) -> Result<Vec<CanvasWindowInfo>, String> {
    let windows = CANVAS_WINDOWS.lock().unwrap();
    Ok(windows.values().cloned().collect())
}

/// 画布窗口关闭时的清理逻辑（由 lib.rs on_window_event 调用）
pub fn handle_canvas_window_close(app: &AppHandle, label: &str) {
    let info = {
        let mut windows = CANVAS_WINDOWS.lock().unwrap();
        windows.remove(label)
    };

    if let Some(info) = info {
        let _ = app.emit("canvas-window-closed", &info);
        log::info!("[CANVAS_WINDOW] 画布窗口已关闭: label={}, canvasId={}", label, info.canvas_id);
    }
}
```

#### 5.2.3 模块注册

**[`commands.rs`](../../../../src-tauri/src/commands.rs)** 新增：

```rust
pub mod canvas_window;
pub use canvas_window::*;
```

**[`lib.rs`](../../../../src-tauri/src/lib.rs)** 修改：

1. **命令注册** (invoke_handler 中新增)：

```rust
// 画布窗口命令
create_canvas_window,
close_canvas_window,
close_all_canvas_windows,
get_canvas_windows,
```

2. **窗口关闭事件分流** (on_window_event 中修改)：

```rust
// 原代码:
if window_label != "main" {
    // 所有非主窗口都走 close_detached_window
}

// 改为:
if window_label != "main" {
    if commands::canvas_window::is_canvas_window(&window_label) {
        // 画布窗口：走画布模块的清理路径
        commands::canvas_window::handle_canvas_window_close(
            window.app_handle(), &window_label
        );
    } else {
        // 分离窗口：走现有逻辑（不变）
        let app_handle = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = commands::close_detached_window(app_handle, window_label).await {
                log::error!("Error closing detached window: {}", e);
            }
        });
    }
}
```

### 5.3 前端：`useCanvasWindowManager.ts` 设计

```typescript
// src/tools/canvas/composables/useCanvasWindowManager.ts

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface CanvasWindowInfo {
  label: string;
  canvasId: string;
  title: string;
}

// 响应式状态
const openWindows = ref<Map<string, CanvasWindowInfo>>(new Map());

// 监听 Rust 端事件
listen<CanvasWindowInfo>("canvas-window-opened", (event) => {
  openWindows.value.set(event.payload.canvasId, event.payload);
});

listen<CanvasWindowInfo>("canvas-window-closed", (event) => {
  openWindows.value.delete(event.payload.canvasId);
});

export function useCanvasWindowManager() {
  async function openPreviewWindow(canvasId: string, title?: string): Promise<string> {
    return invoke<string>("create_canvas_window", {
      canvasId,
      title: title ?? `画布预览 - ${canvasId}`,
    });
  }

  async function closePreviewWindow(canvasId: string): Promise<void> {
    return invoke("close_canvas_window", { canvasId });
  }

  async function closeAllWindows(): Promise<number> {
    return invoke<number>("close_all_canvas_windows");
  }

  function isWindowOpen(canvasId: string): boolean {
    return openWindows.value.has(canvasId);
  }

  function getWindowLabel(canvasId: string): string | undefined {
    return openWindows.value.get(canvasId)?.label;
  }

  return {
    openWindows: readonly(openWindows),
    openPreviewWindow,
    closePreviewWindow,
    closeAllWindows,
    isWindowOpen,
    getWindowLabel,
  };
}
```

### 5.4 前端路由

**[`router/index.ts`](../../../../src/router/index.ts)** 新增专用路由：

```typescript
{
  path: "/canvas-window/:canvasId",
  name: "CanvasWindow",
  component: () => import("../tools/canvas/components/window/CanvasWindowContainer.vue"),
}
```

`CanvasWindowContainer.vue` 是一个轻量级的顶层容器（类似 `DetachedComponentContainer`），但专门为 Canvas 设计：

- 从路由参数中提取 `canvasId`
- 初始化 `useCanvasStateConsumer`
- 渲染 `CanvasWindow.vue`

### 5.5 完整修改清单

#### 5.5.1 Rust 端

| 文件                        | 操作          | 改动量  | 说明                                               |
| --------------------------- | ------------- | ------- | -------------------------------------------------- |
| `commands/canvas_window.rs` | ✅ **新建**   | ~150 行 | 画布专用窗口管理模块                               |
| `commands.rs`               | ✅ 修改       | +2 行   | `pub mod canvas_window; pub use canvas_window::*;` |
| `lib.rs` (invoke_handler)   | ✅ 修改       | +4 行   | 注册 4 个新命令                                    |
| `lib.rs` (on_window_event)  | ✅ 修改       | +5 行   | 窗口关闭事件分流                                   |
| `window_manager.rs`         | ❌ **不修改** | 0       | 分离窗口体系完全不动                               |
| `window_config.rs`          | ❌ **不修改** | 0       | 画布窗口自动复用位置/大小记忆                      |

#### 5.5.2 前端

| 文件                             | 操作          | 说明                                          |
| -------------------------------- | ------------- | --------------------------------------------- |
| `useCanvasWindowManager.ts`      | ✅ **新建**   | Canvas 专用窗口管理器 composable              |
| `CanvasWindowContainer.vue`      | ✅ **新建**   | 窗口顶层容器                                  |
| `router/index.ts`                | ✅ 修改       | 添加 `/canvas-window/:canvasId` 路由          |
| `canvas.registry.ts`             | ✅ 修改       | 移除 `detachableComponents` 注册              |
| `useCanvasSync.ts`               | ✅ 修改       | `"open-window"` 改用 `useCanvasWindowManager` |
| `useDetachable.ts`               | ❌ **不修改** | Canvas 不使用拖拽分离                         |
| `useDetachedManager.ts`          | ❌ **不修改** | Canvas 窗口不注册到通用管理器                 |
| `DetachedComponentContainer.vue` | ❌ **不修改** | Canvas 使用独立路由                           |
| `detachable-components.ts`       | ❌ **不修改** | Canvas 不通过静态注册表加载                   |

### 5.6 同步层适配

现有的 `useCanvasSync.ts` 中的 Layer 3 增量推送需要适配多窗口：

```typescript
// 当前: 广播到所有下游窗口
bus.syncState("canvas:file-delta", { canvasId, filePath, content }, 0, false);

// 改进: 定向推送到特定画布窗口
const targetLabel = windowManager.getWindowLabel(canvasId);
if (targetLabel) {
  bus.syncState("canvas:file-delta", { canvasId, filePath, content }, 0, false, targetLabel);
}
```

### 5.7 与现有系统的隔离保证

| 维度           | 分离窗口体系                          | 画布窗口体系                                    | 交集        |
| -------------- | ------------------------------------- | ----------------------------------------------- | ----------- |
| Rust 注册表    | `FINALIZED_DETACHED_WINDOWS`          | `CANVAS_WINDOWS`                                | 无          |
| 窗口标签前缀   | `detached-`                           | `canvas-win-`                                   | 无冲突      |
| 生命周期事件   | `window-detached` / `window-attached` | `canvas-window-opened` / `canvas-window-closed` | 无          |
| 前端管理器     | `useDetachedManager`                  | `useCanvasWindowManager`                        | 无          |
| 窗口关闭路径   | `close_detached_window()`             | `handle_canvas_window_close()`                  | 无          |
| 窗口配置持久化 | `window_config.rs` (按 label)         | `window_config.rs` (按 label)                   | **共用** ✅ |
| 窗口特效       | `window_effects.rs`                   | `window_effects.rs`                             | **共用** ✅ |

## 6. 实施计划修订建议

在 [`canvas-implementation-plan.md`](canvas-implementation-plan.md) 中需要修订以下章节：

1. **§3.1 窗口管理复用**: 标记为 ❌ 已废弃，替换为"Canvas 独立 Rust 窗口模块"章节
2. **§3 后端实现**: 不再是"全量复用、零 Rust 代码"，需新增 `canvas_window.rs` 模块（约 150 行）
3. **§4.4 跨窗口同步**: Layer 3 增量推送部分需要补充"定向推送"策略
4. **§4.5.1 目录结构**: 新增 `useCanvasWindowManager.ts` 和 `CanvasWindowContainer.vue`
5. **§6 实施状态**: 新增"P2.5: 窗口管理器重构"里程碑
6. **§8 技术债清单**: 新增窗口管理器相关条目

## 7. 风险评估

| 风险                                                                | 等级 | 缓解措施                                                                                                                   |
| ------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| `lib.rs` 窗口关闭分流逻辑引入 bug                                   | 低   | `is_canvas_window()` 只做前缀匹配，逻辑极简；且有 `log::info` 追踪                                                         |
| `window_config.rs` 中画布窗口配置与分离窗口配置混在同一个 JSON 文件 | 低   | 两者 label 前缀不同（`canvas-win-` vs `detached-`），不会冲突；且 `clear_all_window_configs` 是全局操作，语义一致          |
| 同步总线的 `windowType` 判断可能不认识新窗口                        | 高   | `useWindowSyncBus` 构造函数中需显式支持 `/canvas-window/` 路径识别为 `detached-component`，并适配 `canvas-win-` 前缀解析。 |
| 多个画布窗口同时打开时的内存压力                                    | 低   | 每个窗口只维护自己对应 canvasId 的影子文件副本，不是全量                                                                   |
| Rust 模块的 `CANVAS_WINDOWS` 在应用退出时未持久化                   | 低   | 画布窗口是临时性的预览窗口，不需要跨会话恢复；`window_config.rs` 已负责位置/大小记忆                                       |

## 8. 与方案 A 的对比总结

| 维度        | 方案 A (前端管理器 + 复用 Rust)                | 方案 B (独立 Rust 模块)                          |
| ----------- | ---------------------------------------------- | ------------------------------------------------ |
| Rust 改动量 | 0 行                                           | ~150 行新建 + ~12 行修改                         |
| 事件污染    | ⚠️ 画布窗口会触发 `window-detached/attached`   | ✅ 完全隔离                                      |
| 错误日志    | ⚠️ 关闭时 `close_detached_window` 报 not found | ✅ 干净                                          |
| 前端过滤    | ⚠️ 需要在 `useDetachedManager` 中过滤画布窗口  | ✅ 无需过滤                                      |
| 未来扩展    | ⚠️ 受限于 `create_tool_window` 的行为          | ✅ 可自由添加画布特有功能                        |
| 架构清晰度  | ⚠️ 两个体系共享底层，边界模糊                  | ✅ 完全独立，职责明确                            |
| 回归风险    | ✅ 零                                          | ✅ 零（`lib.rs` 修改是新增分支，不影响现有路径） |
