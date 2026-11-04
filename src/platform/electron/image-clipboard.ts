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

import { toRaw } from "vue";
import { request } from "./client";
import type { ClipboardPng } from "../../../electron/image-clipboard";
let nextImageId = 0;
export class ElectronImage {
  readonly rid = ++nextImageId;
  #closed = false;
  #pixels?: Promise<Uint8Array>;
  constructor(private png: ClipboardPng) {}
  private check() {
    if (this.#closed) throw new Error("图片已释放，请重新读取剪贴板");
  }
  async size() {
    this.check();
    return { width: this.png.width, height: this.png.height };
  }
  encoded(): Uint8Array {
    this.check();
    return new Uint8Array(this.png.bytes);
  }
  async rgba(): Promise<Uint8Array> {
    this.check();
    this.#pixels ??= this.decode();
    const pixels = await this.#pixels;
    this.check();
    return new Uint8Array(pixels);
  }
  private async decode(): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(this.png.bytes).buffer as ArrayBuffer], {
        type: "image/png",
      })
    );
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法读取图片像素，请重新复制图片");
      context.drawImage(bitmap, 0, 0);
      return new Uint8Array(
        context.getImageData(0, 0, bitmap.width, bitmap.height).data
      );
    } finally {
      bitmap.close();
    }
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.png = { bytes: new Uint8Array(), width: 0, height: 0 };
    this.#pixels = undefined;
  }
}
export async function readImage(): Promise<ElectronImage> {
  return new ElectronImage(await request<ClipboardPng>("clipboard.readImage"));
}
export async function writeImage(
  image:
    | string
    | Uint8Array
    | ArrayBuffer
    | number[]
    | {
        size(): Promise<{ width: number; height: number }>;
        rgba(): Promise<Uint8Array>;
      }
): Promise<void> {
  image = toRaw(image);
  let value: unknown = image;
  if (image instanceof ElectronImage) value = image.encoded();
  else if (
    typeof image === "object" &&
    image !== null &&
    "rgba" in image &&
    "size" in image
  ) {
    const { width, height } = await image.size();
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 64 * 1024 * 1024
    )
      throw new Error("图片尺寸无效或超过 64 百万像素");
    const rgba = await image.rgba();
    if (rgba.byteLength !== width * height * 4)
      throw new Error("图片像素数据与尺寸不匹配");
    const canvas = new OffscreenCanvas(width, height),
      context = canvas.getContext("2d");
    if (!context) throw new Error("无法编码图片，请重试");
    context.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), width, height),
      0,
      0
    );
    value = new Uint8Array(
      await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer()
    );
  }
  await request("clipboard.writeImage", { image: value });
}
