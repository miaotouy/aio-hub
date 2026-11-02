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
import { planImageSlices } from "../utils/imageSlicing";

/** OCR adapter: chat shares the plan, while OCR keeps its editable image blocks. */
export function useImageSlicer() {
  const sliceImage = async (
    image: HTMLImageElement,
    config: SlicerConfig,
    imageId = "default"
  ): Promise<{ blocks: ImageBlock[]; lines: CutLine[] }> => {
    const plan = planImageSlices(image, { ...config, enabled: true });
    const blocks = plan.regions.map(({ startY, endY }, index): ImageBlock => {
      const height = endY - startY;
      const canvas = document.createElement("canvas");
      canvas.width = plan.width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法获取切图上下文");
      ctx.drawImage(
        image,
        0,
        startY,
        plan.width,
        height,
        0,
        0,
        plan.width,
        height
      );
      return {
        id: plan.regions.length === 1 ? "full" : `block-${index}`,
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY,
        endY,
        width: plan.width,
        height,
      };
    });
    return { blocks, lines: plan.lines };
  };
  return { sliceImage };
}
