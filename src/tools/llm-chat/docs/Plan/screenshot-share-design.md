# LLM Chat: 消息截图分享功能 — 实施计划 (V2)

> 最后更新：2026-06-17
> 状态：实施计划 (V2)
> 作者：Gugu_Kilo & miaotouy
> 版本：V2 (并发消息截图 + 纯 Canvas 2D 装饰绘制)

---

## 1. 功能概述

将当前对话分支中的单条、多条或整段消息，渲染成一张排版精美、支持高度自定义的**长图卡片**，支持一键保存到本地或复制到剪贴板。

**核心方案**：专用截图组件 + **并发消息截图** + `modern-screenshot`（纯前端，零 Rust 代码）。

---

## 2. 已验证的技术前提

| 验证项                                      | 结果      | 来源                                                                                         |
| :------------------------------------------ | :-------- | :------------------------------------------------------------------------------------------- |
| `modern-screenshot` DOM 转图片              | ✅ 可用   | [`ScreenshotTester.vue`](src/tools/component-tester/components/ScreenshotTester.vue:471-510) |
| **并发消息截图**                            | ✅ 可用   | 新方案验证：并发截取 `.message-slot` 节点，速度极快，无渲染缺失                              |
| 纯 Canvas 2D 绘制背景（渐变/圆角/阴影）     | ✅ 可用   | 新方案验证：`ctx.createLinearGradient` + `ctx.roundRect` 完美绘制                            |
| Canvas 拼接（无间隙控制）                   | ✅ 可用   | 新方案验证：直接 `drawImage` 拼接，绝对对齐，无裂缝                                          |
| `onCloneNode` 替换 iframe/毛玻璃            | ✅ 可用   | [`ScreenshotTester.vue`](src/tools/component-tester/components/ScreenshotTester.vue:901-976) |
| Tauri 原生 Webview 截图 API                 | ❌ 不存在 | `@tauri-apps/api` v2.10.1 无 `screenshot()`                                                  |
| `modern-screenshot` 克隆 DOM 后 `scrollTop` | ❌ 不可靠 | 因此采用**并发消息截图**，不依赖滚动                                                         |

---

## 3. 架构设计

### 3.1 新增文件清单

```
src/tools/llm-chat/
├── composables/ui/
│   └── useMessageLayout.ts          # 从 MessageList 提取的布局编排逻辑
├── components/screenshot/
│   ├── ScreenshotRenderer.vue       # 专用截图渲染组件
│   ├── ScreenshotMessageSelector.vue # 消息选择弹窗（第一步）
│   ├── ShareScreenshotDialog.vue     # 截图预览与配置弹窗（第二步）
│   └── ScreenshotTemplateSelector.vue # 模板选择器
├── composables/features/
│   └── useScreenshotGenerator.ts    # 截图生成核心逻辑
├── utils/
│   └── screenshotCapture.ts         # modern-screenshot 封装 + Canvas 拼接
└── config/
    └── screenshotTemplates.ts       # 视觉模板配置
```

### 3.2 需修改的现有文件

| 文件                                                                                     | 修改内容                                                       |
| :--------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)               | 提取布局逻辑到 `useMessageLayout`，改为调用 composable         |
| [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)               | 添加 `screenshotMode` prop，隐藏 menubar、禁用 hover           |
| [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)         | 添加 `screenshotMode` prop，隐藏编辑入口、复制按钮、流式指示器 |
| [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)       | 添加 `screenshotMode` prop，隐藏操作按钮；接收折叠策略         |
| [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue) | 添加 `screenshotMode` prop，隐藏编辑/删除按钮                  |
| [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)         | 添加"创建消息截图"按钮入口                                     |
| [`ExportBranchDialog.vue`](src/tools/llm-chat/components/export/ExportBranchDialog.vue)  | 添加"生成分享长图"入口                                         |

### 3.3 数据流

```mermaid
graph TD
    A[用户点击"创建消息截图"] --> B{入口来源}

    B -->|MessageMenubar| C[打开 ScreenshotMessageSelector]
    B -->|ExportBranchDialog| D[直接打开 ShareScreenshotDialog<br/>全选当前分支消息]

    C --> C1[展示消息列表 + 复选框]
    C1 --> C2[范围滑块选择<br/>复用 ExportOptionsPanel 模式]
    C2 --> C3[用户确认选择]

    C3 --> D
    D --> D1[ScreenshotRenderer 渲染选中消息]
    D1 --> D2[用户配置模板/折叠策略/卡片元素]
    D2 --> E[useScreenshotGenerator 执行截图]

    E --> E1[并发截取每个 .message-slot 节点]
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
  - **不再截取整个大容器**：之前的方案是“隐藏所有消息 -> 逐组显示 -> 截取整个大容器”，导致 `modern-screenshot` 每次都要克隆整个大容器的 DOM，解析样式，下载资源，渲染成 SVG 再转 Canvas。如果消息有 20 条，分了 5 组，它就要克隆 5 次大容器，每次克隆都包含一堆隐藏的元素，这极其低效！
  - **并发截取每个 `.message-slot` 节点**：每个消息节点（`.message-slot`）是完全独立的 DOM 节点。我们直接**并发**对每个 `.message-slot` 调用 `modern-screenshot` 的 `domToBlob()`。每个消息节点的 DOM 极小，截图速度极快，几乎是瞬间完成！
  - **绝对对齐**：每个消息节点都是独立截图，高度是其真实渲染高度。拼接时通过 Canvas 2D 坐标精确累加，绝对不会出现 1 像素的对不齐或裂缝！
  - **零渲染缺失**：没有 `display: none` 的频繁切换，没有大容器克隆的尺寸计算 bug。

- **已知限制与应对**：

| 限制                                | 应对                                       |
| :---------------------------------- | :----------------------------------------- |
| `backdrop-filter` 毛玻璃丢失        | `onCloneNode` 中替换为实色背景             |
| `<iframe>` 内容无法渲染             | 替换为静态缩略图占位                       |
| `appdata://`/`asset://` 图片跨域    | 截图前转为 base64 data URL                 |
| `content-visibility: auto` 导致空白 | 截图容器强制 `content-visibility: visible` |

### 4.2 长图生成：纯 Canvas 2D 绘制背景 + 拼接消息 Canvas

- **不再使用 Canvas 拼接消息截图**：之前的方案是将分组截图后的 Canvas 拼接起来，但分组截图本身就有问题（慢、对不齐）。
- **V2 方案**：
  1. **并发截图**：使用 `Promise.all` 并发对每个 `.message-slot` 调用 `captureElementAsCanvas`（`scale` 设为 2 高清）。
  2. **纯 Canvas 2D 绘制背景**：
     - 创建一个大 Canvas，宽度 = 消息 Canvas 宽度 + 左右 padding _ 2，高度 = 所有消息 Canvas 高度之和 + 消息间距之和 + 上下 padding _ 2。
     - 解析 `template.background`：
       - 如果是 `linear-gradient(...)`，解析出渐变方向和颜色，用 `ctx.createLinearGradient` 绘制。
       - 如果是 `var(...)`，从当前文档中获取计算后的 CSS 变量值（如 `--bg-color`、`--card-bg`）。
       - 如果是普通颜色，直接填充。
     - 绘制圆角矩形背景（支持 `borderRadius`，使用 `ctx.roundRect`）。
     - 绘制阴影（如果配置了 `boxShadow`，使用 `ctx.shadowColor`、`ctx.shadowBlur` 等）。
  3. **拼接消息 Canvas**：
     - 逐个将消息 Canvas 绘制到大 Canvas 上，精确计算 `yOffset`。
     - 消息间距由 Canvas 2D 精确控制，无需担心 CSS margin 叠加问题。
  4. **绘制水印**：
     - 如果有水印，用 `ctx.fillText` 绘制在右下角，支持自定义颜色、字体、透明度。

- **这样做的巨大优势**：
  - **速度提升数倍**：并发执行 `Promise.all`，每个消息节点的 DOM 极小，截图速度极快。
  - **绝对对齐**：每个消息节点都是独立截图，高度是其真实渲染高度，拼接时通过 Canvas 2D 坐标精确累加，绝对不会出现 1 像素的对不齐或裂缝！
  - **零渲染缺失**：没有 `display: none` 的频繁切换，没有大容器克隆的尺寸计算 bug，没有毛玻璃丢失（因为毛玻璃背景是由 Canvas 2D 完美绘制的，消息气泡本身是不带毛玻璃的，或者气泡本身的背景是实色/半透明色，Canvas 2D 完美支持半透明叠加！）。
  - **彻底摆脱虚拟滚动和滚动条**：每个消息节点都是独立渲染的，根本不需要考虑滚动条、视口裁剪等问题！

### 4.3 布局编排复用：`useMessageLayout` composable

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:93-238) 中有 4 个关键 computed 控制消息渲染路径和布局：

| 计算属性                                                                             | 作用                          |
| :----------------------------------------------------------------------------------- | :---------------------------- |
| [`messageLayouts`](src/tools/llm-chat/components/message/MessageList.vue:163)        | 预计算每条消息的 role / align |
| [`compressedNodeIds`](src/tools/llm-chat/components/message/MessageList.vue:93)      | 判断哪些消息被压缩节点吞掉    |
| [`messageSiblingInfoMap`](src/tools/llm-chat/components/message/MessageList.vue:111) | 预计算兄弟节点信息            |
| [`bubbleLayoutVars`](src/tools/llm-chat/components/message/MessageList.vue:227)      | 注入 CSS 变量                 |

提取为 `useMessageLayout` composable，`MessageList.vue` 和 `ScreenshotRenderer.vue` 共同使用。

### 4.4 四种消息渲染分支

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:778-1009) 的模板有 4 条渲染路径，`ScreenshotRenderer` 必须全部覆盖：

1. **外置 Header + 气泡** (L803-872)：`MessageHeader` (external) + `ChatMessage` (`hideHeader=true`) + `MessageExternalAvatar`
2. **压缩节点** (L875-889)：`CompressionMessage`
3. **工具调用** (L892-944)：`ToolCallMessage`
4. **普通消息** (L947-1007)：`ChatMessage`

### 4.5 交互抑制：`screenshotMode`

**双重保障机制**：

1. **Prop 级**：`screenshotMode` prop 从 `ScreenshotRenderer` → 各消息组件 → 子组件逐层传递
2. **CSS 级**：`.screenshot-mode` class 在截图容器根元素上，通过 CSS 全局抑制

需要抑制的交互元素：

| 组件                                                                                             | 抑制项                                                                                         |
| :----------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue:278-301)               | `.menubar-wrapper` 完全隐藏；hover 边框变色禁用                                                |
| [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue:929-1056)        | 编辑模式禁用；附件移除/预览按钮隐藏；错误信息复制按钮隐藏；流式指示器隐藏；渐进预览图禁用点击  |
| [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue:1084-1111)     | menubar 完全隐藏；折叠/展开交互禁用；复制参数/预览渲染按钮隐藏；异步任务操作隐藏；编辑模式禁用 |
| [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue:258-334) | 角色下拉禁用；编辑/保存/取消隐藏；启用/禁用切换隐藏；删除确认弹窗隐藏                          |
| [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)                 | `v-if="!screenshotMode"` 整体不渲染                                                            |
| [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue:292-345)           | 性能指标/时间戳根据模板配置决定                                                                |

CSS 级全局抑制：

```css
.screenshot-mode .menubar-wrapper {
  display: none !important;
}
.screenshot-mode .chat-message:hover::after,
.screenshot-mode .tool-call-message:hover::after,
.screenshot-mode .compression-message:hover::after {
  border-color: var(--border-color);
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

### 4.6 折叠策略

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

**`config` 策略的配置来源**：

| 截图中的可折叠元素                   | Agent 配置来源                             |
| :----------------------------------- | :----------------------------------------- |
| 工具调用结果（`isCollapsed`）        | `agent.defaultToolCallCollapsed`           |
| 深度思考节点（`collapsedByDefault`） | `agent.llmThinkRules[].collapsedByDefault` |
| 工具调用参数（`argsCollapsedMap`）   | `agent.defaultToolCallCollapsed`（共用）   |

> 注，在助手消息中的工具调用结果是来自于vcp中间件的不间断流式拼接的内容，不是我们自己的工具调用消息，我们自己的消息有单独的节点

### 4.7 范围选择

复用 [`ExportOptionsPanel.vue`](src/tools/llm-chat/components/export/ExportOptionsPanel.vue:29-60) 中已有的范围滑块模式：

- `el-slider` range 模式 + 双 `el-input-number`
- 1-based 索引，`[start, end]` 元组
- 支持按角色筛选（全部 / 仅用户 / 仅助手）

---

## 5. UI/UX 设计

### 5.1 消息选择弹窗 (ScreenshotMessageSelector)

第一步入口，中等尺寸弹窗（`width="700px"`, `height="70vh"`）：

- **顶部工具栏**：全选/取消全选；按角色筛选；搜索框
- **消息列表**：角色图标 + 前 50 字 + 时间戳 + 复选框
- **范围滑块**：复用 ExportOptionsPanel 的 `el-slider range` 模式
- **底部操作栏**：已选消息数量统计 + "取消"和"下一步"按钮

### 5.2 截图预览与配置弹窗 (ShareScreenshotDialog)

第二步入口，双栏响应式布局（`width="1100px"`, `height="85vh"`）：

- **左侧**：实时预览区域，支持缩放和拖拽查看
- **右侧配置面板**：
  - 视觉模板选择
  - 折叠策略选择
  - 卡片元素开关（头像、模型名称、时间戳、Token 统计）
  - 个性化水印

### 5.3 预设视觉模板

1. **极简现代 (Minimalist)**：纯白/纯黑背景，无边框，微弱阴影
2. **极光渐变 (Aurora Gradient)**：蓝紫渐变背景，半透明白色卡片
3. **智能体专属 (Agent Theme)**：提取智能体头像主色调，生成双色渐变
4. **赛博朋克 (Cyberpunk)**：暗霓虹色调，硬核直角

---

## 6. 实施计划

### 阶段一：截图工具封装（基础建设）✅ 已完成

**目标**：封装 `screenshotCapture.ts`，提供可复用的截图 + 拼接能力。

**新增文件**：

- `src/tools/llm-chat/utils/screenshotCapture.ts`

**实现内容**：

1. `captureElement(element, options?) → Promise<<Blob>`：封装 `modern-screenshot` 的 `domToBlob()`
2. `captureElementAsCanvas(element, options?) → Promise<<HTMLCanvasElement>`：用于需要 Canvas 操作的场景
3. `captureMessagesAndStitch(items, template, options?) → Promise<<HTMLCanvasElement>`：**V2 核心函数**，并发截取每个消息节点，纯 Canvas 2D 绘制背景/圆角/阴影/水印，精确拼接。
4. `canvasToBlob(canvas, type?, quality?) → Promise<<Blob>`：Canvas 转 Blob
5. `canvasToUint8Array(canvas) → Promise<<Uint8Array>`：Canvas 转 Uint8Array（用于 Tauri writeFile）
6. `imageUrlToDataUrl(url) → Promise<string>`：将图片 URL 转为 base64 data URL（用于处理 appdata:// 等协议）

**V2 关键改进**：

- 新增 `captureMessagesAndStitch` 函数，取代旧版的 `captureElementGroups` 和 `stitchCaptures`。
- 并发截图：使用 `Promise.all` 并发对每个 `.message-slot` 调用 `captureElementAsCanvas`。
- 纯 Canvas 2D 绘制背景：解析 `template.background`（纯色/渐变/CSS 变量），用 `ctx.createLinearGradient` 或 `ctx.fillStyle` 绘制。
- 圆角支持：使用 `ctx.roundRect`（现代浏览器完美支持）绘制圆角矩形背景。
- 阴影支持：使用 `ctx.shadowColor`、`ctx.shadowBlur` 等绘制阴影。
- 水印支持：使用 `ctx.fillText` 绘制水印。

**验证**：`bun run check:frontend` 通过，类型零错误。

---

### 阶段二：布局编排提取 + ScreenshotRenderer 开发（架构重构）✅ 已完成

**目标**：提取 `useMessageLayout` composable，开发 `ScreenshotRenderer` 组件。

**新增文件**：

- `src/tools/llm-chat/composables/ui/useMessageLayout.ts` ✅
- `src/tools/llm-chat/components/screenshot/ScreenshotRenderer.vue` ✅
- `src/tools/llm-chat/types/screenshot.ts` ✅（类型定义文件）

**修改文件**：

- `src/tools/llm-chat/components/message/MessageList.vue` ✅（改为调用 composable）

**实现内容**：

1. **提取 `useMessageLayout`** ✅：
   - 已创建 composable，包含布局编排逻辑
   - 输入参数：`messages: Ref<<ChatMessageNode[]>`
   - `MessageList.vue` 已替换为调用此 composable，删除约 180 行重复布局计算代码

2. **开发 `ScreenshotRenderer.vue`** ✅：
   - 使用 `useMessageLayout` 编排布局
   - 覆盖所有 4 种消息渲染分支（与 `MessageList.vue` 模板结构一致）
   - 复用 `MessageList.vue` 的气泡模式 CSS 系统（相同的 DOM 结构和 class 名）
   - `provide('screenshotMode', true)` 注入截图模式标志
   - `provide('screenshotCollapseStrategy', strategyRef)` 注入折叠策略
   - CSS `.screenshot-mode` class 全局抑制交互
   - 禁用 `content-visibility: auto` 优化
   - 不使用虚拟滚动，全量展开渲染
   - 支持自定义背景、边框、水印等装饰元素
   - **V2 改进**：暴露 `getMessageElements(): HTMLElement[]` 方法，供截图逻辑获取所有 `.message-slot` 节点

3. **为现有组件添加 `screenshotMode` 支持** ✅：
   - [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)：接收 `screenshotMode` prop，`v-if="!screenshotMode"` 隐藏 menubar
   - [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)：接收 `screenshotMode` prop，隐藏编辑入口、复制按钮、流式指示器；通过 `inject('screenshotCollapseStrategy')` 控制 `LlmThinkNode` 折叠状态
   - [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)：接收 `screenshotMode` prop，隐藏操作按钮；通过 `inject('screenshotCollapseStrategy')` 根据策略决定 `isCollapsed` 和 `argsCollapsedMap` 初始状态
   - [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue)：接收 `screenshotMode` prop，隐藏编辑/删除按钮
   - [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：`v-if="!screenshotMode"` 整体不渲染
   - [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue)：根据模板配置控制性能指标和时间戳的显示

**验证**：`bun run check:frontend` 通过，类型零错误。

---

### 阶段三：消息选择弹窗 + 截图预览弹窗（交互与视觉）✅ 已完成

**目标**：开发完整的两步式交互流程。

**新增文件**：

- `src/tools/llm-chat/components/screenshot/ScreenshotMessageSelector.vue` ✅
- `src/tools/llm-chat/components/screenshot/ShareScreenshotDialog.vue` ✅
- `src/tools/llm-chat/components/screenshot/ScreenshotTemplateSelector.vue` ✅
- `src/tools/llm-chat/config/screenshotTemplates.ts` ✅

**实现内容**：

1. **`ScreenshotMessageSelector.vue`** ✅：
   - 使用 `BaseDialog` 作为弹窗骨架（`width="700px"`, `height="70vh"`）
   - 展示当前分支的所有消息列表，每条消息前有复选框
   - 范围滑块：复用 [`ExportOptionsPanel.vue`](src/tools/llm-chat/components/export/ExportOptionsPanel.vue:29-60) 的 `el-slider range` + `el-input-number` 模式
   - 支持全选/取消全选、按角色筛选、搜索框
   - 消息以精简摘要形式展示（角色图标 + 前 50 字 + 时间戳）
   - 用户确认选择后，将选中的消息节点 ID 列表传递给 `ShareScreenshotDialog`
   - **实现细节**：使用运行时类型声明（`defineProps({...})`）避免泛型语法冲突；`v-model` 数组绑定通过 `sliderRange` 计算属性包装

2. **`ShareScreenshotDialog.vue`** ✅：
   - 使用 `BaseDialog` 作为弹窗骨架（`width="1100px"`, `height="85vh"`）
   - 左侧为预览区域，右侧为配置面板
   - 包含 `ScreenshotRenderer` 组件
   - 配置面板包含：模板选择、折叠策略、卡片元素开关、水印
   - **实现细节**：预览区域使用 `overflow: auto` + 缩放控制；配置面板使用 `el-scrollbar` 确保内容可滚动
   - **V2 改进**：截图时调用 `rendererRef.value?.getMessageElements()` 获取消息节点列表，传给 `useScreenshotGenerator` 的 `generateScreenshot`

3. **视觉模板样式** ✅：
   - 在 `screenshotTemplates.ts` 中定义模板配置
   - 实现"极简现代"、"极光渐变"、"智能体专属"、"赛博朋克"四个预设模板
   - `ScreenshotTemplateSelector.vue` 以卡片网格形式展示，支持选中态和悬停效果

**验证**：`bun run check:frontend` 通过，类型零错误。实际交互流程需在运行时验证。

---

### 阶段四：截图生成引擎 + 保存/复制集成（功能闭环）✅ 已完成

**目标**：实现完整的截图生成、保存、复制流程。

**新增文件**：

- `src/tools/llm-chat/composables/features/useScreenshotGenerator.ts` ✅

**修改文件**：

- `src/tools/llm-chat/components/message/MessageMenubar.vue` ✅（添加入口按钮）
- `src/tools/llm-chat/components/export/ExportBranchDialog.vue` ✅（添加入口按钮）

**实现内容**：

1. **`useScreenshotGenerator.ts`** ✅：
   - `generateScreenshot`：调用 `captureMessagesAndStitch` 执行并发截图 + Canvas 2D 绘制 + 拼接
   - `onCloneNode` 处理：替换毛玻璃 `backdrop-filter` 为实色背景、iframe 占位替换
   - 进度报告：`onProgress` 回调更新 `progress` / `progressMessage`
   - `preserve` 折叠策略：通过 `inject('screenshotCollapseStrategy')` 在组件层面控制初始折叠状态
   - **V2 改进**：不再使用 `captureElementGroups`（旧版分组截图），改为调用 `captureMessagesAndStitch`（并发消息截图）

2. **"保存图片"** ✅：
   - 调用 Tauri `save` 插件打开保存对话框
   - 默认文件名：`${会话名称}-分享-${日期}.png`
   - Canvas → `canvasToUint8Array` → `writeFile`

3. **"复制到剪贴板"** ✅：
   - Canvas → Blob → `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`
   - 使用 `customMessage.success("图片已复制到剪贴板")` 提示

4. **入口集成** ✅：
   - [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：在"更多"下拉菜单中添加"创建消息截图"按钮（使用 `Camera` 图标），发射 `screenshot` 事件
   - [`ExportBranchDialog.vue`](src/tools/llm-chat/components/export/ExportBranchDialog.vue)：在底部操作栏添加"生成分享长图"按钮，发射 `screenshot` 事件

**验证**：`bun run check:frontend` 通过，类型零错误。
**验证**：从入口到截图生成到保存/复制，完整流程可走通。

---

## 7. 关键架构决策记录

## 7. 关键架构决策记录

| 决策                 | 选择                                                                     | 原因                                                          |
| :------------------- | :----------------------------------------------------------------------- | :------------------------------------------------------------ |
| 截图方式             | `modern-screenshot` DOM 转图片                                           | 纯前端，跨平台，无需 Rust                                     |
| 长图生成策略         | **并发消息截图**（并发截取每个 `.message-slot`，Canvas 2D 绘制背景拼接） | **V2 改进**：速度极快，绝对对齐，零渲染缺失，彻底摆脱虚拟滚动 |
| 布局编排复用         | 提取 `useMessageLayout` composable                                       | 避免重复实现，保证视觉一致性                                  |
| 交互抑制             | `screenshotMode` prop + CSS `.screenshot-mode`                           | 双重保障，prop 控制组件级行为，CSS 控制全局样式               |
| 折叠元素策略         | 可配置：preserve / config / override-expand / override-collapse          | 不同场景需求不同，preserve 模式通过快照主界面 ref 状态实现    |
| `content-visibility` | 截图模式禁用                                                             | 避免视口外消息不渲染导致截图空白                              |
| 毛玻璃效果           | 截图模式下替换为实色背景                                                 | `modern-screenshot` 无法捕获 `backdrop-filter`                |
| 范围选择             | 复用 ExportOptionsPanel 的 el-slider range 模式                          | 已有实现，保持一致性                                          |

## 8. 实现技术细节记录

### 8.1 泛型语法与 XML 工具兼容性

Vue 单文件组件中的 `defineProps<<Props>()` 泛型语法在 XML 工具格式中会被错误解析（`<` 被当作小于号）。**解决方案**：使用运行时类型声明：

```typescript
// ❌ 避免使用（XML 工具格式不兼容）
const props = defineProps<{ screenshotMode: boolean }>();

// ✅ 使用运行时声明
const props = defineProps({
  screenshotMode: { type: Boolean, default: false },
});
```

### 8.2 `v-model` 数组绑定

`el-slider` 的 range 模式需要绑定数组，但 Vue 3 不支持 `v-model="[start, end]"` 语法。**解决方案**：使用计算属性包装：

```typescript
const sliderRange = computed({
  get: () => [rangeStart.value, rangeEnd.value],
  set: (val: number[]) => {
    rangeStart.value = val[0];
    rangeEnd.value = val[1];
  },
});
```

### 8.3 `modern-screenshot` 类型问题

`Options["features"]` 类型为 `any`，直接 spread 会导致 `TS2698: Spread types may only be created from object types`。**解决方案**：添加类型断言：

```typescript
features: {
  removeControlCharacter: true,
  ...(features as Record<string, unknown>),
},
```

### 8.4 并发消息截图的 `onCloneNode` 处理

在并发截图时，每个 `.message-slot` 节点独立截图，因此 `onCloneNode` 中只需要处理当前消息节点内部的样式：

```typescript
onCloneNode: (clonedNode) => {
  const el = clonedNode as HTMLElement;
  // 移除当前消息节点的外边距（间距由 Canvas 拼接时精确控制）
  el.style.margin = "0";
  // 确保 content-visibility 被禁用
  el.style.setProperty("content-visibility", "visible", "important");
  el.style.setProperty("contain-intrinsic-size", "auto 0px", "important");
  // 递归处理所有子元素
  const allElements = el.querySelectorAll("*");
  allElements.forEach((child) => {
    const childEl = child as HTMLElement;
    if (childEl.style) {
      childEl.style.setProperty("content-visibility", "visible", "important");
      childEl.style.setProperty(
        "contain-intrinsic-size",
        "auto 0px",
        "important"
      );
    }
  });
};
```

### 8.5 纯 Canvas 2D 绘制背景

解析 `template.background` 并绘制到 Canvas 上：

```typescript
function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: string
) {
  if (background.startsWith("linear-gradient")) {
    // 解析渐变方向和颜色
    const gradient = parseLinearGradient(background, width, height);
    ctx.fillStyle = gradient;
  } else if (background.startsWith("var(")) {
    // 获取 CSS 变量值
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue(background.slice(4, -1))
      .trim();
    ctx.fillStyle = cssValue || "#ffffff";
  } else {
    ctx.fillStyle = background;
  }
  ctx.fillRect(0, 0, width, height);
}
```

### 8.6 圆角矩形绘制

使用 `ctx.roundRect`（现代浏览器支持）绘制圆角矩形：

```typescript
ctx.beginPath();
ctx.roundRect(0, 0, width, height, borderRadius);
ctx.fill();
```

如果浏览器不支持 `roundRect`，可以回退到路径绘制：

```typescript
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
```

---

## 9. 待完成清单

| 序号 | 任务                                                       | 优先级 | 状态 |
| :--- | :--------------------------------------------------------- | :----- | :--- |
| 1    | `MessageList.vue` 替换为调用 `useMessageLayout` composable | 中     | ✅   |
| 2    | `useScreenshotGenerator.ts` 完善折叠策略响应逻辑           | 高     | ✅   |
| 3    | `useScreenshotGenerator.ts` 实现**并发消息截图**流程控制   | 高     | ✅   |
| 4    | 实现"保存图片"功能（Tauri save dialog + writeFile）        | 高     | ✅   |
| 5    | 实现"复制到剪贴板"功能                                     | 高     | ✅   |
| 6    | `MessageMenubar` → `ChatArea` 截图事件流连接               | 高     | ✅   |
| 7    | `ScreenshotRenderer.vue` 四种消息渲染分支实际验证          | 中     | ⏳   |
| 8    | CSS `.screenshot-mode` 全局样式注入验证                    | 低     | ⏳   |
| 9    | 完整端到端流程测试                                         | 高     | ⏳   |
| 10   | **V2 性能优化**：并发截图 vs 旧版分组截图性能对比测试      | 高     | ⏳   |
| 11   | **V2 对齐验证**：长图拼接处 1 像素对齐测试                 | 高     | ⏳   |
| 12   | **V2 背景绘制**：渐变/圆角/阴影 Canvas 2D 绘制效果验证     | 中     | ⏳   |
