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

import type { CutLine, SlicerConfig } from "../types";

export const DEFAULT_SLICER_CONFIG: SlicerConfig = {
  enabled: true,
  aspectRatioThreshold: 3,
  blankThreshold: 0.3,
  minBlankHeight: 20,
  minCutHeight: 680,
  cutLineOffset: 0.2,
};

export interface ImageSlicePlan {
  width: number;
  height: number;
  regions: Array<{ startY: number; endY: number }>;
  lines: CutLine[];
}

const calculateRowVariance = (imageData: ImageData): number[] => {
  const { data, width, height } = imageData;
  const variances = new Array(height).fill(0);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    const mean = sum / width;
    let squaredDiff = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray =
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      squaredDiff += (gray - mean) ** 2;
    }
    const variance = squaredDiff / width;

    variances[y] = variance;
  }

  return variances;
};

/**
 * 用 Otsu 方法在行方差分布中自动定位背景（空白行）与内容（文字行）的分界。
 * 相比固定比例阈值，它不依赖空白行占比，也不会被页面边框/底噪造成的
 * 背景基准抬高所干扰。
 */
const calculateOtsuThreshold = (values: number[]): number | null => {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const span = max - min;
  if (!(span > 0)) return null;

  const binCount = 256;
  const histogram = new Array<number>(binCount).fill(0);
  const scale = (binCount - 1) / span;

  for (const value of values) {
    const bin = Math.min(
      binCount - 1,
      Math.max(0, Math.round((value - min) * scale))
    );
    histogram[bin]++;
  }

  let globalSum = 0;
  for (let i = 0; i < binCount; i++) globalSum += i * histogram[i];

  let weightBackground = 0;
  let sumBackground = 0;
  let bestVariance = -1;
  let bestBin = 0;

  for (let i = 0; i < binCount; i++) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;

    const weightForeground = values.length - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (globalSum - sumBackground) / weightForeground;
    const between =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;

    if (between > bestVariance) {
      bestVariance = between;
      bestBin = i;
    }
  }

  return min + bestBin / scale;
};

/**
 * 寻找切割点（基于方差）
 */
const findCutLines = (variances: number[], config: SlicerConfig): CutLine[] => {
  const cutLines: CutLine[] = [];
  const { minBlankHeight, cutLineOffset } = config;

  // 用分位数估计背景基准与内容基准。中位数在空白行占多数时会被拉到背景
  // 水平，导致阈值永远无法区分空白行，这里改用高/低分位数避免该问题。
  const sortedVariances = [...variances].sort((a, b) => a - b);
  const backgroundLevel =
    sortedVariances[Math.floor(sortedVariances.length * 0.05)];
  const contentLevel =
    sortedVariances[
      Math.min(
        sortedVariances.length - 1,
        Math.floor(sortedVariances.length * 0.95)
      )
    ];

  // 无明显对比度的纯色图片不需要切割
  const minContrast = 10;
  if (contentLevel - backgroundLevel < minContrast) {
    return cutLines;
  }

  // Otsu 自动定位分界，再用 blankThreshold 作为灵敏度系数微调；
  // 下限保证背景基准高于 0（如页面边框）时空白行仍能被识别。
  const otsuThreshold = calculateOtsuThreshold(variances) ?? contentLevel;
  const minThreshold =
    backgroundLevel + (contentLevel - backgroundLevel) * 0.01;
  const varianceThreshold = Math.max(
    otsuThreshold * config.blankThreshold,
    minThreshold
  );

  let blankStart = -1;
  let blankHeight = 0;

  for (let y = 0; y < variances.length; y++) {
    const isBlank = variances[y] <= varianceThreshold;

    if (isBlank) {
      if (blankStart === -1) {
        // 开始一个新的空白区域
        blankStart = y;
        blankHeight = 1;
      } else {
        // 继续当前空白区域
        blankHeight++;
      }
    } else {
      // 空白区域结束
      if (blankStart !== -1 && blankHeight >= minBlankHeight) {
        // 应用切割线偏移
        // cutLineOffset: -1(向上) ~ 0(居中) ~ 1(向下)
        // 计算偏移后的切割位置
        const offsetRatio = (cutLineOffset + 1) / 2; // 转换到 0~1 范围
        const finalCutY = Math.round(blankStart + blankHeight * offsetRatio);

        cutLines.push({
          y: finalCutY,
          height: blankHeight,
        });
      }
      blankStart = -1;
      blankHeight = 0;
    }
  }

  // 检查最后一个空白区域
  if (blankStart !== -1 && blankHeight >= minBlankHeight) {
    const offsetRatio = (cutLineOffset + 1) / 2;
    const finalCutY = Math.round(blankStart + blankHeight * offsetRatio);

    cutLines.push({
      y: finalCutY,
      height: blankHeight,
    });
  }

  return cutLines;
};

/** Plan contiguous regions without encoding or retaining slice canvases. */
export function planImageSlicesFromVariances(
  width: number,
  height: number,
  variances: number[],
  config: SlicerConfig
): ImageSlicePlan {
  const full: ImageSlicePlan = {
    width,
    height,
    regions: [{ startY: 0, endY: height }],
    lines: [],
  };
  if (!config.enabled || height / width <= config.aspectRatioThreshold)
    return full;
  const lines = findCutLines(variances, config);
  const cuts: number[] = [];
  let lastY = 0;
  for (const line of lines) {
    if (
      line.y > lastY &&
      line.y < height &&
      line.y - lastY >= config.minCutHeight
    ) {
      cuts.push(line.y);
      lastY = line.y;
    }
  }
  if (height - lastY < config.minCutHeight) cuts.pop();
  const boundaries = [0, ...cuts, height];
  return {
    width,
    height,
    lines,
    regions: boundaries
      .slice(1)
      .map((endY, index) => ({ startY: boundaries[index], endY })),
  };
}

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
