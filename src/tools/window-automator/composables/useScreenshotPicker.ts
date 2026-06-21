/**
 * 截图取点 composable
 *
 * 职责：
 *  - 调用 wa_capture_window 截取当前绑定窗口的图像；
 *  - 将 ArrayBuffer 包装为 Object URL（避开 Tauri CSP 对 data: 的拦截）；
 *  - 提供画布上像素拾取（坐标 / 颜色 / 框选）。
 */

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ScreenshotPickerResult } from "../types";

const logger = createModuleLogger("window-automator/useScreenshotPicker");
const errorHandler = createModuleErrorHandler(
  "window-automator/useScreenshotPicker"
);

export type ScreenshotMode = "point" | "rect";

export interface RectPickResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useScreenshotPicker() {
  const imageUrl = ref<string | null>(null);
  const naturalWidth = ref(0);
  const naturalHeight = ref(0);
  const isCapturing = ref(false);

  /** 释放当前 Object URL（避免内存泄漏） */
  function revoke() {
    if (imageUrl.value) {
      try {
        URL.revokeObjectURL(imageUrl.value);
      } catch (e) {
        // ignore
      }
      imageUrl.value = null;
      naturalWidth.value = 0;
      naturalHeight.value = 0;
    }
  }

  /**
   * 截取指定 hwnd 的窗口客户区。
   * 内部用 Blob([ArrayBuffer], { type: 'image/png' }) 生成 Object URL，
   * 避免 Tauri CSP 拦截 fetch(data:...)。
   */
  async function capture(hwnd: number): Promise<boolean> {
    if (!hwnd) return false;
    isCapturing.value = true;
    revoke();
    const buffer = await errorHandler.wrapAsync(
      () => invoke<ArrayBuffer>("wa_capture_window", { hwnd }),
      { userMessage: "截图失败" }
    );
    isCapturing.value = false;
    if (!buffer) return false;
    const blob = new Blob([buffer], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    // 通过 Image 预加载以拿到原始宽高
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => {
        naturalWidth.value = img.naturalWidth;
        naturalHeight.value = img.naturalHeight;
        resolve();
      };
      img.onerror = () => {
        // 即使加载失败也把 URL 暴露给 UI，至少能显示
        resolve();
      };
      img.src = url;
    });
    imageUrl.value = url;
    logger.info("截图完成", {
      hwnd,
      width: naturalWidth.value,
      height: naturalHeight.value,
    });
    return true;
  }

  /**
   * 从 HTMLImageElement 获取指定像素的颜色（#RRGGBB）。
   * 要求 CORS 干净；Object URL 通常满足。
   */
  function pickColor(img: HTMLImageElement, x: number, y: number): string {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return "#000000";
    try {
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      const r = data[0] ?? 0;
      const g = data[1] ?? 0;
      const b = data[2] ?? 0;
      return rgbToHex(r, g, b);
    } catch (e) {
      logger.warn("取色失败", { error: String(e) });
      return "#000000";
    }
  }

  /**
   * 把点击事件相对图片的客户端坐标转换为原始像素坐标。
   * 配合 element-ui / 原生 img 标签使用。
   */
  function clientToImage(
    img: HTMLImageElement,
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  /** 单点取色封装：返回完整结果对象 */
  function buildPointResult(
    img: HTMLImageElement,
    clientX: number,
    clientY: number
  ): ScreenshotPickerResult {
    const { x, y } = clientToImage(img, clientX, clientY);
    const color = pickColor(img, x, y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      xPercent: naturalWidth.value > 0 ? (x / naturalWidth.value) * 100 : 0,
      yPercent: naturalHeight.value > 0 ? (y / naturalHeight.value) * 100 : 0,
      color,
    };
  }

  /** 框选区域封装 */
  function buildRectResult(
    img: HTMLImageElement,
    start: { clientX: number; clientY: number },
    end: { clientX: number; clientY: number }
  ): ScreenshotPickerResult {
    const a = clientToImage(img, start.clientX, start.clientY);
    const b = clientToImage(img, end.clientX, end.clientY);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    return {
      x: Math.round(x),
      y: Math.round(y),
      xPercent: naturalWidth.value > 0 ? (x / naturalWidth.value) * 100 : 0,
      yPercent: naturalHeight.value > 0 ? (y / naturalHeight.value) * 100 : 0,
      color: w > 0 && h > 0 ? pickColor(img, x + w / 2, y + h / 2) : "#000000",
      rect: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        xPercent: naturalWidth.value > 0 ? (x / naturalWidth.value) * 100 : 0,
        yPercent: naturalHeight.value > 0 ? (y / naturalHeight.value) * 100 : 0,
        widthPercent:
          naturalWidth.value > 0 ? (w / naturalWidth.value) * 100 : 0,
        heightPercent:
          naturalHeight.value > 0 ? (h / naturalHeight.value) * 100 : 0,
      },
    };
  }

  return {
    imageUrl,
    naturalWidth,
    naturalHeight,
    isCapturing,
    capture,
    revoke,
    pickColor,
    clientToImage,
    buildPointResult,
    buildRectResult,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
