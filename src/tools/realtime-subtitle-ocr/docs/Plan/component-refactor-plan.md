# 实时字幕OCR 组件重构与双模式隔离计划书

> 状态：已实施（性能调度优化另开任务）
> 更新时间：2026-09-13
> 关联文档：[ARCHITECTURE.md](../../ARCHITECTURE.md)

## 1. 背景与问题

`RealtimeSubtitleOcr.vue` 目前同时承担两种职责：

1. **工具入口壳子**：模式切换（屏幕实时 OCR / 本地视频 OCR）、状态徽标、整体生命周期。
2. **屏幕模式工作台本身**：上下分栏布局、高度拖拽、`ResizeObserver` 自适应、`LivePreview` / `RegionFilterPreview` / `MonitorConfig` / `SubtitleTimeline`、监控框窗口控制、字幕动作处理。

第二种职责与 `VideoWorkbench.vue` 已有的「独立全幅工作台」定位不对称，导致：

- 入口组件臃肿（548 行），屏幕模式无法像视频模式一样被单独理解与维护。
- 监控框窗口控制（含定位、saved labels、分离窗口管理）与 UI 布局耦合。
- 字幕动作（复制全部 / 发送 Chat / 导出 SRT / 清空）在入口与 `VideoWorkbench` 中**重复实现两份**。
- 标题为 `resize-trigger-y` 的拖拽条样式与逻辑在两个组件各写一遍。
- `LivePreview.vue` 存在声明但未使用的 `monitorRect` prop。

### 1.1 双模式并行的架构阻塞（本次一并解决）

产品上希望切到视频模式时**不关闭、不中断**屏幕实时监控，允许两条 OCR 流水线同时并行。但当前两条流水线共用同一份模块级单例字幕状态：

- `useVideoSubtitleOcr` 通过 `useSubtitleTimeline()` 直接写入 `useScreenMonitor` 的 `subtitles`。
- 视频 `start()` 会调用 `clearSubtitles()`，并行时会**清空屏幕正在累积的字幕**。
- 两条线都只与「最后一条」做相似度合并，屏幕 / 视频字幕会互相误合并。

因此「切模式不停屏幕」必须先把字幕状态按来源隔离。经确认，采用**每模式独立字幕 store**（模型 C），并把性能调度优化另开任务、本次不做。

## 2. 目标

1. `RealtimeSubtitleOcr.vue` 瘦身为纯壳子，屏幕与视频两个工作台对等。
2. 抽出屏幕工作台 `ScreenWorkbench.vue` 与监控框控制、共享字幕动作 composable。
3. 字幕状态按模式隔离：屏幕与视频各持独立 store，互不清空、互不误合并。
4. 两个工作台首次进入后常驻（`KeepAlive`），切换模式不销毁、不中断对方任务。
5. 消除重复实现（字幕动作、拖拽条）与死代码（`monitorRect` prop）。
6. 同步更新 `ARCHITECTURE.md`，补充单测保护 store 抽出的回归点。

### 2.1 非目标（本次不做）

- OCR 调用串行化 / 并发上限、运行中降采样、配置按任务快照等**性能调度**优化。
- 引擎 / 滤镜 / 采样配置仍为全局共享，不拆分为按模式独立配置。
- 视觉样式与布局的重设计（保持现有观感）。

## 3. 目标结构

```text
RealtimeSubtitleOcr.vue                      壳子：模式切换 + 状态徽标 + KeepAlive
├── components/screen/ScreenWorkbench.vue    屏幕模式工作台（新）
│   ├── components/LivePreview.vue
│   ├── components/common/RegionFilterPreview.vue
│   ├── components/MonitorConfig.vue
│   ├── components/SubtitleTimeline.vue
│   └── components/common/ResizeHandle.vue   共用拖拽条（新）
├── components/video/VideoWorkbench.vue      视频模式工作台（已有）
└── components/MonitorBox.vue                分离窗口（不变）

composables/
├── useSubtitleTimelineStore.ts   字幕时间轴 store 工厂（新）
├── useMonitorBox.ts              监控框窗口控制（新）
├── useSubtitleActions.ts         复制/发送/导出/清空（新）
├── useScreenMonitor.ts           屏幕采样 + OCR 管线（复用独立 store）
└── useVideoSubtitleOcr.ts        视频抽帧 + OCR 管线（复用独立 store）
```

数据流：

```text
useSubtitleTimelineStore (工厂)
        ▲                         ▲
        │ create                  │ create
useScreenMonitor ─── screenStore  useVideoSubtitleOcr ─── videoStore
        ▲                                 ▲
   ScreenWorkbench                   VideoWorkbench
        └──── useSubtitleActions(screenStore) ───┘
              useSubtitleActions(videoStore)
```

## 4. 详细步骤

### 4.1 新增 `composables/useSubtitleTimelineStore.ts`

把 `useScreenMonitor.ts` 中模块级的 `subtitles` / `subtitleFrameUrls` 以及 `useSubtitleTimeline()` 的全部逻辑抽为工厂 `createSubtitleTimelineStore()`：

- 状态：`subtitles`、frameUrl 注册表（`registerFrameUrl` / `clearFrameUrl` / `revokeAllFrameUrls`）。
- 操作：`addSubtitle` / `replaceSubtitle` / `splitSubtitle` / `mergeSubtitles` / `removeSubtitle` / `clearSubtitles` / `updateSubtitleText`。
- 导出：`exportPlainText` / `exportTextWithTime` / `exportSrt` / `downloadSrt`（从 `useScreenMonitor.ts:682-715` 迁入）。
- 复用 `utils/subtitleOps` 与 `utils/algorithms`。
- 工厂无模块级单例，调用方各自 `create`。

### 4.2 新增 `composables/useMonitorBox.ts`

从 `RealtimeSubtitleOcr.vue:37-41,158-230` 抽出：

- 常量：`MONITOR_BOX_ID`、默认宽高。
- 计算：`isMonitorBoxDetached`。
- 方法：`openMonitorBox`、`closeMonitorBox`、`focusMonitorBox`、内部 `findMonitorBoxLabel`。
- 依赖 `useDetachable` / `useDetachedManager` / `invoke` / `getCurrentWindow`。

### 4.3 新增 `composables/useSubtitleActions.ts`

封装 `copyAll(withTime)`、`sendToChat(withTime)`、`exportSrt()`、`clearAll()`，接收 store 实例与 `useSendToChat`；确认框保持 `lockScroll: false`。

### 4.4 新增 `components/screen/ScreenWorkbench.vue`

承接 `RealtimeSubtitleOcr.vue` 中全部屏幕专属内容与逻辑：

- 顶部区布局、高度拖拽（`useResizable`）、双击复原、`ResizeObserver` 自适应布局。
- `LivePreview` / `RegionFilterPreview` / `MonitorConfig(orientation="vertical")` / `SubtitleTimeline`。
- `captureScreenSource`。
- 使用 `useScreenMonitor()` + `useMonitorBox()` + `useSubtitleActions(screenStore)`。

### 4.5 新增 `components/common/ResizeHandle.vue`

替换 `RealtimeSubtitleOcr.vue:402-411,566-600` 与 `VideoWorkbench.vue:241-248,964-986` 的两份 `resize-trigger-y`。

### 4.6 修改 `useScreenMonitor.ts`

- 模块级 `const timeline = createSubtitleTimelineStore()`。
- 所有 `subtitles` / `subtitleFrameUrls` 引用改为 `timeline.*`（`processOcrQueue`、`tick`、`start`、`stop`、`removeSubtitle`、`clearSubtitles`、`updateSubtitleText`、导出函数）。
- 返回值的 `subtitles` 改为 `timeline.subtitles`，导出方法委托 store。
- 删除导出 `useSubtitleTimeline`（消费方全部在本工具内）。
- `config` / `ensureOcrReady` / `isOcrPreparing` / `monitorRect` / 截图与 OCR 管线保持不变。

### 4.7 修改 `useVideoSubtitleOcr.ts`

- 模块级 `const timeline = createSubtitleTimelineStore()`（视频独立 store）。
- `useSubtitleTimeline()` 调用点全部改为 `timeline.*`；`start()` 的 `clearSubtitles()` 只清视频自己的。
- 返回值暴露 `timeline` / `subtitles` 与导出方法；`screen` 仅保留 `ensureOcrReady` / `config` 用途。

### 4.8 修改 `VideoWorkbench.vue`

- 字幕相关改用 `video.timeline`：`updateSubtitleText` / `removeSubtitle` / `clearSubtitles` / `exportPlainText` / `exportTextWithTime` / `downloadSrt` / `addSubtitle` / `replaceSubtitle` / `splitSubtitle` / `mergeSubtitles`。
- 移除 `useSubtitleTimeline` 导入；`screen` 仅保留 `isOcrPreparing`。
- 用 `useSubtitleActions(video.timeline)` 替换 `onExportSrt` / `onListCopy` / `onListSend` / `onListClear` 的重复实现。
- 用 `ResizeHandle` 替换内联拖拽条。

### 4.9 修改 `RealtimeSubtitleOcr.vue`（瘦身为壳）

- 仅保留：`ocrMode`、`switchMode`（**去掉 stop / cancel，允许并行**）、`statusText`、顶栏与状态徽标。
- `<KeepAlive>` 包裹 `<VideoWorkbench v-if="ocrMode === 'video'" />` / `<ScreenWorkbench v-else />`，两工作台首次进入后常驻。
- 移除全部屏幕专属模板 / 脚本 / 样式；生命周期交由两工作台 composable 与 `useMonitorBox` 处理。

### 4.10 修改 `LivePreview.vue`

删除未使用的 `monitorRect` prop。

## 5. 验证

- 新增单测 `composables/__tests__/subtitleTimelineStore.test.ts`：拆分 / 合并 / 来源隔离 / 导出。
- 现有 `SubtitleTimeline.test.ts` 不受影响；`RegionFilterPreview.test.ts` 对 `useScreenMonitor` 的 mock 仍返回 `config`，保持兼容。
- `bun run build:tsc`、`bun run build:vite`、`bun run test:run`（相关用例）。
- 真实 Tauri 环境走查：屏幕监控运行中切到视频并同时启动识别，确认两份时间轴互不干扰、互不清空。

## 6. 风险与兼容

| 风险 | 说明 | 缓解 |
|---|---|---|
| 字幕隔离后行为变化 | 屏幕字幕不再出现在视频工作台，反之亦然 | 符合模型 C 预期；文档同步说明 |
| `KeepAlive` 生命周期 | `onMounted` / `onBeforeUnmount` 不再随模式切换触发 | 依赖 `onActivated` / `onDeactivated` 仅处理激活态；几何监听随工具关闭注销 |
| 并行资源占用 | 两条管线同时运行 | 本次接受，性能调度另开任务 |
| store 抽取回归 | 拆分 / 合并 / frameUrl 释放逻辑迁移 | 新增单测覆盖 |

## 7. 实施顺序

1. `useSubtitleTimelineStore.ts`（含单测）→ 2. 改造 `useScreenMonitor.ts` / `useVideoSubtitleOcr.ts` 接入独立 store → 3. `useMonitorBox.ts` / `useSubtitleActions.ts` / `ResizeHandle.vue` → 4. `ScreenWorkbench.vue` → 5. 瘦身 `RealtimeSubtitleOcr.vue` 并接入 KeepAlive → 6. `VideoWorkbench.vue` 改造与去重 → 7. `LivePreview.vue` 清理 → 8. 更新 `ARCHITECTURE.md` → 9. 构建与测试验证。
