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

import type { ImageBlock } from "../../types";
import type { OcrImageInput } from "../types";

export function createOcrImageFromDataUrl(
  dataUrl: string,
  options: {
    id: string;
    groupId?: string;
    width: number;
    height: number;
    metadata?: Record<string, unknown>;
  }
): OcrImageInput {
  return {
    id: options.id,
    groupId: options.groupId,
    dataUrl,
    width: options.width,
    height: options.height,
    metadata: options.metadata,
  };
}

export function imageBlockToOcrImage(block: ImageBlock): OcrImageInput {
  return {
    id: block.id,
    groupId: block.imageId,
    path: block.path,
    dataUrl: block.path ? undefined : block.dataUrl,
    width: block.width,
    height: block.height,
    metadata: {
      startY: block.startY,
      endY: block.endY,
    },
  };
}

export function ocrImageToPluginImage(image: OcrImageInput) {
  return {
    blockId: image.id,
    imageId: image.groupId ?? image.id,
    path: image.path,
    dataUrl: image.path ? undefined : image.dataUrl,
    width: image.width,
    height: image.height,
    metadata: image.metadata,
  };
}

export function ocrImageToImageBlock(image: OcrImageInput): ImageBlock {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  return {
    id: image.id,
    imageId: image.groupId ?? image.id,
    canvas,
    dataUrl: image.dataUrl ?? "",
    path: image.path,
    startY: Number(image.metadata?.startY ?? 0),
    endY: Number(image.metadata?.endY ?? image.height),
    width: image.width,
    height: image.height,
  };
}
