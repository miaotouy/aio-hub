/**
 * 图片处理器（纯 Canvas API，零依赖）
 * 用于前端图片尺寸获取、缩放和格式转换
 *
 * 设计原则：二进制进，二进制出。
 * 输入/输出均为 ArrayBuffer，不沾染 base64 或其他编码。
 * 调用方需要什么编码自己转换——本模块只做图片像素处理。
 *
 * 适合在 asset-resolver 中对图片进行发送前预处理。
 */

import { createModuleLogger } from "./logger";

const logger = createModuleLogger("imageProcessor");

export interface ImageDimensions {
  width: number;
  height: number;
  /** 原始二进制数据的字节数 */
  byteLength: number;
}

export interface ResizeOptions {
  /** 最大宽度 */
  maxWidth: number;
  /** 最大高度 */
  maxHeight: number;
  /** 输出格式（默认保持原输入格式） */
  format?: "jpeg" | "webp" | "png";
  /** 质量 (0.1-1.0)，仅对有损格式有效 */
  quality?: number;
}

/**
 * 从 ArrayBuffer 加载 HTMLImageElement
 */
function loadImageFromBuffer(
  buffer: ArrayBuffer
): Promise<{ img: HTMLImageElement; cleanup: () => void }> {
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ img: image, cleanup: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    image.src = url;
  });
}

/**
 * 从图片二进制获取尺寸信息
 */
export async function getImageDimensions(
  buffer: ArrayBuffer
): Promise<ImageDimensions> {
  try {
    const { img, cleanup } = await loadImageFromBuffer(buffer);
    cleanup();
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      byteLength: buffer.byteLength,
    };
  } catch (error) {
    logger.warn("获取图片尺寸失败", { error });
    return { width: 0, height: 0, byteLength: buffer.byteLength };
  }
}

/**
 * 等比缩放图片到指定的最大尺寸，支持格式转换
 *
 * 输入 ArrayBuffer → 输出 ArrayBuffer（纯二进制流）
 *
 * 短路优化：若尺寸无需缩放且未指定格式转换，直接返回原 buffer。
 */
export async function resizeImage(
  buffer: ArrayBuffer,
  options: ResizeOptions
): Promise<ArrayBuffer> {
  try {
    const { img, cleanup } = await loadImageFromBuffer(buffer);

    const { naturalWidth: originalW, naturalHeight: originalH } = img;
    const { maxWidth, maxHeight } = options;

    let targetW = originalW;
    let targetH = originalH;

    if (originalW > maxWidth || originalH > maxHeight) {
      const scale = Math.min(maxWidth / originalW, maxHeight / originalH);
      targetW = Math.floor(originalW * scale);
      targetH = Math.floor(originalH * scale);
    }

    const format = options.format;
    // 未指定格式且无需缩放 → 直接返回原始 buffer，零开销
    if (!format || format === "png") {
      if (targetW === originalW && targetH === originalH) {
        cleanup();
        return buffer;
      }
    }

    const mimeType =
      format === "jpeg"
        ? "image/jpeg"
        : format === "webp"
          ? "image/webp"
          : "image/png";
    const quality =
      format && format !== "png" ? (options.quality ?? 0.85) : undefined;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cleanup();
      throw new Error("无法获取 Canvas 上下文");
    }

    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);
    cleanup();

    // Canvas → Blob → ArrayBuffer（纯二进制，不经过 base64）
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob 失败"))),
        mimeType,
        quality
      );
    });
    return await blob.arrayBuffer();
  } catch (error) {
    logger.warn("图片缩放失败，回退到原始数据", { error });
    return buffer;
  }
}
