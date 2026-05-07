/**
 * 图片处理器（纯 Canvas API，零依赖）
 * 用于前端图片尺寸获取、缩放和格式转换
 *
 * 所有操作均使用 try/catch 包裹，失败时安全回退到原始数据。
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
  /** 输出格式 */
  format?: "jpeg" | "webp" | "png";
  /** 质量 (0.1-1.0)，仅对有损格式有效 */
  quality?: number;
}

/**
 * 判断字符串是否为 base64 编码的图片数据
 * 支持带 data: 前缀和不带前缀的纯 base64
 */
function isBase64(str: string): boolean {
  return /^(?:data:)?[A-Za-z0-9+/]*={0,2}$/.test(str.replace(/^data:image\/[^;]+;base64,/, ""));
}

/**
 * 解析输入源，返回可用的 base64 字符串（不含 data: 前缀）
 */
async function resolveSource(source: string | ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof source === "string") {
    if (source.startsWith("data:")) {
      return source;
    }
    if (isBase64(source)) {
      return `data:image/png;base64,${source}`;
    }
    return source;
  }

  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const blob = new Blob([bytes], { type: "image/png" });
  return URL.createObjectURL(blob);
}

/**
 * 从图片源获取尺寸信息
 * 使用 Image 对象解析，耗时通常 <10ms
 */
export async function getImageDimensions(source: string | ArrayBuffer | Uint8Array): Promise<ImageDimensions> {
  const url = await resolveSource(source);
  const isBlob = url.startsWith("blob:");

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (isBlob) URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    image.src = url;
  });

  const byteLength =
    typeof source === "string"
      ? Math.ceil((source.startsWith("data:") ? source.split(",")[1] || source : source).length * 0.75)
      : source instanceof ArrayBuffer
        ? source.byteLength
        : source.length;

  return { width: img.naturalWidth, height: img.naturalHeight, byteLength };
}

/**
 * 等比缩放图片到指定的最大尺寸
 * 支持格式转换（jpeg / webp / png）
 *
 * 如果原图尺寸已在限制内，且格式不变，不做处理直接返回原始 base64
 */
export async function resizeImage(source: string | ArrayBuffer | Uint8Array, options: ResizeOptions): Promise<string> {
  try {
    const url = await resolveSource(source);
    const isBlob = url.startsWith("blob:");

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (isBlob) URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        if (isBlob) URL.revokeObjectURL(url);
        reject(new Error("图片加载失败"));
      };
      image.src = url;
    });

    const { naturalWidth: originalW, naturalHeight: originalH } = img;
    const { maxWidth, maxHeight } = options;

    // 计算缩放目标尺寸，始终保持宽高比
    let targetW = originalW;
    let targetH = originalH;

    if (originalW > maxWidth || originalH > maxHeight) {
      const scale = Math.min(maxWidth / originalW, maxHeight / originalH);
      targetW = Math.floor(originalW * scale);
      targetH = Math.floor(originalH * scale);
    }

    // 确定输出格式
    const format = options.format || "png";
    const mimeType = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
    const quality = format !== "png" ? (options.quality ?? 0.85) : undefined;

    // 零开销短路：不需要缩放且格式不变
    if (targetW === originalW && targetH === originalH && mimeType === "image/png") {
      if (typeof source === "string") {
        return source.startsWith("data:") ? source : `data:image/png;base64,${source}`;
      }
      // 二进制源还是得画一遍
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法获取 Canvas 上下文");
    }

    // JPEG 不支持透明通道，用白色背景填充
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    return canvas.toDataURL(mimeType, quality);
  } catch (error) {
    logger.warn("图片缩放失败，返回原始数据", { error });
    // 失败回退
    if (typeof source === "string") {
      return source.startsWith("data:") ? source : `data:image/png;base64,${source}`;
    }
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const binary = Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
    return `data:image/png;base64,${btoa(binary)}`;
  }
}
