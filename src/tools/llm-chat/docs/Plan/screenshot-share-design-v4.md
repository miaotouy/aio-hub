# LLM Chat: 消息截图分享功能 — 实施计划 (V4)

> 最后更新：2026-06-19
> 状态：V4 计划制定中，待实施
> 作者：Gugu_Kilo & miaotouy
> 版本：V4 (背景与间距自定义系统 + 消息间距精确累加 + 纯色/主题/壁纸 Canvas 2D 绘制 + 实时 DOM 预览 100% 对齐)

---

## 1. 背景与痛点

在 V3 版本中，我们成功实现了 **DOM 实时预览** 与 **完全手动生成** 的架构，解决了自动生成卡顿和无法即时预览配置效果的痛点。然而，在实际使用中，仍有以下细节需要打磨：

1. **消息间距丢失**：由于拼接算法是简单地将每条消息的 Canvas 紧贴着绘制（`y += h`），导致消息之间的 gap 丢失，消息挤在一起显得局促，破坏了原本聊天界面的呼吸感。
2. **半透明/透明背景问题**：目前大 Canvas 拼接时没有绘制底色。如果用户开启了界面透明度（如使用带透明度的主题设置），截出来的单条消息 Canvas 是半透明的，拼接后的大 Canvas 也是半透明的，输出的 PNG 就会是半透明的。发到聊天软件里背景会变成黑色或奇怪的颜色，非常不适合分享。

为了解决这些问题，V4 计划引入一套**“背景与间距自定义系统”**，让截图分享功能达到像素级的精致度。

---

## 2. 架构设计与技术方案

### 2.1 类型定义扩展 (`screenshotTypes.ts`)

我们将在 `ScreenshotRenderOptions` 中引入背景、间距、留白和装饰的完整配置：

```typescript
/** 截图背景类型 */
export type ScreenshotBgType = "theme" | "solid" | "wallpaper";

/** 截图背景配置 */
export interface ScreenshotBgConfig {
  type: ScreenshotBgType;
  /** 纯色背景时的 HEX 颜色值 */
  color: string;
  /** 壁纸不透明度 (0.0 - 1.0) */
  wallpaperOpacity: number;
}

export interface ScreenshotRenderOptions {
  width: number;
  widthMode: RenderWidthMode;
  scale: number;

  // --- 新增背景与间距配置 ---
  /** 背景配置 */
  bgConfig: ScreenshotBgConfig;
  /** 消息间距 (px)，undefined 表示跟随布局模式自动 (卡片 8px, 气泡 12px) */
  gap: number | undefined;
  /** 四周留白 (内边距, px) */
  padding: number;
  /** 是否启用卡片外边框与投影装饰 */
  enableDecoration: boolean;
}
```

### 2.2 实时 DOM 预览适配 (`ScreenshotRenderer.vue`)

为了让右侧的 **DOM 实时预览**与最终截出来的图片 **100% 一致**，我们需要让渲染器也支持这些样式：

- **背景色与壁纸**：根据 `bgConfig` 动态计算渲染器的背景。如果是 `wallpaper`，直接读取系统当前壁纸并应用不透明度。
- **消息间距**：通过 CSS 变量 `--screenshot-gap` 动态控制 `.messages-container` 的 `gap`。
- **四周留白与装饰**：通过 CSS 变量 `--screenshot-padding` 控制内边距。如果启用了 `enableDecoration`，则为预览容器加上精致的边框和投影。

### 2.3 Canvas 2D 精确拼接算法 (`screenshotCapture.ts`)

在最终生成图片时，我们在 Canvas 2D 中进行像素级的精确绘制：

1. **尺寸计算**：
   - `内容宽度 = resolvedWidth`
   - `内容高度 = Σ(messageHeight) + gap * (N - 1)`
   - `画布总宽度 = 内容宽度 + padding * 2`
   - `画布总高度 = 内容高度 + padding * 2`
2. **背景绘制**：
   - `solid`：使用 `ctx.fillStyle` 填充纯色。
   - `theme`：读取当前主题的背景色（强制不透明），填充整个画布。
   - `wallpaper`：如果系统有壁纸，将壁纸加载为 `HTMLImageElement`，在 Canvas 中进行**平铺（Tile）**或**等比拉伸填充（Cover）**，并叠加一层半透明底色以保证消息可读性。
3. **卡片装饰**：
   - 如果启用了 `enableDecoration`，在 Canvas 中绘制精致的圆角矩形外边框（`ctx.strokeStyle`）和微弱的投影（`ctx.shadowBlur`）。
4. **消息拼接**：
   - 消息绘制的起始坐标为 `(padding, padding)`。
   - 逐个绘制消息 Canvas，y 坐标每次累加 `h + gap`。

---

## 3. 实施步骤规划

### 步骤 1：类型定义与默认值 (`screenshotTypes.ts`)

- 新增 `ScreenshotBgType`、`ScreenshotBgConfig` 类型。
- 扩展 `ScreenshotRenderOptions` 接口。
- 定义合理的默认值（默认跟随主题背景，卡片间距自动，四周留白 16px，开启卡片装饰）。

### 步骤 2：配置面板 UI 升级 (`ScreenshotConfigPanel.vue`)

- 新增 **“背景与间距”** 配置区域。
- 提供背景类型下拉选择器（跟随主题 / 纯色背景 / 桌面壁纸）。
- 提供背景颜色选择器（`el-color-picker`，仅在纯色背景时显示）。
- 提供壁纸不透明度滑块（仅在壁纸背景时显示）。
- 提供消息间距输入框（支持“自动”或手动指定 `0-32px`）。
- 提供四周留白输入框（`0-64px`）。
- 提供卡片装饰开关。

### 步骤 3：渲染器实时预览适配 (`ScreenshotRenderer.vue`)

- 接收新的 `renderOptions` 或拆分后的 props。
- 动态计算根容器的 `:style`，注入 `--screenshot-gap`、`--screenshot-padding`、`--screenshot-bg` 等 CSS 变量。
- 补齐对应的 CSS 样式，确保预览画面瞬间响应配置变化。

### 步骤 4：Canvas 拼接重构 (`screenshotCapture.ts`)

- 重构 `captureMessagesAndStitch` 函数，接收完整的 `StitchOptions`（包含背景、间距、留白、装饰配置）。
- 实现异步加载壁纸图片并绘制的逻辑。
- 实现 Canvas 2D 绘制背景、圆角、投影、外边框的逻辑。
- 修正消息拼接的坐标计算，将 `padding` 和 `gap` 纳入累加。

### 步骤 5：弹窗状态桥接 (`ShareScreenshotDialog.vue` & `useScreenshotGenerator.ts`)

- 在 `ShareScreenshotDialog.vue` 中初始化新的配置项状态。
- 监听配置变化时，正确清空上一次的生成结果。
- 将当前系统壁纸的 URL 传递给生成器，以便在 Canvas 中绘制。
