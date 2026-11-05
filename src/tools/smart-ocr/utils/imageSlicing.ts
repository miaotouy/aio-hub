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

import type { SlicerConfig } from "../types";

import {
  calculateRowVariance,
  planImageSlicesFromVariances,
} from "./imageSlicePlan";
import type { ImageSlicePlan } from "./imageSlicePlan";
export {
  DEFAULT_SLICER_CONFIG,
  planImageSlicesFromVariances,
} from "./imageSlicePlan";
export type { ImageSlicePlan } from "./imageSlicePlan";

/** Analyze strips at original resolution, keeping the temporary canvas small. */
export function planImageSlices(
  image: HTMLImageElement,
  config: SlicerConfig
): ImageSlicePlan {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("图片尺寸无效");
  if (!config.enabled || height / width <= config.aspectRatioThreshold) {
    return planImageSlicesFromVariances(width, height, [], {
      ...config,
      enabled: false,
    });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.min(height, 256);
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("无法获取切图分析上下文");
    const variances: number[] = [];
    for (let startY = 0; startY < height; startY += canvas.height) {
      const rows = Math.min(canvas.height, height - startY);
      ctx.clearRect(0, 0, width, rows);
      ctx.drawImage(image, 0, startY, width, rows, 0, 0, width, rows);
      const chunk = calculateRowVariance(ctx.getImageData(0, 0, width, rows));
      for (const value of chunk) variances.push(value);
    }
    return planImageSlicesFromVariances(width, height, variances, config);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
