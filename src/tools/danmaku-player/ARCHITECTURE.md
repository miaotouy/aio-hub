# 弹幕播放器架构文档

> 最后更新：2026-6-15

## 1. 工具定位

弹幕播放器提供两条使用路径：

- **内置播放器**：加载本地视频、弹幕文件和可选外挂字幕，在同一窗口内完成播放与叠加渲染。
- **外部播放器覆盖**：连接外部播放器状态接口，同步透明覆盖窗口到播放器客户区，在第三方播放器上显示弹幕。

当前弹幕输入支持 ASS、B 站 JSON `DanmakuElem[]` 和 B 站经典 XML `<d p="...">`。内置播放器字幕输入支持 SRT、VTT、ASS/SSA、LRC、SBV、SubViewer、MicroDVD、SAMI、TTML/DFXP 等文本字幕；IDX/SUP 等图形字幕会被拒绝。

## 2. 入口与组件

### 2.1 主入口

[`DanmakuPlayer.vue`](DanmakuPlayer.vue) 负责模式切换、文件拖放和解析：

- 视频文件通过 `convertFileSrc()` 转为 Tauri 可访问 URL，仅用于内置播放器。
- 弹幕文件通过 `readFile()` 读取二进制，再用 `smartDecode()` 解码后交给 [`parseDanmaku`](core/danmakuParser.ts)。
- 字幕文件同样走 `smartDecode()`，图形字幕先在入口拦截，文本字幕交给 [`parseSubtitle`](core/subtitleParser.ts)。
- 弹幕显示配置由 [`useDanmakuConfig`](composables/useDanmakuConfig.ts) 统一管理，并在内置模式和外部覆盖模式复用。

### 2.2 内置播放器

内置路径由 [`DanmakuVideoPlayer.vue`](components/DanmakuVideoPlayer.vue) 包装通用 `VideoPlayer`：

- [`DanmakuCanvas.vue`](components/DanmakuCanvas.vue) 作为弹幕 Canvas 层，只有存在弹幕数据时才挂载。
- [`useDanmakuRenderer.ts`](composables/useDanmakuRenderer.ts) 将 `DanmakuEngine` 绑定到 HTML5 video 的 `currentTime`，播放时启动、暂停时停止，seek 后清空画布避免残影。
- [`SubtitleOverlay.vue`](components/SubtitleOverlay.vue) 渲染普通文本字幕，根据当前时间筛选 active cues。
- [`JassubRenderer.vue`](components/JassubRenderer.vue) 专门处理 ASS/SSA 字幕的高保真渲染；初始化失败时回退到 `SubtitleOverlay`。
- 控制栏通过 `controls-extra` 插槽增加弹幕开关、字幕开关和弹幕设置面板；`d` 快捷键切换弹幕开关。

### 2.3 外部播放器

外部路径由 [`ExternalPlayerPanel.vue`](components/ExternalPlayerPanel.vue) 组织连接、扫描、状态预览和覆盖窗口生命周期：

- [`useExternalPlayer.ts`](composables/useExternalPlayer.ts) 保存外部播放器配置，扫描窗口，测试状态接口，并每 1s 拉取一次播放状态用于面板预览。
- [`useDanmakuOverlay.ts`](composables/useDanmakuOverlay.ts) 创建透明覆盖窗口，同步弹幕数据和配置，并持续跟随目标窗口位置。
- [`overlay/DanmakuOverlayApp.vue`](overlay/DanmakuOverlayApp.vue) 是覆盖窗口内的最小渲染应用，只包含一个透明 Canvas、`DanmakuEngine`、外部播放器状态 provider 和虚拟时钟。

当前 UI 暴露 MPC-BE、MPC-HC、PotPlayer、mpv 和 VLC。状态读取通过 [`core/externalPlayerApi.ts`](core/externalPlayerApi.ts) 统一到 `get_external_player_status`，覆盖层和主面板共用同一套 provider。

## 3. 数据模型

核心类型集中在 [`types.ts`](types.ts)：

- `ParsedDanmaku`：统一后的弹幕行，时间单位为秒，坐标基于 ASS `PlayResX/PlayResY`。滚动弹幕使用 `x1/y1 -> x2/y2` 和可选 `t1/t2` 表达移动。
- `AssScriptInfo`：弹幕脚本坐标系，默认值为 `1836 x 1032`。
- `SubtitleTrack`：外挂字幕轨道，包含已解析 `cues`、启用状态和可选 `rawContent`。ASS/SSA 会保留原文，供 JASSUB 使用。
- `DanmakuConfig`：弹幕显示配置，包括类型过滤、彩色过滤、显示区域、透明度、字号、速度、密度、字体、描边和屏蔽词。
- `ExternalPlayerConfig` / `OverlayState`：外部播放器类型、端口或 IPC 配置、覆盖裁切、全屏增强、目标窗口和播放状态。

字幕和弹幕刻意分离：字幕不会进入 `ParsedDanmaku[]`，因此不受弹幕密度、滚动速度、屏蔽词等弹幕专属逻辑影响。

## 4. 关键流程

### 4.1 内置模式流程

1. 用户选择视频文件后，主入口生成 Tauri asset URL。
2. 用户选择弹幕文件后，解析为 `ParsedDanmaku[]` 和 `AssScriptInfo`。
3. 用户选择字幕文件后，解析为 `SubtitleTrack`；ASS/SSA 额外保留 `rawContent`。
4. `DanmakuVideoPlayer` 初始化 `DanmakuEngine`，播放时以 video 当前时间渲染弹幕。
5. 文本字幕走 DOM overlay；ASS/SSA 优先走 JASSUB canvas 手动渲染，失败后降级为 DOM 字幕。

### 4.2 外部模式流程

1. `ExternalPlayerPanel` 挂载后按当前播放器类型自动扫描常见 Win32 类名。
2. 用户也可以切换为扫描所有可见顶层窗口，手动选择目标 HWND。
3. `TauriExternalPlayerStatusProvider` 通过 Rust command `get_external_player_status` 读取播放状态，测试连接并展示状态。
4. 启动覆盖时，Rust command `create_danmaku_overlay_window` 创建或复用 `danmaku-overlay` 透明窗口，并开启鼠标穿透。
5. 主窗口通过 Tauri 事件发送初始化数据：
   - `danmaku-overlay:init`
   - `danmaku-overlay:config-update`
   - `danmaku-overlay:danmaku-update`
   - `danmaku-overlay:stop`
6. 覆盖窗口每 200ms 轮询外部播放器状态，使用虚拟时钟平滑推进弹幕时间。
7. 主窗口独立同步覆盖窗口位置和 Z-Order，关闭面板或工具卸载时关闭覆盖窗口。

## 5. Rust / Win32 集成

外部播放器能力在 [`src-tauri/src/commands/external_player.rs`](../../../src-tauri/src/commands/external_player.rs) 中实现，并在 `tauri::generate_handler![]` 注册。

主要 command：

- `find_player_windows`：枚举可见顶层窗口，可按 Win32 class name 过滤。
- `is_window_valid`：检查目标 HWND 是否仍有效。
- `get_player_window_rect`：用 `GetClientRect` + `ClientToScreen` 取得播放器客户区物理像素矩形，并计算显示器 DPI 缩放和全屏状态。
- `create_danmaku_overlay_window`：创建透明、无边框、跳过任务栏、鼠标穿透的 Tauri overlay 窗口。
- `set_danmaku_overlay_zorder`：窗口模式下把 overlay 插到播放器正上方；全屏增强开启时使用 `HWND_TOPMOST`。
- `close_danmaku_overlay_window`：关闭 overlay。
- `get_external_player_status`：按播放器类型读取播放状态，并统一返回 file/state/position/duration/volumeLevel。
- `get_mpc_be_status`：兼容旧 MPC-BE 调用，内部复用 MPC Web Interface 解析。

Rust 返回给前端的结构体均使用 `#[serde(rename_all = "camelCase")]`，与前端类型字段保持一致。

外部状态来源：

- MPC-BE / MPC-HC：请求 `http://localhost:{port}/variables.html`，按 `<p id="...">` 提取 file/state/position/duration/volumelevel。
- PotPlayer（实验）：优先读取 Windows System Media Transport Controls session；无可用 session 时，对用户选中的窗口发送 PotPlayer `WM_USER` 消息读取当前进度和总时长。
- mpv：通过 JSON IPC named pipe 读取 `path`、`pause`、`time-pos`、`duration`，用户需以 `--input-ipc-server` 启动 mpv。
- VLC：请求 `http://localhost:{port}/requests/status.json`，使用 VLC Web Interface 密码做 Basic Auth。

## 6. 同步与渲染策略

### 6.1 时间同步

内置模式直接读取 HTML5 video 当前时间。

外部覆盖模式使用 [`useVirtualClock.ts`](composables/useVirtualClock.ts)：

- 覆盖窗口每 200ms 轮询外部播放器播放状态。
- 播放中时，虚拟时钟按 `requestAnimationFrame` 的 delta 推进。
- 当虚拟时间和播放器真实进度偏差超过 500ms 时才强制校准，减少频繁跳变。
- 暂停或停止时，虚拟时间固定在播放器上报位置。

### 6.2 位置同步

[`useDanmakuOverlay.ts`](composables/useDanmakuOverlay.ts) 以目标播放器客户区为基准同步 overlay：

- Rust 返回物理像素，前端按 `scaleFactor` 转为 Tauri 逻辑像素。
- 普通窗口和全屏窗口分别使用 `offsetTop/offsetBottom` 与 `fullscreenOffsetTop/fullscreenOffsetBottom` 做裁切。
- 默认每 100ms 同步一次；检测到位置、尺寸、DPI 或全屏状态变化后，进入 1s 活跃期，期间每 16ms 同步。
- 每轮都会刷新 Z-Order；窗口无效时自动关闭覆盖窗口。

### 6.3 弹幕渲染

[`DanmakuEngine.ts`](core/danmakuEngine.ts) 是内置模式和外部 overlay 共用的 Canvas 2D 引擎：

- `setDanmakus()` 会按 `startTime` 排序，并为每条弹幕预计算稳定哈希。
- 每帧通过二分查找定位当前时间附近的候选弹幕，再向前回溯最多 20s。
- 渲染阶段内联执行类型过滤、彩色过滤、密度过滤、屏蔽词过滤和显示区域限制。
- 密度过滤使用稳定哈希，调整密度时同一条弹幕不会在帧间随机闪烁。
- 内置模式和 overlay 都将渲染节流到约 30fps；没有弹幕或弹幕关闭时不维持无意义的 rAF 循环。

### 6.4 ASS/SSA 字幕

ASS/SSA 作为“字幕”加载时优先交给 JASSUB，而不是转成弹幕：

- `parseSubtitle()` 仍会解析出降级用的 `SubtitleCue[]`，同时保留原始文本到 `rawContent`。
- `JassubRenderer` 使用动态 `import("jassub")`，初始化失败后通知父组件降级。
- JASSUB canvas 按 `object-fit: contain` 计算实际视频渲染区域，避免字幕落到 letterbox 黑边之外。
- wrapper 覆盖整个 video 容器，并用极小 `backdrop-filter` 触发 Chromium/WebView2 正常合成路径，规避硬件 overlay 导致字幕层不可见的问题。

## 7. 约束与边界

- 外部模式当前依赖 Windows Win32 API；相关 Rust command 均带 `#[cfg(windows)]`。
- 外部播放状态支持 MPC-BE、MPC-HC、PotPlayer、mpv 和 VLC；PotPlayer 状态同步仍标记为实验支持。
- 外部模式只显示弹幕，不加载外挂字幕。
- 图形字幕 IDX/SUP 暂不支持。
- Tauri 前端不直接请求播放器本地接口，统一通过 Rust 代理规避 CSP / scope 限制。

