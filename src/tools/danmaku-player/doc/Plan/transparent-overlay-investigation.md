# 透明弹幕覆盖层 — 技术调查报告

**状态**: `Implementing` (Phase 1 MVP 已实施)
**日期**: 2025-04-26
**作者**: 咕咕 (Architect Mode)
**实施日期**: 2025-04-26

---

## 1. 背景与动机

当前弹幕播放器 (`danmaku-player`) 使用 Tauri 内置的 `<video>` 标签播放视频。但对于以下类型的视频文件，浏览器内核（Chromium）无法良好支持：

| 特性                        | 示例文件          | 问题                       |
| --------------------------- | ----------------- | -------------------------- |
| HEVC Main 10 + Dolby Vision | 深海 (dvhe codec) | Chromium 不支持 DV profile |
| HEVC 4K + E-AC-3 5.1        | 罗小黑战记2 (MKV) | MKV 容器 + EAC3 兼容性差   |
| 10bit 色深                  | 各种 HDR 源       | WebView 解码能力有限       |
| 高码率 (>20Mbps)            | 深海 (21.2 Mbps)  | 内存/性能压力              |

**核心思路**：不只在浏览器内播放视频，而是让专业的本地播放器（如 MPC-BE）负责解码渲染。我们只需要创建一个**透明的弹幕画布窗口**，精准覆盖在播放器视频区域之上，通过同步播放进度来驱动弹幕渲染。

---

## 2. 现有资产盘点

### 2.1. 可完整复用的模块

| 模块                                                                                    | 路径                                  | 说明                                        |
| --------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| [`DanmakuEngine`](src/tools/danmaku-player/core/danmakuEngine.ts:12)                    | `core/danmakuEngine.ts`               | 弹幕渲染引擎，二分查找 + 批量渲染，性能优异 |
| [`parseAss()`](src/tools/danmaku-player/core/assParser.ts)                              | `core/assParser.ts`                   | ASS 弹幕解析器                              |
| [`useDanmakuRenderer()`](src/tools/danmaku-player/composables/useDanmakuRenderer.ts:13) | `composables/useDanmakuRenderer.ts`   | 渲染循环管理 (30fps 节流)                   |
| [`useDanmakuConfig()`](src/tools/danmaku-player/composables/useDanmakuConfig.ts:27)     | `composables/useDanmakuConfig.ts`     | 配置持久化                                  |
| [`DanmakuCanvas`](src/tools/danmaku-player/components/DanmakuCanvas.vue:1)              | `components/DanmakuCanvas.vue`        | Canvas 组件 + ResizeObserver                |
| [`DanmakuSettingsPanel`](src/tools/danmaku-player/components/DanmakuSettingsPanel.vue)  | `components/DanmakuSettingsPanel.vue` | 设置面板                                    |

### 2.2. Tauri 侧已有能力

| 能力            | 位置                                                                    | 说明                             |
| --------------- | ----------------------------------------------------------------------- | -------------------------------- |
| 透明窗口        | [`window_manager.rs:441`](src-tauri/src/commands/window_manager.rs:441) | `builder.transparent(true)`      |
| 点击穿透        | [`window_manager.rs:447`](src-tauri/src/commands/window_manager.rs:447) | `set_ignore_cursor_events(true)` |
| 无边框          | [`window_manager.rs:429`](src-tauri/src/commands/window_manager.rs:429) | `decorations(false)`             |
| 置顶            | [`window_manager.rs:616`](src-tauri/src/commands/window_manager.rs:616) | `set_always_on_top(true)`        |
| 窗口位置控制    | [`window_manager.rs:801`](src-tauri/src/commands/window_manager.rs:801) | `set_window_position()`          |
| `windows` crate | [`Cargo.toml:100`](src-tauri/Cargo.toml:100)                            | 已引入，当前用于 OCR             |

---

## 3. 技术方案调查

### 3.1. MPC-BE 播放进度获取

MPC-BE (v1.8.9.0) 提供两种进程间通信方式：

#### 方案 A：Web Interface (HTTP API) ✅ 推荐

MPC-BE 内置 Web 接口，在「设置 → 播放器 → Web 接口」中启用后，可通过 HTTP 获取播放状态。

**端点**: `http://localhost:{port}/variables.html`

**返回信息格式 (按行分隔)**:
根据姐姐提供的实测数据，格式如下：

1. `filename` (文件名)
2. `filepath_encoded` (URL 编码的文件路径)
3. `filepath` (原始文件路径)
4. `dirpath_encoded`
5. `dirpath`
6. `state_code` (状态码)
7. `state_text` (如 "已暂停"、"正在播放")
8. `unknown_id`
9. `position_string` (HH:MM:SS)
10. `position_ms` (**核心同步数据**)
11. `duration_string` (HH:MM:SS)
12. `duration_ms` (总时长毫秒)
13. `volume`
14. ... (其他元数据，如大小、SDR/HDR、版本号)

**优点**:

- 实现简单，前端 `fetch()` 即可
- 跨版本兼容性好
- 不依赖 Win32 API

**缺点**:

- 需要用户手动开启 Web 接口
- HTTP 轮询有固有延迟 (~50-100ms)
- 需要占用一个本地端口

**轮询频率评估**: 弹幕渲染以 30fps 运行，但播放进度不需要这么高频。200ms 轮询 (5 次/秒) 即可满足弹幕同步需求，配合本地时间插值可达到平滑效果。

#### 方案 B：Win32 Window Messages (WM_COPYDATA)

MPC-BE 支持通过 Win32 消息进行 IPC，主要使用 `WM_COPYDATA`。

**核心消息**:

- `CMD_GETCURRENTPOSITION` (0xA0003004) — 获取当前播放位置
- `CMD_GETPLAYBACKSTATE` (0xA0003001) — 获取播放/暂停/停止状态
- `CMD_NOWPLAYING` (0xA0003002) — 获取当前播放文件信息
- `CMD_LISTSUBTITLETRACKS` (0xA0003006) — 字幕轨道列表

**流程**:

1. `FindWindowW("MediaPlayerClassicW", NULL)` 找到 MPC-BE 主窗口
2. 向其发送 `WM_COPYDATA` 消息请求数据
3. MPC-BE 通过 `WM_COPYDATA` 回复到我们注册的窗口

**优点**:

- 不需要用户额外配置
- 更低延迟（进程间消息）

**缺点**:

- 需要在 Rust 侧创建一个隐藏的消息窗口来接收回复
- 实现复杂度高
- MPC-BE 版本间的消息协议可能有差异
- 需要额外的 `windows` crate features

#### 方案 C：命令行 + Named Pipe

MPC-BE 支持 `/slave` 命令行参数指定一个 HWND，然后通过该窗口发送状态通知。

**评估**: 需要由我们启动 MPC-BE 进程，不适合"附加到已运行播放器"的场景。可作为未来"一键播放"功能的扩展。

#### **决策建议**: 优先实现方案 A (Web Interface)，原因：

1. 实现成本最低
2. MPC-BE 的 Web 接口功能成熟稳定
3. 前端可直接调用，不需要新增 Rust 命令
4. 未来可扩展支持 PotPlayer 等也有 Web 接口的播放器

### 3.2. MPC-BE 窗口位置跟踪

无论使用哪种进度获取方案，都需要实时获取 MPC-BE 窗口的位置和大小来同步弹幕覆盖窗口。

#### 需要的 Win32 API

```rust
// 需要添加到 windows crate features:
// "Win32_UI_WindowsAndMessaging" — FindWindowW, GetWindowRect, GetClientRect,
//                                   GetWindowLong, IsWindow, IsWindowVisible
// "Win32_Foundation" — HWND, RECT, BOOL (已有依赖可能间接包含)
// "Win32_Graphics_Gdi" — ClientToScreen (坐标转换)

use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetWindowRect, GetClientRect, IsWindow, IsWindowVisible,
    GetForegroundWindow, EnumWindows, GetWindowTextW, GetClassNameW,
};
use windows::Win32::Foundation::{HWND, RECT, POINT, BOOL, LPARAM};
use windows::Win32::Graphics::Gdi::ClientToScreen;
```

#### 窗口发现逻辑

```
1. FindWindowW(L"MediaPlayerClassicW", NULL) → 获取 MPC-BE 主窗口 HWND
2. 如果有多个实例，EnumWindows 遍历所有匹配窗口，让用户选择
3. GetClientRect(hwnd) → 获取视频渲染区域（不含标题栏/菜单栏）
4. ClientToScreen(hwnd, &point) → 将客户区坐标转为屏幕坐标
```

#### 视频区域精确定位

MPC-BE 的窗口结构：

```
┌─────────────────────────────┐ ← 主窗口 (MediaPlayerClassicW)
│  菜单栏                     │ ← 窗口化时固定占据上方空间
├─────────────────────────────┤
│                             │
│       视频渲染区域          │ ← 我们需要覆盖的区域
│                             │
├─────────────────────────────┤
│  播放控制栏 / 进度条        │ ← 窗口化时固定占据下方空间
└─────────────────────────────┘
```

**关键问题**：MPC-BE 的视频渲染区域并不等于整个客户区。窗口化时，菜单栏和控制栏占据**固定的上下边距**空间，覆盖层必须精确裁切到视频区域才能避免弹幕飘到 UI 元素上。

**覆盖区域适配方案**：提供三种适配策略，用户可组合使用。

##### 策略 A：播放器预设（内置）

内置常见播放器在窗口化模式下的默认边距预设，选择播放器类型后自动应用：

| 播放器    | 上边距 (菜单栏) | 下边距 (控制栏) | 备注              |
| --------- | --------------- | --------------- | ----------------- |
| MPC-BE    | ~24px           | ~76px           | 取决于 DPI 和皮肤 |
| PotPlayer | ~0px            | ~60px           | 预留，待实测      |

> 预设值仅为参考初始值，用户可在此基础上微调。需要实际测量后校准。

##### 策略 B：数值配置裁切

在外部播放器连接面板中直接提供上/下边距的像素输入框：

- 支持实时预览（覆盖窗口立即响应偏移变化）
- 数值持久化保存到配置，下次启动自动恢复
- 这是最直接的方式，适合知道精确像素值或想快速微调的用户

##### 策略 C：手动调整模式（交互式）✅ 推荐

提供「进入调整模式」按钮，让用户通过可视化交互来精确划定覆盖区域：

1. **进入调整模式**：点击按钮后，覆盖窗口临时切换为：
   - 半透明有色背景（如 `rgba(0, 120, 255, 0.15)`），让用户看到当前覆盖范围
   - 关闭鼠标穿透 (`set_ignore_cursor_events(false)`)，允许用户与覆盖窗口交互
   - 四边显示可拖拽的裁切手柄

2. **交互式裁切**：用户拖拽上/下边的手柄来调整覆盖区域边界
   - 上边手柄：向下拖动以排除菜单栏
   - 下边手柄：向上拖动以排除控制栏
   - 实时显示当前偏移像素值

3. **确认并保存比例**：点击确认后：
   - 将偏移量**转换为相对比例**（如 `topRatio = offsetTop / clientHeight`），而非保存绝对像素值
   - 这样当播放器窗口大小改变时，裁切比例仍然适用
   - 恢复透明穿透模式，弹幕正常渲染

4. **退出调整模式**：恢复 `set_ignore_cursor_events(true)`，覆盖窗口回到纯透明状态

```
调整模式示意：

┌─────────────────────────────┐ ← 播放器窗口
│  菜单栏                      │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤ ← 上边裁切手柄 (可拖拽 ↕)
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░  半透明蓝色覆盖区域  ░░░ │ ← 实际弹幕渲染范围
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤ ← 下边裁切手柄 (可拖拽 ↕)
│  播放控制栏 / 进度条          │
└─────────────────────────────┘

        [确认] [重置] [取消]    ← 调整模式工具栏 (覆盖窗口内)
```

##### 三种策略的组合使用

推荐的用户流程是：先通过**策略 A** 的预设自动填充一个接近的初始值，再通过**策略 C** 的手动调整模式进行精确校准。**策略 B** 作为高级选项供精确控制。三者共享同一组边距/比例数据，互相覆盖生效。

##### 全屏模式适配

全屏模式与窗口化模式的覆盖区域策略有所不同：

- **底部工具栏**：多数播放器（包括 MPC-BE）在全屏时，鼠标移到底部才会浮现控制栏。弹幕覆盖层默认覆盖全屏即可——用户操作工具栏时注意力不在弹幕上，两者不会产生视觉冲突
- **顶部工具栏**：MPC-BE 全屏时上方无遮挡；但其他播放器（如 PotPlayer）可能在上方也有浮现式工具栏。此差异通过播放器预设来区分
- **检测全屏**：通过 `WindowRect.is_fullscreen` 字段判断，全屏时自动切换到全屏适配策略（使用独立的全屏边距配置，或默认上下均为 0）

| 模式   | 默认上边距  | 默认下边距  | 说明                                    |
| ------ | ----------- | ----------- | --------------------------------------- |
| 窗口化 | 按预设/手动 | 按预设/手动 | 必须配置，否则弹幕会覆盖到菜单栏/控制栏 |
| 全屏   | 0           | 0           | 默认全屏覆盖，工具栏为浮现式不影响      |

> 全屏模式下也支持手动调整模式，用于个别播放器有特殊布局的情况。具体各播放器全屏适配到时候实测后完善预设。

#### 位置同步频率

| 刷新率       | 延迟感         | CPU 开销 | 建议       |
| ------------ | -------------- | -------- | ---------- |
| 60Hz (16ms)  | 几乎无感       | 较低     | 窗口拖动时 |
| 10Hz (100ms) | 可感知但可接受 | 极低     | 静止时     |

**策略**：默认 10Hz 轮询窗口位置。当检测到位置变化时，临时提升到 60Hz 并持续 1 秒后回落。

#### DPI 缩放与多显示器坐标处理

> **开发者环境**：双 4K 显示器 (3840×2160)，Windows 缩放 150%。这意味着逻辑分辨率为 2560×1440/屏，但 Win32 API 在 DPI-aware 进程中返回物理像素坐标。

**核心矛盾**：Win32 的 `GetClientRect` / `ClientToScreen` 返回的是**物理像素**坐标，而 Tauri 的 `set_position()` / `set_size()` 默认接受**逻辑像素**。如果直接把 Win32 坐标传给 Tauri，在 150% 缩放下覆盖窗口会变成目标窗口的 1.5 倍大小并产生偏移。

**处理方案**：

```
Win32 物理坐标                        Tauri 逻辑坐标
┌────────────────┐                   ┌────────────────┐
│ x=3840, y=0    │  ÷ scale_factor   │ x=2560, y=0    │
│ w=1920, h=1080 │ ──────────────→   │ w=1280, h=720  │
│ (物理像素)     │   (= 1.5)         │ (逻辑像素)     │
└────────────────┘                   └────────────────┘
```

**实现步骤**：

1. **获取目标窗口所在显示器**：根据播放器窗口中心点 (`x + w/2, y + h/2`) 匹配所在 monitor
2. **获取该 monitor 的 scale factor**：通过 `MonitorFromWindow` + `GetDpiForMonitor` 获取（或 Tauri 的 `available_monitors()` + `scale_factor()`）
3. **坐标转换**：将 Win32 物理坐标除以 scale factor 得到逻辑坐标
4. **传递给 Tauri**：使用转换后的逻辑坐标设置覆盖窗口位置和大小

**需要额外的 Win32 API**：

```rust
// 新增 features 需求
// "Win32_Graphics_Gdi" — MonitorFromWindow (已在上方列出)
// "Win32_UI_HiDpi" — GetDpiForMonitor

use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
use windows::Win32::Graphics::Gdi::MonitorFromWindow;
```

**多显示器场景**：

| 场景                  | 行为                                             |
| --------------------- | ------------------------------------------------ |
| 播放器在左屏 (主屏)   | 正常获取左屏 scale factor 并转换                 |
| 播放器在右屏 (副屏)   | 正常获取右屏 scale factor 并转换                 |
| 播放器跨屏拖动        | 实时重新匹配 monitor，更新 scale factor          |
| 双屏同缩放比例 (150%) | 坐标偏移连续，转换系数不变                       |
| 双屏不同缩放比例      | Phase 2 支持（需要处理跨屏时 scale factor 突变） |

> **Phase 1 范围**：仅支持双屏同缩放比例（姐姐的实际环境）。不同缩放比例混用的场景延后处理。

### 3.3. 透明覆盖窗口创建

基于项目已有的 [`window_manager.rs`](src-tauri/src/commands/window_manager.rs) 能力，创建覆盖窗口的关键配置：

```rust
WebviewWindowBuilder::new(&app, "danmaku-overlay", url)
    .title("Danmaku Overlay")
    .decorations(false)        // 无边框
    .transparent(true)         // 透明背景 (Windows)
    .shadow(false)             // 无阴影
    .skip_taskbar(true)        // 不显示在任务栏
    .always_on_top(true)       // 始终置顶
    .visible(false)            // 初始不可见
    // 不设置 resizable，让后端控制尺寸
```

创建后：

```rust
window.set_ignore_cursor_events(true)  // 鼠标穿透
```

**前端页面：独立 HTML 入口（非主应用路由）**

覆盖窗口**不走**主应用的 [`index.html`](index.html)，而是使用独立的 `overlay.html` 作为 Vite 入口点。

**原因**：

- 主应用 `index.html` 加载了完整的 Element Plus、全局 Store、主题系统等，这些都会给根节点或 `body` 设置背景色，干扰 WebView2 透明合成
- 独立 HTML 入口可以完全控制 CSS 环境，确保根节点、`body`、`#app` 全部为 `background: transparent`
- 无需加载任何 UI 框架，只引用 Canvas + `DanmakuEngine`，bundle 极小，启动快
- 可以设置独立的 CSP meta tag（或不设 CSP），避免主应用 CSP 阻断 `localhost` 轮询请求

```
Vite 多入口配置（vite.config.ts）：
  input: {
    main:    'index.html',         // 主应用（已有）
    overlay: 'overlay.html',       // 弹幕覆盖层（新增）
  }

overlay.html 极简结构：
  <!DOCTYPE html>
  <html style="background:transparent">
  <body style="margin:0;background:transparent;overflow:hidden">
    <div id="overlay-app"></div>
    <script type="module" src="/src/overlay/main.ts"></script>
  </body>
  </html>
```

Rust 侧传入 URL 时指向 `overlay.html` 而非主应用路由：

```rust
// 开发模式
let url = WebviewUrl::External("http://localhost:1420/overlay.html".parse()?);
// 生产模式
let url = WebviewUrl::App("overlay.html".into());
```

### 3.4. 鼠标穿透与控制面板的矛盾

覆盖窗口设置了 `ignore_cursor_events(true)` 后，用户无法点击弹幕设置面板。

**解决方案**：

1. **控制面板放在主窗口**：弹幕的设置、开关等 UI 放在 AIO Hub 主窗口的弹幕播放器页面中，通过 Tauri 事件系统同步配置到覆盖窗口。覆盖窗口本身完全穿透。
2. **快捷键控制**：注册全局快捷键切换弹幕显示/隐藏（如 `D` 键已实现）。
3. **系统托盘菜单**：可选，在托盘菜单中添加快捷控制项。

这与项目已有的"分离组件"架构一致，主窗口负责控制面板，覆盖窗口负责纯渲染。

---

## 4. 整体架构设计

```
┌──────────────────────────────────────────────────────┐
│                  AIO Hub 主窗口                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  弹幕播放器页面 (外部播放器模式)               │  │
│  │  ┌─────────────────┐ ┌──────────────────────┐  │  │
│  │  │ ASS 文件选择器  │ │ 播放器连接面板       │  │  │
│  │  │ (已有)          │ │ · 播放器类型 (MPC-BE)│  │  │
│  │  └─────────────────┘ │ · Web端口 (13579)    │  │  │
│  │  ┌─────────────────┐ │ · 连接状态           │  │  │
│  │  │ 弹幕设置面板    │ │ · 窗口跟踪状态       │  │  │
│  │  │ (已有)          │ │ · 覆盖区域调整       │  │  │
│  │  └─────────────────┘ │   [进入调整模式]     │  │  │
│  │                      └──────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────┐   │  │
│  │  │ 播放状态预览 (当前文件名、进度条、状态) │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────┘
                       │ Tauri Events (config-sync)
                       ▼
┌─────────────────────────────────────────────────────┐
│           透明弹幕覆盖窗口 (danmaku-overlay)        │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │          Canvas (全屏, 完全穿透)             │   │
│  │          DanmakuEngine.render(currentTime)   │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         ▲ 位置/大小同步            ▲ 播放进度
         │                          │
┌────────┴───────────┐    ┌─────────┴──────────┐
│  Win32 API (Rust)  │    │ MPC-BE Web API     │
│  · FindWindow      │    │ GET /variables.html│
│  · GetClientRect   │    │ → position (ms)    │
│  · ClientToScreen  │    │ → state            │
│  · IsWindow        │    │ → duration         │
└────────────────────┘    └────────────────────┘
         ▲                          ▲
         │                          │
┌────────┴──────────────────────────┴──────────┐
│              MPC-BE 播放器窗口               │
│         (外部进程，不受我们控制)             │
└──────────────────────────────────────────────┘
```

### 4.1. 数据流

```
时间轴 (每 200ms):
  MPC-BE Web API ──GET──→ {position: 35200, state: "Playing"}
       │
       ▼
  前端轮询器 (overlay 窗口内)
       │ 计算 currentTime = position / 1000
       │ 线性插值: currentTime += (Date.now() - lastPoll) / 1000
       ▼
  DanmakuEngine.render(currentTime) ──→ Canvas 绘制

时间轴 (每 100ms):
  Rust 命令: get_player_window_rect(hwnd)
       │
       ▼
  返回 {x, y, width, height, scale_factor} (物理像素 + 缩放系数)
       │
       ▼
  前端坐标转换:
       logical_x = x / scale_factor
       logical_y = y / scale_factor
       logical_w = width / scale_factor
       logical_h = height / scale_factor
       │
       ▼
  overlay 窗口: setPosition(logical_x, logical_y) + setSize(logical_w, logical_h)
```

### 4.2. 时间轴策略：虚拟时钟 + 偏差校准

#### 4.2.1. 核心思路

弹幕引擎自身的渲染循环（rAF，~30fps）本身就是一个连续的时间轴。不需要**每帧都**去问轮询结果。正确的做法是：

> **渲染器自建虚拟时钟，轮询只做偏差校准，不做时间驱动。**

原理如下：

| 角色         | 做什么                                       | 频率         |
| ------------ | -------------------------------------------- | ------------ |
| **虚拟时钟** | 渲染器内部维护 `virtualTime`，基于帧增量累加 | 每帧 (~33ms) |
| **轮询校准** | 从 MPC-BE 获取真实时间，与虚拟时钟对比       | 每 200ms     |
| **校准动作** | 仅当偏差超过阈值时，才修正虚拟时钟           | 按需触发     |

#### 4.2.2. 虚拟时钟实现

```typescript
// 渲染器内部状态
let virtualTime = 0; // 内部维护的当前播放时间（秒）
let isPlaying = false; // 播放/暂停状态
let playbackRate = 1.0; // 播放速率
let lastFrameTimestamp = 0; // 上一帧的 performance.now()

// 每帧调用（在 rAF 循环中）
function tick(frameTime: DOMHighResTimeStamp): number {
  if (lastFrameTimestamp === 0) {
    lastFrameTimestamp = frameTime;
    return virtualTime;
  }

  if (isPlaying) {
    const delta = ((frameTime - lastFrameTimestamp) / 1000) * playbackRate;
    virtualTime += delta;
  }

  lastFrameTimestamp = frameTime;
  return virtualTime;
}
```

**关键优势**：

- 弹幕的**移动完全由 rAF 帧时间驱动**，不受轮询间隔影响
- 暂停状态下虚拟时钟自动停止累加
- 性能开销极低（仅仅是两数相加）

#### 4.2.3. 偏差校准策略

收到轮询结果后，不直接覆盖虚拟时钟，而是做偏差检测：

```typescript
const CALIBRATION_THRESHOLD = 0.5; // 500ms 以内不校准

function onPollResult(serverPositionMs: number, state: string) {
  const serverTime = serverPositionMs / 1000;
  const playing = state === "Playing";

  // 状态从暂停 → 播放：强制校准（防止暂停期间用户手动拖动进度）
  if (!isPlaying && playing) {
    virtualTime = serverTime;
    isPlaying = true;
    return;
  }

  // 更新播放状态
  isPlaying = playing;

  // 偏差检测
  const deviation = serverTime - virtualTime;

  if (Math.abs(deviation) > CALIBRATION_THRESHOLD) {
    // 偏差超过阈值 → 校准（用户可能拖动进度条、卡顿恢复、倍速变化等）
    virtualTime = serverTime;
  }
  // 偏差在阈值内 → 不做任何事，虚拟时钟保持连续
}
```

#### 4.2.4. 为什么不做每轮询直接更新？

| 方案                       | 效果                             | 问题                           |
| -------------------------- | -------------------------------- | ------------------------------ |
| ❌ **每轮询直接覆盖**      | 每 200ms 重置一次时间            | 弹幕每 200ms 微跳一下，不舒服  |
| ❌ **插值（旧方案）**      | 线性外推，轮询到后重置基准       | 服务器时间抖动仍会引入微小跳跃 |
| ✅ **虚拟时钟 + 偏差校准** | 平滑连续，只在偏差 >500ms 时才跳 | 最流畅，且人力介入感最低       |

**简而言之**："弹幕自己跑自己的时间轴，轮询只是偶尔看一眼手表对时。如果对时发现差几毫秒，就当没看见；差半秒以上才调表。"

#### 4.2.5. 与渲染器的集成

在覆盖窗口的渲染组件中，将原来的 `getInterpolatedTime` 函数替换为虚拟时钟：

```typescript
// DanmakuOverlayPage.vue (示意)
const { virtualTime, tick, calibrate, setPlaying } = useVirtualClock();

// 启动 rAF 循环（复用 useDanmakuRenderer）
startRender(() => {
  // 每帧先 tick 虚拟时钟，再传给引擎
  return tick(performance.now());
});

// 轮询回调
function onPoll(status: MpcBeStatus) {
  const deviation = status.position / 1000 - virtualTime.value;
  if (Math.abs(deviation) > 0.5) {
    virtualTime.value = status.position / 1000;
  }
  setPlaying(status.state === "Playing");
}
```

这样实现的覆盖窗口弹幕滚动平滑自然，与内部播放器模式的体验基本一致。

---

## 5. 需要新增的 Rust 能力

### 5.1. `windows` crate 新增 features

```toml
# Cargo.toml 中 [target.'cfg(windows)'.dependencies] 下
windows = { version = "0.58", features = [
    # 已有
    "Graphics_Imaging",
    "Media_Ocr",
    "Storage_Streams",
    "Globalization",
    # 新增：窗口发现与跟踪
    "Win32_UI_WindowsAndMessaging",
    "Win32_Foundation",
    "Win32_Graphics_Gdi",
    # 新增：DPI 感知 (多显示器缩放)
    "Win32_UI_HiDpi",
] }
```

### 5.2. 新增 Tauri 命令

| 命令                      | 参数                     | 返回                    | 说明                       |
| ------------------------- | ------------------------ | ----------------------- | -------------------------- |
| `find_player_windows`     | `class_name: String`     | `Vec<PlayerWindowInfo>` | 查找所有匹配的播放器窗口   |
| `get_player_window_rect`  | `hwnd: i64`              | `WindowRect`            | 获取窗口客户区的屏幕坐标   |
| `is_window_valid`         | `hwnd: i64`              | `bool`                  | 检查窗口是否仍然存在       |
| `create_overlay_window`   | `OverlayConfig`          | `String (label)`        | 创建透明覆盖窗口           |
| `sync_overlay_to_target`  | `overlay_label, hwnd`    | `SyncResult`            | 一次性同步位置+大小        |
| `launch_player_with_file` | `player_path, file_path` | `i64 (pid)`             | 可选：启动播放器并打开文件 |

### 5.3. 数据结构

```rust
#[derive(Serialize)]
pub struct PlayerWindowInfo {
    pub hwnd: i64,
    pub title: String,
    pub class_name: String,
    pub is_visible: bool,
}

#[derive(Serialize)]
pub struct WindowRect {
    pub x: i32,              // 物理像素 X (屏幕坐标)
    pub y: i32,              // 物理像素 Y (屏幕坐标)
    pub width: u32,          // 物理像素宽度
    pub height: u32,         // 物理像素高度
    pub scale_factor: f64,   // 目标窗口所在显示器的缩放系数 (如 1.5 = 150%)
    pub is_fullscreen: bool, // 窗口是否占满整个显示器
}

/// 前端使用时需要将物理坐标转换为逻辑坐标：
/// logical_x = x as f64 / scale_factor
/// logical_y = y as f64 / scale_factor
/// logical_w = width as f64 / scale_factor
/// logical_h = height as f64 / scale_factor

#[derive(Deserialize)]
pub struct OverlayConfig {
    pub target_hwnd: i64,
    pub crop_mode: String,             // "preset" | "manual" | "interactive"
    pub offset_top: i32,               // 顶部偏移像素 (窗口化)
    pub offset_bottom: i32,            // 底部偏移像素 (窗口化)
    pub ratio_top: f64,                // 顶部裁切比例 (0.0~1.0, 手动调整模式保存)
    pub ratio_bottom: f64,             // 底部裁切比例 (0.0~1.0, 手动调整模式保存)
    pub fullscreen_offset_top: i32,    // 全屏模式顶部偏移 (默认 0)
    pub fullscreen_offset_bottom: i32, // 全屏模式底部偏移 (默认 0)
}

/// 覆盖区域应用时的实际计算逻辑：
/// - crop_mode == "interactive" 时：使用 ratio_top/ratio_bottom × 当前客户区高度
/// - crop_mode == "preset" | "manual" 时：使用 offset_top/offset_bottom 绝对像素
/// - is_fullscreen 时：切换到 fullscreen_offset_top/bottom，默认均为 0
```

---

## 6. 前端新增模块

### 6.1. 文件结构 (增量)

```
// 覆盖层独立入口（Vite 多入口，不走主应用）
overlay.html                                # [新增] 覆盖层 HTML 入口（极简，无 Element Plus）
src/overlay/
├── main.ts                                 # [新增] 覆盖层 Vue 应用挂载点
└── OverlayApp.vue                          # [新增] 覆盖层根组件（纯 Canvas，无全局样式）

// 主应用侧（弹幕播放器工具目录内）
src/tools/danmaku-player/
├── composables/
│   ├── useExternalPlayer.ts                # [新增] 外部播放器连接管理
│   │   ├── 播放器发现 (findPlayerWindows)
│   │   ├── Web API 轮询 (position, state)
│   │   └── 虚拟时钟校准 (useVirtualClock)
│   ├── useOverlayWindow.ts                 # [新增] 覆盖窗口生命周期管理
│   │   ├── 创建/销毁覆盖窗口
│   │   ├── 窗口位置同步循环
│   │   └── 配置同步 (Tauri events → overlay)
│   ├── useVirtualClock.ts                  # [新增] 虚拟时钟 + 偏差校准 (overlay 侧使用)
│   ├── useDanmakuRenderer.ts               # [复用] 无需修改
│   └── useDanmakuConfig.ts                 # [复用] 无需修改
├── components/
│   ├── ExternalPlayerPanel.vue             # [新增] 外部播放器连接面板 (含覆盖区域配置)
│   ├── OverlayAdjustLayer.vue              # [新增] 覆盖区域手动调整模式 (裁切手柄 + 预览，Phase 2)
│   ├── DanmakuCanvas.vue                   # [复用]
│   └── DanmakuSettingsPanel.vue            # [复用]
├── core/
│   ├── danmakuEngine.ts                    # [复用]
│   ├── assParser.ts                        # [复用]
│   └── mpcBeApi.ts                         # [新增] MPC-BE Web API 客户端
├── types.ts                                # [扩展] 新增外部播放器相关类型
└── DanmakuPlayer.vue                       # [修改] 新增"外部播放器模式"选项卡
```

### 6.2. MPC-BE Web API 客户端

```typescript
// core/mpcBeApi.ts - 伪代码示意
export interface MpcBeStatus {
  file: string;
  state: "Playing" | "Paused" | "Stopped";
  position: number; // ms
  duration: number; // ms
  volumeLevel: number; // 0-100
}

export class MpcBeClient {
  private baseUrl: string;

  constructor(port: number = 13579) {
    this.baseUrl = `http://localhost:${port}`;
  }

  async getStatus(): Promise<MpcBeStatus> {
    // GET /variables.html 并解析返回的纯文本
    // 返回格式：按固定行序排列（见第 3.1 节），不是 key=value
    // 第 6 行 = state_code，第 10 行 = position_ms，第 12 行 = duration_ms
    // 解析时按行号取值，不依赖本地化的 state_text 文字
  }

  async sendCommand(command: string): Promise<void> {
    // POST /command.html 可选：发送播放控制命令
  }
}
```

---

## 7. 用户使用流程

```
1. 用户打开 AIO Hub → 弹幕播放器
2. 切换到「外部播放器」标签页
3. 选择 ASS 弹幕文件 (已有功能)
4. 配置播放器类型 (MPC-BE) 和 Web 端口 (默认 13579)
5. 点击「扫描播放器窗口」→ 列出所有 MPC-BE 窗口，选择目标
6. 点击「启动弹幕覆盖」
   → 创建透明覆盖窗口（自动应用播放器预设边距）
   → 开始窗口位置同步
   → 开始播放进度轮询
   → 弹幕开始渲染
7. (可选) 点击「进入调整模式」精确校准覆盖区域
   → 覆盖窗口变为半透明蓝色，显示裁切手柄
   → 拖拽上/下手柄裁切掉菜单栏和控制栏区域
   → 点击「确认」保存裁切比例，恢复透明穿透
8. 弹幕设置在主窗口中调整，实时同步到覆盖窗口
9. 按 D 键或在主窗口点击可切换弹幕显示/隐藏
10. 结束时点击「关闭覆盖」或关闭 MPC-BE (自动检测窗口消失)
```

> **首次使用 vs 后续使用**：步骤 7 的覆盖区域调整只需在首次使用时操作一次，裁切比例会持久化保存。后续启动会自动恢复上次的裁切配置。

---

## 8. 技术风险与应对

| 风险                          | 概率 | 影响                           | 应对                                                           |
| ----------------------------- | ---- | ------------------------------ | -------------------------------------------------------------- |
| MPC-BE Web 接口未启用         | 高   | 无法获取进度                   | 提供引导教程，附截图说明如何开启                               |
| 全屏模式下覆盖窗口被遮挡      | 中   | 弹幕消失                       | 使用 `WS_EX_TOPMOST` + 独占全屏检测                            |
| 窗口位置同步延迟              | 低   | 拖动时弹幕层跟随略慢           | 提升到 60Hz 同步 + 可接受的体验降级                            |
| DPI 缩放导致覆盖偏移/尺寸错误 | 高   | 覆盖层大小和位置与播放器不匹配 | Rust 侧获取 scale factor，前端做物理→逻辑坐标转换（见 3.2 节） |
| MPC-BE 退出后覆盖窗口残留     | 低   | 透明窗口卡住                   | `IsWindow()` 检测 + 自动清理                                   |
| CSP 阻止 localhost 请求       | 中   | 无法访问 Web API               | 检查 CSP 配置，必要时通过 Rust 代理                            |

### 8.1. CSP 问题详细分析

当前项目的 CSP 配置在 [`index.html`](index.html) 中。覆盖窗口需要向 `http://localhost:{port}` 发送请求。如果 CSP 的 `connect-src` 不允许，有两种绕过方式：

1. **推荐**：通过 Rust 后端代理请求（新增一个 Tauri 命令 `poll_mpc_status`），完全避开 CSP 限制
2. **备选**：在 CSP 中添加 `connect-src http://localhost:*`

---

## 9. 分阶段实施建议

### Phase 1：最小可用版本 (MVP)

> **当前目标**：在开发者实际设备（双 4K 150% 缩放）上跑通完整链路，验证技术可行性。

- 新增 Vite 多入口：`overlay.html` + `src/overlay/main.ts`（独立入口，不走主应用）
- 新增 Rust 命令：`find_player_windows` + `get_player_window_rect`（含 scale_factor）+ `create_overlay_window`
- 新增前端（主应用侧）：`ExternalPlayerPanel.vue` + `useExternalPlayer.ts` + `useOverlayWindow.ts`
- 新增前端（覆盖层侧）：`OverlayApp.vue` + `useVirtualClock.ts` + `mpcBeApi.ts`
- 复用已有弹幕引擎和配置系统
- 覆盖区域适配：**策略 B（数值配置裁切）** 作为 MVP 最简实现（上/下边距手动填写）
- **DPI / 多显示器**：Phase 1 必须支持双 4K + 150% 缩放 + 双屏同缩放比例的场景（`get_player_window_rect` 返回 `scale_factor`，前端做物理→逻辑坐标转换）
- **不在 Phase 1 做**：不同缩放比例混用的多显示器、全屏适配、手动调整模式（策略 C）、自动匹配 ASS、播放器预设（策略 A）

#### Phase 1 验收标准

在开发者设备（双 4K 3840×2160, 150% 缩放）上，以下场景必须通过：

| #   | 场景                            | 预期结果                                 |
| --- | ------------------------------- | ---------------------------------------- |
| 1   | MPC-BE 在左屏 (主屏) 窗口化播放 | 覆盖层精准对齐播放器客户区，弹幕正常渲染 |
| 2   | MPC-BE 在右屏 (副屏) 窗口化播放 | 覆盖层精准对齐，无偏移、无尺寸异常       |
| 3   | MPC-BE 从左屏拖动到右屏         | 覆盖层实时跟随，过程中不闪烁、不跳屏     |
| 4   | MPC-BE 窗口调整大小             | 覆盖层实时跟随缩放                       |
| 5   | MPC-BE 播放/暂停/拖动进度       | 弹幕同步播放/暂停/跳转，无明显延迟       |
| 6   | 关闭 MPC-BE 窗口                | 覆盖层自动检测并清理                     |
| 7   | 手动填写上/下边距 (策略 B)      | 覆盖区域按输入值裁切，实时生效           |

#### Phase 1 实施记录 (2025-04-26)

**已完成的文件变更**：

| 层级 | 文件 | 状态 |
|------|------|------|
| Rust 后端 | `src-tauri/Cargo.toml` (windows crate features) | 修改 |
| Rust 后端 | `src-tauri/src/commands/external_player.rs` | 新增 |
| Rust 后端 | `src-tauri/src/commands.rs` (模块声明) | 修改 |
| Rust 后端 | `src-tauri/src/lib.rs` (命令注册) | 修改 |
| 构建配置 | `vite.config.ts` (多入口 input) | 修改 |
| 构建配置 | `overlay.html` (覆盖层独立 HTML 入口) | 新增 |
| 覆盖层应用 | `src/overlay/main.ts` | 新增 |
| 覆盖层应用 | `src/overlay/OverlayApp.vue` | 新增 |
| 前端核心 | `src/tools/danmaku-player/types.ts` (外部播放器类型) | 修改 |
| 前端核心 | `src/tools/danmaku-player/core/mpcBeApi.ts` | 新增 |
| 前端核心 | `src/tools/danmaku-player/composables/useVirtualClock.ts` | 新增 |
| 主应用 | `src/tools/danmaku-player/composables/useExternalPlayer.ts` | 新增 |
| 主应用 | `src/tools/danmaku-player/composables/useOverlayWindow.ts` | 新增 |
| UI 集成 | `src/tools/danmaku-player/components/ExternalPlayerPanel.vue` | 新增 |
| UI 集成 | `src/tools/danmaku-player/DanmakuPlayer.vue` (模式切换) | 修改 |

**验证状态**：
- ✅ 前端类型检查通过 (`check:frontend`)
- ✅ 后端编译检查通过 (`check:backend`)
- ✅ 代码 Lint 通过
- ⏳ 待实机验收测试

### Phase 2：体验优化

- **覆盖区域精确适配**：
  - 策略 A：播放器预设（内置 MPC-BE 默认边距）
  - 策略 C：手动调整模式（`OverlayAdjustLayer` 组件，交互式裁切手柄）
  - 裁切比例持久化（按比例保存，窗口缩放后仍适用）
- **全屏模式适配**：
  - 全屏检测 + 自动切换到全屏边距配置
  - 各播放器全屏适配预设（实测后填充）
- 虚拟时钟 + 偏差校准（进度同步平滑化）
- 窗口位置自适应同步频率
- 自动匹配弹幕文件（根据视频文件名查找同目录 ASS）

### Phase 3：功能扩展

- 支持 `/slave` 模式由 AIO Hub 启动 MPC-BE
- 支持 PotPlayer 等其他播放器
- 弹幕源扩展（在线获取 B 站弹幕）
- 支持 XML 格式弹幕（B 站原始格式）

---

## 10. 与姐姐确认的问题

1. **MPC-BE Web 接口端口**：姐姐的 MPC-BE 是否已开启 Web 接口？默认端口是 13579，是否沿用？
2. **UI 布局**：外部播放器功能是作为弹幕播放器页面的一个子标签，还是独立的入口？
3. **优先级**：先做 Phase 1 即可，还是需要一步到位包含 Phase 2 的体验优化？
4. **启动方式**：是否需要从 AIO Hub 直接启动 MPC-BE 并打开视频文件的功能，还是只要"附加到已运行的播放器"？
