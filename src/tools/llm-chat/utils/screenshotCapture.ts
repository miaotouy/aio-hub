/**
 * 消息截图核心工具。
 *
 * 关键能力:
 * - `captureElementAsCanvas`: 对单条消息节点 (`.message-slot`) 截图, 自动处理
 *   CSS 变量复制、content-visibility 强制可见、毛玻璃替换为实色背景、滚动条隐藏。
 * - `captureMessagesAndStitch`: V2 核心 — 并发截取每条消息, 纯 Canvas 2D 拼接为
 *   完整长图。
 *
 * 设计参考:
 * - `src/tools/component-tester/components/ScreenshotTester.vue` (modern-screenshot 基本用法)
 * - `src/tools/rich-text-renderer/components/RichTextRendererTester.vue` (onCloneNode 修复)
 */

import { domToCanvas } from "modern-screenshot";
import type { ScreenshotBgConfig } from "../components/screenshot/screenshotTypes";

// ===================== 类型 =====================

export interface ScreenshotScaleOptions {
  /** 高清倍率, 默认 2 (DPR 2x) */
  scale?: number;
  /** 单条消息节点的超时时间 (ms), 默认 30000 */
  timeout?: number;
  /** 是否在 onCloneNode 中隐藏所有滚动条, 默认 true */
  hideScrollbars?: boolean;
}

export interface CaptureElementOptions extends ScreenshotScaleOptions {
  /** 指定宽度, 不传则使用元素当前宽度 */
  width?: number;
  /** 指定高度, 不传则使用元素当前高度 */
  height?: number;
}

export interface StitchOptions extends ScreenshotScaleOptions {
  /**
   * 显式指定截图容器宽度 (CSS px)。
   *
   * 关键: ScreenshotRenderer 固定 720px, 但每个 .message-slot 在气泡模式下
   * 默认 width: auto, 也就是气泡的自然宽度 (~276px)。若不传 width,
   * captureElementAsCanvas 会用 rect.width, 导致截出来是窄条气泡, 再被
   * drawImage 强行拉伸到第一张图宽度, 排版全错。
   *
   * 必须由调用方显式传入 ScreenshotRenderer 的 width prop (默认 720px)。
   */
  width?: number;
  /** 并发截图的最大并行数, 默认 6 */
  concurrency?: number;
  /** 进度回调 */
  onProgress?: (done: number, total: number, currentLabel: string) => void;

  // --- V4: 背景与间距配置 ---
  /** 背景配置 */
  bgConfig?: ScreenshotBgConfig;
  /** 消息间距 (px), undefined 表示不加间距 (紧贴拼接) */
  gap?: number;
  /** 四周留白 (px) */
  padding?: number;
  /** 是否启用卡片装饰 (圆角边框 + 投影) */
  enableDecoration?: boolean;
  /** 消息背景容器的圆角 (px), 由调用方从 DOM 获取或传入, 默认 8 */
  messageBorderRadius?: number;
}

export interface StitchResult {
  canvas: HTMLCanvasElement;
  /** 总高度 (px, 未乘以 scale) */
  height: number;
  /** 宽度 (px, 未乘以 scale) */
  width: number;
}

// ===================== 内部辅助 =====================

/**
 * 等待所有图片解码完成 (含 background-image / content: url())。
 * 用于截图前的稳定性等待。
 */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          // 兜底超时 3s, 避免极少数图片卡死整个流程
          setTimeout(done, 3000);
        })
    )
  );
}

/**
 * 等待至少一个 RAF, 确保异步布局 (LaTeX / 代码高亮) 已完成。
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * 复制容器上的 CSS 变量到目标元素, 修复 SVG foreignObject
 * 离屏渲染时主题颜色/排版崩溃的问题。
 */
function copyCssVariables(source: HTMLElement, target: HTMLElement): void {
  const sourceStyles = getComputedStyle(source);
  const rootStyles = getComputedStyle(document.documentElement);

  for (const styles of [rootStyles, sourceStyles]) {
    for (let i = 0; i < styles.length; i++) {
      const prop = styles.item(i);
      if (prop && prop.startsWith("--")) {
        const value = styles.getPropertyValue(prop);
        if (value) {
          target.style.setProperty(prop, value);
        }
      }
    }
  }
}

/**
 * 在克隆树中应用排版保护:
 * 1. 强制 content-visibility: visible, 防止视口外空白
 * 2. 替换 backdrop-filter:
 *    - 对 .message-background-slice: 如果有壁纸则设为完全透明 (Canvas 后合成模糊)
 *    - 对其他元素: 回退为实色背景
 * 3. 可选: 注入临时样式隐藏所有滚动条
 */
function applyLayoutGuards(
  clonedRoot: HTMLElement,
  options: { hideScrollbars: boolean; hasWallpaper: boolean }
): void {
  const allElements = clonedRoot.querySelectorAll<HTMLElement>("*");
  for (const child of allElements) {
    child.style.setProperty("content-visibility", "visible", "important");
    child.style.setProperty("contain-intrinsic-size", "auto 0px", "important");

    const childStyle = getComputedStyle(child);
    if (
      childStyle.backdropFilter &&
      childStyle.backdropFilter !== "none" &&
      !childStyle.backdropFilter.includes("none")
    ) {
      // 对 .message-background-slice 做特殊处理
      if (
        options.hasWallpaper &&
        child.classList.contains("message-background-slice")
      ) {
        // 有壁纸时: 设为完全透明, 让 Canvas 后合成阶段绘制模糊壁纸
        child.style.backdropFilter = "none";
        child.style.backgroundColor = "transparent";
      } else {
        // 其他元素或无壁纸: 清除模糊, 实色回退
        child.style.backdropFilter = "none";
        const bg = childStyle.backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
          child.style.backgroundColor = "var(--card-bg)";
        }
      }
    }
  }

  if (options.hideScrollbars) {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; }
      pre, code, .markdown-table-wrapper, .html-preview-container, .code-preview-block, .cm-editor-inner {
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
      }
    `;
    clonedRoot.prepend(styleEl);
  }
}

// ===================== 公开 API =====================

/**
 * 将单个 DOM 节点截取为 Canvas。
 *
 * 包含三项关键修复:
 * - 显式指定 width/height 防止离屏渲染时尺寸失控
 * - onCloneNode 复制 CSS 变量
 * - 强制 content-visibility: visible 防止视口外空白
 */
export async function captureElementAsCanvas(
  element: HTMLElement,
  options: CaptureElementOptions & { hasWallpaper?: boolean } = {}
): Promise<HTMLCanvasElement> {
  const {
    scale = 2,
    timeout = 30000,
    hideScrollbars = true,
    hasWallpaper = false,
    width,
    height,
  } = options;

  // 等待图片与异步布局
  await waitForImages(element);
  await nextFrame();

  const rect = element.getBoundingClientRect();
  // 关键：如果元素处于 transform: scale 缩放容器中，rect.width/height 会被缩放。
  // offsetWidth/offsetHeight 拿到的永远是 1:1 的自然布局尺寸，能完美免疫缩放影响。
  const captureWidth = Math.ceil(width ?? element.offsetWidth ?? rect.width);
  const captureHeight = Math.ceil(
    height ?? element.offsetHeight ?? rect.height
  );

  return domToCanvas(element, {
    width: captureWidth,
    height: captureHeight,
    scale,
    timeout,
    features: {
      removeControlCharacter: true,
    },
    onCloneNode: (clonedNode) => {
      const el = clonedNode as HTMLElement;
      el.style.width = `${captureWidth}px`;
      el.style.minWidth = `${captureWidth}px`;
      el.style.maxWidth = `${captureWidth}px`;
      el.style.height = `${captureHeight}px`;
      el.style.boxSizing = "border-box";
      el.style.overflow = "visible";

      copyCssVariables(element, el);
      applyLayoutGuards(el, { hideScrollbars, hasWallpaper });
    },
  });
}

/**
 * 并发截取每条消息并拼接为长图。
 *
 * 算法:
 * 1. 并发截图 (Promise.all 限流到 concurrency 个), 得到 N 张独立 Canvas
 * 2. 计算总高度 = Σ(messageHeight)
 * 3. 创建大画布, 按 y 偏移依次 drawImage 消息 Canvas
 */
export async function captureMessagesAndStitch(
  elements: HTMLElement[],
  options: StitchOptions = {}
): Promise<StitchResult> {
  if (elements.length === 0) {
    throw new Error("captureMessagesAndStitch: 至少需要一条消息");
  }

  const { scale = 2, timeout = 30000, concurrency = 6, onProgress } = options;

  // 解析截图容器宽度: 1) 优先 options.width; 2) 回退父容器; 3) 兜底 720px
  // 关键: 千万不能用 rect.width, 气泡模式下那只是气泡自然宽度
  function resolveCaptureWidth(): number {
    if (options.width && options.width > 0) return options.width;
    if (elements.length > 0) {
      const parent = elements[0].parentElement;
      if (parent) {
        const w = parent.getBoundingClientRect().width;
        if (w > 0) return w;
      }
    }
    return 720;
  }
  const resolvedWidth = resolveCaptureWidth();

  // 0. 预检壁纸状态 (决定是否需要 Canvas 后合成模糊)
  const wallpaperSrc = parseWallpaperUrl();
  const hasWallpaper = !!wallpaperSrc;

  // 1. 并发截图 (限流)
  const messageCanvases: HTMLCanvasElement[] = [];
  let done = 0;
  const total = elements.length;

  // 关键：消息内容的实际宽度应该是总宽度扣除左右 padding，保持与 DOM 渲染时的实际宽度完全一致
  const padding = options.padding ?? 0;
  const contentWidth = Math.max(100, resolvedWidth - padding * 2);

  async function captureOne(el: HTMLElement, idx: number): Promise<void> {
    const canvas = await captureElementAsCanvas(el, {
      scale,
      timeout,
      width: contentWidth,
      hasWallpaper,
    });
    messageCanvases[idx] = canvas;
    done += 1;
    onProgress?.(done, total, el.dataset.messageId ?? `#${idx + 1}`);
  }

  // 简易并发限流
  const tasks = elements.map((el, idx) => () => captureOne(el, idx));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    let cursor = i;
    const run = async () => {
      while (cursor < tasks.length) {
        const t = tasks[cursor];
        cursor += concurrency;
        await t();
      }
    };
    workers.push(run());
  }
  await Promise.all(workers);

  // 2. 计算总尺寸 (CSS 像素, 不乘 scale)
  // V4: gap 默认 8px (与 ScreenshotRenderer CSS 中 mode-card 的 gap 默认一致)
  const gap = options.gap ?? 8;
  const captureWidth = contentWidth;
  const messageHeights = messageCanvases.map((c) => c.height / scale);
  const contentHeight =
    messageHeights.reduce((sum, h) => sum + h, 0) +
    gap * Math.max(0, messageHeights.length - 1);
  const totalWidth = resolvedWidth; // 总宽度正好等于解析出的 resolvedWidth
  const totalHeight = contentHeight + padding * 2;

  // 3. 创建大画布
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(totalWidth * scale);
  canvas.height = Math.ceil(totalHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("captureMessagesAndStitch: 无法获取 2D context");
  }
  ctx.scale(scale, scale);

  // 4. 绘制背景 (壁纸模式需要异步加载图片)
  await drawBackground(ctx, totalWidth, totalHeight, options.bgConfig);

  // 5. 绘制卡片装饰 (圆角边框 + 投影)
  if (options.enableDecoration) {
    drawDecoration(ctx, totalWidth, totalHeight);
  }

  // 6. V4 模糊合成: 如果有壁纸, 为每条消息的背景区域绘制模糊壁纸 + 蒙层
  const borderRadius = options.messageBorderRadius ?? 8;
  let blurredBgCanvas: HTMLCanvasElement | null = null;

  if (hasWallpaper) {
    blurredBgCanvas = await createBlurredBackgroundCanvas(
      totalWidth,
      totalHeight,
      scale,
      options.bgConfig
    );
  }

  // 7. 拼接消息 Canvas — 精确累加 gap, 含模糊背景合成
  let y = padding;
  for (let i = 0; i < messageCanvases.length; i++) {
    const msgCanvas = messageCanvases[i];
    const h = messageHeights[i];

    // 如果有壁纸, 先在消息区域绘制模糊背景 + card-bg 蒙层
    if (blurredBgCanvas) {
      drawBlurredMessageBackground(
        ctx,
        blurredBgCanvas,
        scale,
        padding,
        y,
        captureWidth,
        h,
        borderRadius
      );
    }

    try {
      ctx.drawImage(msgCanvas, padding, y, captureWidth, h);
    } catch (err) {
      // 单条截图失败不应阻塞整图, 继续下一条
      console.warn(`[screenshotCapture] drawImage 失败 (msg #${i}):`, err);
    }
    y += h + gap;
  }

  return {
    canvas,
    width: totalWidth,
    height: totalHeight,
  };
}

// ===================== V4: 模糊背景合成 =====================

/**
 * 创建一张与最终大图同尺寸的"模糊版背景" Canvas。
 *
 * 流程:
 * 1. 绘制壁纸 (cover) + container-bg 蒙层 (模拟真实渲染中消息下方的内容)
 * 2. 对整张 canvas 应用 blur 滤镜
 *
 * 返回的 canvas 供后续 clip + drawImage 使用, 模拟 backdrop-filter 效果。
 */
async function createBlurredBackgroundCanvas(
  width: number,
  height: number,
  scale: number,
  bgConfig?: ScreenshotBgConfig
): Promise<HTMLCanvasElement | null> {
  const wallpaperSrc = parseWallpaperUrl();
  if (!wallpaperSrc) return null;

  const img = await loadImageAsync(wallpaperSrc);
  if (!img) return null;

  // 获取模糊半径
  const blurRaw = getComputedStyle(document.documentElement)
    .getPropertyValue("--ui-blur")
    .trim();
  const blurRadius = parseFloat(blurRaw) || 10;

  // 获取 container-bg 蒙层色
  const themeBgRaw = getComputedStyle(document.documentElement)
    .getPropertyValue("--container-bg")
    .trim();

  // 获取壁纸不透明度
  let wallpaperOpacity = 1;
  if (bgConfig?.type === "wallpaper") {
    wallpaperOpacity = bgConfig.wallpaperOpacity ?? 0.6;
  } else {
    const opacityRaw = getComputedStyle(document.documentElement)
      .getPropertyValue("--wallpaper-opacity")
      .trim();
    wallpaperOpacity = opacityRaw ? parseFloat(opacityRaw) : 1;
  }

  // 1. 创建"原始背景" canvas (壁纸 + 蒙层, 未模糊)
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.ceil(width * scale);
  bgCanvas.height = Math.ceil(height * scale);
  const bgCtx = bgCanvas.getContext("2d");
  if (!bgCtx) return null;
  bgCtx.scale(scale, scale);

  // 绘制主题底色
  const themeBgColor = getThemeBgColor();
  bgCtx.fillStyle = themeBgColor;
  bgCtx.fillRect(0, 0, width, height);

  // Cover 绘制壁纸
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = width / height;
  let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
  if (imgRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * imgRatio;
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  } else {
    drawWidth = width;
    drawHeight = width / imgRatio;
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  }

  bgCtx.save();
  bgCtx.globalAlpha = wallpaperOpacity;
  bgCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  bgCtx.restore();

  // 叠 container-bg 蒙层
  if (themeBgRaw) {
    bgCtx.fillStyle = themeBgRaw;
    bgCtx.fillRect(0, 0, width, height);
  }

  // 2. 创建"模糊版"canvas: 从原始背景 drawImage 并应用 blur 滤镜
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = bgCanvas.width;
  blurCanvas.height = bgCanvas.height;
  const blurCtx = blurCanvas.getContext("2d");
  if (!blurCtx) return null;

  // 使用 CanvasRenderingContext2D.filter 应用高斯模糊
  blurCtx.filter = `blur(${blurRadius * scale}px)`;
  blurCtx.drawImage(bgCanvas, 0, 0);
  blurCtx.filter = "none";

  return blurCanvas;
}

/**
 * 在大 Canvas 上为单条消息绘制模糊背景 + card-bg 蒙层。
 *
 * 相当于 AE 合成中的:
 * 1. 圆角矩形 mask → 裁剪模糊壁纸
 * 2. 叠半透明 card-bg 色块
 */
function drawBlurredMessageBackground(
  ctx: CanvasRenderingContext2D,
  blurredBgCanvas: HTMLCanvasElement,
  scale: number,
  msgX: number,
  msgY: number,
  msgW: number,
  msgH: number,
  borderRadius: number
): void {
  // 获取 card-bg 颜色 (半透明蒙层)
  const cardBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--card-bg")
    .trim();

  ctx.save();

  // Clip 出消息背景区域 (圆角矩形)
  ctx.beginPath();
  ctx.roundRect(msgX, msgY, msgW, msgH, borderRadius);
  ctx.clip();

  // 从模糊背景 canvas 上取对应区域绘制
  // 注意: blurredBgCanvas 是 scale 倍尺寸, 需要用像素坐标
  ctx.drawImage(
    blurredBgCanvas,
    msgX * scale,
    msgY * scale,
    msgW * scale,
    msgH * scale,
    msgX,
    msgY,
    msgW,
    msgH
  );

  // 叠半透明 card-bg 蒙层
  if (cardBg && cardBg !== "transparent") {
    ctx.fillStyle = cardBg;
    ctx.fillRect(msgX, msgY, msgW, msgH);
  }

  ctx.restore();
}

// ===================== V4: 背景绘制 =====================

/**
 * 从 CSS 变量 `--wallpaper-url` 解析出实际的 URL 字符串。
 * 变量格式通常为: `url('/wallpapers/xxx.png')` 或 `url('https://...')` 或 `url('asset://...')`
 *
 * 注意: 文件名可能包含 `()` 等特殊字符, 必须使用引号配对匹配而非惰性匹配,
 * 否则文件名中的 `)` 会导致正则提前截断 (如 `card_normal (93).jpg`)。
 */
function parseWallpaperUrl(): string | null {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--wallpaper-url")
    .trim();
  if (!raw || raw === "none") return null;

  // 优先匹配有引号包裹的 url('...') 或 url("...") — 使用反向引用确保引号配对
  const quotedMatch = raw.match(/url\(\s*(['"])(.+)\1\s*\)/);
  if (quotedMatch) return quotedMatch[2];

  // 无引号情况: url(...)，匹配到字符串末尾的 ) (贪婪, 取最后一个右括号)
  const unquotedMatch = raw.match(/url\(\s*(.+)\s*\)$/);
  return unquotedMatch?.[1]?.trim() ?? null;
}

/**
 * 加载图片为 HTMLImageElement，带超时兜底。
 */
function loadImageAsync(
  src: string,
  timeoutMs = 5000
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * 获取当前主题的不透明背景色
 */
function getThemeBgColor(): string {
  const themeBg = getComputedStyle(document.documentElement)
    .getPropertyValue("--container-bg")
    .trim();
  if (!themeBg) return "#ffffff";
  const match = themeBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
  }
  return themeBg;
}

/**
 * 在 Canvas 上绘制背景。
 * - solid: 纯色填充
 * - theme: 读取当前主题容器背景色 (强制不透明)
 * - wallpaper: 加载系统壁纸图片, cover 绘制, 叠加半透明蒙层
 * - 未配置时默认白色
 */
async function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgConfig?: ScreenshotBgConfig
): Promise<void> {
  const themeBgColor = getThemeBgColor();
  const themeBgRaw = getComputedStyle(document.documentElement)
    .getPropertyValue("--container-bg")
    .trim();

  if (!bgConfig) {
    // 默认使用当前主题的不透明背景色，避免半透明输出
    ctx.fillStyle = themeBgColor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  switch (bgConfig.type) {
    case "solid":
      ctx.fillStyle = bgConfig.color || themeBgColor;
      ctx.fillRect(0, 0, width, height);
      break;
    case "theme": {
      // 1. 先铺当前主题的不透明背景色
      ctx.fillStyle = themeBgColor;
      ctx.fillRect(0, 0, width, height);

      // 2. 如果系统当前有壁纸，也需要跟随壁纸！
      const wallpaperSrc = parseWallpaperUrl();
      if (wallpaperSrc) {
        const img = await loadImageAsync(wallpaperSrc);
        if (img) {
          const wallpaperOpacity = getComputedStyle(document.documentElement)
            .getPropertyValue("--wallpaper-opacity")
            .trim();
          const opacity = wallpaperOpacity ? parseFloat(wallpaperOpacity) : 1;

          // Cover 绘制: 等比缩放填满整个画布
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const canvasRatio = width / height;
          let drawWidth: number,
            drawHeight: number,
            drawX: number,
            drawY: number;
          if (imgRatio > canvasRatio) {
            drawHeight = height;
            drawWidth = height * imgRatio;
            drawX = (width - drawWidth) / 2;
            drawY = 0;
          } else {
            drawWidth = width;
            drawHeight = width / imgRatio;
            drawX = 0;
            drawY = (height - drawHeight) / 2;
          }

          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          ctx.restore();

          // 3. 叠加半透明主题色蒙层，保证文字可读性
          if (themeBgRaw) {
            ctx.fillStyle = themeBgRaw;
            ctx.fillRect(0, 0, width, height);
          }
        }
      }
      break;
    }
    case "wallpaper": {
      // 1. 先铺当前主题的不透明背景色，而不是硬编码的白色！
      ctx.fillStyle = themeBgColor;
      ctx.fillRect(0, 0, width, height);

      // 2. 尝试加载系统壁纸图片
      const wallpaperSrc = parseWallpaperUrl();
      if (wallpaperSrc) {
        const img = await loadImageAsync(wallpaperSrc);
        if (img) {
          // Cover 绘制: 等比缩放填满整个画布
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const canvasRatio = width / height;
          let drawWidth: number,
            drawHeight: number,
            drawX: number,
            drawY: number;
          if (imgRatio > canvasRatio) {
            drawHeight = height;
            drawWidth = height * imgRatio;
            drawX = (width - drawWidth) / 2;
            drawY = 0;
          } else {
            drawWidth = width;
            drawHeight = width / imgRatio;
            drawX = 0;
            drawY = (height - drawHeight) / 2;
          }

          ctx.save();
          ctx.globalAlpha = bgConfig.wallpaperOpacity ?? 0.6;
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          ctx.restore();

          // 3. 叠加半透明主题色蒙层，保证文字可读性
          if (themeBgRaw) {
            ctx.fillStyle = themeBgRaw;
            ctx.fillRect(0, 0, width, height);
          }
        }
      }
      break;
    }
  }
}

// ===================== V4: 卡片装饰绘制 =====================

/**
 * 绘制精致的圆角矩形外边框与微弱投影。
 */
function drawDecoration(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const radius = 12;
  const inset = 0.5; // 边框内缩半像素, 避免被裁切

  // 投影
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.06)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // 圆角路径
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, radius);
  ctx.closePath();

  // 仅绘制投影 (透明填充触发阴影渲染)
  ctx.fillStyle = "rgba(0, 0, 0, 0)";
  ctx.fill();
  ctx.restore();

  // 边框
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, radius);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * 将 Canvas 转换为 Uint8Array (PNG 字节流), 用于 Tauri writeFile。
 *
 * 严格遵守 CSP 规范: 不使用 fetch(dataUrl), 而是 atob + Uint8Array 解码。
 */
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

/**
 * 将 Canvas 复制到剪贴板 (PNG)。
 *
 * 使用 navigator.clipboard.write + ClipboardItem, 是当前唯一支持图像剪贴板的 API。
 * 部分平台 (老旧 WebView) 不支持时, 调用方应 catch 并降级到"保存到本地"。
 */
export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement
): Promise<void> {
  if (typeof ClipboardItem === "undefined") {
    throw new Error("当前环境不支持 ClipboardItem, 无法复制图片到剪贴板");
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Canvas 转 Blob 失败"));
    }, "image/png");
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
