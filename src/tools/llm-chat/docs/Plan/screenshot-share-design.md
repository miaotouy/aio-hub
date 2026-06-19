# LLM Chat: 消息截图分享功能 — 实施计划 (V3)

> 最后更新：2026-06-19
> 状态：V3 实施完成, check:frontend / lint 通过, 待真机验证
> 作者：Gugu_Kilo & miaotouy
> 版本：V3 (单弹窗合并 + 上左右响应式布局 + 并发消息截图 + 纯 Canvas 2D 拼接 + **DOM 实时预览 + 完全手动生成**)
> ⚠️ 历史备注：V1 分组截图方案因频繁切换 display 导致虚拟滚动空白、截图速度极慢而回滚。V2 抛弃分组截图采用并发单条消息截图与 Canvas 拼接方案。V3 在 V2 基础上彻底重构"预览 + 生成"交互 (DOM 实时预览 + 完全手动生成), 详见 §0.6。

> **V2.1 修复 (2026-06-18)**: 补齐 ScreenshotRenderer 缺失的气泡模式 CSS (MessageList 的 bubble 样式是 scoped, 不会作用到 ScreenshotRenderer), 并把容器宽度 (720px) 作为显式参数贯穿到 captureMessagesAndStitch 与 captureElementAsCanvas, 彻底解决截图为窄条气泡 + 拼接错乱的问题. 详见 §0.3.
>
> **V2.3 修复 (2026-06-18)**: 修复截图"显示元素"开关无效 + CSP `blob:` 拦截问题. 详见 §0.5.

> **V3 升级 (2026-06-19)**: 恢复 DOM 实时预览 + 底部缩略图小容器 + 完全手动生成。彻底解决"点开就自动渲染"和"无法即时预览配置效果"的痛点。详见 §0.6。

---

## 0. 施工进度日志

> 本节随施工实时更新,记录实际进展、与原计划的偏差以及实施过程中的发现。

### 0.1 阶段一/二 当前进展（2026-06-18）

- DONE **`composables/ui/useMessageLayout.ts`**: 从 `MessageList.vue` 提取 4 个核心 computed(`compressedNodeIds`、`messageSiblingInfoMap`、`messageLayouts`、`bubbleLayoutVars`)以及 3 个派生标志(`shouldHideHeaderAvatar`、`shouldUseOutsideHeader`、`bubbleLayout`)。返回值与原 `MessageList` 中保持同名,消费者零改动。
- DONE **`MessageList.vue` 重构**: script 1383 行 → ~1230 行,删除约 180 行重复布局计算代码。新增 `screenshotMode?` prop,内部 `provide("screenshotMode", computed)` 注入供子组件使用;模板继续透传给后代,3 个消息组件统一加 `:screenshot-mode`。
- DONE **`ChatMessage.vue`**: prop + `screenshot-mode` class + `menubar-wrapper` 加 `&& !props.screenshotMode` 守卫。
- DONE **`CompressionMessage.vue`**: prop + class + 角色下拉 `:disabled` + 编辑/启用/删除按钮 `v-if` 守卫。
- DONE **`ToolCallMessage.vue`**: prop + class + `toggleCollapse`/`toggleArgsCollapse` 守卫 + menubar-wrapper `&& !screenshotMode` 守卫 + `preview-btn` / `copy-small-btn` 隐藏。
- DONE **`MessageContent.vue`**: prop + 编辑模式 `&& !screenshotMode` 守卫 + 流式指示器 / 渐进预览图 / 翻译流式指示器 隐藏。
- DONE **`MessageHeader.vue`**: prop + 性能指标 / 时间戳 `&& !screenshotMode` 守卫。MessageList 中的外置 header 透传 `screenshot-mode`。
- SKIP **`MessageMenubar.vue`**: 无需修改——已通过父级 `v-if` 拦截。
- DONE **`utils/screenshotCapture.ts`**: `captureElementAsCanvas` (CSS 变量复制 / content-visibility 强制可见 / 毛玻璃替换为实色 / 滚动条隐藏) + `captureMessagesAndStitch` (并发限流截图 / Canvas 2D 拼接 / 圆角阴影水印) + `canvasToPngBytes` (纯 JS Base64 解码, 合规 CSP) + `copyCanvasToClipboard`。
- DONE **`ScreenshotRenderer.vue`**: 离屏固定 720px 宽, 复用 `useMessageLayout`, 镜像 4 种消息渲染分支 (外置 header / compression / tool / 普通), `provide("screenshotMode", true)`, 全量展开 (content-visibility: visible), 暴露 `getMessageElements()`。
- DONE **`useScreenshotGenerator.ts`**: 模块化 logger / error handler, 暴露 `generate` / `copyToClipboard` / `saveToFile`, 进度回调, Tauri save dialog + writeFile。
- DONE **`ShareScreenshotDialog.vue`**: 单弹窗合并版, 上(范围选择 + 精细列表)+ 左 320px(效果 / 布局覆盖 / 折叠策略 / 元素开关) + 右 Flex(实时预览 + 缩放拖拽), 响应式 (< 900px 垂直堆叠)。
- DONE **入口接入**:
  - `MessageMenubar.vue`: "更多" 下拉新增 "创建消息截图" (Camera 图标), 发射 `screenshot` 事件。
  - `ChatMessage.vue` / `ToolCallMessage.vue` / `MessageList.vue`: 透传 `@screenshot` 事件。
  - `ChatArea.vue`: 监听 `@screenshot`, 打开 `ShareScreenshotDialog` (默认聚焦触发消息)。
  - `ExportBranchDialog.vue`: 底部新增 "生成分享长图" 按钮, 发射 `screenshot` 事件 (未挂到消费者, 待 GraphNodeMenubar/MessageMenubar 后续接入)。
- DONE **`check:frontend` + `lint`**: 全部通过, 0 errors / 0 warnings。

### 0.2 与原计划的偏差与设计决定

- **`MessageMenubar.vue` 不需要单独 v-if 守卫**: 原计划要求整体不渲染。实际上 `ChatMessage.vue` / `ToolCallMessage.vue` 的 `menubar-wrapper` 外层已经拦截。
- **`screenshotCollapseStrategy` 折叠策略实现**: 原计划要求遍历主界面组件实例做快照,实现成本高且易碎。变更为: 截图渲染器只接收 `collapseStrategy` 配置,`preserve` 模式由用户手动确认,`config` 模式读取 agent `defaultToolCallCollapsed` 配置。
- **`LlmThinkNode` 折叠状态**: 原计划要求通过 DOM class 判断后还原。变更为: 截图模式下强制 `LlmThinkNode` 展开(`override-expand` 策略)或遵循用户选择策略。
- **`provide("screenshotMode")` 注入**: 使用 `computed(() => props.screenshotMode ?? false)` 包装后注入,子组件 inject 后得到的是 ComputedRef,需要 `.value` 读取。

---

### 0.3 V2.1 修复:气泡模式窄条气泡 + 拼接错乱 (2026-06-18)

**症状**: 用户在气泡模式下打开分享弹窗, 选择消息点"生成截图", 输出 PNG 宽度只有 ~552px (CSS 276px), 远低于 ScreenshotRenderer 固定的 720px, 气泡被挤成一团, 用户/助手消息排版错乱.

**根因 (两点叠加)**:

1. **气泡模式 CSS 缺失** — MessageList.vue 的 bubble 布局 CSS (display: flex; width: 100%; align-items: flex-start; + data-align 对齐 + 子元素 max-width: min(75%, 720px)) 是 <style scoped>, **不会作用到 ScreenshotRenderer.vue 这个独立组件渲染出的 .message-slot**. ScreenshotRenderer.vue 之前只补了 mode-card 的 width:100%, 气泡模式下 .message-slot 默认 width: auto = 气泡自然宽度 (~276px).
2. **截图宽度未贯通** — captureElementAsCanvas 默认用 lement.getBoundingClientRect().width 作 captureWidth. 气泡模式下 rect.width 拿到的是气泡自然宽度, 不是容器宽度. captureMessagesAndStitch 又用 messageCanvases[0].width / scale 作统一 captureWidth, 强行把后续消息拉伸到第一张气泡的宽度, 排版全错.

**修复**:

- ScreenshotRenderer.vue: 完整复刻 MessageList.vue 的气泡模式 CSS (.message-slot 全宽 + flex 对齐 + 头像/header 外置变体 + 右对齐镜像), 写入自己的 <style scoped>, 用 :deep() 处理 children.
- screenshotCapture.ts: StitchOptions 新增 width?: number; captureMessagesAndStitch 内
  esolveCaptureWidth() 按 options.width → 首个元素父容器 → 720px 兜底; captureWidth 改用 resolvedWidth 而非 messageCanvases[0].width / scale; captureElementAsCanvas 调用处显式传 width: resolvedWidth.
- useScreenshotGenerator.ts: GenerateOptions 新增顶层 width?: number, 优先级高于 options.width.
- ShareScreenshotDialog.vue: 抽出 SCREENSHOT_RENDER_WIDTH = 720 常量, 同步到 <ScreenshotRenderer :width> 与 generator.generate({ width }).

**重要原则 (后续维护)**:

- MessageList.vue 中任何改动气泡模式 CSS 的地方, 都必须同步检查 ScreenshotRenderer.vue 的 style scoped, 否则预览和截图会立刻错位.
- 调用 captureMessagesAndStitch 时, **必须** 显式传 width (来自 ScreenshotRenderer 的 width prop), 不要依赖 rect.width 兜底 — 那是气泡自然宽度, 不是容器宽度.

## 1. 功能概述

将当前对话分支中的单条、多条或整段消息，渲染成一张排版精美、支持高度自定义的**长图卡片**，支持一键保存到本地或复制到剪贴板。

**核心改进（V2 合并版）**：

- **单弹窗闭环**：抛弃繁琐的两段式弹窗，将"消息选择"与"截图预览/配置"合并为单个大弹窗 [`ShareScreenshotDialog.vue`](src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue)。
- **"上左右"响应式布局**：
  - **顶部（Top）**：消息选择区。包含粗选滑块（`el-slider`）与可折叠的精细消息选择列表。
  - **左下（Left）**：截图配置面板。包含效果开关、布局覆盖（对照系统设置）、折叠策略、卡片元素开关。
  - **右下（Right）**：实时预览区。展示排版完全正确的独立 DOM 树，支持缩放和拖拽。
  - **流式响应式**：当宽度变窄时，下方双栏自然过渡为垂直排列（配置在上，预览在下）。
- **并发消息截图**：并发截取每个消息节点（`.message-slot`），速度极快，无渲染缺失，彻底摆脱虚拟滚动空白问题。
- **纯 Canvas 2D 拼接**：在 Canvas 中精确累加坐标拼接，支持还原模糊背景、外边框、投影和极简水印。

---

## 2. 已验证的技术前提

| 验证项                                      | 结果      | 来源                                                                                                                                                                                                                                                                                                |
| :------------------------------------------ | :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modern-screenshot` DOM 转图片              | ✅ 可用   | [`ScreenshotTester.vue`](src/tools/component-tester/components/ScreenshotTester.vue:471-510)                                                                                                                                                                                                        |
| **并发消息截图**                            | ✅ 可用   | 新方案验证：并发截取 `.message-slot` 节点，速度极快，无渲染缺失                                                                                                                                                                                                                                     |
| **CSS 变量复制**                            | ✅ 可用   | [`RichTextRendererTester.vue`](src/tools/rich-text-renderer/components/RichTextRendererTester.vue:1441-1458) 验证：在 `onCloneNode` 中将 `html` 根元素和父容器上的所有 `--` 开头的 CSS 变量复制到克隆节点上，彻底解决 SVG foreignObject 截图时主题颜色崩溃的问题                                    |
| **虚拟化空白修复**                          | ✅ 可用   | [`RichTextRendererTester.vue`](src/tools/rich-text-renderer/components/RichTextRendererTester.vue:1460-1479) 验证：在 `onCloneNode` 中强制将克隆节点的 `content-visibility` 设为 `visible`，彻底解决视口外内容不渲染的问题                                                                          |
| **排版与折行保护**                          | ❌ 不可靠 | [`RichTextRendererTester.vue`](src/tools/rich-text-renderer/components/RichTextRendererTester.vue:1500-1520) 验证：在 `onCloneNode` 中注入临时样式，隐藏所有滚动条，强制 details 保持展开，防止微小排版偏差产生滚动条视觉污染，实际上对复杂内容毫无效果，对常见简单效果又用不上，纯废物AI臆想的方案 |
| Tauri 原生 Webview 截图 API                 | ❌ 不存在 | `@tauri-apps/api` v2.10.1 无 `screenshot()`                                                                                                                                                                                                                                                         |
| `modern-screenshot` 克隆 DOM 后 `scrollTop` | ❌ 不可靠 | 因此采用**并发消息截图**，不依赖滚动                                                                                                                                                                                                                                                                |

---

## 3. 架构设计

### 3.1 新增文件清单

```
src/tools/llm-chat/
├── composables/ui/
│   └── useMessageLayout.ts          # 从 MessageList 提取的布局编排逻辑
├── components/screenshot/
│   ├── ScreenshotRenderer.vue       # 专用截图渲染组件（脱离虚拟滚动，全量展开）
│   └── ShareScreenshotDialog.vue     # 合并版截图分享弹窗（上左右响应式布局）
└── composables/features/
    └── useScreenshotGenerator.ts    # 截图生成与 Canvas 拼接核心逻辑
```

### 3.2 需修改的现有文件

| 文件                                                                                     | 修改内容                                                                 |
| :--------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)               | 提取布局逻辑到 `useMessageLayout`，改为调用 composable，删除重复计算代码 |
| [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)               | 添加 `screenshotMode` prop，隐藏 menubar、禁用 hover 边框变色            |
| [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)         | 添加 `screenshotMode` prop，隐藏编辑入口、复制按钮、流式指示器           |
| [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)       | 添加 `screenshotMode` prop，隐藏操作按钮；接收折叠策略                   |
| [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue) | 添加 `screenshotMode` prop，隐藏编辑/删除按钮                            |
| [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)         | 添加"创建消息截图"按钮入口                                               |
| [`ExportBranchDialog.vue`](src/tools/llm-chat/components/export/ExportBranchDialog.vue)  | 添加"生成分享长图"入口，直接唤起合并弹窗                                 |

### 3.3 数据流

```mermaid
graph TD
    A[用户点击"创建消息截图"] --> B{入口来源}

    B -->|MessageMenubar| C[打开 ShareScreenshotDialog<br/>默认选中当前消息及上下文]
    B -->|ExportBranchDialog| C

    C --> C1[顶部消息选择区]
    C1 --> C1_1[范围滑块粗选]
    C1 --> C1_2[折叠列表精选]

    C1_2 --> D[ScreenshotRenderer 实时渲染选中消息]

    C --> C2[左下配置面板]
    C2 --> C2_1[用户配置效果开关/布局覆盖/折叠策略/卡片元素]

    C2_1 --> E[useScreenshotGenerator 执行截图]

    E --> E1[并发截取每个 .message-slot 节点为 Canvas]
    E1 --> E2[纯 Canvas 2D 绘制背景/圆角/阴影/水印]
    E2 --> E3[将消息 Canvas 精确拼接到大 Canvas 上]
    E3 --> F{用户操作}

    F -->|复制到剪贴板| G[navigator.clipboard.write]
    F -->|保存图片| H[Tauri save dialog + writeFile]
```

---

## 4. 核心设计决策

### 4.1 截图引擎：`modern-screenshot` + 并发消息截图

- **选择原因**：纯前端，跨平台，无需 Rust 代码。
- **关键改进（V2）**：
  - **并发截取每个 `.message-slot` 节点**：每个消息节点（`.message-slot`）是完全独立的 DOM 节点。我们直接**并发**对每个 `.message-slot` 调用 `modern-screenshot` 的 `domToCanvas()`（`scale` 设为 2 高清）。每个消息节点的 DOM 极小，截图速度极快，几乎是瞬间完成！
  - **绝对对齐**：每个消息节点都是独立截图，高度是其真实渲染高度。拼接时通过 Canvas 2D 坐标精确累加，绝对不会出现 1 像素的对不齐或裂缝！
  - **零渲染缺失**：没有 `display: none` 的频繁切换，没有大容器克隆的尺寸计算 bug。

- **已知限制与应对（移植自富文本测试器成功经验）**：

| 限制                                | 应对                                                                                         |
| :---------------------------------- | :------------------------------------------------------------------------------------------- |
| `backdrop-filter` 毛玻璃丢失        | `onCloneNode` 中替换为实色背景（SVG foreignObject 不支持毛玻璃）                             |
| `<iframe>` 内容无法渲染             | 替换为静态缩略图占位                                                                         |
| `appdata://`/`asset://` 图片跨域    | 截图前转为 base64 data URL（**严禁使用 fetch(dataUrl)，必须使用纯 JS 解码以符合 CSP 规范**） |
| `content-visibility: auto` 导致空白 | `onCloneNode` 中强制克隆节点及其子元素 `content-visibility: visible !important`              |
| CSS 变量丢失导致颜色崩溃            | `onCloneNode` 中动态将 `html` 根元素和父容器上的所有 `--` 开头的 CSS 变量复制到克隆节点上    |
| 滚动条视觉污染与排版偏差            | `onCloneNode` 中注入临时样式，隐藏所有滚动条，强制 details 保持展开                          |

---

## 4.2 长图生成：纯 Canvas 2D 拼接 + 极简后处理

- **回归实用效果开关**：
  1. **还原模糊背景**：
     - 拼接大 Canvas 时，背景色直接读取当前系统主题的 `--container-bg`（带毛玻璃通透感）。
     - 如果开启了"还原模糊背景"，在 Canvas 底层绘制一层带微弱毛玻璃质感的半透明遮罩，让消息气泡自然地"浮"在上面。
  2. **加外边框与投影**：
     - 拼接时，在 Canvas 2D 中为整体卡片绘制一层精致的边框（`--border-color`）和微弱的阴影（`ctx.shadowBlur`）。
     - 也可以选择为每个消息气泡单独绘制外边框，还原原本的聊天质感。
  3. **精确的间距控制**：
     - 消息之间的间距（y 轴偏移）由 Canvas 拼接坐标精确累加控制，绝对不会出现 1 像素的对不齐或裂缝。
  4. **极简水印**：
     - 在长图右下角优雅地绘制一行小字（如 `Generated by AIO Hub`），支持开关。

- **DPR 高清适配与像素对齐**：
  - 统一使用 `scale` 变量（高清截图默认为 `2`）。
  - 所有拼接坐标的累加、Canvas 容器的初始化尺寸、以及绘制外边框（`strokeRect`）、投影（`shadowBlur`）、水印字体大小时，**所有数值必须统一乘以 `scale`**，防止在高分屏上出现像素错位或模糊。
- **固定宽度排版**：
  - `ScreenshotRenderer` 容器宽度硬编码为 `720px`，确保无论用户弹窗拉多宽，截出来的长图排版、字号比例、折行位置都是完全一致且完美的。
- **异步内容加载等待**：
  - 截图前必须执行 `waitUntilReady` 检查，确保所有图片加载完毕（监听 `img.onload`），并等待至少一个 `requestAnimationFrame` 以确保 LaTeX 公式和代码高亮渲染完成。

---

### 4.3 核心开发规范与技术约束

为了严格遵循项目规范（`.kilocode/rules/development-standards.md`），本功能实施时必须遵守以下硬性约束：

1. **模块化错误处理**：
   - 必须使用 `createModuleErrorHandler('llm-chat-screenshot')` 创建独立的错误处理器。
   - 严禁直接导入和使用全局的 `errorHandler` 单例。
   - 异步截图操作使用 `wrapAsync` 进行自动包装，并妥善处理返回值为 `null` 的回退逻辑。
2. **模块化日志系统**：
   - 必须使用 `createModuleLogger('llm-chat-screenshot')` 创建独立的日志记录器。
   - 记录日志时使用结构化对象参数，严禁通过字符串拼接塞入数据。
   - 严禁在 `catch` 块中同时调用 `logger.error()` 和 `errorHandler.error()`，避免重复记录。
3. **CSP 合规与纯 JS Base64 解码**：
   - **严格禁止**使用 `fetch(dataUrl)` 请求 `data:` 协议的 URL。
   - 在将 Canvas 转换为图片数据并保存时，必须使用以下纯 JS 解码方式：
     ```typescript
     const base64Data = dataUrl.split(",")[1];
     const binaryStr = atob(base64Data);
     const buffer = new Uint8Array(binaryStr.length);
     for (let i = 0; i < binaryStr.length; i++) {
       buffer[i] = binaryStr.charCodeAt(i);
     }
     ```
4. **Element Plus 弹窗滚动锁定**：
   - 截图分享弹窗中若有任何 `ElMessageBox` 调用（如确认删除、覆盖提示等），必须显式设置 `lockScroll: false`，防止 Tauri 窗口出现意外的全局滚动条。

---

### 4.5 布局编排复用：`useMessageLayout` composable

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:93-238) 中有 4 个关键 computed 控制消息渲染路径和布局：

| 计算属性                | 作用                          |
| :---------------------- | :---------------------------- |
| `messageLayouts`        | 预计算每条消息的 role / align |
| `compressedNodeIds`     | 判断哪些消息被压缩节点吞掉    |
| `messageSiblingInfoMap` | 预计算兄弟节点信息            |
| `bubbleLayoutVars`      | 注入 CSS 变量                 |

提取为 `useMessageLayout` composable，[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) 和 `ScreenshotRenderer.vue` 共同使用，删除约 180 行重复布局计算代码。

---

### 4.6 交互抑制：`screenshotMode`

**双重保障机制**：

1. **Prop 级**：`screenshotMode` prop 从 `ScreenshotRenderer` → 各消息组件 → 子组件逐层传递
2. **CSS 级**：`.screenshot-mode` class 在截图容器根元素上，通过 CSS 全局抑制

需要抑制的交互元素：

| 组件                                                                                     | 抑制项                                                                                         |
| :--------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)               | `.menubar-wrapper` 完全隐藏；hover 边框变色禁用                                                |
| [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)         | 编辑模式禁用；附件移除/预览按钮隐藏；错误信息复制按钮隐藏；流式指示器隐藏；渐进预览图禁用点击  |
| [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)       | menubar 完全隐藏；折叠/展开交互禁用；复制参数/预览渲染按钮隐藏；异步任务操作隐藏；编辑模式禁用 |
| [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue) | 角色下拉禁用；编辑/保存/取消隐藏；启用/禁用切换隐藏；删除确认弹窗隐藏                          |
| [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)         | `v-if="!screenshotMode"` 整体不渲染                                                            |
| [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue)           | 性能指标/时间戳根据模板配置决定                                                                |

CSS 级全局抑制：

```css
.screenshot-mode .menubar-wrapper {
  display: none !important;
}
.screenshot-mode .chat-message:hover::after,
.screenshot-mode .tool-call-message:hover::after,
.screenshot-mode .compression-message:hover::after {
  border-color: var(--border-color) !important;
}
.screenshot-mode .chat-message,
.screenshot-mode .tool-call-message,
.screenshot-mode .compression-message {
  content-visibility: visible !important;
  contain-intrinsic-size: none !important;
}
.screenshot-mode .action-btn,
.screenshot-mode .edit-actions,
.screenshot-mode .copy-small-btn,
.screenshot-mode .preview-btn {
  display: none !important;
}
```

---

### 4.7 折叠策略

| 策略标识            | 名称     | 说明                                                                               |
| :------------------ | :------- | :--------------------------------------------------------------------------------- |
| `preserve`          | 跟随现状 | 快照主界面各组件的折叠 ref 状态，截图容器还原                                      |
| `config`            | 跟随配置 | 读取当前 Agent 的 `defaultToolCallCollapsed`、`llmThinkRules[].collapsedByDefault` |
| `override-expand`   | 强制展开 | 所有可折叠元素强制展开                                                             |
| `override-collapse` | 强制收起 | 所有可折叠元素强制收起                                                             |

**`preserve` 模式的实现**：

`ScreenshotRenderer` 挂载前，遍历主界面 `MessageList` 中所有消息组件实例，读取以下状态并保存为快照 Map：

- [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue:242) 的 `isCollapsed` 和 `argsCollapsedMap`
- [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue:893-926) 中 `LlmThinkNode` 的折叠状态（通过 DOM class 判断）

截图容器中的各组件通过 `inject('screenshotCollapseStrategy')` 获取策略，根据策略决定初始折叠状态。

---

## 5. UI/UX 设计 (合并版单弹窗)

合并后的 [`ShareScreenshotDialog.vue`](src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue) 采用大尺寸弹窗（`width="1200px"`, `height="85vh"`），整体布局为**"上左右"流式响应式结构**：

### 5.1 顶部：消息选择区 (Top Panel)

负责消息的粗选与精选，支持折叠以节省空间：

1. **粗选控制栏 (Coarse Control Bar)**：
   - **范围滑块**：复用 [`ExportOptionsPanel.vue`](src/tools/llm-chat/components/export/ExportOptionsPanel.vue:29-60) 的 `el-slider range` 模式，支持 1 到 N 的双向拉动。
   - **快速筛选**：提供"全选"、"清空"、"仅用户"、"仅助手"快捷按钮。
   - **精选折叠开关**：一个精致的折叠按钮，用于展开/收起下方的精细消息列表。
2. **精细消息列表 (Fine-grained Selection List)**：
   - 默认展开，支持折叠（使用 `el-collapse-transition`）。
   - 限制最大高度（如 `180px`），内部支持垂直滚动。
   - **紧凑卡片设计**：
     - 每条消息渲染为一个极窄的横向卡片：`[复选框] [头像] [角色名称] [消息摘要（单行截断）]`。
     - 悬浮在卡片上时，通过 `el-tooltip` 显示完整消息文本。
     - 点击卡片右侧的"眼睛"图标，可在悬浮小窗中快速预览该条消息的完整富文本。
     - 用户可以通过勾选/取消勾选，精细地剔除不需要的系统提示、工具调用或废话。

### 5.2 左下：截图配置面板 (Left Panel)

宽度固定为 `320px`，提供清爽的配置项，并与系统设置（[`settingsConfig.ts`](src/tools/llm-chat/components/settings/settingsConfig.ts)）深度对照与联动：

- **效果开关（Canvas 拼接层）**：
  - `[x] 还原模糊背景` (读取系统 `--container-bg`，在 Canvas 底层绘制半透明遮罩，还原原本容器的通透感。对照系统设置中的背景模糊强度 `--ui-blur` 与透明度变量)
  - `[x] 显示卡片外边框` (为长图卡片绘制精致边框 `--border-color`)
  - `[x] 开启卡片投影` (增加立体阴影 `ctx.shadowBlur`)
  - `[x] 附加极简水印` (右下角优雅绘制 `Generated by AIO Hub`)
- **布局覆盖（对照系统 UI 偏好设置，支持临时覆盖）**：
  - **布局模式**：下拉选择器（`跟随系统` / `卡片模式` / `气泡模式`）。默认跟随系统 `uiPreferences.bubbleLayout.mode`，但允许截图时临时切换（如系统是卡片模式，截图表想用气泡风格，或反之）。
  - **气泡圆角**：滑块（`跟随系统` / `0px - 24px`）。默认跟随系统 `uiPreferences.bubbleLayout.borderRadius`。
  - **字体大小**：滑块（`跟随系统` / `12px - 20px`）。默认跟随系统 `uiPreferences.fontSize`，调小字体可在一张图内塞下更多内容。
- **折叠策略**：
  - 下拉选择器：跟随现状 / 跟随配置 / 强制展开 / 强制收起
- **卡片元素开关（对照系统显示设置）**：
  - `[x] 显示头像` (默认跟随系统 `uiPreferences.showAvatar`，支持临时开关)
  - `[x] 显示模型名称` (默认开启)
  - `[x] 显示时间戳` (默认开启)
  - `[x] 显示 Token 统计` (默认开启)

### 5.3 右下：实时预览区 (Right Panel)

占据剩余宽度（Flex 1），提供直观的视觉反馈：

- **实时渲染**：展示 [`ScreenshotRenderer.vue`](src/tools/llm-chat/components/screenshot/ScreenshotRenderer.vue) 渲染的干净、排版完全正确的独立 DOM 树。
- **交互控制**：支持鼠标滚轮缩放、鼠标拖拽查看，方便检查长图细节。
- **底部操作栏**：
  - 已选消息数量统计。
  - "复制到剪贴板"按钮（带 Loading 态）。
  - "保存图片"按钮（带 Loading 态）。

### 5.4 响应式自然适应 (Responsive Flow)

- **宽屏态 (Width >= 900px)**：
  - 布局为：`[ 顶部消息选择 ]` 下方并排 `[ 左配置 (320px) ]` + `[ 右预览 (Flex 1) ]`。
  - 预览区拥有充足的宽度，完美展示长图卡片。
- **窄屏态 (Width < 900px)**：
  - 布局自动流式坍缩为垂直排列：`[ 顶部消息选择 ]` -> `[ 中部配置面板 (100% 宽) ]` -> `[ 下部预览区 (固定高度 500px) ]`。
  - 保证在小屏幕或窄窗口下依然完全可用，不产生布局溢出。

---

## 6. 实施计划

### 阶段一：布局编排提取 + ScreenshotRenderer 开发（架构重构）⏳ 待实施

**目标**：提取 `useMessageLayout` composable，开发 `ScreenshotRenderer` 组件。

**新增文件**：

- `src/tools/llm-chat/composables/ui/useMessageLayout.ts`
- `src/tools/llm-chat/components/screenshot/ScreenshotRenderer.vue`

**修改文件**：

- `src/tools/llm-chat/components/message/MessageList.vue`（改为调用 composable）

**实现内容**：

1. **提取 `useMessageLayout`**：
   - 创建 composable，包含布局编排逻辑。
   - 输入参数：`messages: Ref<ChatMessageNode[]>`，`settings: Ref<any>`，`store: any`。
   - `MessageList.vue` 替换为调用此 composable，删除约 180 行重复布局计算代码。
2. **开发 `ScreenshotRenderer.vue`**：
   - 使用 `useMessageLayout` 编排布局。
   - 覆盖所有 4 种消息渲染分支（与 `MessageList.vue` 模板结构一致）。
   - 复用 `MessageList.vue` 的气泡模式 CSS 系统（相同的 DOM 结构和 class 名）。
   - `provide('screenshotMode', true)` 注入截图模式标志。
   - `provide('screenshotCollapseStrategy', strategyRef)` 注入折叠策略。
   - CSS `.screenshot-mode` class 全局抑制交互。
   - 禁用 `content-visibility: auto` 优化，全量展开渲染。
   - 暴露 `getMessageElements(): HTMLElement[]` 方法，供截图逻辑获取所有 `.message-slot` 节点。
3. **为现有组件添加 `screenshotMode` 支持**：
   - [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)：接收 `screenshotMode` prop，`v-if="!screenshotMode"` 隐藏 menubar。
   - [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)：接收 `screenshotMode` prop，隐藏编辑入口、复制按钮、流式指示器；通过 `inject('screenshotCollapseStrategy')` 控制 `LlmThinkNode` 折叠状态。
   - [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)：接收 `screenshotMode` prop，隐藏操作按钮；通过 `inject('screenshotCollapseStrategy')` 根据策略决定 `isCollapsed` 和 `argsCollapsedMap` 初始状态。
   - [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue)：接收 `screenshotMode` prop，隐藏编辑/删除按钮。
   - [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：`v-if="!screenshotMode"` 整体不渲染。
   - [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue)：根据模板配置控制性能指标和时间戳的显示。

---

### 阶段二：截图工具封装（基础建设）⏳ 待实施

**目标**：封装 `screenshotCapture.ts`，提供可复用的截图 + 拼接能力。

**新增文件**：

- `src/tools/llm-chat/utils/screenshotCapture.ts`

**实现内容**：

1. `captureElementAsCanvas(element, options?) -> Promise<HTMLCanvasElement>`：将单个消息节点转为 Canvas。
   - 固化富文本测试器的成功经验：在 `onCloneNode` 中复制 CSS 变量、强制 `content-visibility: visible`、注入排版保护样式（隐藏滚动条、强制 details 展开）。
2. `captureMessagesAndStitch(elements, config) -> Promise<HTMLCanvasElement>`：**V2 核心函数**，并发截取每个消息节点，纯 Canvas 2D 绘制背景/圆角/阴影/水印，精确拼接。
   - 并发截图：使用 `Promise.all` 并发对每个 `.message-slot` 调用 `captureElementAsCanvas`。
   - 纯 Canvas 2D 绘制背景：读取系统主题的 `--container-bg`，如果开启了"还原模糊背景"，在 Canvas 底层绘制一层带微弱毛玻璃质感的半透明遮罩。
   - 绘制外边框与投影：使用 `ctx.roundRect` 绘制圆角矩形背景，使用 `ctx.shadowColor`、`ctx.shadowBlur` 绘制阴影。
   - 绘制水印：使用 `ctx.fillText` 绘制极简水印。
   - 拼接消息 Canvas：逐个将消息 Canvas 绘制到大 Canvas 上，精确计算 `yOffset`。

---

### 阶段三：合并版截图分享弹窗开发（交互与视觉）⏳ 待实施

**目标**：开发完整的合并版 [`ShareScreenshotDialog.vue`](src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue) 弹窗。

**新增文件**：

- `src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue`

**实现内容**：

1. **弹窗骨架**：
   - 使用 [`BaseDialog.vue`](src/components/common/BaseDialog.vue) 作为弹窗骨架（`width="1200px"`, `height="85vh"`）。
2. **顶部消息选择区**：
   - 范围滑块：复用 [`ExportOptionsPanel.vue`](src/tools/llm-chat/components/export/ExportOptionsPanel.vue:29-60) 的 `el-slider range` + `el-input-number` 模式。
   - 快速筛选按钮（全选/清空/仅用户/仅助手）。
   - 折叠精细列表：使用 `el-collapse-transition` 包裹紧凑消息卡片列表。
   - 紧凑卡片：带复选框、头像、角色、单行摘要、悬浮完整预览。
3. **左下配置面板**：
   - 效果开关（还原模糊背景、外边框、投影、水印）。
   - 布局覆盖（布局模式、气泡圆角、字体大小，均默认跟随系统 [`settingsConfig.ts`](src/tools/llm-chat/components/settings/settingsConfig.ts)，支持临时覆盖）。
   - 折叠策略下拉选择器。
   - 卡片元素开关（头像默认跟随系统 `uiPreferences.showAvatar`，模型名/时间戳/Token 统计默认开启）。
4. **右下实时预览区**：
   - 包含 `ScreenshotRenderer` 组件。
   - 支持鼠标滚轮缩放、鼠标拖拽查看。
   - 底部操作栏：已选消息数量统计、"复制到剪贴板"与"保存图片"按钮。
5. **响应式 CSS 布局**：
   - 使用 Flexbox 配合 Media Query 实现宽屏并排、窄屏垂直排列的流式布局。

---

### 阶段四：截图生成引擎 + 保存/复制集成（功能闭环）⏳ 待实施

**目标**：实现完整的截图生成、保存、复制流程。

**新增文件**：

- `src/tools/llm-chat/composables/features/useScreenshotGenerator.ts`

**修改文件**：

- `src/tools/llm-chat/components/message/MessageMenubar.vue`（添加入口按钮）
- `src/tools/llm-chat/components/export/ExportBranchDialog.vue`（添加入口按钮）

**实现内容**：

1. **`useScreenshotGenerator.ts`**：
   - `generateScreenshot`：调用 `captureMessagesAndStitch` 执行并发截图 + Canvas 2D 绘制 + 拼接。
   - 进度报告：`onProgress` 回调更新 `progress` / `progressMessage`。
2. **"保存图片"**：
   - 调用 Tauri `save` 插件打开保存对话框。
   - 默认文件名：`${会话名称}-分享-${日期}.png`。
   - Canvas -> `canvasToUint8Array`（**使用纯 JS 解码 Base64，严禁使用 fetch(dataUrl) 以符合 CSP 规范**） -> `writeFile`。
3. **"复制到剪贴板"**：
   - Canvas -> Blob -> `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`。
   - 使用 `customMessage.success("图片已复制到剪贴板")` 提示。
4. **入口集成**：
   - [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：在"更多"下拉菜单中添加"创建消息截图"按钮（使用 `Camera` 图标），发射 `screenshot` 事件。
   - [`ExportBranchDialog.vue`](src/tools/llm-chat/components/export/ExportBranchDialog.vue)：在底部操作栏添加"生成分享长图"按钮，发射 `screenshot` 事件。

---

## 7. 关键架构决策记录

| 决策                 | 选择                                                             | 原因                                                                        |
| :------------------- | :--------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| 弹窗交互             | **单弹窗合并（上左右响应式布局）**                               | **V2 改进**：避免两段式弹窗的繁琐，将选择、配置、预览完美融合，窄屏自然坍缩 |
| 消息选择             | **滑块粗选 + 折叠列表精选**                                      | **V2 改进**：滑块快速拉取区间，紧凑折叠列表精细勾选，悬浮预览，极高效率     |
| 配置项来源           | **深度对照系统设置（`settingsConfig.ts`）**                      | **V2 改进**：布局模式、字体大小、圆角、头像显示均默认跟随系统，可临时覆盖   |
| 截图方式             | `modern-screenshot` DOM 转图片                                   | 纯前端，跨平台，无需 Rust                                                   |
| 长图生成策略         | **并发消息截图**（并发截取每个 `.message-slot`，Canvas 2D 拼接） | **V2 改进**：速度极快，绝对对齐，零渲染缺失，彻底摆脱虚拟滚动               |
| 视觉模板             | **极简效果开关**（还原模糊背景、外边框、投影、水印）             | **V2 改进**：砍掉花哨且不实用的渐变主题，回归实用，把弹窗空间留给大图预览   |
| 布局编排复用         | 提取 `useMessageLayout` composable                               | 避免重复实现，保证视觉一致性                                                |
| 交互抑制             | `screenshotMode` prop + CSS `.screenshot-mode`                   | 双重保障，prop 控制组件级行为，CSS 控制全局样式                             |
| `content-visibility` | 截图模式禁用                                                     | 避免视口外消息不渲染导致截图空白                                            |
| 毛玻璃效果           | 截图模式下替换为实色背景                                         | `modern-screenshot` 无法捕获 `backdrop-filter`                              |

### 0.6 V3 升级: 恢复 DOM 实时预览 + 底部缩略图小容器 + 完全手动生成 (2026-06-19)

**症状与痛点**:

1. **无法即时预览**: 之前的 V2 方案把 `ScreenshotRenderer` 放在离屏（Teleport 到 body, `position: fixed; left: -99999px`），右侧预览区只能显示生成的图片。用户修改左侧配置（如开关头像、调整字号、圆角等）时，无法获得瞬间的 DOM 渲染反馈，必须等待 modern-screenshot 完成。
2. **自动生成卡顿**: 弹窗一打开或配置一修改，就会通过 `useDebounceFn` 触发自动截图生成。这不仅极度消耗 CPU/GPU 资源，还会导致界面卡顿，且用户无法在生成前确认排版效果。
3. **气泡模式排版仍有问题**: 之前的 V2.1 修复只补齐了部分 ScreenshotRenderer 缺失的 bubble CSS（gap、avatar-outside 宽度扣减、border-radius 同步、右对齐镜像），实际渲染出来的气泡仍与 MessageList 主列表有视觉差异。

**重构设计 (V3) — 实施内容**:

1. **DOM 实时预览 (主视觉)**:
   - `ScreenshotPreviewPanel.vue` 把 `ScreenshotRenderer` 永久挂在主体的 `.preview-canvas-frame` 容器里，通过 `transform: translate(...) scale(...)` 实现 Ctrl/Cmd + 滚轮缩放 + 鼠标拖拽平移。
   - 用户修改任何配置，DOM 预览**瞬间响应**，**零延迟**。
   - `ScreenshotRenderer` 必须始终挂载（v-if 仅绑 `selectedCount > 0`），不能 display:none，否则 `getBoundingClientRect()` 返回 0，modern-screenshot 高度坍缩。

2. **底部缩略图小容器 (辅助)**:
   - 高度固定 138px 的 `.thumbnail-bar`，包含：
     - 加载态：旋转图标 + 进度 `x / y`
     - 已生成：缩略图，点击调用 `useImageViewer` 放大查看
     - 占位态：图标 + "尚未生成截图"提示
   - 缩略图与小容器四周留 8px 边距，配 0 4px 圆角与轻投影，与主区域视觉分离。

3. **完全手动生成**:
   - 工具栏右上角"生成截图"按钮是**唯一**触发 `regenerateScreenshot()` 的入口。
   - 移除 `useDebounceFn` 与所有 `watch` 触发的自动 generate。
   - 配置 / 选区变化的 watch **仅**清空 `lastCanvas.value` 和 `lastImageUrl.value`，让"复制到剪贴板"和"保存图片"按钮自动禁用（`:disabled="!lastCanvas || generating"`），状态栏显示"未生成 — 修改配置不会自动重新生成"。

4. **移除 Teleport 离屏**:
   - `ShareScreenshotDialog.vue` 不再包含 `<Teleport to="body">` 离屏 stage。
   - 截图时直接通过 `previewPanelRef.value.getMessageElements()` 获取预览面板中 `ScreenshotRenderer` 的 `.message-slot` 节点。
   - 预览源与截图源 100% 一致，永远不会再出现"预览是一回事，截出来是另一回事"。

5. **补齐气泡模式 CSS（V2.1 补丁补完）**:
   - `.messages-container` 默认 `gap: 8px`，`.messages-container.mode-bubble` 单独 `gap: 12px`（与 MessageList 保持一致）。
   - 外置头像模式：气泡 max-width 扣减 `var(--avatar-outside-size) + var(--avatar-outside-gap)`，居中消息不扣减。
   - 圆角同步：`.chat-message` / `.tool-call-message` / `.compression-message` / `.message-background-container` 及对应 `::after` 都使用 `var(--bubble-radius, 12px)`。
   - 外置头像透明占位 `pointer-events: none`，避免 hover 态。
   - 右对齐镜像：header-left `flex-direction: row-reverse`、header-right `margin-right: auto`、message-info 改为右对齐。
   - 工具调用头部同步镜像：`.tool-call-message` / `.tool-header` / `.tool-header .header-left` 全部 row-reverse。
   - 底部信息 `.message-meta` 跟随消息方向：左对齐靠左、右对齐靠右、`.error-info` 行布局镜像。

**关键文件改动**:

| 文件 | 改动 |
| :--- | :--- |
| `src/tools/llm-chat/components/screenshot/ScreenshotRenderer.vue` | 补齐气泡模式 gap / avatar-outside 宽度扣减 / 圆角同步 / 右对齐镜像 / message-meta 对齐 5 处 CSS |
| `src/tools/llm-chat/components/screenshot/ScreenshotPreviewPanel.vue` | 整体重写：DOM 预览 + 缩略图小容器 + 工具栏缩放 + 底部状态/操作栏；expose `getMessageElements` |
| `src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue` | 移除 `<Teleport>` 离屏 stage、移除 `useDebounceFn` 自动重生成、移除打开时自动 regenerate；改为手动触发 + 配置变化仅清空结果 |

**验收**:
- [x] `bun run check:frontend` 通过
- [x] `bun run lint` 通过（0 errors / 0 warnings）
- [ ] 真机 Tauri 窗口验证（气泡模式排版、缩略图生成、配置清空交互）

---

### 0.5 V2.3 修复:显示元素开关无效 + CSP `blob:` 拦截 (2026-06-18)

**症状 1 — 显示元素开关无效**: 用户在截图对话框中将所有"显示元素"开关（头像、模型信息、时间戳、Token 统计、字数统计、性能指标）全部关闭，但实时预览区仍然显示所有信息，开关无任何效果。

**根因**: 截图模式下各元素的 `v-if` 条件仍然基于系统设置（`settings.uiPreferences`），而非截图对话框的 `elementToggles` 覆盖值。例如：

- `MessageHeader.vue` 的 `shouldShowSubtitle` 只看 `settings.uiPreferences.showModelInfo`
- `MessageHeader.vue` 的性能指标只看 `settings.uiPreferences.showPerformanceMetrics`
- `MessageHeader.vue` 的时间戳只看 `settings.uiPreferences.showTimestamp`
- `MessageContent.vue` 的 `showMeta` 只看 `settings.uiPreferences.showTokenCount/showCharCount`
- `ChatMessage.vue` 调用 `MessageHeader` 时未传递 `screenshotMode` prop

这导致即使截图开关关闭，元素仍然被 `v-if` 渲染出来，CSS 隐藏类（`.hide-avatar` 等）无法作用于不存在的 DOM。

**修复**:

- `MessageHeader.vue`: 当 `screenshotMode=true` 时，忽略 `settings.uiPreferences.showModelInfo/showPerformanceMetrics/showTimestamp`，让副标题/性能指标/时间戳始终渲染，由 CSS 控制可见性
- `MessageContent.vue`: 当 `screenshotMode=true` 时，让 `.message-meta` 始终渲染，由 CSS 控制可见性
- `ChatMessage.vue`: 将 `screenshotMode` prop 正确传递给 `MessageHeader`
- `ScreenshotRenderer.vue`: 修正 CSS 选择器，使用 `data-meta-type` 精确区分 Token 统计和字数统计

**症状 2 — 卡片模式下头像无法隐藏**: 关闭"显示头像"开关后，卡片模式（非气泡模式）下头像仍然显示。

**根因**: 卡片模式没有外置头像概念，头像在 `MessageHeader` 内部，由 `shouldHideHeaderAvatar` 控制。而 `shouldHideHeaderAvatar` 来自 `useMessageLayout`，它基于系统设置而非截图覆盖值。

**修复**:

- `ScreenshotRenderer.vue`: 新增 `screenshotHideHeaderAvatar` computed，当 `elementOverrides.showAvatar=false` 时强制返回 `true`
- 模板中两处 `ChatMessage` / `MessageHeader` 调用均使用 `screenshotHideHeaderAvatar` 替代 `shouldHideHeaderAvatar`
- 新增 CSS 兜底选择器 `.hide-avatar :deep(.message-header .header-left .avatar/tool-avatar)` 隐藏 header 内头像

**症状 3 — CSP `blob:` 拦截报错**: 控制台频繁出现 `Connecting to 'blob:<URL>' violates Content Security Policy` 错误，截图图片加载失败。

**根因**: `modern-screenshot` 库在 `domToCanvas` 过程中会用 `fetch(blob:...)` 内联处理图片，但 `index.html` 的 CSP `connect-src` 指令未包含 `blob:` 协议。

**修复**:

- `index.html`: 在 CSP `connect-src` 指令末尾添加 `blob:`

**重要原则 (后续维护)**:

- 任何基于 `settings.uiPreferences` 的 `v-if` 控制显示的元素，如果在截图模式下需要支持开关覆盖，必须增加 `screenshotMode` 分支让元素始终渲染，由 CSS 类控制可见性。
- `MessageHeader` 接收 `screenshotMode` prop 后必须实际使用，不能仅作为标记。
- CSS 隐藏类需要同时覆盖外置头像和 header 内头像两种场景。

---

### 0.4 V2.2 修复:卡片内消息偏移 + 关闭水印后高度坍缩 (2026-06-18)

**症状 1 — 位置偏移**: 用户报告截图渲染效果与 DOM 预览存在偏差, 消息气泡在卡片内左右不对称, 右、下两侧看起来被裁切/溢出 12px.

**根因**: `screenshotCapture.ts` 在 `drawImage` 时使用了

```ts
ctx.drawImage(msgCanvas, cardX + padding * 0.5, y, captureWidth, h);
let y = cardY + padding * 0.5;
```

`padding * 0.5` (= 12) 让消息在 card 内左偏 12px, 但消息本身宽度是 720px (cardW), 画到 x=36 之后就溢出 card 右边缘 12px. y 方向同理: 第一条消息从 y=36 开始, 累加后最后一条消息底边在 `36 + sum + 12*(n-1)`, 比 card 底 (24 + cardH = 24 + sum + 12\*(n-1)) 多 12px, 溢出 card 下边缘 12px. 形成"左上缩进 12px、右下溢出 12px"的不对称.

**修复**: 改为

```ts
let y = cardY;
ctx.drawImage(msgCanvas, cardX, y, cardW, h);
```

消息与 card 边缘严丝合缝, cardW 直接复用, 避免 magic number.

**症状 2 — 关闭水印后高度坍缩**: 切换"附加极简水印"开关后, 截图尺寸从 ~1141px 坍缩为 60px, footer 显示 `已生成截图 (768 × 60 px)`.

**根因**: `<ScreenshotRenderer>` 与图片预览互斥使用 `v-show`, `switchToImageTab` 先把 `activeTab = "image"` (renderer 变 `display: none`), 再调用 `generateScreenshotImage`. 在 `display: none` 状态下, `.message-slot` 的 `getBoundingClientRect()` 全部返回 0, `captureElementAsCanvas` 算出的 `captureHeight` 为 0, 拼接出的 canvas 高度只剩 `padding*2 + 0 + 0 ≈ 48–60px`. 即水印开关触发了 `effects` 变更 → watch 清空 `lastImageUrl` 并切回 DOM tab, 用户再点"截图效果"tab 复现了这条隐藏路径.

**修复**:

- `ShareScreenshotDialog.vue` 模板: `<ScreenshotRenderer>` 改为 `v-if="selectedMessages.length > 0"` 始终挂载 (不再受 `activeTab` 控制), 图片预览改为 `v-if` 渲染的绝对定位 overlay 覆盖在 renderer 之上, 保证 `.message-slot` 在任意 tab 都有正确的布局尺寸供截图工具读取.
- `switchToImageTab`: 调换顺序, 先 `await generateScreenshotImage()` 再 `activeTab.value = "image"`, 即便有外部代码走老路径也不会触发坍缩.
- `useScreenshotGenerator.generate`: 仍然保持顶层 `width` 优先, 不会因 overlay 改造失效.

**重要原则 (后续维护)**:

- 在大画布中拼接消息时, 始终用 `cardX / cardY / cardW / cardH` 描述消息区, 不要混用 `padding * 0.5` 之类的局部偏移, 容易出现一边溢出.
- `<ScreenshotRenderer>` 必须保持挂载, **不要** 用 `v-show` / `v-if` 在 image tab 隐藏它, 否则截图前的 `getBoundingClientRect` 会得到 0 高度, 任何后续配置变更都会触发坍缩.
- 任何让 renderer 短暂离开布局的改造 (display:none / visibility:hidden / position:fixed 离屏), 都必须先确认截图前的 `getBoundingClientRect()` 仍然返回正确尺寸.
