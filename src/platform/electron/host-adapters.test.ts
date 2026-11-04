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

import { afterEach, describe, expect, it, vi } from "vitest";
import { watchFiles } from "./file-watches";
import { readImage, writeImage } from "./image-clipboard";
import type { FileWatchMessage } from "../../../electron/file-watches";
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn(), debug: vi.fn() }),
}));
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
});
describe("Electron durable file watch and image snapshots", () => {
  it("subscribes before setup, clones file URLs and tears down local and native listeners once", async () => {
    let callback!: (message: FileWatchMessage) => void;
    const received: unknown[] = [],
      stop = vi.fn();
    const host = vi
      .fn()
      .mockImplementation(
        async (operation: string, args: { id: string; paths: string[] }) => {
          if (operation === "fs.watch.start")
            callback({
              id: args.id,
              event: { type: "any", paths: ["C:/canvas/a.html"], attrs: {} },
            });
          return { ok: true, value: undefined };
        }
      );
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        request: host,
        subscribeFileWatch: (_id: string, handler: typeof callback) => {
          callback = handler;
          return stop;
        },
      },
    });
    const unwatch = await watchFiles(
      [new URL("file:///C:/canvas/")],
      (event) => received.push(event),
      { recursive: true, delayMs: 25 }
    );
    expect(host.mock.calls[0][1]).toMatchObject({
      paths: ["file:///C:/canvas/"],
      options: { recursive: true, delayMs: 25 },
    });
    expect(received).toHaveLength(1);
    unwatch();
    unwatch();
    callback({
      id: host.mock.calls[0][1].id,
      event: { type: "any", paths: ["late"], attrs: {} },
    });
    expect(received).toHaveLength(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(
      host.mock.calls.filter(([operation]) => operation === "fs.watch.stop")
    ).toHaveLength(1);
  });
  it("unsubscribes when setup fails and preserves actionable host errors", async () => {
    const stop = vi.fn();
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        subscribeFileWatch: () => stop,
        request: async () => ({
          ok: false,
          error: { code: "ENOENT", message: "目录已移走" },
        }),
      },
    });
    await expect(watchFiles("C:/missing", () => {})).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("returns reusable image snapshots with dimensions and explicit release", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const host = vi.fn().mockImplementation(async (operation) => ({
      ok: true,
      value:
        operation === "clipboard.readImage"
          ? { bytes: png, width: 2, height: 1 }
          : undefined,
    }));
    Object.assign(window, { aiohub: { platform: "electron", request: host } });
    const image = await readImage();
    expect(await image.size()).toEqual({ width: 2, height: 1 });
    await writeImage(image);
    expect(host.mock.calls[1]).toEqual([
      "clipboard.writeImage",
      { image: png },
    ]);
    await image.close();
    await image.close();
    await expect(image.size()).rejects.toThrow("已释放");
    await expect(writeImage(image)).rejects.toThrow("已释放");
    expect(host).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched raw pixels before attempting to replace the clipboard", async () => {
    const host = vi.fn();
    Object.assign(window, { aiohub: { platform: "electron", request: host } });
    await expect(
      writeImage({
        size: async () => ({ width: 2, height: 2 }),
        rgba: async () => new Uint8Array(4),
      })
    ).rejects.toThrow("不匹配");
    expect(host).not.toHaveBeenCalled();
  });
});
