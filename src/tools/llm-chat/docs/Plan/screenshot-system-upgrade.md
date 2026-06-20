# 消息截图系统升级计划 (Message Screenshot System Upgrade Plan)

消息截图系统是 `llm-chat` 工具中的一项核心特色功能。为了进一步提升长图导出的个性化与专业度，本计划旨在为截图系统引入以下三项新特性：

1. **壁纸平铺方式自定义**：支持 `cover`、`contain`、`tile`、`stretch` 四种平铺模式。
2. **额外的水印层**：支持在长图上平铺一层精致的、可自定义的半透明水印。
3. **AIO Hub 应用标识的头/脚**：支持在长图的顶部或底部添加精致的 AIO Hub 品牌标识横条，且完美适配毛玻璃壁纸背景。

---

## 1. 架构设计与技术方案

升级方案遵循**“零破坏性、高度复用、所见即所得”**的原则，最大程度复用现有的“实时 DOM 预览 + 离屏并发截图 + Canvas 2D 后拼接”混合架构。

### 1.1. 壁纸平铺方式 (Wallpaper Mode)

- **预览端**：在 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 中，根据 `wallpaperMode` 动态计算 CSS 变量 `--screenshot-wallpaper-size` 和 `--screenshot-wallpaper-repeat`，作用于 `::before` 伪元素，实现预览端的实时平铺。
- **导出端**：在 [`screenshotCapture.ts`](../../utils/screenshotCapture.ts) 中，将壁纸绘制逻辑抽离为通用的 `drawWallpaper` 函数，同时适配 `cover`、`contain`、`tile`（使用 `CanvasPattern` 平铺）和 `stretch`（拉伸），确保最终导出的图片与预览完全一致。

### 1.2. 额外的水印层 (Watermark Layer)

- **预览端**：在 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 中，添加一个绝对定位的 `.screenshot-watermark-layer`。为了实现高性能的实时预览，在前端动态创建一个微型 Canvas 绘制单个倾斜的水印文字，然后将其转为 Data URL 作为该图层的 `background-image`，并设置 `background-repeat: repeat`。
- **导出端**：在 [`screenshotCapture.ts`](../../utils/screenshotCapture.ts) 中，在拼接完所有消息后，使用相同的算法在大 Canvas 上通过 `ctx.createPattern` 绘制平铺的水印层，保证“所见即所得”。

### 1.3. AIO Hub 应用标识的头/脚 (Brand Header/Footer)

- **核心思想**：直接在 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 中将顶部标识（`.screenshot-brand-header`）和底部标识（`.screenshot-brand-footer`）渲染为普通的 DOM 节点。
- **节点收集**：在 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue) 的 `getMessageElements()` 收集函数中，如果启用了顶部/底部标识，直接将这两个 DOM 节点作为数组的第一个和最后一个元素，与消息节点一起返回。
- **无缝拼接**：底层的 `captureMessagesAndStitch` 拼接引擎完全不需要修改任何拼接逻辑，它会自动把顶部和底部标识截取为独立的 Canvas，并完美拼在长图的最上面和最下面。
- **毛玻璃完美复用**：给顶部和底部标识加上 `.message-background-container` 类名。这样，底层的“毛玻璃后合成算法”会自动识别它们，并为它们合成出完美的、与消息气泡一致的毛玻璃壁纸背景。

---

## 2. 详细修改计划

### 2.1. 扩展类型定义 [`screenshotTypes.ts`](../../components/screenshot/screenshotTypes.ts)

- 新增 `WallpaperMode` 类型：`"cover" | "contain" | "tile" | "stretch"`。
- 在 `ScreenshotBgConfig` 中增加 `wallpaperMode?: WallpaperMode`。
- 定义 `ScreenshotWatermarkConfig` 接口：
  ```typescript
  export interface ScreenshotWatermarkConfig {
    enable: boolean;
    text: string;
    color: string;
    fontSize: number;
    gap: number;
    angle: number;
  }
  ```
- 定义 `ScreenshotBrandConfig` 接口：
  ```typescript
  export type BrandShowMode = "none" | "top" | "bottom" | "both";
  export interface ScreenshotBrandConfig {
    show: BrandShowMode;
    text: string;
    showLogo: boolean;
  }
  ```
- 在 `ScreenshotRenderOptions` 中增加 `watermark` 和 `brand` 字段，并定义默认值常量。

### 2.2. 升级配置面板 [`ScreenshotConfigPanel.vue`](../../components/screenshot/ScreenshotConfigPanel.vue)

- 在“背景与间距”区域，当背景类型为 `wallpaper` 时，增加“壁纸平铺方式”下拉选择框（`cover` / `contain` / `tile` / `stretch`）。
- 新增“水印设置”折叠面板（`el-collapse` 或精致的配置分组），包含：
  - 启用水印开关
  - 水印文字输入框
  - 水印颜色选择器（支持透明度）
  - 水印字号、平铺间距、旋转角度的数字输入框/滑块。
- 新增“应用标识”配置分组，包含：
  - 标识显示位置下拉框（不显示 / 仅顶部 / 仅底部 / 顶部和底部）
  - 标识自定义文字输入框
  - 显示 Logo 开关

### 2.3. 升级渲染器 [`ScreenshotRenderer.vue`](../../components/screenshot/ScreenshotRenderer.vue)

- 在模板中，在 `messages-container` 的上方和下方分别渲染 `.screenshot-brand-header` 和 `.screenshot-brand-footer`。
- 在模板中，添加绝对定位的 `.screenshot-watermark-layer`。
- 在 `v4StyleVars` 中，根据 `wallpaperMode` 动态计算并输出 `--screenshot-wallpaper-size` 和 `--screenshot-wallpaper-repeat`。
- 使用 `computed` 动态生成水印背景样式 `watermarkStyle`（利用微型 Canvas 动态生成 repeat 背景）。
- 修改 `getMessageElements()`，将顶部和底部标识 DOM 节点（如果启用）分别 append 到返回数组的首尾。

### 2.4. 升级拼接核心 [`screenshotCapture.ts`](../../utils/screenshotCapture.ts)

- 在 `StitchOptions` 中增加 `watermark` 和 `brand` 配置参数。
- 抽离 `drawWallpaper` 函数，支持四种平铺模式的 Canvas 绘制。
- 在 `drawBackground` 和 `createBlurredBackgroundCanvas` 中调用 `drawWallpaper`。
- 实现 `drawWatermark` 函数，在拼接完成后，利用 `ctx.createPattern` 将水印平铺绘制到大 Canvas 上。

### 2.5. 桥接与对话框适配 [`ShareScreenshotDialog.vue`](../../components/screenshot/ShareScreenshotDialog.vue)

- 在初始化 `renderOptions` 时加入水印和应用标识的默认值。
- 在 `regenerateScreenshot` 调用 `generator.generate` 时，将 `watermark` 和 `brand` 配置透传给生成器。

---

## 3. 进度与验证指标

1. **实时预览验证**：在预览面板中调整壁纸平铺方式、水印文字/颜色/角度、应用标识位置/文字，预览界面应立即无缝更新，无卡顿。
2. **导出一致性验证**：生成的 PNG 图片在壁纸平铺、水印覆盖、应用标识呈现上，应与预览面板完全一致。
3. **毛玻璃效果验证**：在应用壁纸模式下，顶部和底部标识的背景应呈现出完美的毛玻璃模糊效果，且与消息气泡的模糊程度一致。
4. **性能与内存验证**：在连续生成截图时，内存占用应保持稳定，无 Canvas 泄露。

---

## 4. 施工偏差与补充说明

### 4.1. 类型默认值统一集中管理

原计划 2.1 节只说要新增类型和默认值，但 `ShareScreenshotDialog.vue` 中 `renderOptions` 的初始值若直接写死，会导致 `screenshotTypes.ts` 的默认值与对话框初值出现双源。实际实现中：

- 在 `screenshotTypes.ts` 集中导出 `SCREENSHOT_BG_CONFIG_DEFAULT`、`SCREENSHOT_WATERMARK_DEFAULT`、`SCREENSHOT_BRAND_DEFAULT`；
- 对话框 `renderOptions` 改为 `bgConfig: { ...SCREENSHOT_BG_CONFIG_DEFAULT }`、`watermark: { ...SCREENSHOT_WATERMARK_DEFAULT }`、`brand: { ...SCREENSHOT_BRAND_DEFAULT }`；
- 后续调整默认值只需要改一处，避免重复维护。

### 4.2. 品牌头/脚节点结构调整

原计划 1.3 节说"给顶部和底部标识加上 `.message-background-container` 类名"——这样直接把容器类挂在外层 wrapper 上。但 `captureMessagesAndStitch` 的 `bgContainer` 是用 `el.querySelector(".message-background-container")` 查找**后代节点**的，不会匹配元素自身。如果直接挂在外层，会出现：

- 毛玻璃后合成阶段读不到正确的 `bgContainer` 几何信息；
- `borderRadius` 退化为 `options.messageBorderRadius` 默认值 8px，与品牌横条视觉的 12px 不一致。

实际施工中改为与普通消息完全一致的双层结构：

```
<div ref="brandHeaderRef" class="screenshot-brand-strip screenshot-brand-header">
  <div class="message-background-container">
    <div class="message-background-slice"></div>
  </div>
  <div class="screenshot-brand-content">
    <img class="screenshot-brand-logo" :src="aioIconColor" />
    <span class="screenshot-brand-text">{{ brand.text || "AIO Hub" }}</span>
  </div>
</div>
```

并通过 scoped CSS 让内层 `.message-background-container` 继承外层的 12px 圆角。这样 `captureMessagesAndStitch` 现有的毛玻璃后合成算法无需任何改动即可正确处理品牌横条。

### 4.3. 水印层在导出时统一重绘

原计划 1.2 节的"导出端"只提"在拼接完所有消息后用 `ctx.createPattern` 绘制平铺的水印层"，但没考虑水印层在 DOM 中已经存在并被 `modern-screenshot` 多次重复绘制。实际施工中：

- 在 `applyLayoutGuards` 中显式隐藏克隆树里的 `.screenshot-watermark-layer`（`display: none`），避免 per-message canvas 里出现水印；
- 在 `captureMessagesAndStitch` 步骤 8 单独调用 `drawWatermark`，用同一组参数绘制整张长图的水印。

这样既保证导出图与预览所见完全一致，也避免水印在拼接时产生拼接缝/错位。

### 4.4. 水印字体兜底链

为避免用户系统缺少中文字体导致水印变成方块，`makeWatermarkTile` 与 `drawWatermark` 共用以下字体兜底链：

```css
font-family: var(
  --app-font-family,
  system-ui,
  -apple-system,
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif
);
```

与项目其他水印/排版处保持一致。

### 4.5. `drawWallpaper` 抽离为通用函数

原计划 1.1 说"在 `screenshotCapture.ts` 中将壁纸绘制逻辑抽离为通用的 `drawWallpaper` 函数"，实际抽离后被两个地方复用：

- `drawBackground` 中主题模式（固定 cover 行为）
- `createBlurredBackgroundCanvas` 中可按用户配置选择 cover / contain / tile / stretch

主题模式固定 cover 是为了与系统主界面壁纸行为一致，不暴露平铺方式选项给"跟随主题"用户。

### 4.6. 验证

- `bun run check:frontend` (vue-tsc) ✅ 0 errors
- `bun run lint` (oxlint) ✅ 0 warnings / 0 errors
- `bun run test:run --dir src` ✅ 25 test files / 145 tests passed
- `.claude/worktrees/git-committer-impl/` 中存在一个无关的 model-fetcher 测试失败（与本次改动无关，预先存在）

### 4.7.1. 水印层 z-index 设计

水印层需要在预览端和导出端都绘制在消息内容之上，以保证"所见即所得"。

预览端 `.screenshot-watermark-layer` 的 `z-index` 设为 3，确保其在 `.messages-container`（`z-index: 1`）和 `.screenshot-brand-strip`（`z-index: 2`）之上渲染。导出端的 `drawWatermark` 在所有消息 `drawImage` 之后执行，天然保证水印在最上层。

注意：`.screenshot-renderer::before`（壁纸层）位于 `z-index: 0`，水印层若与其同层会被不透明的 messages-container 盖住，因此必须使用更高的层级。

### 4.7.2. 品牌横条毛玻璃背景的样式穿透

品牌横条在 `ScreenshotRenderer.vue` 中渲染，但 `.message-background-container` 和 `.message-background-slice` 的毛玻璃关键样式（`position: absolute; inset: 0; backdrop-filter: blur()`）定义在其他消息组件（`ChatMessage.vue`、`ToolCallMessage.vue`、`CompressionMessage.vue`）的 scoped `<style>` 中。

Vue 的 scoped 机制会为不同组件生成不同的 `data-v-hash`，ScreenshotRenderer 渲染的同名节点无法命中其他组件定义的样式。因此在 ScreenshotRenderer.vue 的 scoped CSS 中通过 `:deep()` 显式声明这两个类在品牌横条内的样式:

```css
.screenshot-brand-strip :deep(.message-background-container) {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
  transform: translateZ(0);
}
.screenshot-brand-strip :deep(.message-background-slice) {
  position: absolute;
  inset: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  border-radius: inherit;
}
```

普通消息不受此影响——它们在 ChatMessage.vue 等组件内渲染，自然携带对应的 data-v-hash，原有 scoped 样式继续生效。只有跨组件渲染的品牌节点需要通过 `:deep()` 显式声明。

导出端方面，品牌节点拥有正确的 `position: absolute; inset: 0;` 几何后，`captureMessagesAndStitch` 的 querySelector 找到的 bgContainer 尺寸与外层一致，`border-radius: 12px` 也能正确读出，壁纸模式下的毛玻璃后合成自动生效，无需额外改动。

### 4.8. 未在本次实现内的可优化点

- 标识头/脚的 Logo 暂仅使用项目内置的 `aio-icon-color.svg`，未做"深色/浅色主题适配"。若后续需要，可按 `prefers-color-scheme` 切换至 `aio-icon-white.svg`。
- 水印暂未提供"密度"参数（如"稀疏/标准/密集"），用户需要手动调整 `gap`。后续可加密度档位简化操作。
- 标识头/脚的内边距和圆角硬编码为 10px/16px/12px，未暴露到配置面板。属于次要视觉调节，可按需扩展。
