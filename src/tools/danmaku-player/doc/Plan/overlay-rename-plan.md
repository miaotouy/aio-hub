# 重构计划：Overlay 命名诚实化

- **状态**: `Implementing`
- **日期**: 2026-04-26
- **背景**: 现有的"通用" Overlay 窗口基础设施（`overlay.html`、`src/overlay/`、Rust 命令 `create_overlay_window` 等）实际上完全硬编码了弹幕播放器的业务逻辑，却用了听起来很通用的命名，造成了虚假的"基础设施"印象。本次重构目标是让代码命名如实反映用途，并将弹幕专属代码物理归属到弹幕工具目录下。

---

## 一、改动全景图

```
改动类型：纯重命名 + 物理迁移，不新增/删除任何功能逻辑
```

### 文件系统变更

| 操作 | 源 | 目标 |
|---|---|---|
| 重命名 | `overlay.html` | `danmaku-overlay.html` |
| 迁移+改名 | `src/overlay/main.ts` | `src/tools/danmaku-player/overlay/main.ts` |
| 迁移+改名 | `src/overlay/OverlayApp.vue` | `src/tools/danmaku-player/overlay/DanmakuOverlayApp.vue` |
| 重命名 | `src/tools/danmaku-player/composables/useOverlayWindow.ts` | `src/tools/danmaku-player/composables/useDanmakuOverlay.ts` |
| 删除空目录 | `src/overlay/` | —— |

---

## 二、逐文件改动明细

### Step 1：Vite 构建入口

**文件**: [`vite.config.ts`](../../../../../../vite.config.ts)

```diff
- overlay: 'overlay.html',
+ danmakuOverlay: 'danmaku-overlay.html',
```

---

### Step 2：HTML 入口文件

**操作**: 将 `overlay.html` 重命名为 `danmaku-overlay.html`，并修改内容。

```diff
- <title>Danmaku Overlay</title>
+ <title>弹幕覆盖层</title>
  ...
- <script type="module" src="/src/overlay/main.ts"></script>
+ <script type="module" src="/src/tools/danmaku-player/overlay/main.ts"></script>
```

---

### Step 3：前端入口 `main.ts`

**操作**: 物理迁移到 `src/tools/danmaku-player/overlay/main.ts`，修改 import 路径。

```diff
- import OverlayApp from "./OverlayApp.vue";
+ import DanmakuOverlayApp from "./DanmakuOverlayApp.vue";

- const app = createApp(OverlayApp);
+ const app = createApp(DanmakuOverlayApp);
```

---

### Step 4：Overlay Vue 组件

**操作**: 物理迁移到 `src/tools/danmaku-player/overlay/DanmakuOverlayApp.vue`。

修改 Tauri 事件监听的事件名（4 处）：

```diff
- await listen<OverlayInitPayload>("overlay:init", ...)
+ await listen<OverlayInitPayload>("danmaku-overlay:init", ...)

- await listen<DanmakuConfig>("overlay:config-update", ...)
+ await listen<DanmakuConfig>("danmaku-overlay:config-update", ...)

- await listen<OverlayDanmakuUpdatePayload>("overlay:danmaku-update", ...)
+ await listen<OverlayDanmakuUpdatePayload>("danmaku-overlay:danmaku-update", ...)

- await listen("overlay:stop", ...)
+ await listen("danmaku-overlay:stop", ...)
```

---

### Step 5：Composable 重命名

**操作**: 重命名为 `useDanmakuOverlay.ts`，修改导出函数名和内部标识符。

```diff
- const logger = createModuleLogger("danmaku-player/overlayWindow");
- const errorHandler = createModuleErrorHandler("danmaku-player/overlayWindow");
+ const logger = createModuleLogger("danmaku-player/danmakuOverlay");
+ const errorHandler = createModuleErrorHandler("danmaku-player/danmakuOverlay");
```

修改 `invoke` 命令名（2 处）：

```diff
- const label = await invoke<string>("create_overlay_window", { targetHwnd });
+ const label = await invoke<string>("create_danmaku_overlay_window", { targetHwnd });

- await invoke("close_overlay_window");
+ await invoke("close_danmaku_overlay_window");
```

修改 Tauri 事件 emit 名（4 处）：

```diff
- await tauriEmit("overlay:stop");
+ await tauriEmit("danmaku-overlay:stop");

- await tauriEmit("overlay:init", { danmakus, scriptInfo, config, port });
+ await tauriEmit("danmaku-overlay:init", { danmakus, scriptInfo, config, port });

- await tauriEmit("overlay:config-update", config);
+ await tauriEmit("danmaku-overlay:config-update", config);

- await tauriEmit("overlay:danmaku-update", { danmakus, scriptInfo });
+ await tauriEmit("danmaku-overlay:danmaku-update", { danmakus, scriptInfo });
```

修改导出函数名：

```diff
- export function useOverlayWindow() {
+ export function useDanmakuOverlay() {
```

---

### Step 6：ExternalPlayerPanel.vue（调用方）

**文件**: `src/tools/danmaku-player/components/ExternalPlayerPanel.vue`

```diff
- import { useOverlayWindow } from "../composables/useOverlayWindow";
+ import { useDanmakuOverlay } from "../composables/useDanmakuOverlay";

- const { ... } = useOverlayWindow();
+ const { ... } = useDanmakuOverlay();
```

如果文件内还有 `invoke("set_overlay_ignore_cursor", ...)` 的调用，同步改为 `set_danmaku_overlay_ignore_cursor`。

---

### Step 7：Rust 命令层

**文件**: `src-tauri/src/commands/external_player.rs`

修改 debug URL（1 处）：

```diff
- "http://localhost:1420/overlay.html"
+ "http://localhost:1420/danmaku-overlay.html"
```

修改三个命令函数名：

```diff
- pub async fn create_overlay_window(...)
+ pub async fn create_danmaku_overlay_window(...)

- pub fn close_overlay_window(...)
+ pub fn close_danmaku_overlay_window(...)

- pub fn set_overlay_ignore_cursor(...)
+ pub fn set_danmaku_overlay_ignore_cursor(...)
```

> `OVERLAY_WINDOW_LABEL = "danmaku-overlay"` 已经是正确的，不需要修改。

---

### Step 8：Rust lib.rs

**文件**: `src-tauri/src/lib.rs`

`use` 声明（第 162 行附近）：

```diff
- use commands::{
-     close_overlay_window, create_overlay_window, find_player_windows, get_player_window_rect,
-     is_window_valid, set_overlay_ignore_cursor,
- };
+ use commands::{
+     close_danmaku_overlay_window, create_danmaku_overlay_window, find_player_windows,
+     get_player_window_rect, is_window_valid, set_danmaku_overlay_ignore_cursor,
+ };
```

`invoke_handler!` 宏（第 519-529 行附近）：

```diff
- #[cfg(windows)]
- create_overlay_window,
- #[cfg(windows)]
- close_overlay_window,
- #[cfg(windows)]
- set_overlay_ignore_cursor,
+ #[cfg(windows)]
+ create_danmaku_overlay_window,
+ #[cfg(windows)]
+ close_danmaku_overlay_window,
+ #[cfg(windows)]
+ set_danmaku_overlay_ignore_cursor,
```

---

## 三、执行顺序

```
Step 1: vite.config.ts 更新构建入口键名
Step 2: overlay.html → danmaku-overlay.html（重命名 + 内容更新）
Step 3: 新建 src/tools/danmaku-player/overlay/main.ts（内容来自原 src/overlay/main.ts）
Step 4: 新建 src/tools/danmaku-player/overlay/DanmakuOverlayApp.vue（内容来自原 OverlayApp.vue，事件名更新）
Step 5: 删除 src/overlay/ 目录（两个旧文件）
Step 6: 重命名 useOverlayWindow.ts → useDanmakuOverlay.ts，函数名+命令名+事件名全部更新
Step 7: ExternalPlayerPanel.vue 更新 import 路径和函数名
Step 8: external_player.rs 三个命令函数改名 + debug URL 更新
Step 9: lib.rs use 声明和 invoke_handler 同步更新
```

---

## 四、不在本次范围内

- `OVERLAY_WINDOW_LABEL`（Rust 常量）已经是 `"danmaku-overlay"`，无需改动
- `find_player_windows`、`get_player_window_rect`、`is_window_valid` 这三个是真正通用的窗口工具命令，命名已经准确，不动
- `external_player.rs` 的模块名保持不变（它服务于"外部播放器"这个功能域，名字是合理的）