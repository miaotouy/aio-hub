// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 区域截图 + OCR 滤镜预览（屏幕模式 / 本地视频模式共用）。
 *
 * 与来源解耦：source 可以是 `<video>` 当前帧、`<img>`、`<canvas>`、`ImageBitmap`
 * 或来自后端单次截屏的 `Blob`。所有函数只负责像素处理，不持有响应式状态。
 */

import { useOcrRunner } from "@/tools/smart-ocr/platform";
import type { ImageBlock, OcrEngineConfig } from "@/tools/smart-ocr/types";
import {
  applyImageFilterToPixels,
  canvasToPngBlob,
  isImageFilterActive,
} from "./image";
import type { ImageFilterConfig } from "../types";

/** 像素坐标的矩形区域 */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 可截图来源 */
export type CaptureSource =
  HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** 读取来源的像素尺寸（未缩放的自然尺寸）。 */
export function getSourceDimensions(source: CaptureSource): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }
  if ("naturalWidth" in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Release decoded resources owned by a capture source. */
export function releaseCaptureSource(
  source: CaptureSource | null | undefined
): void {
  if (
    source &&
    typeof ImageBitmap !== "undefined" &&
    source instanceof ImageBitmap
  ) {
    source.close();
  }
}

/** 将任意矩形夹取到来源范围内，保证宽高 >= 1 的整数像素。 */
export function normalizePixelRect(
  rect: PixelRect,
  sourceWidth: number,
  sourceHeight: number
): PixelRect {
  const maxX = Math.max(0, Math.floor(sourceWidth) - 1);
  const maxY = Math.max(0, Math.floor(sourceHeight) - 1);
  const x = Math.min(maxX, Math.max(0, Math.floor(rect.x)));
  const y = Math.min(maxY, Math.max(0, Math.floor(rect.y)));
  const width = Math.max(
    1,
    Math.min(Math.floor(sourceWidth) - x, Math.ceil(rect.width))
  );
  const height = Math.max(
    1,
    Math.min(Math.floor(sourceHeight) - y, Math.ceil(rect.height))
  );
  return { x, y, width, height };
}

/** 来源是否已经具备可绘制尺寸。 */
export function isSourceReady(source: CaptureSource): boolean {
  const { width, height } = getSourceDimensions(source);
  return width > 0 && height > 0;
}

/**
 * 把来源按 rect 裁剪绘制到 Canvas。传入 canvas 可复用画布，避免频繁分配。
 */
export function captureRegionToCanvas(
  source: CaptureSource,
  rect: PixelRect,
  canvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const { width, height } = getSourceDimensions(source);
  if (width <= 0 || height <= 0) {
    throw new Error("截图来源尚未准备就绪");
  }
  const region = normalizePixelRect(rect, width, height);
  const target = canvas ?? document.createElement("canvas");
  target.width = region.width;
  target.height = region.height;
  const ctx = target.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建截图画布");
  ctx.clearRect(0, 0, region.width, region.height);
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height
  );
  return target;
}

/** 原地对 Canvas 应用 OCR 滤镜；滤镜未启用时直接返回原画布。 */
export function applyFilterToCanvas(
  canvas: HTMLCanvasElement,
  filter: ImageFilterConfig
): HTMLCanvasElement {
  if (!isImageFilterActive(filter)) return canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建滤镜画布");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData.data.set(applyImageFilterToPixels(imageData.data, filter));
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const target = document.createElement("canvas");
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d", { willReadFrequently: true });
  ctx?.drawImage(source, 0, 0);
  return target;
}

export interface FilteredRegionResult {
  originalCanvas: HTMLCanvasElement;
  filteredCanvas: HTMLCanvasElement;
  originalUrl: string;
  filteredUrl: string;
}

/**
 * 裁剪区域并生成原图 / 处理图两张画布与对应 Object URL。
 * 调用方负责在不再使用时 `revokeRegionUrls(result)` 释放。
 */
export function renderFilteredRegion(
  source: CaptureSource,
  rect: PixelRect,
  filter: ImageFilterConfig
): FilteredRegionResult {
  const originalCanvas = captureRegionToCanvas(source, rect);
  const filteredCanvas = isImageFilterActive(filter)
    ? applyFilterToCanvas(cloneCanvas(originalCanvas), filter)
    : originalCanvas;
  return {
    originalCanvas,
    filteredCanvas,
    originalUrl: originalCanvas.toDataURL("image/png"),
    filteredUrl:
      filteredCanvas === originalCanvas
        ? ""
        : filteredCanvas.toDataURL("image/png"),
  };
}

/** 释放 `renderFilteredRegion` 产生的资源（data URL 无需释放，保留占位）。 */
export function revokeRegionUrls(_result: FilteredRegionResult | null): void {
  // data URL 不占用 Object URL 生命周期；保留此函数以便未来切换到 blob URL。
}

/** 由 Canvas 构造 smart-ocr 的 ImageBlock。 */
export function canvasToImageBlock(
  canvas: HTMLCanvasElement,
  imageId: string
): ImageBlock {
  return {
    id: `blk-${imageId}`,
    imageId,
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
    startY: 0,
    endY: canvas.height,
    width: canvas.width,
    height: canvas.height,
  };
}

/** 对单张 Canvas 执行一次 OCR（单帧试识别）。 */
export async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  engineConfig: OcrEngineConfig,
  signal?: AbortSignal
): Promise<string> {
  const imageId = `frame-${Date.now()}`;
  const block = canvasToImageBlock(canvas, imageId);
  const { runOcr } = useOcrRunner();
  const results = await runOcr([block], engineConfig, undefined, signal);
  return results[0]?.text?.trim() ?? "";
}

/** 把 Blob（如后端截屏 PNG）解成可绘制的 CaptureSource。 */
export async function blobToCaptureSource(blob: Blob): Promise<CaptureSource> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法解码截图"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 供外部（如单测）确认滤镜结果，返回处理后的 PNG Blob。 */
export async function filteredRegionToBlob(
  source: CaptureSource,
  rect: PixelRect,
  filter: ImageFilterConfig
): Promise<Blob> {
  const { filteredCanvas } = renderFilteredRegion(source, rect, filter);
  return canvasToPngBlob(filteredCanvas);
}
