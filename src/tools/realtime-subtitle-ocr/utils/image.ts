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

/**
 * 将 HTMLImageElement 绘制到 Canvas 并构造 ImageBlock 供 runOcr 使用
 *
 * @param image 载入的图片元素
 * @param imageId 图片唯一标识
 * @param canvas 缓存的 Canvas 元素，若未传入则内部动态创建
 */
export function createImageBlock(
  image: HTMLImageElement,
  imageId: string,
  canvas?: HTMLCanvasElement
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
    dataUrl: targetCanvas.toDataURL("image/png"),
    startY: 0,
    endY: targetCanvas.height,
    width: targetCanvas.width,
    height: targetCanvas.height,
  };
}
