// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { deflateSync } from "node:zlib";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
export function pngFixture(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly number[],
  declared?: { width: number; height: number }
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(declared?.width ?? width);
  header.writeUInt32BE(declared?.height ?? height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height),
    rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      rgba.set(value, (y * width + x) * 4);
      scanlines.set(value, y * (width * 4 + 1) + 1 + x * 4);
    }
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return { buffer, rgba, width, height };
}
export const longImageFixture = () =>
  pngFixture(80, 800, (x, y) => {
    const blank = y % 200 >= 140;
    const value = blank || x % 8 >= 4 ? 255 : 0;
    return [value, value, value, 255];
  });

/** Keep this isolated loaded-library copy until the Node process exits (Windows locks loaded DLLs). */
export async function installRasterRuntimeFixture() {
  const app = await fs.mkdtemp(path.join(os.tmpdir(), "aio-raster-addon-"));
  await fs.mkdir(path.join(app, "native-runtime"));
  const source =
    process.platform === "win32"
      ? "aiohub_knowledge_addon.dll"
      : process.platform === "darwin"
        ? "libaiohub_knowledge_addon.dylib"
        : "libaiohub_knowledge_addon.so";
  await fs.copyFile(
    path.resolve("native/knowledge-addon/target/release", source),
    path.join(app, "native-runtime/knowledge-addon.node")
  );
  return app;
}
