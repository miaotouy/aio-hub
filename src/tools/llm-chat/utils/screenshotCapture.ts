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
 * 2. 替换 backdrop-filter 为实色背景 (毛玻璃在 SVG foreignObject 中丢失)
 * 3. 可选: 注入临时样式隐藏所有滚动条
 */
function applyLayoutGuards(
  clonedRoot: HTMLElement,
  options: { hideScrollbars: boolean }
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
      child.style.backdropFilter = "none";
      // 若没有背景色, 给一个实色回退
      const bg = childStyle.backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") {
        child.style.backgroundColor = "var(--card-bg)";
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
  options: CaptureElementOptions = {}
): Promise<HTMLCanvasElement> {
  const {
    scale = 2,
    timeout = 30000,
    hideScrollbars = true,
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
      applyLayoutGuards(el, { hideScrollbars });
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

  // 1. 并发截图 (限流)
  const messageCanvases: HTMLCanvasElement[] = [];
  let done = 0;
  const total = elements.length;

  async function captureOne(el: HTMLElement, idx: number): Promise<void> {
    const canvas = await captureElementAsCanvas(el, {
      scale,
      timeout,
      width: resolvedWidth,
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
  const captureWidth = resolvedWidth;
  const messageHeights = messageCanvases.map((c) => c.height / scale);
  const totalHeight = messageHeights.reduce((sum, h) => sum + h, 0);

  // 3. 创建大画布
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(captureWidth * scale);
  canvas.height = Math.ceil(totalHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("captureMessagesAndStitch: 无法获取 2D context");
  }
  ctx.scale(scale, scale);

  // 4. 拼接消息 Canvas — 纯消息叠加, 不做卡片装饰
  let y = 0;
  for (let i = 0; i < messageCanvases.length; i++) {
    const msgCanvas = messageCanvases[i];
    const h = messageHeights[i];
    try {
      ctx.drawImage(msgCanvas, 0, y, captureWidth, h);
    } catch (err) {
      // 单条截图失败不应阻塞整图, 继续下一条
      console.warn(`[screenshotCapture] drawImage 失败 (msg #${i}):`, err);
    }
    y += h;
  }

  return {
    canvas,
    width: captureWidth,
    height: totalHeight,
  };
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
