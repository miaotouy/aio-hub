# LLM Chat: 消息截图分享功能 — 实施计划 (V4)

> 最后更新：2026-06-19
> 状态：V4 核心逻辑已实施 (Capture 层)，配置 UI 待补充
> 作者：Gugu_Kilo & miaotouy
> 版本：V4 (背景与间距自定义系统 + 消息间距精确累加 + 纯色/主题/壁纸 Canvas 2D 绘制 + 实时 DOM 预览 100% 对齐 + Canvas 后合成模糊 —— AE 式合成路径)

---

## 1. 背景与痛点

在 V3 版本中，我们成功实现了 **DOM 实时预览** 与 **完全手动生成** 的架构，解决了自动生成卡顿和无法即时预览配置效果的痛点。然而，在实际使用中，仍有以下细节需要打磨：

1. **消息间距丢失**：由于拼接算法是简单地将每条消息的 Canvas 紧贴着绘制（`y += h`），导致消息之间的 gap 丢失，消息挤在一起显得局幸，破坏了原本聊天界面的呼吸感。
2. **半透明/透明背景问题**：目前大 Canvas 拼接时没有绘制底色。如果用户开启了界面透明度（如使用带透明度的主题设置），截出来的单条消息 Canvas 是半透明的，拼接后的大 Canvas 也是半透明的，输出的 PNG 就会是半透明的。发到聊天软件里背景会变成黑色或奇怪的颜色，非常不适合分享。
3. **消息背景毛玻璃（Blur）效果丢失**：由于 `modern-screenshot` 底层将 DOM 序列化为 SVG 并放入 `<foreignObject>` 中进行离屏渲染，而浏览器在 SVG 渲染沙盒中**原生不支持 `backdrop-filter`**。为了防止渲染崩溃，我们在 `applyLayoutGuards` 中主动将 `backdropFilter` 设为了 `none` 并回退为实色背景，导致生成的截图中，消息气泡/卡片的毛玻璃模糊效果完全消失，显得非常生硬。

为了解决这些问题，V4 引入了一套**"背景与间距自定义系统"**，并在拼接阶段采用**"Canvas 后合成模糊方案"**—— 类 AE 合成路径，让截图分享功能达到像素级的精致度。

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

### 2.3 Canvas 后合成模糊方案 — AE 式合成路径 (`screenshotCapture.ts`)

为了在截图中完美还原消息气泡/卡片的毛玻璃（Blur）效果，我们采用**Canvas 2D 后合成方案**，原理层等价于 After Effects 的合成思路：

1. **底层**：先画壁纸大背景（含 `container-bg` 蒙层）
2. **消息区域**：对每条消息的背景区域做圆角 clip → 叠模糊版壁纸 → 叠 `card-bg` 半透明蒙层
3. **顶层**：叠上消息内容（背景透明的 canvas）

> 为什么不用 SVG 注入方案？`modern-screenshot` 底层将 DOM 序列化为 SVG 并放入 `<foreignObject>` 离屏渲染，`backdrop-filter` 在此沙盒中不可用。虽然可以通过内联 SVG `<filter>` + `<feGaussianBlur>` 实现模糊，但 `modern-screenshot` 不会自动处理动态注入的 `<image>` 引用，且 SVG 渲染的跨浏览器一致性不如原生 Canvas 2D。

#### 2.3.1 合成流程 (两阶段)

**阶段一：单条消息截图 (`applyLayoutGuards`)**

- 预检系统是否有壁纸 (`hasWallpaper`)
- 对 `.message-background-slice` 元素：
  - 有壁纸 → 设为**完全透明** (`backgroundColor: transparent; backdropFilter: none`)
  - 无壁纸 → 保留实色回退（模糊纯色 = 纯色，无视觉差异）
- 这样截出的单条消息 canvas 背景是透明的，保留了 alpha 通道供后合成

**阶段二：Canvas 拼接后合成 (`captureMessagesAndStitch`)**

1. 用已有的 `drawBackground` 画壁纸大背景（含 `container-bg` 蒙层）
2. 创建"模糊版背景 canvas"（`createBlurredBackgroundCanvas`）：
   - 壁纸 cover 绘制 + `container-bg` 蒙层 → 临时 canvas A
   - `ctx.filter = 'blur(Xpx)'` → drawImage(A) → 模糊版 canvas B
3. 遍历每条消息，对每一条：
   1. `ctx.save()` + `ctx.beginPath()` + `ctx.roundRect()` + `ctx.clip()` 切出圆角消息区域
   2. 从模糊版 canvas 上取对应区域 `drawImage`
   3. 叠 `card-bg` 半透明蒙层
   4. `ctx.restore()`
   5. `drawImage` 叠上消息内容的 canvas（背景透明）

#### 2.3.2 关键代码位置

- `applyLayoutGuards()` — `screenshotCapture.ts:136`，对 slice 元素的 `backdropFilter` 做分支处理
- `createBlurredBackgroundCanvas()` — `screenshotCapture.ts:395`，生成模糊版背景 canvas
- `drawBlurredMessageBackground()` — `screenshotCapture.ts:462`，为单条消息绘制模糊背景 + 蒙层
- `captureMessagesAndStitch()` — `screenshotCapture.ts:251`，拼接入口，集成了整个流程

---

## 4. 无壁纸场景的退化逻辑

由于整个模糊合成方案只在有壁纸时才激活，无壁纸时的行为需要清晰定义：

- **无壁纸**：`backdrop-filter: blur()` 模糊纯色 = 纯色本身，视觉上无差异。`applyLayoutGuards` 走原来的**实色回退路径**：清除 `backdropFilter`，给 `var(--card-bg)` 回退色
- **有壁纸但壁纸加载失败**：`createBlurredBackgroundCanvas` 返回 null，跳过后合成步骤，消息背景透明但被 `drawBackground` 中的 `container-bg` 蒙层兜底覆盖，输出为纯色截图
- **有壁纸且加载成功**：完整后合成流程，输出包含模糊气泡效果的截图

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

### 步骤 4：Canvas 后合成模糊 + 拼接重构 (`screenshotCapture.ts`) ✅ 已实施

- `applyLayoutGuards` 增加 `hasWallpaper` 参数：有壁纸时 `.message-background-slice` 设为完全透明
- 新增 `createBlurredBackgroundCanvas()`：加载壁纸 → cover 绘制 + container-bg 蒙层 → blur 滤镜 → 返回模糊版 canvas
- 新增 `drawBlurredMessageBackground()`：clip 圆角 → drawImage 模糊片段 → 叠 card-bg 蒙层
- `captureMessagesAndStitch` 接收完整 `StitchOptions`（含 `bgConfig`、`gap`、`padding`、`enableDecoration`、`messageBorderRadius`）
- 实现异步加载壁纸图片并绘制的逻辑
- 实现 Canvas 2D 绘制背景、圆角、投影、外边框的逻辑
- 修正消息拼接的坐标计算，将 `padding` 和 `gap` 纳入累加
- `StitchOptions.messageBorderRadius` 由调用方从 DOM 中实际读取 `.message-background-container` 的 `border-radius`

### 步骤 5：弹窗状态桥接 (`ShareScreenshotDialog.vue` & `useScreenshotGenerator.ts`) ⚡ 待完善

- ✅ 在 `ShareScreenshotDialog.vue` 中初始化新的配置项状态
- ✅ 监听配置变化时，正确清空上一次的生成结果
- ✅ 从 DOM 读取 `messageBorderRadius` 传入 `StitchOptions`
- ⏳ 背景与间距配置面板 UI（`ScreenshotConfigPanel.vue` 待补充）
