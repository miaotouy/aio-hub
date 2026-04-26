# 弹幕播放器 (Danmaku Player) 架构文档

## 1. 设计概述

弹幕播放器是一个非侵入式的增强工具，旨在为第三方本地播放器提供弹幕显示能力。其核心挑战在于：

1. **窗口同步**：弹幕层必须精准覆盖在播放器视频区域上方，并随播放器移动/缩放而同步。
2. **时间同步**：弹幕流动必须与播放器的播放进度保持毫秒级一致。
3. **性能表现**：在大规模弹幕（数千条）场景下保持平滑渲染，且不干扰播放器运行。

## 2. 核心架构模型

系统支持两种播放模式：**外部同步模式**（针对第三方播放器）和**内置播放模式**（针对本地视频文件）。

### 2.1 外部同步模式 (External Sync Mode)

采用 **“双窗口 + 跨进程同步”** 模型：

- **主窗口 (Main App)**：负责 UI 交互、弹幕文件加载、播放器连接控制及全局配置管理。
- **覆盖窗 (Overlay Window)**：一个完全透明、无边框、忽略鼠标点击的独立 Tauri 窗口，专门用于 Canvas 弹幕渲染。
- **Rust 后端 (Backend)**：通过 Win32 API 负责窗口句柄探测、位置追踪、Z-Order 管理以及跨进程状态通信。

### 2.2 内置播放模式 (Internal Player Mode)

采用 **“单窗口 + 组件化集成”** 模型：

- **DanmakuVideoPlayer**：包装了通用 `VideoPlayer` 组件，通过插槽注入弹幕层。
- **DanmakuCanvas**：作为视频播放器的 Overlay 层，直接在当前窗口渲染。
- **useDanmakuRenderer**：将渲染引擎与 HTML5 Video 的 `currentTime` 和播放状态绑定。

### 2.3 系统组件图

```mermaid
graph TD
    subgraph "Main Window (Tauri)"
        M_UI[UI Logic] --> M_EP[useExternalPlayer]
        M_EP --> M_OC[useDanmakuOverlay]
        M_EP --> M_MC[MpcBeClient (Preview)]
    end

    subgraph "Overlay Window (Tauri)"
        O_APP[DanmakuOverlayApp] --> O_ENG[DanmakuEngine]
        O_APP --> O_VC[useVirtualClock]
    end

    subgraph "Rust Backend"
        R_CMD[Commands] --> R_W32[Win32 API]
        R_CMD --> R_HTTP[HTTP Proxy]
    end

    subgraph "External Player (e.g. MPC-BE)"
        P_WIN[Player Window]
        P_WEB[Web Interface]
    end

    M_OC -- "Tauri Events" --> O_APP
    M_EP -- "Invoke" --> R_CMD
    R_W32 -- "Track Position" --> P_WIN
    R_HTTP -- "Poll Status" --> P_WEB
```

## 3. 关键技术实现

### 3.1 内置模式：GPU 加速与层级管理

在内置模式下，为了保证视频播放与弹幕渲染的流畅度：

- **GPU 合成层**：[`DanmakuCanvas.vue`](components/DanmakuCanvas.vue) 使用 `will-change: transform` 和 `translateZ(0)` 强制开启独立合成层，避免 Canvas 频繁重绘导致视频掉帧。
- **按需卸载**：通过 `v-if` 在无弹幕时彻底卸载 Canvas，减少不必要的 GPU 内存占用。
- **渲染限帧**：[`useDanmakuRenderer.ts`](composables/useDanmakuRenderer.ts) 将弹幕渲染限制在 ~30fps。对于弹幕而言，30fps 已足够丝滑，这能节省约 50% 的帧预算给视频解码。

### 3.2 外部模式：窗口吸附与 Z-Order 管理

覆盖层窗口的精准定位由 [`useDanmakuOverlay.ts`](composables/useDanmakuOverlay.ts) 与 Rust 后端配合完成：

1. **坐标转换**：Rust 端通过 `GetClientRect` 和 `ClientToScreen` 获取播放器**客户区**（视频画面区域）的物理像素矩形。
2. **DPI 适配**：Rust 计算显示器 `scale_factor`，前端将其转换为逻辑像素以适配 Tauri 窗口系统。
3. **层级控制 (Z-Order)**：
   - **窗口模式**：通过 `GetWindow(player, GW_HWNDPREV)` 获取播放器上方窗口句柄，再以此为 `hWndInsertAfter` 调用 `SetWindowPos` 将 Overlay 精确插入播放器正上方，确保它不会被其他不相关的置顶窗口遮挡，也不会遮挡播放器的菜单。
   - **全屏模式**：启用 `HWND_TOPMOST` 强制置顶，解决部分播放器全屏时抢占顶层的问题。

### 3.3 虚拟时钟与偏差校准

为了保证弹幕流动的平滑性，系统不直接使用轮询到的时间驱动渲染，而是采用 [`useVirtualClock.ts`](composables/useVirtualClock.ts)：

- **驱动源**：基于 `requestAnimationFrame` 的本地虚拟时钟，每帧按 `delta` 累加时间。
- **校准源**：每 200ms 通过 Rust 代理请求 MPC-BE 的 Web API 获取 `variables.html`。
- **对时逻辑**：仅当本地虚拟时间与播放器真实进度偏差超过 **500ms** 时，才进行强制校准（跳转对齐），避免因网络波动导致的弹幕跳帧。

### 3.4 高性能渲染引擎

[`DanmakuEngine.ts`](core/danmakuEngine.ts) 基于 Canvas 2D 进行了针对性优化：

- **二分查找**：弹幕按 `startTime` 排序，渲染时通过二分查找快速定位当前时间窗口内的可见弹幕，避免 $O(n)$ 全量遍历。
- **稳定哈希密度过滤**：为每条弹幕生成 ID 相关的稳定哈希值，在调整弹幕密度时，确保同一条弹幕的可见性状态在帧间保持稳定，防止闪烁。
- **状态批量设置**：减少 Canvas 上下文属性（如 `font`, `fillStyle`）的切换频率。

### 3.5 跨域与安全 (CSP)

由于第三方播放器的 Web 接口（如 `localhost:13579`）受 Tauri CSP 限制，前端无法直接 `fetch`。
系统通过 Rust 后端 [`external_player.rs`](../../../src-tauri/src/commands/external_player.rs) 建立 HTTP 代理，由后端发起请求并解析 HTML 字段，再将结构化数据返回前端。

## 4. 数据流向

1. **初始化**：主窗口加载 ASS 文件 -> [`assParser.ts`](core/assParser.ts) 解析为标准弹幕格式 -> 通过 `danmaku-overlay:init` 事件发送至 Overlay。
2. **同步循环**：
   - `Main` 轮询播放器位置 -> `Invoke` Rust -> `SetPosition/Size` Overlay。
   - `Main` 轮询播放器进度 -> `MpcBeClient` -> 更新 UI 状态预览。
   - `Overlay` 轮询播放器进度 -> `Invoke` Rust -> `MpcBeClient` -> 更新 `VirtualClock`。
3. **渲染循环**：`Overlay` 每帧调用 `DanmakuEngine.render(virtualTime)`。

## 5. 性能考量

- **位置同步频率**：默认 100ms。当检测到位置变动时，进入持续 1000ms 的活跃期，期间频率提升至 16ms 以保证丝滑跟随。
- **渲染限制**：Overlay 窗口仅在有弹幕且播放器运行时开启渲染循环，静止状态下 `cancelAnimationFrame` 以节省 CPU。
