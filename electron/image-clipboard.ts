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
import { decodeIco, isIco } from "icojs";
import { filePath } from "./filesystem";
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
export interface ClipboardPng {
  bytes: Uint8Array;
  width: number;
  height: number;
}
export interface ImageClipboardHost {
  read: () => Promise<Uint8Array>;
  write: (png: Uint8Array) => Promise<void>;
  decode: (bytes: Uint8Array) => ClipboardPng;
}
function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (
    Array.isArray(value) &&
    value.length <= MAX_BYTES &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  )
    return new Uint8Array(value);
  throw new Error("图片数据需为有效的字节数组");
}
/** PNG is the IPC format, avoiding platform-dependent BGRA and premultiplied bitmaps. */
export class ImageClipboard {
  constructor(private readonly host: ImageClipboardHost) {}
  private async decode(value: Uint8Array): Promise<ClipboardPng> {
    if (!value.length || value.byteLength > MAX_BYTES)
      throw new Error("图片为空或超过 256 MiB，请选择较小的图片");
    const encoded = Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );
    if (encoded.length >= 4 && isIco(encoded)) {
      if (
        encoded.length < 6 ||
        encoded.readUInt16LE(4) < 1 ||
        encoded.readUInt16LE(4) > 256
      )
        throw new Error("ICO 图片包含过多或无效的图像帧");
      const frames = await decodeIco(encoded, "image/png");
      const frame = frames.sort(
        (a, b) => b.width * b.height - a.width * a.height || b.bpp - a.bpp
      )[0];
      if (!frame) throw new Error("ICO 图片没有可读取的图像帧");
      value = new Uint8Array(frame.buffer);
    }
    const result = this.host.decode(value);
    if (
      !Number.isInteger(result.width) ||
      !Number.isInteger(result.height) ||
      result.width <= 0 ||
      result.height <= 0 ||
      result.width * result.height > MAX_PIXELS ||
      result.bytes.byteLength > MAX_BYTES
    )
      throw new Error("图片无法解码或超过 64 百万像素，请缩小后重试");
    return result;
  }
  async write(value: unknown): Promise<void> {
    let buffer: Uint8Array;
    if (typeof value === "string") {
      const target = filePath(value, undefined, {});
      const info = await fs.stat(target);
      if (!info.isFile() || info.size > MAX_BYTES)
        throw new Error("请选择 256 MiB 以内的图片文件");
      buffer = await fs.readFile(target);
    } else buffer = bytes(value);
    const image = await this.decode(buffer);
    await this.host.write(image.bytes);
  }
  async read(): Promise<ClipboardPng> {
    return this.decode(await this.host.read());
  }
}
