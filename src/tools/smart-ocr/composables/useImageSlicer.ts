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

import type { ImageBlock, SlicerConfig, CutLine } from "../types";
import { createModuleLogger } from "@utils/logger";

/**
 * 智能切图 Composable
 */
export function useImageSlicer() {
  const logger = createModuleLogger("ImageSlicer");
  /**
   * 计算每一行的灰度方差
   * 方差越小，说明这一行的颜色越单一（越可能是空白行）
   */
  const calculateRowVariance = (imageData: ImageData): number[] => {
    const { data, width, height } = imageData;
    const variances = new Array(height).fill(0);

    for (let y = 0; y < height; y++) {
      const grayValues: number[] = [];

      // 收集这一行所有像素的灰度值
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // 使用标准灰度转换公式
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayValues.push(gray);
      }

      // 计算均值
      const mean =
        grayValues.reduce((sum, val) => sum + val, 0) / grayValues.length;

      // 计算方差
      const variance =
        grayValues.reduce((sum, val) => {
          const diff = val - mean;
          return sum + diff * diff;
        }, 0) / grayValues.length;

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
  const findCutLines = (
    variances: number[],
    config: SlicerConfig
  ): CutLine[] => {
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
    const otsuThreshold =
      calculateOtsuThreshold(variances) ?? contentLevel;
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

  /**
   * 根据切割线分割图像
   */
  const splitImage = (
    originalImage: HTMLImageElement,
    cutLines: CutLine[],
    imageId: string,
    config: SlicerConfig
  ): ImageBlock[] => {
    const blocks: ImageBlock[] = [];
    const height = originalImage.height;
    const width = originalImage.width;

    // 如果没有切割线，返回整张图
    if (cutLines.length === 0) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(originalImage, 0, 0);

      blocks.push({
        id: "full",
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: 0,
        endY: height,
        width,
        height,
      });
      return blocks;
    }

    // 过滤切割线：跳过会产生过小块的切割点
    const validCutLines: number[] = [];
    let lastY = 0;

    for (const line of cutLines) {
      const blockHeight = line.y - lastY;

      // 如果这个切割会产生一个足够高的块，则保留这个切割点
      if (blockHeight >= config.minCutHeight) {
        validCutLines.push(line.y);
        lastY = line.y;
      }
      // 否则跳过这个切割点（小块会自动合并到前一个块）
    }

    // 检查最后一个块的高度
    const lastBlockHeight = height - lastY;
    // 如果最后一块太小，移除最后一个切割点（让它合并到前面）
    if (lastBlockHeight < config.minCutHeight && validCutLines.length > 0) {
      validCutLines.pop();
    }

    // 如果过滤后没有有效的切割线，返回整张图
    if (validCutLines.length === 0) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(originalImage, 0, 0);

      blocks.push({
        id: "full",
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: 0,
        endY: height,
        width,
        height,
      });
      return blocks;
    }

    // 根据有效的切割线生成块
    let currentY = 0;

    validCutLines.forEach((cutY, index) => {
      const blockHeight = cutY - currentY;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = blockHeight;
      const ctx = canvas.getContext("2d")!;

      // 从原图裁剪对应区域
      ctx.drawImage(
        originalImage,
        0,
        currentY,
        width,
        blockHeight,
        0,
        0,
        width,
        blockHeight
      );

      blocks.push({
        id: `block-${index}`,
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: currentY,
        endY: cutY,
        width,
        height: blockHeight,
      });

      currentY = cutY;
    });

    // 添加最后一个块
    const finalBlockHeight = height - currentY;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = finalBlockHeight;
    const ctx = canvas.getContext("2d")!;

    ctx.drawImage(
      originalImage,
      0,
      currentY,
      width,
      finalBlockHeight,
      0,
      0,
      width,
      finalBlockHeight
    );

    blocks.push({
      id: `block-${validCutLines.length}`,
      imageId,
      canvas,
      dataUrl: canvas.toDataURL(),
      startY: currentY,
      endY: height,
      width,
      height: finalBlockHeight,
    });

    return blocks;
  };

  /**
   * 执行智能切图
   */
  const sliceImage = async (
    image: HTMLImageElement,
    config: SlicerConfig,
    imageId: string = "default"
  ): Promise<{ blocks: ImageBlock[]; lines: CutLine[] }> => {
    // 0. 检查长宽比阈值
    const aspectRatio = image.height / image.width;
    if (aspectRatio <= config.aspectRatioThreshold) {
      logger.debug("图片长宽比未达到阈值，跳过切图", {
        imageId,
        aspectRatio: aspectRatio.toFixed(2),
        threshold: config.aspectRatioThreshold,
      });

      // 返回整张图作为单个块
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);

      return {
        blocks: [
          {
            id: "full",
            imageId,
            canvas,
            dataUrl: canvas.toDataURL(),
            startY: 0,
            endY: image.height,
            width: image.width,
            height: image.height,
          },
        ],
        lines: [],
      };
    }

    // 创建canvas获取图像数据
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    // 1. 计算每行的方差
    logger.debug("开始计算行方差", {
      imageId,
      width: image.width,
      height: image.height,
    });
    const variances = calculateRowVariance(imageData);

    // 调试信息：输出方差统计
    const sortedVariances = [...variances].sort((a, b) => a - b);
    const percentile = (ratio: number) =>
      sortedVariances[
        Math.min(
          sortedVariances.length - 1,
          Math.floor(sortedVariances.length * ratio)
        )
      ];

    logger.debug("方差统计完成", {
      imageId,
      背景基准_P5: percentile(0.05).toFixed(2),
      中位数: percentile(0.5).toFixed(2),
      内容基准_P95: percentile(0.95).toFixed(2),
      灵敏度系数: config.blankThreshold,
    });

    // 2. 寻找切割点
    const cutLines = findCutLines(variances, config);
    logger.debug("找到切割线", {
      imageId,
      切割线数量: cutLines.length,
      切割线详情: cutLines,
      配置: {
        minBlankHeight: config.minBlankHeight,
        minCutHeight: config.minCutHeight,
        cutLineOffset: config.cutLineOffset,
      },
    });

    // 3. 分割图像
    const blocks = splitImage(image, cutLines, imageId, config);
    logger.debug("图片切分完成", {
      imageId,
      生成块数量: blocks.length,
      块信息: blocks.map((b) => ({
        id: b.id,
        startY: b.startY,
        endY: b.endY,
        height: b.height,
      })),
    });

    return { blocks, lines: cutLines };
  };

  return {
    sliceImage,
  };
}
