# LLM Chat: 消息截图分享功能 — 实施计划 (V2)

> 最后更新：2026-06-18
> 状态：实施计划 (V2) — 待实施
> 作者：Gugu_Kilo & miaotouy
> 版本：V2 (单弹窗合并 + 上左右响应式布局 + 并发消息截图 + 纯 Canvas 2D 拼接)
> ⚠️ 历史备注：上一轮实施（V1 分组截图方案）因效果不理想、频繁切换 display 导致虚拟滚动空白、截图速度极慢而回滚。本版 V2 彻底抛弃分组截图，采用并发单条消息截图与 Canvas 拼接方案。

---

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
