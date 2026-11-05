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
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentDeduplicator } from "./content-deduplicator";

let root: string, service: ContentDeduplicator;
let runtimes: FakeRuntime[];
let emit: ReturnType<typeof vi.fn>, trashItem: ReturnType<typeof vi.fn>;
const analysis = {
  groups: [],
  statistics: {
    totalFilesScanned: 0,
    totalTextFiles: 0,
    totalGroups: 0,
    totalDuplicates: 0,
    totalWastedBytes: 0,
  },
  skippedFiles: [],
};
class FakeRuntime {
  resolve!: (result: string) => void;
  reject!: (error: Error) => void;
  events: unknown[] = [];
  started = false;
  cancel = vi.fn(() => {
    this.reject?.(new Error("cancelled worker"));
  });
  constructor() {
    runtimes.push(this);
  }
  scan = vi.fn(async (_path: string, _config: string) => {
    this.started = true;
    return new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  });
  drainProgress() {
    return JSON.stringify(this.events.splice(0));
  }
}
const call = (command: string, args: Record<string, unknown> = {}, owner = 1) =>
  service.runCommand(owner, command, args) as Promise<any>;
async function put(name: string, data: string | Buffer = "content") {
  const filename = path.join(root, name);
  await fs.writeFile(filename, data);
  return filename;
}
async function start(owner = 1) {
  const index = runtimes.length;
  const result = call(
    "scan_content_duplicates",
    { path: root, config: { marker: owner } },
    owner
  );
  await vi.waitFor(() => expect(runtimes[index]?.started).toBe(true));
  return { result, runtime: runtimes[index]! };
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-dedup-"));
  runtimes = [];
  emit = vi.fn();
  trashItem = vi.fn(async (filename: string) => {
    await fs.unlink(filename);
  });
  service = new ContentDeduplicator(root, {
    emit,
    trashItem,
    loadAddon: () => ({ DedupRuntime: FakeRuntime }),
  });
});
afterEach(async () => {
  await service.shutdown();
  await fs.rm(root, { recursive: true, force: true });
});

describe("content deduplicator host contracts", () => {
  it("routes concurrent scan progress privately and drains final native events", async () => {
    const first = await start(1),
      second = await start(2);
    for (const [owner, task] of [
      [1, first],
      [2, second],
    ] as const) {
      task.runtime.events.push({ stage: "collecting", owner });
      task.runtime.resolve(JSON.stringify(analysis));
      expect(await task.result).toEqual(analysis);
      expect(task.runtime.scan).toHaveBeenCalledWith(
        await fs.realpath(root),
        JSON.stringify({ marker: owner })
      );
    }
    expect(emit.mock.calls).toEqual([
      [1, "dedup-scan-progress", { stage: "collecting", owner: 1 }],
      [2, "dedup-scan-progress", { stage: "collecting", owner: 2 }],
    ]);
    expect(service.hasPendingOperations).toBe(false);
  });
  it("cancels only the requesting owner's worker and allows a fresh scan", async () => {
    const first = await start(1),
      second = await start(2);
    const rejected = expect(first.result).rejects.toMatchObject({
      code: "DEDUP_SCAN_CANCELLED",
    });
    expect(await call("stop_dedup_scan")).toBeNull();
    await rejected;
    expect(second.runtime.cancel).not.toHaveBeenCalled();
    const next = await start(1);
    next.runtime.resolve(JSON.stringify(analysis));
    await next.result;
    second.runtime.resolve(JSON.stringify(analysis));
    await second.result;
  });
  it("honors cancellation before startup and prevents overlapping scans for one owner", async () => {
    const before = call("scan_content_duplicates", { path: root, config: {} });
    const rejected = expect(before).rejects.toMatchObject({
      code: "DEDUP_SCAN_CANCELLED",
    });
    await call("stop_dedup_scan");
    await rejected;
    expect(runtimes).toHaveLength(0);
    const task = await start();
    await expect(
      call("scan_content_duplicates", { path: root, config: {} })
    ).rejects.toThrow("已有");
    task.runtime.resolve(JSON.stringify(analysis));
    await task.result;
  });
  it("silences disposed owners and waits for workers on shutdown", async () => {
    const task = await start();
    let release!: () => void;
    task.runtime.cancel.mockImplementation(() => {});
    task.runtime.events.push({ stage: "building" });
    const rejected = expect(task.result).rejects.toMatchObject({
      code: "DEDUP_SCAN_CANCELLED",
    });
    service.disposeOwner(1);
    let complete = false;
    const shutdown = service.shutdown().then(() => {
      complete = true;
    });
    await new Promise<void>((resolve) => {
      release = resolve;
      setImmediate(release);
    });
    expect(complete).toBe(false);
    task.runtime.resolve(JSON.stringify(analysis));
    await rejected;
    await shutdown;
    expect(emit).not.toHaveBeenCalled();
    await expect(
      call("read_file_content_for_diff", { path: root })
    ).rejects.toThrow("退出");
  });
  it("reads bounded UTF-8 previews and rejects binary, oversized, linked and directory inputs", async () => {
    const unicode = await put("文.txt", "\ufeff你好\r\nworld");
    expect(await call("read_file_content_for_diff", { path: unicode })).toBe(
      "\ufeff你好\r\nworld"
    );
    const binary = await put("binary", Buffer.from([255, 254, 1]));
    await expect(
      call("read_file_content_for_diff", { path: binary })
    ).rejects.toThrow("UTF-8");
    const large = await put("large", Buffer.alloc(1025));
    await expect(
      call("read_file_content_for_diff", { path: large, maxSizeKb: 1 })
    ).rejects.toThrow("过大");
    await expect(
      call("read_file_content_for_diff", { path: unicode, maxSizeKb: -1 })
    ).rejects.toThrow("大小");
    await expect(
      call("read_file_content_for_diff", { path: root })
    ).rejects.toThrow("普通文件");
    const link = path.join(root, "junction");
    await fs.symlink(
      root,
      link,
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(
      call("read_file_content_for_diff", { path: path.join(link, "文.txt") })
    ).rejects.toThrow("普通文件");
    await fs.unlink(link);
  });
  it("returns exact successful deletion paths and refuses directories or junction paths", async () => {
    const good = await put("ok.txt"),
      failed = await put("failed.txt");
    const folder = path.join(root, "folder");
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "keep"), "keep");
    trashItem.mockImplementation(async (filename) => {
      if (filename === failed) throw new Error("busy");
      await fs.unlink(filename);
    });
    const result = await call("delete_duplicate_files", {
      paths: [good, failed, folder, good],
    });
    expect(result).toMatchObject({
      successCount: 1,
      errorCount: 2,
      cleanedPaths: [good],
      cancelled: false,
    });
    expect(await fs.readFile(path.join(folder, "keep"), "utf8")).toBe("keep");
    expect(await fs.readFile(failed, "utf8")).toBe("content");
    expect(
      emit.mock.calls.every(
        (call) => call[0] === 1 && call[1] === "dedup-delete-progress"
      )
    ).toBe(true);
  });
  it("owner disposal drains the current recycle operation and preserves untouched files", async () => {
    const first = await put("a"),
      second = await put("b");
    let finish!: () => void;
    trashItem.mockImplementationOnce(
      (filename) =>
        new Promise<void>((resolve) => {
          finish = async () => {
            await fs.unlink(filename);
            resolve();
          };
        })
    );
    const pending = call("delete_duplicate_files", { paths: [first, second] });
    await vi.waitFor(() => expect(trashItem).toHaveBeenCalledTimes(1));
    service.disposeOwner(1);
    let done = false;
    const drain = service.shutdown().then(() => {
      done = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(done).toBe(false);
    finish();
    expect(await pending).toMatchObject({
      cleanedPaths: [first],
      cancelled: true,
      successCount: 1,
    });
    await drain;
    expect(await fs.readFile(second, "utf8")).toBe("content");
    expect(emit).not.toHaveBeenCalled();
  });
});
