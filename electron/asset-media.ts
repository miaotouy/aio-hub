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

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { nativeImage, type NativeImage } from "electron";
import { parseNodeStream, selectCover } from "music-metadata-browser";
import type { AssetMetadata, AssetType } from "./asset-store";
export interface AssetInspection {
  metadata: AssetMetadata;
  thumbnail?: Uint8Array;
}
function thumbnail(image: NativeImage): Uint8Array | undefined {
  if (image.isEmpty()) return;
  const { width, height } = image.getSize();
  const side = Math.min(width, height);
  return image
    .crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: 400, height: 400, quality: "best" })
    .toJPEG(85);
}
export async function inspectAssetMedia(
  filename: string,
  type: AssetType,
  generateThumbnail: boolean
): Promise<AssetInspection> {
  if (type === "image") {
    const image = nativeImage.createFromPath(filename);
    if (image.isEmpty()) return { metadata: {} };
    const { width, height } = image.getSize();
    return {
      metadata: { width, height },
      ...(generateThumbnail ? { thumbnail: thumbnail(image) } : {}),
    };
  }
  if (type === "audio") {
    const stream = createReadStream(filename);
    try {
      const parsed = await parseNodeStream(
        stream,
        { path: filename, size: (await fs.stat(filename)).size },
        { duration: true, skipCovers: !generateThumbnail }
      );
      const cover = generateThumbnail
        ? selectCover(parsed.common.picture)
        : undefined;
      return {
        metadata: Number.isFinite(parsed.format.duration)
          ? { duration: parsed.format.duration }
          : {},
        ...(cover
          ? {
              thumbnail: thumbnail(
                nativeImage.createFromBuffer(Buffer.from(cover.data))
              ),
            }
          : {}),
      };
    } catch {
      return { metadata: {} };
    } finally {
      stream.destroy();
    }
  }
  return { metadata: {} };
}
