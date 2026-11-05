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
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ImageClipboard } from "./image-clipboard";
describe("image clipboard boundary", () => {
  it("accepts binary and file inputs, normalizes to PNG and awaits clipboard completion", async () => {
    const source = new Uint8Array([1, 2, 255]),
      png = new Uint8Array([137, 80, 78, 71]);
    const output: Uint8Array[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = new ImageClipboard({
      read: async () => source,
      decode: (value) => {
        expect([...value]).toEqual([...source]);
        return { bytes: png, width: 2, height: 1 };
      },
      write: async (value) => {
        await pending;
        output.push(value);
      },
    });
    let completed = false;
    const first = store.write(source).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    release();
    await first;
    await store.write(source.buffer);
    await store.write([...source]);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-clipboard-"));
    try {
      const filename = path.join(root, "中文.png");
      await fs.writeFile(filename, source);
      await store.write(pathToFileURL(filename).href);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
    expect(output).toEqual([png, png, png, png]);
    expect(await store.read()).toEqual({ bytes: png, width: 2, height: 1 });
  });
  it("preserves the clipboard when bytes, format or dimensions are invalid", async () => {
    const write = vi.fn(),
      decode = vi.fn().mockImplementation(() => {
        throw new Error("invalid encoding");
      });
    const store = new ImageClipboard({
      read: async () => new Uint8Array([1]),
      write,
      decode,
    });
    for (const input of [[], [-1], [256], [0.5], {}, new Uint8Array()])
      await expect(store.write(input)).rejects.toThrow();
    await expect(store.write(new Uint8Array([1]))).rejects.toThrow(
      "invalid encoding"
    );
    decode.mockReturnValue({ bytes: new Uint8Array([1]), width: 0, height: 1 });
    await expect(store.write(new Uint8Array([1]))).rejects.toThrow();
    decode.mockReturnValue({
      bytes: new Uint8Array([1]),
      width: 1000000,
      height: 1000000,
    });
    await expect(store.write(new Uint8Array([1]))).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("propagates empty clipboard and OS write errors to the caller", async () => {
    const failure = Object.assign(new Error("clipboard unavailable"), {
      code: "CLIPBOARD_EMPTY",
    });
    const store = new ImageClipboard({
      read: async () => {
        throw failure;
      },
      write: async () => {
        throw failure;
      },
      decode: (bytes) => ({ bytes, width: 1, height: 1 }),
    });
    await expect(store.read()).rejects.toBe(failure);
    await expect(store.write(new Uint8Array([1]))).rejects.toBe(failure);
  });
});

it("normalizes PNG-backed and legacy bitmap ICOs before native decoding", async () => {
  const output: Uint8Array[] = [];
  const store = new ImageClipboard({
    read: async () => new Uint8Array(),
    write: async (bytes) => {
      output.push(bytes);
    },
    decode: (bytes) => {
      expect(Array.from(bytes.subarray(0, 8))).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
      return { bytes, width: 1, height: 1 };
    },
  });
  await store.write(
    await fs.readFile(path.resolve("src-tauri/icons/icon.ico"))
  );
  const dib = Buffer.alloc(70);
  dib.writeUInt16LE(1, 2);
  dib.writeUInt16LE(1, 4);
  dib[6] = 1;
  dib[7] = 1;
  dib.writeUInt16LE(1, 10);
  dib.writeUInt16LE(32, 12);
  dib.writeUInt32LE(48, 14);
  dib.writeUInt32LE(22, 18);
  dib.writeUInt32LE(40, 22);
  dib.writeInt32LE(1, 26);
  dib.writeInt32LE(2, 30);
  dib.writeUInt16LE(1, 34);
  dib.writeUInt16LE(32, 36);
  dib.writeUInt32LE(8, 42);
  dib[64] = 255;
  dib[65] = 255;
  await store.write(dib);
  expect(output).toHaveLength(2);
});
