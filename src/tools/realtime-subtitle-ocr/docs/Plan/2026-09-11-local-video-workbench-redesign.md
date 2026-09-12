# 本地视频 OCR 模式重构计划：编辑器式工作台

> 日期：2026-09-11
> 状态：已完成（2026-09-12 回填）
> 范围：仅重构本地视频 OCR 模式；屏幕实时 OCR 模式保持现有布局（新增“截图 + 实时滤镜预览”共享能力）

---

## 1. 背景与问题

现有实现将“屏幕实时 OCR”和“本地视频 OCR”塞进同一套上下分栏外壳（`RealtimeSubtitleOcr.vue` 的 `rsocr-top-section`），导致本地视频模式出现一系列体验问题：

| 现状 | 问题 |
|------|------|
| 两种模式共用上下分栏外壳 | 视频面板被挤压，与字幕编辑区/列表互相争夺空间，布局错乱 |
| `VideoSubtitlePanel.vue` + `VideoRoiSelector.vue` 使用裸 `<video>` | 无播放控件、不能放大查看、不能拖拽平移、不能精确设置识别区域 |
| ROI 仅支持“移动 / 重新框选” | 无 8 向手柄、无数值输入、无预设，字幕区域难以精确对准 |
| 缺少“区域截图 → 滤镜实时预览” | 调滤镜只能盲调，无法即时看到裁剪后与滤镜后的效果 |
| 时间轴是表格式 `SubtitleTimeline.vue` | 没有横向可缩放轨道、没有播放头，不是剪辑软件式交互 |

用户期望：本地视频模式改为**独立的全幅工作台**，采用达芬奇 / Premiere 式的**大监视器 + 横向可缩放时间轴（字幕轨道）**交互；并且**截图区域实时滤镜预览能力同时适用于屏幕实时模式**。

---

## 2. 目标

1. **模式隔离**：仅本地视频模式使用全新布局；屏幕实时 OCR 模式保持现状。
2. **剪辑软件式大监视器**：
   - 播放 / 暂停 / 停止、逐帧、快退快进、倍速、音量、全屏；
   - **适配缩放（Fit）、缩放 ± 、缩放比例菜单、1:1**；
   - **滚轮缩放（以光标为中心）、拖拽平移、双击 Fit/100%**；
   - **ROI 叠加层**：8 向手柄、暗化遮罩、比例锁定、精确数值输入、预设。
3. **区域截图 + 实时滤镜预览（屏幕 / 视频两模式共用）**：
   - 在监视器中点击/截图当前区域的原始帧；
   - 原图 vs 处理图并排对照，滤镜参数变化实时刷新；
   - 支持“以此帧试识别”，用单帧直接验证 OCR 效果。
4. **Konva 横向可缩放时间轴**：时间标尺 + 字幕轨道块 + 识别区间 + 播放头；与视频播放双向同步。
5. **保留表格式字幕列表**为次级列表，与轨道双向联动。

---

## 3. 现状可复用资产（已核实）

| 资产 | 路径 | 说明 |
|------|------|------|
| OCR 管线 | `composables/useVideoSubtitleOcr.ts` | 抽帧队列、去重、编辑距离合并、取消、临时目录清理；逻辑保留，仅重构 UI |
| 屏幕监控 | `composables/useScreenMonitor.ts` | 采样、aHash 去重、`useSubtitleTimeline` 单例、`createConfigManager`、滤镜预设 |
| 滤镜像素管线 | `utils/image.ts` | `applyImageFilterToPixels` / `createFilteredImageBlob` / `blobToDataUrl` / `createImageBlock` |
| ROI 工具 | `utils/video.ts` | 归一化 ROI 夹取、帧数/区间计算 |
| 类型 | `types.ts` | `SubtitleEntry` / `VideoRoi` / `ImageFilterConfig` 等 |
| 通用组件 | `components/common/VideoPlayer.vue` | 逐帧、截图、hover-seek、全屏；可参考其 `crossOrigin` + canvas 截图方式 |
| 依赖 | `konva@10`、`@tanstack/vue-virtual`、`element-plus`、`lucide-vue-next`、`@vueuse/core` | 均已在 `package.json` |
| Rust 后端 | `src-tauri/src/commands/ffmpeg_processor.rs` | `extract_video_frames`（归一化 ROI 裁剪）、`get_media_metadata`、`get_media_keyframes`、`kill_ffmpeg_process` |
| 本地播放 | `tauri.conf.json` | `assetProtocol.enable = true`，`allow: ["**"]`；`convertFileSrc` 可播放本地视频 |

---

## 4. 架构设计

### 4.1 模式隔离

`RealtimeSubtitleOcr.vue`：

- 工具栏只保留：模式切换、状态徽标、屏幕模式的监控框控制入口。
- `ocrMode === 'screen'` → 现有屏幕布局原样保留。
- `ocrMode === 'video'` → 渲染占满主区域的 `<VideoWorkbench />`。
- 将 `MonitorConfig` 从共享工具栏迁出：视频模式放入工作台 Inspector；屏幕模式保留在原有位置（不动）。

### 4.2 工作台布局

```
VideoWorkbench
├─ WorkbenchToolbar   文件名 / 时长 / 分辨率 / FFmpeg 状态; 开始·取消·进度; 导出 SRT
├─ Body (row, 可拖拽分栏)
│  ├─ MonitorPane (flex, min-w-0)
│  │  ├─ VideoMonitor       视口 + 播放控件 + ROI 叠加层
│  │  └─ FilterPreviewPanel 原图 | 处理后 | 试识别结果 (可折叠)
│  └─ InspectorPane (~320px, 可折叠)
│     Tabs: 引擎/滤镜(复用 MonitorConfig) · ROI 精确 · 字幕编辑(复用 ActiveSubtitleEditor)
├─ TimelineEditor (Konva, 上边缘可拖拽调高)
└─ SubtitleListDrawer (现有表格, 可折叠, 与轨道联动)
```

无视频时：全幅 `DropZone`。

### 4.3 VideoMonitor（剪辑器式）

- 原生 `<video crossOrigin="anonymous" preload="auto">`，`src = convertFileSrc(path)`。
- 视口变换模型 `useViewportTransform`：`{ scale, offsetX, offsetY }`，默认按容器“适配”计算 scale，视频居中。
- 控件条：播放/暂停、停止、上一帧/下一帧、±5s、当前/总时间码、音量、倍速、**适配**、**缩放±**、比例菜单、1:1、全屏。
- 交互：
  - 视口滚轮 = 以光标为中心缩放；`Ctrl/Alt`+滚轮变体；触控板平移。
  - 空格/中键/手型工具拖拽 = 平移；双击 = Fit ↔ 100%。
- ROI 叠加层（`RoiOverlay.vue`）：置于被 CSS `transform: translate()+scale()` 的视口内容内，与视频同步缩放。
  - 技术选型：**DOM + 绝对定位手柄**（指针事件与文字更清晰，规避 Konva 在 CSS 变换下的坐标精度问题）；手柄屏幕尺寸按 `1/scale` 补偿。
  - 暗化遮罩（ROI 外）+ 8 向手柄 + 边框；支持移动、缩放、最小尺寸、比例锁定。
  - Inspector「ROI 精确」页：x/y/w/h 的 px 与 %、微调、比例锁定、预设（底部单行 / 双行 / 全屏 / 自定义）。

### 4.4 区域截图 + 实时滤镜预览 + 单帧试识别（两模式共用）

新增 `utils/frameCapture.ts`（与来源解耦）：

- `captureImageRegion(source, roiPx): { canvas, blob }` — `source` 可为 `HTMLVideoElement | HTMLImageElement | ImageBitmap | Blob`。
- `renderFilteredRegion(source, roiPx, filter): Promise<{ originalUrl, filteredUrl, filteredBlob }>` — 复用 `applyImageFilterToPixels`。
- `recognizeRegion(source, roiPx, filter, engineConfig)` — 复用 `useOcrRunner` 做单帧试识别。

新增共用组件 `components/common/FrameFilterPreview.vue`：

- Props：`originalUrl` / `filteredUrl` / `filterConfig` / `busy` / `recognizedText`。
- 原图 vs 处理图并排对照，可放大；“以此帧试识别”按钮；结果显示区。
- 直接用于视频模式与屏幕模式的预览面板。

两种模式的截图来源适配：

- **视频模式**：从 `<video>` 当前帧 + ROI 裁剪 → `captureImageRegion`。
- **屏幕模式**：调用现有 Rust `capture_screen_rect`（一次性、`lastHash = null`）获取监控框区域 PNG → `captureImageRegion`（ROI 即整框，或允许框内二次裁剪）。

触发方式（两模式一致）：

- “截图预览”按钮；
- 暂停/空闲下 ROI 或滤镜参数变化后 debounce 自动刷新；
- “以此帧试识别”按钮。

> 风险：asset 协议下 canvas 可能被污染。现有 `VideoPlayer.captureSnapshot` 已用同方式成功 `toDataURL`，判定可行；若个别视频仍失败，降级为新增 Rust `extract_single_frame` 命令（备选，不默认做）。

### 4.5 TimelineEditor（Konva）

- `Konva.Stage` 全宽；图层：`ruler` / `track` / `range` / `playhead`（播放头可用 DOM 叠加以保持锐利）。
- 视口状态 `useTimelineViewport`：`pxPerSecond`、`scrollX`，只渲染可见区（windowing）。
- 滚轮 = 横向滚动；`Ctrl`+滚轮 = 以光标为中心缩放；按钮：适配全长 / 缩放±。
- 标尺：自适应刻度密度 + 时间标签（`hh:mm:ss.mmm`）。
- 字幕轨道：`SubtitleEntry.startMs/endMs` 渲染为块；选中/悬停高亮；拖块体 = 平移时间（保持时长），拖边 = 修剪；右键菜单（删除/合并/拆分/编辑）；双击 → 聚焦编辑器。
- 识别区间层：开始/结束遮罩 + 可拖拽手柄，吸附到播放头/字幕块边缘。
- 播放头与视频 `currentTimeMs` 双向同步；点击/拖标尺 = seek。
- 长视频性能：windowing + 图层最小重绘；必要时 `@tanstack/vue-virtual` 辅助。

### 4.6 状态与逻辑

- 新增 `composables/useVideoWorkbench.ts`：播放态（`currentTime`/`duration`/`isPlaying`）、视口变换、ROI、选中项、预览状态、时间轴缩放/滚动；OCR 任务委托现有 `useVideoSubtitleOcr` 管线。
- 继续复用 `useSubtitleTimeline` 单例，新增轻量选中/seek 协调（本地 store），保证轨道、表格、编辑器同步。
- 保留：临时帧清理、取消语义、合并算法、SRT 导出。

### 4.7 快捷键（工作台聚焦时生效）

空格 播放/暂停；`←/→` 逐帧；`Shift+←/→` ±1s；`Home/End` 首尾；`I/O` 设识别区间起止；`F` 适配；`+/-` 缩放。需确认不与全局热键冲突（参考 `VideoPlayer` 的 `globalHotkey` 处理模式）。

---

## 5. 文件改动清单

**新增**

- `components/video/VideoWorkbench.vue`
- `components/video/VideoMonitor.vue`
- `components/video/RoiOverlay.vue`
- `components/video/FilterPreviewPanel.vue`（薄封装，内部用共用 `FrameFilterPreview.vue`）
- `components/video/InspectorPanel.vue`
- `components/video/timeline/TimelineEditor.vue`
- `components/video/timeline/timelineRuler.ts`
- `components/video/timeline/subtitleTrack.ts`
- `components/video/timeline/rangeLayer.ts`
- `components/video/timeline/Playhead.vue`
- `components/common/FrameFilterPreview.vue`（两模式共用）
- `composables/useVideoWorkbench.ts`
- `composables/useViewportTransform.ts`
- `composables/useTimelineViewport.ts`
- `utils/frameCapture.ts`
- `utils/__tests__/frameCapture.test.ts`

**修改**

- `RealtimeSubtitleOcr.vue`（模式隔离，视频分支改挂 `VideoWorkbench`）
- `LivePreview.vue`（屏幕模式接入共用截图 + 滤镜预览）
- `composables/useVideoSubtitleOcr.ts`（暴露/重构 UI 态，OCR 管线不变）
- `composables/useScreenMonitor.ts`（暴露一次性截屏能力供预览）
- `types.ts`（viewport / selection / timeline 类型）
- `utils/video.ts`（px↔归一化 ROI 辅助）
- `ARCHITECTURE.md`
- `docs/user-guide/tools/realtime-subtitle-ocr/index.md`
- `realtime-subtitle-ocr.registry.ts`（版本号）

**迁移后删除**

- `components/VideoSubtitlePanel.vue`
- `components/VideoRoiSelector.vue`

---

## 6. 分阶段实施

1. **模式隔离 + 工作台骨架**：新增 `VideoWorkbench`，`RealtimeSubtitleOcr` 分流；迁移 `DropZone`/工具栏/进度，OCR 行为不变。
2. **VideoMonitor + 视口变换 + 控件 + RoiOverlay**：达芬奇式缩放/平移 + 精确 ROI。
3. **共用截图滤镜预览 + 单帧试识别**：`frameCapture.ts` + `FrameFilterPreview.vue`，接入视频与屏幕两模式。
4. **Konva 时间轴**：标尺 / 轨道 / 区间 / 播放头 + 与表格联动。
5. **Inspector 整合 + 删除旧组件 + 文档/测试**。
6. **打磨**：快捷键、边界情形、长视频性能。

---

## 7. 验证

- 类型检查：`bun run check:frontend`（`vue-tsc --noEmit`）
- 单测：`bun run test:run`（vitest；含新增 `frameCapture` 与现有 `utils/__tests__`）
- Lint：`bun run lint`
- 手动（`bun run tauri:dev`）：
  1. 载入视频 → 缩放/平移/ROI 精确设置 → 截图调滤镜 → 试识别；
  2. 跑全片 → 轨道选中/拖动/修剪 → 表格联动 → 导出 SRT；
  3. 切到屏幕实时模式 → 截图区域滤镜预览 → 试识别。

---

## 8. 风险与对策

| 风险 | 对策 |
|------|------|
| asset 协议下 canvas 污染 | 现有截图能力证明可行；保留 Rust `extract_single_frame` 作为降级 |
| Konva + CSS 变换指针精度 | ROI 用 DOM 叠加层；时间轴用原生 Konva 变换；极端缩放下手测 |
| 长视频轨道性能 | 可见区 windowing + 图层分离重绘 |
| `useSubtitleTimeline` 单例与屏幕模式耦合 | 只新增选择/seek 协调，不改其数据契约 |
| 快捷键冲突 | 工作台聚焦域内监听，参考 `globalHotkey` 模式 |
| 屏幕模式一次性截屏与监控采样竞争 | 预览截图走独立一次性调用，不复用监控 `lastHash` |

---

## 9. 实施状态与偏差（2026-09-12）

### 已完成

- 阶段 1-5 全部落地：模式隔离、`VideoWorkbench`、`VideoMonitor` + 视口变换 + `RoiOverlay`、共用 `RegionFilterPreview` / `FrameFilterPreview`、Konva `TimelineEditor`、Inspector 整合、旧组件删除、文档与版本号更新。
- 阶段 6 打磨：空格播放/暂停、`←/→` 逐帧、`Shift+←/→` ±1s、`Home/End` 首尾、`I/O` 设置识别区间起止、`F` 适配、`+/-` 缩放、`H` 手型；时间轴右键菜单（编辑 / 在播放头拆分 / 与下一条合并 / 删除）；ROI 比例锁定。
- 复核补齐（2026-09-12）：监视器控件条补齐音量（可静音 + 滑块）、倍速菜单、缩放比例菜单；视口双击 `Fit ↔ 100%`；单击视口 / ROI / 空白主动 `focus()`，控制条交互后焦点归还监视器，恢复快捷键链路。
- 复核补齐（2026-09-12）：`RegionFilterPreview` 刷新 / 识别引入递增令牌，丢弃过期结果、刷新时取消在途识别；视频截图前 `waitForFrame()` 等待 `seeked` 与 `requestVideoFrameCallback` 呈现目标帧，避免 seek 后抓到旧帧。
- 单测：`frameCapture`、`resizeVideoRoi`、`subtitleOps`、`useViewportTransform`、`useTimelineViewport`、`RegionFilterPreview` 刷新竞态。
- E2E：`tests/tauri-e2e/specs/realtime-subtitle-ocr-workbench.spec.ts`（真实视频 + 原生选择器，不跑 OCR），覆盖模式隔离、加载、ROI 预设与比例锁定、播放/暂停、音量与静音、倍速菜单、缩放比例菜单、双击 `Fit ↔ 100%`、点击视口聚焦。

### 偏差

- 原计划的独立文件 `FilterPreviewPanel.vue` / `InspectorPanel.vue` / `timelineRuler.ts` / `subtitleTrack.ts` / `rangeLayer.ts` / `Playhead.vue` / `useVideoWorkbench.ts` 未单独拆分，能力分别内联在 `VideoWorkbench.vue`、`TimelineEditor.vue` 与各 composable 中；功能完整，仅文件组织与计划不同。
- ROI 比例锁定仅在角点手柄生效，边手柄仍按单轴缩放；最小尺寸优先级高于比例。
- 屏幕模式截图预览的触发按钮放在工具栏，而非改造 `LivePreview.vue` 内部。
- 视频模式单帧试识别在预览面板手动触发；暂停/跳转后自动刷新，不再额外监听 ROI 变化去重。
