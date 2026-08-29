// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { ImageBlock } from "@/tools/smart-ocr/types";
import type { ImageFilterConfig } from "../types";

/**
 * 滤镜配置是否会修改图片像素。原图预设和所有参数均为默认值时跳过 Canvas 像素循环。
 */
export function isImageFilterActive(config: ImageFilterConfig): boolean {
  return (
    config.grayscale ||
    config.brightness !== 0 ||
    config.contrast !== 0 ||
    config.saturation !== 0 ||
    config.hue !== 0 ||
    config.invert ||
    config.binarize
  );
}

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, lightness];

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === nr) {
    hue = (ng - nb) / delta + (ng < nb ? 6 : 0);
  } else if (max === ng) {
    hue = (nb - nr) / delta + 2;
  } else {
    hue = (nr - ng) / delta + 4;
  }

  return [hue * 60, saturation, lightness];
}

function hueToRgb(p: number, q: number, hue: number): number {
  const t = ((hue % 1) + 1) % 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number
): [number, number, number] {
  if (saturation === 0) {
    const gray = lightness * 255;
    return [gray, gray, gray];
  }

  const normalizedHue = normalizeHue(hue) / 360;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    hueToRgb(p, q, normalizedHue) * 255,
    hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
  ];
}

/**
 * 对 RGBA 像素缓冲区应用 OCR 滤镜。输入不会被修改，方便在无 Canvas 的测试环境中验证。
 * 顺序固定为：色相/饱和度 → 亮度/对比度 → 灰度 → 反色 → 二值化。
 */
export function applyImageFilterToPixels(
  source: Uint8ClampedArray,
  config: ImageFilterConfig
): Uint8ClampedArray {
  if (!isImageFilterActive(config)) return new Uint8ClampedArray(source);

  const output = new Uint8ClampedArray(source);
  const contrastFactor =
    config.contrast === 0
      ? 1
      : (259 * (config.contrast + 255)) / (255 * (259 - config.contrast));
  const brightnessOffset = config.brightness * 2.55;
  const saturationFactor = 1 + config.saturation / 100;

  for (let index = 0; index < output.length; index += 4) {
    let red = output[index];
    let green = output[index + 1];
    let blue = output[index + 2];

    if (config.hue !== 0 || config.saturation !== 0) {
      const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
      [red, green, blue] = hslToRgb(
        hue + config.hue,
        clamp(saturation * saturationFactor, 0, 1),
        lightness
      );
    }

    red = clamp(contrastFactor * (red - 128) + 128 + brightnessOffset);
    green = clamp(contrastFactor * (green - 128) + 128 + brightnessOffset);
    blue = clamp(contrastFactor * (blue - 128) + 128 + brightnessOffset);

    if (config.grayscale) {
      const gray = clamp(red * 0.299 + green * 0.587 + blue * 0.114);
      red = gray;
      green = gray;
      blue = gray;
    }

    if (config.invert) {
      red = 255 - red;
      green = 255 - green;
      blue = 255 - blue;
    }

    if (config.binarize) {
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const value = luminance >= config.threshold ? 255 : 0;
      red = value;
      green = value;
      blue = value;
    }

    output[index] = red;
    output[index + 1] = green;
    output[index + 2] = blue;
  }

  return output;
}

/** 将 Canvas 编码为 PNG Blob；编码失败时显式拒绝。 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("无法编码处理后的 OCR 图片"));
      }
    }, "image/png");
  });
}

/** 使用 FileReader 生成 data URL，避免 fetch(dataUrl) 触发 Tauri CSP 限制。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("无法读取 OCR 图片数据"));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("读取 OCR 图片失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 HTMLImageElement 绘制到 Canvas 并构造 ImageBlock 供 runOcr 使用。
 * 已有 PNG data URL 时直接复用，避免再次编码 Canvas。
 */
export function createImageBlock(
  image: HTMLImageElement,
  imageId: string,
  canvas?: HTMLCanvasElement,
  dataUrl?: string
): ImageBlock {
  const targetCanvas = canvas || document.createElement("canvas");
  targetCanvas.width = image.naturalWidth;
  targetCanvas.height = image.naturalHeight;

  const ctx = targetCanvas.getContext("2d");
  ctx?.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx?.drawImage(image, 0, 0);

  return {
    id: `blk-${imageId}`,
    imageId,
    canvas: targetCanvas,
    dataUrl: dataUrl ?? targetCanvas.toDataURL("image/png"),
    startY: 0,
    endY: targetCanvas.height,
    width: targetCanvas.width,
    height: targetCanvas.height,
  };
}

/**
 * 在 Canvas 上应用滤镜并返回处理后的 PNG Blob。调用方应只在滤镜启用时使用它。
 */
export async function createFilteredImageBlob(
  image: HTMLImageElement,
  config: ImageFilterConfig,
  canvas?: HTMLCanvasElement
): Promise<Blob> {
  const targetCanvas = canvas || document.createElement("canvas");
  targetCanvas.width = image.naturalWidth;
  targetCanvas.height = image.naturalHeight;

  const ctx = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建 OCR 图像处理画布");

  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(
    0,
    0,
    targetCanvas.width,
    targetCanvas.height
  );
  imageData.data.set(applyImageFilterToPixels(imageData.data, config));
  ctx.putImageData(imageData, 0, 0);
  return canvasToPngBlob(targetCanvas);
}
