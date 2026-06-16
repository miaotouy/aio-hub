# LLM Chat: 消息截图分享功能设计方案

> 最后更新：2026-06-16
> 状态：Draft (设计草案)
> 作者：Gugu_Kilo (雪鸮妹妹) & miaotouy (设计师)

## 1. 背景与目标

在日常使用 AI 工具的过程中，用户经常需要将精彩的对话、精辟的回答或有趣的角色扮演剧情分享给他人。目前，项目仅支持导出为 Markdown、JSON 或 Raw 格式，这些格式虽然适合数据迁移和二次编辑，但不便于在社交平台（如微信、QQ、微博、小红书等）上进行快速、直观的视觉分享。

本方案旨在设计并实现一个**消息截图分享功能**，允许用户将当前对话分支中的单条、多条或整段消息，渲染成一张排版精美、视觉通透、支持高度自定义的**长图卡片**，并支持一键保存到本地或复制到剪贴板。

---

## 2. 核心设计理念：专用截图组件 + 消息分组截图 + modern-screenshot

> ⚠️ **方案修正（2026-06-16）**：
>
> 1. 原方案计划使用 Tauri 原生 Webview 截图 API，经验证 `@tauri-apps/api` v2.10.1 不存在 `screenshot()` 方法，已修正为使用 `modern-screenshot` DOM 转图片库。
> 2. 原方案采用"滚动截图 + Canvas 拼接"，经验证 `modern-screenshot` 在克隆 DOM 后无法可靠反映 `scrollTop`，导致相邻截图内容重复。已修正为"**消息分组截图**"方案：按消息数量分组，每组独立截图后拼接，不依赖 `scrollTop`。
> 3. 原方案按固定消息数量分组，实际场景中消息长度差异极大（短消息 vs 长代码块），固定条数分组会导致各组高度不均。已修正为**按内容高度分组**（默认），同时保留按消息数量分组作为备选。
> 4. 原方案拼接时组间间隙偏大（每组截图底部包含末尾消息的 `margin-bottom`，拼接后叠加为双倍间隙）。已修正为：截图时通过 `onCloneNode` 移除末尾消息的 `margin-bottom`，拼接时显式注入可控间隙（默认等于消息自然间隙）。

### 2.1. 截图引擎选型分析

| 方案                                  | 优势                      | 劣势                                       | 可行性      |
| :------------------------------------ | :------------------------ | :----------------------------------------- | :---------- |
| **Tauri 原生 Webview 截图**           | 100% 视觉还原             | ❌ API 不存在（v2.10.1 无 `screenshot()`） | ❌ 不可行   |
| **Rust 侧 WebView2 `CapturePreview`** | 100% 视觉还原             | Windows 专用，需新增 Tauri Command         | ⚠️ 备选     |
| **`modern-screenshot`**               | 纯前端，跨平台，无需 Rust | 毛玻璃/iframe/CSS 变量可能有兼容问题       | ✅ 当前方案 |
| **`tauri-plugin-screenshots`**        | 可截取窗口/显示器         | 截取整个窗口而非特定 DOM 元素              | ⚠️ 备选     |
| **`getDisplayMedia()`**               | 浏览器原生                | 需用户授权，体验差                         | ❌ 不推荐   |

### 2.2. 我们的方案：专用截图组件 + 消息分组截图 + modern-screenshot

**核心思路**：使用 `modern-screenshot` 作为截图引擎，配合专用截图组件和消息分组截图实现长图生成。

1. **专用截图组件**：做一个 `ScreenshotRenderer.vue`，把消息树塞进去专门截图。这个组件在一个独立的、干净的容器中渲染消息，可以自由控制背景、边框、水印等，不受主界面其他 UI（侧边栏、标题栏、输入框等）干扰。
2. **消息分组截图**：将选中的消息按**内容高度**分组（默认每组最大高度 2000px，可配置），短消息可以多塞几条，长代码块单独成组。同时保留按消息数量分组作为备选模式。通过 `display: none` 隐藏非当前组的消息，使 `modern-screenshot` 只截取当前组的 DOM。**不依赖 `scrollTop`**，彻底避免滚动偏移导致的内容重复问题。
3. **Canvas 拼接（间隙控制）**：将所有分组的截图片段通过 Canvas API 拼接成一张完整的长图。由于每组截图之间没有重叠，拼接逻辑简单直接，无需裁剪。**关键细节**：截图时通过 `onCloneNode` 移除每组末尾消息的 `margin-bottom`，避免截图底部多余空白；拼接时显式注入可控间隙（`groupGap`，默认等于消息自然间隙），确保组间视觉间距与消息间自然间距一致。

**这个方案的优势**：

- **纯前端实现**：不需要 Rust 代码，跨平台兼容。
- **自由定制背景**：因为是专门的截图组件，可以自由控制背景、边框、水印等，不受主界面干扰。
- **实现简洁**：只需要 `modern-screenshot` + Canvas 拼接算法。

**已知限制与应对**：

| 限制                                | 应对策略                                                                                   |
| :---------------------------------- | :----------------------------------------------------------------------------------------- |
| `backdrop-filter` 毛玻璃效果丢失    | 截图模式下用实色背景替代毛玻璃，或使用 `modern-screenshot` 的 `onCloneNode` 钩子替换为实色 |
| `<iframe>` 内容无法渲染             | HTML 预览沙箱截图时显示静态缩略图替代                                                      |
| `appdata://`/`asset://` 图片跨域    | 截图前将自定义协议图片转为 base64 data URL                                                 |
| `content-visibility: auto` 导致空白 | 截图模式下强制 `content-visibility: visible`                                               |

---

## 3. 核心挑战与解决方案

### 3.1. 截图 API 选型（⚠️ 方案修正）

- **问题描述**：我们需要截取当前 Webview 的真实渲染像素，如何实现？
- **⚠️ 关键发现（2026-06-16 验证）**：`@tauri-apps/api` v2.10.1 的 `Webview`、`WebviewWindow`、`Window` 类中**均没有 `screenshot()` 方法**。原方案中"前端可以直接调用 `webview.screenshot()`"的假设是**错误的**。Tauri v2 的 Rust 侧（2.10.3 / 2.11.2）也没有暴露截图相关的公开 API。
- **修正后的方案**：采用 **`modern-screenshot`（DOM 转图片库）** 作为截图引擎，配合滚动截图 + Canvas 拼接实现长图生成。
  - **优势**：纯前端实现，无需 Rust 代码，跨平台兼容。
  - **已知限制**（需在测试中验证）：
    - `backdrop-filter` 毛玻璃效果可能丢失（`modern-screenshot` 使用 SVG `<foreignObject>` 渲染，Canvas 无法捕获毛玻璃）。
    - `<iframe>` 内容无法渲染（安全沙箱限制）。
    - `appdata://`、`asset://` 等自定义协议的图片可能触发跨域问题。
    - `content-visibility: auto` 优化会导致视口外内容不渲染，截图时必须禁用。
  - **备选方案**（如果 `modern-screenshot` 效果不理想）：
    1. **Rust 侧 WebView2 `CapturePreview`**：在 Rust 侧通过 WebView2 的 `ICoreWebView2` 接口调用 `CapturePreview` 方法截取 Webview 像素，需要新增 Tauri Command。Windows 专用，但 100% 还原渲染效果。
    2. **`tauri-plugin-screenshots`**：第三方插件，可截取窗口/显示器，但截取的是整个窗口而非特定 DOM 元素。
    3. **`getDisplayMedia()`**：浏览器屏幕捕获 API，需要用户授权，体验较差。

### 3.2. 消息分组截图策略

- **问题描述**：长对话的消息数量可能很多，一次性截取整个容器可能导致 `modern-screenshot` 渲染超时或内存溢出。需要将消息分组，每组独立截图后拼接。
- **⚠️ 为什么不用滚动截图**：经验证，`modern-screenshot` 在克隆 DOM 到离屏 iframe 后**无法可靠反映 `scrollTop`**，导致多次截图实际截到相同内容，拼接后消息整段重复。这是该库的已知限制，无法通过增加等待时间或 `IntersectionObserver` 解决。
- **解决方案：消息分组截图**：
  - 截图时，先隐藏所有消息（`display: none`），然后逐组显示当前组的消息并截图。
  - 每组截图完成后，隐藏当前组，显示下一组，循环直到所有组截图完成。
  - 每组截图后通过 `requestAnimationFrame` 等待渲染完成。
  - **优势**：不依赖 `scrollTop`，每组 DOM 高度可控，`modern-screenshot` 渲染稳定，拼接无需处理重叠区域。

#### 3.2.1. 分组模式

支持两种分组模式，用户可在截图配置面板中选择：

| 模式标识 | 名称       | 说明                                                                                     |
| :------- | :--------- | :--------------------------------------------------------------------------------------- |
| `count`  | 按消息数量 | 按固定条数分组（如每组 10 条），简单直接，适合消息长度较均匀的场景                       |
| `height` | 按内容高度 | **默认模式**。每组累计高度不超过 `maxGroupHeight`（默认 2000px），短消息多塞、长消息少塞 |

**为什么默认按高度分组**：实际聊天场景中消息长度差异极大——一条短消息可能只有 20px 高，而一段代码块可能超过 800px。按固定条数分组会导致：

- 短消息组：截图高度很小，拼接后组间间隙占比过大
- 长消息组：截图高度过大，可能超出 `modern-screenshot` 的渲染能力

按高度分组可以保证每组截图高度相对均匀，拼接后视觉效果更自然。

**高度分组的算法**：

1. 遍历所有消息元素，通过 `offsetHeight` + `marginBottom` 计算每条消息的实际占用高度
2. 累加当前组的高度，若加入下一条消息后超过 `maxGroupHeight`，则当前组截止，下一条消息归入新组
3. 至少保证每组有 1 条消息（即使单条消息高度超过 `maxGroupHeight`）

#### 3.2.2. 组间间隙控制

- **问题描述**：每组截图时，容器内最后一个消息元素的 `margin-bottom` 会被包含在截图中。拼接时，上一组截图底部的 margin + 下一组截图顶部的消息 = 视觉上组间间隙大于消息间自然间隙。
- **根因**：消息间自然间隙由 CSS `margin-bottom` 控制（如 4px），但拼接后相邻两组的间隙 = 上一组末尾 margin（4px）+ 下一组顶部无偏移 = 4px，看起来比组内消息间间隙大，因为组内消息间只有 margin 而组间有截图边界。
- **解决方案**：
  1. **截图时**：在 `onCloneNode` 钩子中，移除克隆容器内最后一个 `.scroll-item`（或对应消息元素）的 `margin-bottom`，使截图底部不含多余空白。
  2. **拼接时**：显式注入 `groupGap`（默认等于消息自然间隙，如 4px），在 Canvas 拼接时组间留出此间距。
  3. **效果**：组间间隙 = `groupGap`，与消息间自然间隙一致，视觉上无缝衔接。

```typescript
// onCloneNode 中移除末尾 margin
onCloneNode: (clonedNode: Node) => {
  const el = clonedNode as HTMLElement;
  el.style.border = "none";
  el.style.borderRadius = "0";
  el.style.padding = "0";

  // 移除最后一个子元素的 margin-bottom
  const children = el.querySelectorAll(".scroll-item");
  if (children.length > 0) {
    const lastChild = children[children.length - 1] as HTMLElement;
    lastChild.style.marginBottom = "0";
  }
};

// Canvas 拼接时注入组间间隙
const gap = groupGap; // 默认等于消息自然间隙
let yOffset = 0;
for (let i = 0; i < captures.length; i++) {
  stitchCtx.drawImage(captures[i], 0, yOffset);
  yOffset += captures[i].height;
  if (i < captures.length - 1) {
    yOffset += gap; // 组间间隙
  }
}
```

### 3.3. 截图拼接

- **问题描述**：消息分组截图会产生多张截图片段，需要将它们拼接成一张完整的长图。
- **解决方案**：
  - `modern-screenshot` 的 `domToBlob()` 返回当前组的截图。
  - 将每张截图通过 `createImageBitmap()` 转为 Canvas。
  - 创建一个最终的长图 Canvas，高度为所有截图拼接后的总高度 + 组间间隙，宽度为截图容器的宽度。
  - 将所有截图按顺序绘制到长图 Canvas 上，组间留出 `groupGap` 间距。
  - **由于每组截图之间没有重叠区域，拼接逻辑简单直接，无需裁剪**。
  - **组间间隙通过 `groupGap` 显式控制**，默认等于消息自然间隙，确保视觉一致性。

### 3.4. 专用截图组件的渲染策略

- **问题描述**：`ScreenshotRenderer` 组件需要在独立的容器中渲染消息，同时保证样式与主界面的聊天消息**完全一致**。但 `MessageList.vue` 承担了大量布局编排逻辑，不是简单地把 `ChatMessage` 塞进容器就能还原视觉的。
- **解决方案**：**复用 `MessageList.vue` 的渲染逻辑，而非从零搭建**。

#### 3.4.1. MessageList.vue 的布局编排逻辑（必须复用）

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) 内部有 4 个关键 computed 控制消息的渲染路径和布局，`ScreenshotRenderer` 必须复用这些逻辑：

| 计算属性                                                                             | 位置     | 作用                                                      |
| ------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| [`messageLayouts`](src/tools/llm-chat/components/message/MessageList.vue:163)        | L163-214 | 预计算每条消息的 `role` / `align`，决定气泡左/右/居中对齐 |
| [`compressedNodeIds`](src/tools/llm-chat/components/message/MessageList.vue:93)      | L93-103  | 判断哪些消息被压缩节点吞掉                                |
| [`messageSiblingInfoMap`](src/tools/llm-chat/components/message/MessageList.vue:111) | L111-134 | 预计算兄弟节点信息                                        |
| [`bubbleLayoutVars`](src/tools/llm-chat/components/message/MessageList.vue:227)      | L227-238 | 注入 CSS 变量（`--bubble-max-width-percent` 等）          |

**复用策略**：将 `MessageList.vue` 中的布局编排逻辑提取为 `useMessageLayout` composable，`MessageList.vue` 和 `ScreenshotRenderer.vue` 共同使用。

#### 3.4.2. 四种消息渲染分支（必须全部覆盖）

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:778-1009) 的模板有 4 条渲染路径，`ScreenshotRenderer` 必须全部支持：

1. **外置 Header + 气泡** (L803-872)：[`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue) (external) + [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue) (`hideHeader=true`) + [`MessageExternalAvatar.vue`](src/tools/llm-chat/components/message/MessageExternalAvatar.vue)
2. **压缩节点** (L875-889)：[`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue)
3. **工具调用** (L892-944)：[`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)
4. **普通消息** (L947-1007)：[`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)

设计方案**必须**覆盖所有 4 种渲染分支，包括外置头像组件 [`MessageExternalAvatar.vue`](src/tools/llm-chat/components/message/MessageExternalAvatar.vue)。

#### 3.4.3. `content-visibility: auto` 必须在截图容器中禁用

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:281-346) 通过 `MutationObserver` + `requestAnimationFrame` 给每条消息注入：

```css
content-visibility: auto !important;
contain-intrinsic-size: auto 500px !important;
```

这个优化**会让视口外的消息不渲染真实 DOM**，截图时如果不禁用，滚动截图截到的全是空白。`ScreenshotRenderer` 必须在截图模式下禁用此优化，强制所有消息 `content-visibility: visible`。

#### 3.4.4. 气泡模式 CSS 系统必须整体迁移

[`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue:1057-1380) 有 **320+ 行**的 scoped CSS 控制气泡布局，包括：

- 对齐方向 (`data-align="left/right/center"`)
- 外置头像 (`avatar-outside`)
- 外置 Header (`header-outside`)
- 右对齐镜像 (`flex-direction: row-reverse`)
- 工具消息镜像
- 底部信息与操作栏的双侧布局
- 消息最大宽度限制

这些 CSS 与 `.messages-container` 的 class 名和 `data-*` 属性深度绑定，`ScreenshotRenderer` 必须复用相同的 DOM 结构和 class 名才能生效。

#### 3.4.5. Props 依赖链与 provide/inject 链

[`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue:19-35) 需要 12 个 props，[`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue:70-80) 需要 8 个 props，其中 `sessionIndex`、`sessionDetail`、`llmThinkRules`、`richTextStyleOptions` 等需要从 store 实时获取。

多个子组件依赖 `provide`：

- [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue:96-98) 提供 `messageId`、`chatSettings`、`agentInteractionConfig`、`currentAgent`
- [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue:57-60) 提供 `messageId`、`chatSettings`
- [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue:267-268) 提供 `messageId`、`chatSettings`

`ScreenshotRenderer` 必须确保这些 provide 在正确的组件层级上设置。

#### 3.4.6. 背景分块渲染系统

[`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue:87-102) 和 [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue:270-291) 都使用了背景分块渲染（`BLOCK_SIZE = 2000px`）来规避大尺寸 `backdrop-filter` 失效问题。`modern-screenshot` 能正确捕获分块渲染的结果，无需特殊处理。但需注意：如果截图容器的消息高度超过 2000px，分块渲染会自动生效，这是预期行为。

### 3.5. 交互抑制策略（screenshotMode）

- **问题描述**：截图时，所有交互元素（操作栏、hover 效果、编辑按钮等）都不应该出现，否则截图会包含不必要的 UI 噪音。
- **解决方案**：新增 `screenshotMode` prop，从 `ScreenshotRenderer` → `MessageList` → `ChatMessage` / `ToolCallMessage` / `CompressionMessage` → `MessageContent` / `MessageMenubar` 逐层传递，各组件内部根据此标志抑制交互。

#### 3.5.1. 需要抑制的交互元素完整清单

**[`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)：**

- `.menubar-wrapper` (L278-301) — hover 显示的 [`MessageMenubar`](src/tools/llm-chat/components/message/MessageMenubar.vue) → **完全隐藏**
- `.chat-message:hover::after` (L357-359) — hover 边框变色 → **禁用 hover 效果**
- `.chat-message.is-disabled` (L395-401) — 禁用态半透明 → **保持原样（截图应如实反映消息状态）**

**[`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)：**

- 编辑模式 (L929-1056) — `ChatCodeMirrorEditor` / `ChatTextareaEditor` → **禁用编辑入口**
- [`AttachmentCard`](src/tools/llm-chat/components/message/../AttachmentCard.vue) — 可移除、可预览文档 → **隐藏移除按钮和预览按钮**
- [`DocumentViewer`](src/tools/llm-chat/components/message/../../components/common/DocumentViewer.vue) 弹窗 (L1248-1262) → **禁用触发**
- 错误信息复制按钮 (L1234-1244) → **隐藏复制按钮**
- 流式生成指示器 (L1101-1105) → **隐藏（截图时不应有流式状态）**
- 渐进预览图 (L1108-1130) — 点击查看大图 → **禁用点击，仅展示图片**

**[`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)：**

- 折叠/展开切换 (L252-254) → **禁用交互（根据折叠策略决定展开/收起状态，见 3.6）**
- 参数折叠 (L257-264) → **禁用交互（根据折叠策略决定展开/收起状态，见 3.6）**
- 复制参数按钮 (L608-613) → **隐藏**
- 预览渲染按钮 (L664-668) → **隐藏**
- 异步任务操作（取消/重试）(L198-221) → **隐藏**
- 编辑模式 (L577-606) → **禁用编辑入口**
- Menubar (L1084-1111) → **完全隐藏**

**[`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue)：**

- 角色下拉切换 (L258-283) → **禁用**
- 编辑/保存/取消 (L289-334) → **隐藏**
- 启用/禁用切换 (L314-322) → **隐藏**
- 删除确认弹窗 (L324-333) → **隐藏**

**[`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：**

- 整个组件 → **不渲染（`v-if="!screenshotMode"`）**

**[`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue)：**

- 性能指标 (L292-339) → **根据模板配置决定是否显示**
- 时间戳 (L341-345) → **根据模板配置决定是否显示**

#### 3.5.2. CSS 级别的交互抑制

在 `ScreenshotRenderer` 的根容器上添加 `.screenshot-mode` class，通过 CSS 全局抑制：

```css
/* 截图模式：隐藏操作栏 */
.screenshot-mode .menubar-wrapper {
  display: none !important;
}

/* 截图模式：禁用 hover 边框效果 */
.screenshot-mode .chat-message:hover::after,
.screenshot-mode .tool-call-message:hover::after,
.screenshot-mode .compression-message:hover::after {
  border-color: var(--border-color);
}

/* 截图模式：禁用 content-visibility 优化 */
.screenshot-mode .chat-message,
.screenshot-mode .tool-call-message,
.screenshot-mode .compression-message {
  content-visibility: visible !important;
  contain-intrinsic-size: none !important;
}

/* 截图模式：隐藏编辑/删除等操作按钮 */
.screenshot-mode .action-btn,
.screenshot-mode .edit-actions,
.screenshot-mode .copy-small-btn,
.screenshot-mode .preview-btn {
  display: none !important;
}
```

### 3.6. 可折叠元素的展开策略

- **问题描述**：截图时，部分元素默认是折叠的（如工具调用结果、深度思考、参数预览），需要决定是否强制展开。不同场景下用户需求不同——有时希望展示完整信息，有时希望截图与当前界面一致，有时希望按模板预设来。
- **解决方案**：提供三种可配置的折叠策略，用户在截图配置面板中选择。

#### 3.6.1. 策略定义

| 策略标识            | 名称     | 说明                                                                                                                              |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `preserve`          | 跟随现状 | 保持用户在主界面中当前的折叠/展开状态，截图所见即所得                                                                             |
| `config`            | 跟随配置 | 根据 Agent（智能体）的已有配置决定每个元素的展开/收起状态，如 `defaultToolCallCollapsed`、`llmThinkRules[].collapsedByDefault` 等 |
| `override-expand`   | 强制展开 | 所有可折叠元素强制展开，展示完整信息                                                                                              |
| `override-collapse` | 强制收起 | 所有可折叠元素强制收起，仅展示摘要，适合长对话快速概览                                                                            |

#### 3.6.2. 各策略下可折叠元素的行为

| 元素                                                                                                         | 默认状态       | `preserve`       | `config`                                         | `override-expand` | `override-collapse` |
| ------------------------------------------------------------------------------------------------------------ | -------------- | ---------------- | ------------------------------------------------ | ----------------- | ------------------- |
| [`ToolCallMessage`](src/tools/llm-chat/components/message/ToolCallMessage.vue:242) 的 `isCollapsed`          | `true`（折叠） | 保持当前 UI 状态 | 按 Agent 的 `defaultToolCallCollapsed`           | 强制展开          | 强制收起            |
| [`LlmThinkNode`](src/tools/llm-chat/components/message/MessageContent.vue:893-926) 的 `collapsed-by-default` | `true`（折叠） | 保持当前 UI 状态 | 按 Agent 的 `llmThinkRules[].collapsedByDefault` | 强制展开          | 强制收起            |
| 工具参数预览的 `argsCollapsedMap`                                                                            | 折叠           | 保持当前 UI 状态 | 按 Agent 的 `defaultToolCallCollapsed`           | 强制展开          | 强制收起            |
| [`CompressionMessage`](src/tools/llm-chat/components/message/CompressionMessage.vue) 的摘要内容              | 始终展开       | 保持展开         | 保持展开                                         | 保持展开          | 保持展开            |

> **注意**：`CompressionMessage` 的摘要内容始终展开，不受策略影响，因为其本身没有折叠交互。

#### 3.6.3. `config` 策略的配置来源

当用户选择 `config` 策略时，截图渲染器读取当前 Agent（智能体）的已有配置来决定折叠状态，**不引入额外的截图专用配置**。具体映射关系：

| 截图中的可折叠元素                                     | Agent 配置来源                                                 | 类型定义位置                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 工具调用结果（`ToolCallMessage` 的 `isCollapsed`）     | `agent.defaultToolCallCollapsed`                               | [`AgentBaseConfig.defaultToolCallCollapsed`](src/tools/llm-chat/types/agent.ts:425) |
| 深度思考节点（`LlmThinkNode` 的 `collapsedByDefault`） | `agent.llmThinkRules[].collapsedByDefault`                     | [`LlmThinkRule.collapsedByDefault`](src/tools/rich-text-renderer/types.ts:662)      |
| 工具调用参数（`argsCollapsedMap`）                     | `agent.defaultToolCallCollapsed`（与工具调用结果共用同一配置） | 同上                                                                                |

> **设计决策**：为什么不引入截图模板专用的 `ScreenshotCollapseConfig`？因为 Agent 已经有了完整的折叠配置体系，截图功能应复用这些配置而非另起炉灶。如果用户希望截图中的折叠行为与 Agent 配置不同，可以直接使用 `override-expand` 或 `override-collapse` 策略。

#### 3.6.4. 实现方式

`ScreenshotRenderer` 通过 `provide('screenshotCollapseStrategy', strategyRef)` 注入当前折叠策略，各组件内部通过 `inject` 获取并根据策略决定折叠状态：

- `preserve`：不修改组件内部的折叠状态 ref，保持原值。
- `config`：读取当前 Agent 的 `defaultToolCallCollapsed` 和 `llmThinkRules[].collapsedByDefault`，覆盖组件内部的折叠状态 ref。
- `override-expand`：在 `onMounted` 时将折叠状态 ref 设为 `false`（展开）。
- `override-collapse`：在 `onMounted` 时将折叠状态 ref 设为 `true`（收起）。

同时，截图模式下所有折叠/展开的**交互入口**（点击切换按钮）均被禁用，防止用户在截图预览中误操作改变状态。

---

## 4. 架构设计与数据流

### 4.1. 核心组件设计

我们将新增以下组件、Composable 和工具：

1. **`ScreenshotMessageSelector.vue`** (消息选择弹窗 - 预处理)：
   - **第一步入口**：用户点击"创建消息截图"后，首先打开此弹窗。
   - 展示当前分支的所有消息列表，每条消息前有复选框。
   - 支持全选/取消全选、按角色筛选（仅用户/仅助手）、按范围滑块选择。
   - 消息以精简摘要形式展示（角色图标 + 前 50 字 + 时间戳），方便用户快速定位。
   - 用户确认选择后，将选中的消息节点 ID 列表传递给 `ShareScreenshotDialog`。

2. **`ScreenshotRenderer.vue`** (专用截图渲染组件)：
   - 接收选中的消息节点列表和样式模板配置。
   - **复用 `MessageList.vue` 的布局编排逻辑**（通过 `useMessageLayout` composable）。
   - **覆盖所有 4 种消息渲染分支**：普通消息、外置 Header + 气泡、压缩节点、工具调用。
   - **复用 `MessageList.vue` 的气泡模式 CSS 系统**（相同的 DOM 结构和 class 名）。
   - 通过 `provide('screenshotMode', true)` 注入截图模式标志，各子组件内部抑制交互。
   - 通过 `provide('screenshotCollapseStrategy', strategyRef)` 注入折叠策略，各组件根据策略决定折叠状态（见 3.6）。
   - 通过 CSS `.screenshot-mode` class 全局抑制 hover 效果、操作栏、编辑按钮等。
   - 禁用 `content-visibility: auto` 优化，强制所有消息全量渲染。
   - 支持自定义背景、边框、水印等装饰元素。
   - 不使用虚拟滚动，全量展开渲染。

3. **`useMessageLayout.ts`** (布局编排 Composable)：
   - 从 `MessageList.vue` 中提取的布局编排逻辑。
   - 包含 `messageLayouts`、`compressedNodeIds`、`messageSiblingInfoMap`、`bubbleLayoutVars` 等计算属性。
   - 包含 `shouldUseOutsideHeader`、`shouldHideHeaderAvatar` 等辅助方法。
   - `MessageList.vue` 和 `ScreenshotRenderer.vue` 共同使用。

4. **`ShareScreenshotDialog.vue`** (截图预览与配置弹窗)：
   - **第二步入口**：消息选择完成后打开此弹窗。
   - 负责展示截图预览、样式配置面板、保存/复制按钮。
   - 包含 `ScreenshotRenderer` 组件。

5. **`ScreenshotTemplateSelector.vue`** (模板选择器)：
   - 提供多种精美的视觉主题模板。

6. **`useScreenshotGenerator.ts`** (核心逻辑 Composable)：
   - 负责消息分组截图的流程控制（分组、显示/隐藏、等待渲染、截图、拼接）。
   - 调用 `modern-screenshot` 的 `domToBlob()` 方法截取 DOM 元素。
   - 处理保存到本地和复制到剪贴板。

### 4.2. 详细数据流向

```mermaid
graph TD
    A[用户在消息菜单/导出菜单点击 "创建消息截图"] --> B[打开 ScreenshotMessageSelector 消息选择弹窗]

    subgraph 预处理阶段 (Pre-processing)
        B --> B1[展示当前分支的所有消息列表]
        B1 --> B2[用户勾选要截图的消息]
        B2 --> B3[支持全选/按角色筛选/范围滑块]
        B3 --> B4[用户确认选择]
    end

    B4 --> C[打开 ShareScreenshotDialog 截图预览弹窗]
    C --> C1[选择样式模板 & 配置卡片元素]
    C1 --> D[ScreenshotRenderer 渲染选中的消息]

    subgraph 截图渲染准备 (Render Preparation)
        D --> D1[provide screenshotMode = true]
        D1 --> D2[禁用 content-visibility 优化]
        D2 --> D3[根据折叠策略处理可折叠元素]
        D3 --> D4[CSS .screenshot-mode 抑制交互和 hover]
        D4 --> D5[复用 useMessageLayout 编排布局]
    end

    subgraph 消息分组截图循环 (Group Capture Loop)
        D5 --> E[隐藏所有消息 display: none]
        E --> F[显示当前组的消息]
        F --> G[等待渲染完成 requestAnimationFrame]
        G --> H[调用 modern-screenshot domToBlob 截取容器]
        H --> I[获取截图 Blob → Canvas]
        I --> J[隐藏当前组消息]
        J --> K{是否还有未截图的组?}
        K -- 是 --> F
        K -- 否 --> L[恢复所有消息显示]
        L --> M[拼接所有截图为长图]
    end

    L --> M[生成长图 Canvas]
    M --> N{用户操作}

    N -- 点击 "复制到剪贴板" --> O[Canvas.toBlob -> 写入系统剪贴板]
    N -- 点击 "保存图片" --> P[Tauri save dialog -> 写入本地 .png 文件]
```

---

## 5. UI/UX 设计

### 5.1. 消息选择弹窗 (ScreenshotMessageSelector)

作为第一步入口，采用中等尺寸弹窗（宽度 `700px`，高度 `70vh`）：

- **顶部工具栏**：
  - 全选/取消全选按钮。
  - 按角色筛选：全部 / 仅用户 / 仅助手。
  - 搜索框：支持按消息内容搜索定位。
- **消息列表**：
  - 每条消息以精简摘要形式展示：角色图标 + 前 50 字 + 时间戳。
  - 每条消息前有复选框，支持勾选/取消。
  - 被压缩隐藏的消息默认不展示，但可通过"显示被压缩的消息"开关展开。
  - 系统根节点不展示。
- **底部操作栏**：
  - 已选消息数量统计。
  - "取消"和"下一步"按钮。

### 5.2. 截图预览与配置弹窗 (ShareScreenshotDialog)

作为第二步入口，采用双栏响应式布局（宽度 `1100px`，高度 `85vh`）：

- **左侧：实时预览区域**。展示生成的截图卡片预览，支持鼠标滚轮缩放和拖拽查看。
- **右侧：配置面板**。
- **视觉模板**：卡片背景（渐变色、纯色、智能体壁纸模糊）、卡片圆角、阴影强度。
- **折叠策略**：选择可折叠元素（工具调用、深度思考、参数预览）的展开/收起行为：
  - **跟随现状**：截图与当前界面一致，所见即所得。
  - **跟随配置**：按当前智能体（Agent）的配置决定，如"工具调用默认折叠"、"思考过程默认折叠"等。
  - **强制展开**：所有可折叠元素全部展开，展示完整信息。
  - **强制收起**：所有可折叠元素全部收起，仅展示摘要。
- **卡片元素开关**：
  - 显示智能体头像 / 用户头像
  - 显示模型名称 & 渠道信息
  - 显示消息发送时间戳
  - 显示 Token 消耗统计
- **个性化水印**：支持输入自定义文本水印（如"由 AIO Hub 生成"），或生成专属二维码。

### 5.3. 预设视觉模板 (Templates)

1. **极简现代 (Minimalist)**：
   - 背景：纯白（明亮模式）/ 纯黑（暗黑模式）。
   - 卡片：无边框，微弱阴影，极简排版。
2. **极光渐变 (Aurora Gradient)**：
   - 背景：梦幻的蓝紫渐变（`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`）。
   - 卡片：半透明白色卡片，高雅通透。
3. **智能体专属 (Agent Theme)**：
   - 背景：提取智能体头像的主色调，生成双色渐变背景。
   - 卡片：适配智能体的主题色边框。
4. **赛博朋克 (Cyberpunk)**：
   - 背景：暗霓虹色调（深灰背景 + 荧光粉/荧光蓝渐变边框）。
   - 卡片：硬核直角，科技感十足。

---

## 6. 实施计划 (Implementation Plan)

为了稳妥、高效地落地该功能，我们将实施过程分为四个阶段：

### 阶段一：前端截图工具封装 (基础建设)

1. **封装前端截图工具**：
   - 在 `src/tools/llm-chat/utils/` 下创建 `screenshotCapture.ts`。
   - 封装 `captureElement(element: HTMLElement, options?): Promise<Blob>` 函数，调用 `modern-screenshot` 的 `domToBlob()` 方法。
   - 封装 `captureElementAsCanvas(element: HTMLElement, options?): Promise<HTMLCanvasElement>` 函数，用于需要 Canvas 操作的场景。
   - 封装消息分组截图 + Canvas 拼接的核心逻辑（分组显示/隐藏 → 逐组截图 → 拼接）。
   - **零 Rust 代码**：整个截图流程完全在前端完成，不需要在 Rust 后端新增任何 Tauri Command。

### 阶段二：布局编排逻辑提取与 ScreenshotRenderer 开发 (架构重构)

1. **提取 `useMessageLayout` composable**：
   - 从 [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue) 中提取布局编排逻辑到 `src/tools/llm-chat/composables/ui/useMessageLayout.ts`。
   - 包含 `messageLayouts`、`compressedNodeIds`、`messageSiblingInfoMap`、`bubbleLayoutVars`、`shouldUseOutsideHeader`、`shouldHideHeaderAvatar` 等。
   - 重构 `MessageList.vue` 使用此 composable，确保行为不变。
2. **开发 `ScreenshotRenderer.vue` 组件**：
   - 使用 `useMessageLayout` composable 编排布局。
   - 覆盖所有 4 种消息渲染分支（普通消息、外置 Header + 气泡、压缩节点、工具调用）。
   - 复用 `MessageList.vue` 的气泡模式 CSS 系统（相同的 DOM 结构和 class 名）。
   - 通过 `provide('screenshotMode', true)` 注入截图模式标志。
   - 通过 `provide('screenshotCollapseStrategy', strategyRef)` 注入折叠策略（见 3.6）。
   - 通过 CSS `.screenshot-mode` class 全局抑制交互。
   - 禁用 `content-visibility: auto` 优化。
   - 支持自定义背景、边框、水印等装饰元素。
3. **为现有组件添加 `screenshotMode` 支持**：
   - [`ChatMessage.vue`](src/tools/llm-chat/components/message/ChatMessage.vue)：接收 `screenshotMode` prop，隐藏 menubar、禁用 hover 边框。
   - [`MessageContent.vue`](src/tools/llm-chat/components/message/MessageContent.vue)：接收 `screenshotMode` prop，隐藏编辑入口、复制按钮、流式指示器。
   - [`ToolCallMessage.vue`](src/tools/llm-chat/components/message/ToolCallMessage.vue)：接收 `screenshotMode` prop，隐藏操作按钮；通过 `inject('screenshotCollapseStrategy')` 根据策略决定折叠状态。
   - [`CompressionMessage.vue`](src/tools/llm-chat/components/message/CompressionMessage.vue)：接收 `screenshotMode` prop，隐藏编辑/删除按钮。
   - [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)：`v-if="!screenshotMode"` 整体不渲染。
   - [`MessageHeader.vue`](src/tools/llm-chat/components/message/MessageHeader.vue)：根据模板配置控制性能指标和时间戳的显示。

### 阶段三：消息选择弹窗与截图预览弹窗开发 (交互与视觉)

1. **开发 `ScreenshotMessageSelector.vue` 消息选择弹窗**：
   - 使用 `BaseDialog` 作为弹窗骨架，设置尺寸为 `width="700px"`，`height="70vh"`。
   - 展示当前分支的所有消息列表，每条消息前有复选框。
   - 支持全选/取消全选、按角色筛选、搜索框。
   - 消息以精简摘要形式展示（角色图标 + 前 50 字 + 时间戳）。
   - 用户确认选择后，将选中的消息节点 ID 列表传递给 `ShareScreenshotDialog`。
2. **开发 `ShareScreenshotDialog.vue` 弹窗**：
   - 使用 `BaseDialog` 作为弹窗骨架，设置尺寸为 `width="1100px"`，`height="85vh"`。
   - 左侧为预览区域，右侧为配置面板。
   - 包含 `ScreenshotRenderer` 组件。
3. **开发视觉模板样式**：
   - 在 `src/tools/llm-chat/config/screenshotTemplates.ts` 中定义模板配置。
   - 实现"极简现代"、"极光渐变"、"智能体专属"等模板的 CSS 样式。

### 阶段四：消息分组截图引擎与保存/复制集成 (功能闭环)

1. **开发 `useScreenshotGenerator.ts` Composable**：
   - 实现消息分组截图的流程控制：
     - 将选中的消息按配置数量分组。
     - 循环：隐藏所有消息 → 显示当前组 → 等待渲染 → 截图 → 隐藏当前组 → 下一组。
     - 截图完成后恢复所有消息显示。
   - 拼接逻辑：创建一个长图 Canvas，将所有分组的截图按顺序绘制上去（无需裁剪，因为组间无重叠）。
2. **实现"保存图片"**：
   - 调用 Tauri 的 `save` 插件打开保存对话框，默认文件名为 `${会话名称}-分享-${日期}.png`。
   - 将长图 Canvas 转换为 Blob，再转为 `Uint8Array`，通过 Tauri 的 `fs.writeBinaryFile` 写入本地。
3. **实现"复制到剪贴板"**：
   - 将长图 Canvas 转换为 Blob。
   - 利用浏览器原生的 `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])` 写入系统剪贴板。
   - 使用 `customMessage.success("图片已复制到剪贴板")` 提示用户。
4. **入口集成**：
   - 在 [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)（单条消息操作栏）中，增加"创建消息截图"按钮。
   - 在 [`ExportBranchDialog.vue`](src/tools/llm-chat/components/message/../export/ExportBranchDialog.vue)（分支导出弹窗）中，增加"生成分享长图"入口，点击后直接打开 `ShareScreenshotDialog`。

---

## 7. 总结与展望

通过**专用截图组件 + 消息分组截图 + `modern-screenshot`** 的方案，我们实现了纯前端的截图功能，无需 Rust 后端代码。虽然 `modern-screenshot` 在毛玻璃效果和 `iframe` 渲染方面存在已知限制，但通过截图模式下的样式替换策略（实色背景替代毛玻璃、静态缩略图替代 iframe），可以在保证视觉质量的前提下实现完整的截图分享功能。

> ⚠️ **方案修正（2026-06-16）**：原方案采用"滚动截图 + Canvas 拼接"，经验证 `modern-screenshot` 在克隆 DOM 后无法可靠反映 `scrollTop`，导致相邻截图内容重复。已修正为"消息分组截图"方案：按消息数量分组，每组独立截图后拼接，不依赖 `scrollTop`，彻底解决对齐问题。

该功能不仅丰富了 AIO Hub 的导出与分享生态，还通过高度自定义的视觉模板（如智能体专属主题、极光渐变等），极大地增强了应用的趣味性和社区传播属性。

### 关键架构决策记录

| 决策                 | 选择                                              | 原因                                                    | 备注                                             |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| 截图方式             | `modern-screenshot` DOM 转图片                    | 纯前端实现，跨平台兼容，无需 Rust 代码                  | ⚠️ 原方案为 Tauri 原生截图，因 API 不存在已修正  |
| 长图生成策略         | 消息分组截图（按消息数量分组，逐组截图后拼接）    | 不依赖 `scrollTop`，避免克隆 DOM 后滚动偏移导致内容重复 | ⚠️ 原方案为滚动截图，因 `scrollTop` 不可靠已修正 |
| 布局编排复用         | 提取 `useMessageLayout` composable                | 避免重复实现，保证视觉一致性                            |                                                  |
| 交互抑制             | `screenshotMode` prop + CSS `.screenshot-mode`    | 双重保障，prop 控制组件级行为，CSS 控制全局样式         |                                                  |
| 折叠元素策略         | 可配置：跟随现状 / 跟随配置 / 强制展开 / 强制收起 | 不同场景需求不同，提供灵活控制                          |                                                  |
| `content-visibility` | 截图模式禁用                                      | 避免视口外消息不渲染导致截图空白                        |                                                  |
| 毛玻璃效果           | 截图模式下替换为实色背景                          | `modern-screenshot` 无法捕获 `backdrop-filter`          |                                                  |
