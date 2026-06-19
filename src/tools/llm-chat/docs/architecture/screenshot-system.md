# 消息截图系统 (Message Screenshot System)

消息截图系统是 AIO Hub 聊天工具（`llm-chat`）中的一项核心特色功能，旨在为用户提供将对话内容导出为精致、高清、高度可定制的长图（PNG）的能力。

该系统不仅支持消息范围的精细选择，还提供了丰富的排版、尺寸、背景、间距、卡片装饰、折叠策略以及显示元素的自定义配置。

---

## 1. 整体架构与组件关系

消息截图系统采用**“实时 DOM 预览 + 离屏并发截图 + Canvas 2D 后拼接”**的混合架构。其核心组件与模块组织如下：

```
src/tools/llm-chat/components/screenshot/
├── ShareScreenshotDialog.vue      # 截图功能主入口对话框 (BaseDialog)
├── MessageRangePanel.vue          # 消息范围选择与精细过滤面板
├── ScreenshotConfigPanel.vue       # 截图排版与视觉参数配置面板
├── ScreenshotPreviewPanel.vue      # 实时 DOM 预览、缩放平移与历史管理面板
├── ScreenshotRenderer.vue          # 截图专用 DOM 渲染器 (复刻 MessageList 布局)
└── screenshotTypes.ts              # 截图模块类型定义、默认值与常量范围

src/tools/llm-chat/composables/features/
└── useScreenshotGenerator.ts       # 高层业务 Composable (对接 Tauri 桥接与保存)

src/tools/llm-chat/utils/
└── screenshotCapture.ts            # 底层截图与拼接核心工具 (基于 modern-screenshot)
```

### 1.1. 核心交互时序

1. **打开对话框**：[`ShareScreenshotDialog.vue`](../../components/screenshot/ShareScreenshotDialog.vue) 挂载，初始化消息选区（默认选中最后两条消息），并对消息区当前宽度进行采样（`widthMode = "auto"`），向下取整并夹紧到 `[480, 1280]` px 作为初始渲染宽度。
2. **实时预览**：[`ScreenshotPreviewPanel.vue`](../../components/screenshot/ScreenshotPreviewPanel.vue) 渲染 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue)。用户在 [`ScreenshotConfigPanel.vue`](../../components/screenshot/ScreenshotConfigPanel.vue) 中调整任何配置，都会通过 `v-model` 实时作用于 DOM 渲染器，预览界面立即更新。
3. **生成截图**：用户点击“生成截图”：
   - 业务层调用 [`useScreenshotGenerator.ts`](../../composables/features/useScreenshotGenerator.ts) 的 `generate()`。
   - 收集 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 中所有选中的 `.message-slot` 真实 DOM 节点。
   - 底层 [`screenshotCapture.ts`](../../utils/screenshotCapture.ts) 启动并发截图队列，将每个节点截取为独立的 Canvas。
   - 创建大 Canvas，绘制背景（纯色/主题/壁纸）、卡片装饰（投影与边框）、合成毛玻璃模糊背景。
   - 将各消息 Canvas 按精确计算的 `y` 偏移量（含 `gap` 间距）依次绘制（`drawImage`）到大 Canvas 上。
   - 生成大图 Canvas 并转为 Data URL，加入历史记录列表。
4. **导出与分享**：用户可选择“查看大图”（调用全局图片查看器）、“复制到剪贴板”（通过 Clipboard API）或“保存图片”（通过 Tauri 保存对话框写入本地）。

---

## 2. 核心组件设计

### 2.1. 截图渲染器 (ScreenshotRenderer.vue)

[`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 是整个截图系统的视觉基石。为了保证截图效果与聊天界面完全一致，它完整复刻了主消息列表（`MessageList.vue`）的卡片与气泡布局规则：

- **状态感知与注入**：
  - 注入 `screenshotMode = true`，使子消息组件（如 `ChatMessage.vue`、`ToolCallMessage.vue`）感知截图状态，自动隐藏操作栏（MenuBar）、分支切换器等交互元素。
  - 注入 `screenshotCollapseStrategy`，控制工具调用节点在截图中的折叠状态（强制展开/收起/跟随配置/维持现状）。
  - 注入 `screenshotElementOverrides`，控制头像、时间戳、模型信息、Token 统计、字数、性能指标等元素的可见性。
- **气泡布局复刻**：
  - 完美支持气泡模式下的外置头像（`avatar-outside`）、外置 Header（`header-outside`）、右对齐镜像（`row-reverse` 翻转）以及底部信息（`message-meta`）的对齐。
  - 针对截图容器宽度（如 720px）较窄的情况，将气泡最大宽度限制（`--bubble-max-width-percent`）从系统的 75% 自动放宽到 85%，避免气泡被无故压缩导致难看的换行。
- **圆角与字号同步**：
  - 将临时覆盖的字号转为 CSS 变量 `--message-font-size`，由子组件通过 `var(...)` 兜底读取。
  - 动态覆写消息组件内部的圆角变量 `--bubble-radius`，确保截图中的气泡圆角与系统设置或覆盖设置精确对齐。

### 2.2. 预览与历史面板 (ScreenshotPreviewPanel.vue)

[`ScreenshotPreviewPanel.vue`](../../components/screenshot/ScreenshotPreviewPanel.vue) 承担了高频的交互逻辑：

- **无损缩放与平移 (Pan & Zoom)**：
  - 采用双层结构实现。外层 `.preview-canvas-frame` 使用显式宽高（`自然尺寸 * 预览缩放比例`）撑出与可视内容等大的布局盒，使外层容器的 `overflow: auto` 能够拿到正确的滚动范围；内层 `.preview-canvas-scaler` 仅承担 `transform: scale(previewScale)` 变换。
  - 支持 `Ctrl + 鼠标滚轮` 缩放，以及鼠标左键拖拽平移。
- **截图历史管理**：
  - 维护一个横向滚动的截图历史列表。每次生成新图都会追加到历史中，并自动滚动到最新项。
  - **过时标记 (Stale State)**：当用户修改了选区、排版配置或尺寸时，历史列表中的现有截图会被自动标记为“已过时”（半透明显示并附带警告徽章），提示用户当前预览的 DOM 与已生成的图片不一致，需要重新生成。

---

## 3. 底层截图与拼接核心 (screenshotCapture.ts)

底层截图基于 `modern-screenshot` 库。[`screenshotCapture.ts`](../../utils/screenshotCapture.ts) 针对跨平台桌面端的特殊性，在单节点截图、并发拼接和毛玻璃后合成等环节做了定制化处理。

### 3.1. 单节点截图处理 (captureElementAsCanvas)

- **尺寸控制**：
  - 当元素处于 `transform: scale` 缩放容器中时，`getBoundingClientRect()` 返回的宽高会被缩放，因此改用 `offsetWidth` 和 `offsetHeight` 获取元素 1:1 的自然布局尺寸，免疫缩放影响。
  - 同时显式指定克隆节点的 `width`、`minWidth`、`maxWidth`、`height`，确保离屏渲染时尺寸与源元素一致。
- **CSS 变量同步**：
  - `modern-screenshot` 将 DOM 转换为 SVG `foreignObject` 进行离屏渲染时，默认不携带外部样式表和根元素上的 CSS 变量。系统在 `onCloneNode` 回调中，遍历源元素及 `<html>` 根元素上所有 `--` 开头的 CSS 自定义属性，逐条复制到克隆节点的 `style` 上，保证离屏渲染时的主题上下文完整。
- **视口外内容强制可见**：
  - 浏览器默认的 `content-visibility: auto` 优化会跳过视口外元素的渲染。系统在克隆树中将所有子元素的 `content-visibility` 设为 `visible !important`，强制全量排版，确保视口外的消息节点也被完整渲染。
- **滚动条与溢出处理**：
  - 注入临时 `<style>` 样式，强制隐藏所有滚动条（`scrollbar-width: none`），并将代码块（`.cm-editor-inner`）、Markdown 表格等容器的 `overflow` 设为 `visible`，确保内容完整展开不被截断。

### 3.2. 并发截图与拼接算法 (captureMessagesAndStitch)

1. **宽度解析与对齐**：
   - 消息内容的实际宽度应该是总宽度扣除左右 `padding`（`contentWidth = resolvedWidth - padding * 2`），保持与 DOM 渲染时的实际宽度完全一致，避免文字换行位置发生抖动。
2. **并发限流**：
   - 使用简易并发队列（默认并发数 `concurrency = 6`）并发调用 `captureElementAsCanvas` 截取每条消息，在速度与内存占用之间取得最佳平衡。
3. **精确尺寸计算**：
   - 总宽度 = `resolvedWidth`。
   - 总高度 = `Σ(messageHeight) + gap * (N - 1) + padding * 2`。
4. **背景绘制 (drawBackground)**：
   - **纯色模式**：直接填充指定 HEX 颜色。
   - **跟随主题模式**：提取当前主题的不透明容器背景色（`--container-bg`），若系统当前有壁纸，则等比缩放（`cover`）绘制壁纸，并叠加半透明主题色蒙层以保证文字可读性。
   - **应用壁纸模式**：等比绘制系统壁纸，并应用用户自定义的不透明度（`wallpaperOpacity`），叠加半透明蒙层。
5. **卡片装饰绘制 (drawDecoration)**：
   - 在大 Canvas 上绘制精致的圆角矩形外边框（`rgba(0, 0, 0, 0.08)`）与微弱投影（`shadowBlur = 12`），提升长图的质感。

### 3.3. 毛玻璃后合成算法

`modern-screenshot` 将 DOM 树克隆到 SVG `foreignObject` 中离屏渲染时，浏览器的安全沙箱机制使其无法读取视口底部背景，因此 `backdrop-filter: blur`（毛玻璃效果）无法正常输出。消息截图系统在 Canvas 拼接阶段，通过**"离屏预模糊 + 区域裁剪合成"**在最终画布上复现毛玻璃效果：

1. **创建模糊背景画布 (`createBlurredBackgroundCanvas`)**：
   - 检测到系统当前启用了壁纸时，先创建一张与最终大图同尺寸的"原始背景" Canvas，绘制等比壁纸与半透明蒙层。
   - 再创建"模糊版背景" Canvas，利用 `CanvasRenderingContext2D.filter = "blur(...px)"` 对整张原始背景应用高斯模糊滤镜。
2. **气泡位置与尺寸还原**：
   - 拼接每条消息时，查找其 DOM 中的背景容器 `.message-background-container`。
   - 通过 `getBoundingClientRect()` 获取其相对于消息槽的坐标（`relativeX`, `relativeY`）和实际宽高（`actualWidth`, `actualHeight`），并以 `offsetWidth` 比例做缩放补偿，免疫 `transform: scale` 影响。
3. **裁剪与合成 (`drawBlurredMessageBackground`)**：
   - 在目标 Canvas 上，以气泡的精确位置和圆角半径绘制圆角矩形路径，调用 `ctx.clip()` 进行裁剪。
   - 从"模糊版背景" Canvas 的对应像素坐标上将模糊背景 `drawImage` 到裁剪区域内。
   - 在裁剪区域内叠加半透明的 `card-bg` 蒙层，最后绘制消息前景内容 Canvas。

---

## 4. 安全、性能与合规性

### 4.1. CSP 安全合规 (Data URL 转换禁令)

根据项目安全规范，Tauri 的 CSP 策略严格限制了 `connect-src`，禁止使用 `fetch(dataUrl)` 读取 Data URL。
在 [`canvasToPngBytes()`](../../utils/screenshotCapture.ts:816) 中，系统严格遵守此规范，采用纯 JavaScript 解码方式：

```typescript
export function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
```

### 4.2. 剪贴板异步写入与优雅降级

在 [`copyCanvasToClipboard()`](../../utils/screenshotCapture.ts:828) 中，使用现代异步剪贴板 API 写入图片。针对部分老旧 WebView 环境不支持 `ClipboardItem` 的情况，进行了优雅的异常捕获，并主动提示用户降级使用“保存图片”功能，避免程序崩溃。

### 4.3. 内存与性能优化

- **按需反序列化预过滤**：在生成截图前，仅对选中的消息节点进行 DOM 收集，未选中的消息不参与任何截图计算。
- **Canvas 及时销毁**：历史记录中的 Canvas 对象在清空或删除时会被解除引用，便于浏览器垃圾回收，防止海量高清截图导致内存泄漏。
- **并发限流**：通过 `concurrency` 限制，避免在消息极多（如一次性截取 50+ 条消息）时因同时创建大量离屏 Canvas 而导致 GPU 内存溢出或浏览器卡死。
