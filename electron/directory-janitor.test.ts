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
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { DirectoryJanitor } from "./directory-janitor";
let temp: string, selected: string, janitor: DirectoryJanitor;
let emit: ReturnType<typeof vi.fn>, trashItem: ReturnType<typeof vi.fn>;
async function put(relative: string, content = "1234") {
  const filename = path.join(selected, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
  return filename;
}
const call = (command: string, args: Record<string, unknown> = {}, owner = 1) =>
  janitor.runCommand(owner, command, args) as Promise<any>;
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-janitor-"));
  selected = path.join(temp, "selected");
  await fs.mkdir(selected);
  emit = vi.fn();
  trashItem = vi.fn(async (filename: string) => {
    await fs.rename(
      filename,
      path.join(temp, "trashed-" + path.basename(filename))
    );
  });
  janitor = new DirectoryJanitor({ trashItem, emit });
});
afterEach(async () => {
  await janitor.shutdown();
  await fs.rm(temp, { recursive: true, force: true });
});

describe("directory janitor public behavior", () => {
  it("combines Unicode name, age and size filters while sizing directories below the displayed depth", async () => {
    await put("cache.tmp/文🧪.bin", "abc");
    await put("cache.tmp/deep/tail.bin", "12345");
    await put("cache.tmp/.hidden", "xy");
    await put(".hidden-root/ignored.tmp");
    await put("today.tmp");
    const old = await put("old.tmp");
    await fs.truncate(old, 1024 ** 2);
    const older = new Date(Date.now() - 5 * 86400000);
    await fs.utimes(old, older, older);
    const filtered = await call("analyze_directory_for_cleanup", {
      path: selected,
      namePattern: "*.tmp",
      minAgeDays: 3,
      minSizeMb: 1,
      maxDepth: 1,
    });
    expect(filtered.items.map((item: any) => item.name)).toEqual(["old.tmp"]);
    expect(filtered.statistics).toEqual({
      totalItems: 1,
      totalSize: 1024 ** 2,
      totalDirs: 0,
      totalFiles: 1,
    });
    const shallow = await call("analyze_directory_for_cleanup", {
      path: selected,
      maxDepth: 1,
    });
    expect(
      shallow.items.find((item: any) => item.name === "cache.tmp")
    ).toMatchObject({ isDir: true, size: 10 });
    expect(shallow.items.map((item: any) => item.name).sort()).toEqual([
      "cache.tmp",
      "old.tmp",
      "today.tmp",
    ]);
    const wildcard = await call("analyze_directory_for_cleanup", {
      path: selected,
      namePattern: "文?.bin",
    });
    expect(wildcard.items.map((item: any) => item.name)).toEqual(["文🧪.bin"]);
    expect(
      (
        await call("analyze_directory_for_cleanup", {
          path: selected,
          maxDepth: 0,
        })
      ).items
    ).toEqual([]);
  });
  it("treats regex punctuation in name patterns literally and rejects invalid ranges", async () => {
    await put("a[1].tmp");
    await put("a1.tmp");
    const result = await call("analyze_directory_for_cleanup", {
      path: selected,
      namePattern: "a[1].tmp",
    });
    expect(result.items.map((item: any) => item.name)).toEqual(["a[1].tmp"]);
    await expect(
      call("analyze_directory_for_cleanup", { path: selected, maxDepth: -1 })
    ).rejects.toThrow("非负整数");
    await expect(
      call("analyze_directory_for_cleanup", { path: selected, minAgeDays: "3" })
    ).rejects.toThrow("非负整数");
  });
  it("skips descendant junctions during scans and preserves link targets during cleanup", async () => {
    const external = path.join(temp, "external");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "valuable"), "keep");
    const link = path.join(selected, "linked");
    await fs.symlink(
      external,
      link,
      process.platform === "win32" ? "junction" : "dir"
    );
    await put("real.txt");
    const result = await call("analyze_directory_for_cleanup", {
      path: selected,
    });
    expect(result.items.map((item: any) => item.name)).toEqual(["real.txt"]);
    const nested = await call("cleanup_items", { paths: [selected] });
    expect(nested).toMatchObject({
      successCount: 0,
      errorCount: 1,
      cleanedPaths: [],
    });
    const throughLink = await call("cleanup_items", {
      paths: [path.join(link, "valuable")],
    });
    expect(throughLink.errorCount).toBe(1);
    expect(await fs.readFile(path.join(external, "valuable"), "utf8")).toBe(
      "keep"
    );
    expect(trashItem).not.toHaveBeenCalled();
  });
  it("deduplicates requested paths, accounts overlapping directories once and preserves individual failures", async () => {
    const child = await put("cache/child", "1234"),
      folder = path.dirname(child),
      locked = await put("locked", "abc");
    trashItem.mockImplementation(async (filename: string) => {
      if (filename === locked) throw Error("fixture denied trash");
      await fs.rename(
        filename,
        path.join(temp, "trashed-" + path.basename(filename))
      );
    });
    const result = await call("cleanup_items", {
      paths: [child, folder, folder, locked],
    });
    expect(result).toMatchObject({
      successCount: 2,
      errorCount: 1,
      freedSpace: 4,
      cleanedPaths: [folder, child],
      cancelled: false,
    });
    expect(result.errors[0]).toContain(locked);
    expect(await fs.readFile(locked, "utf8")).toBe("abc");
    expect(trashItem.mock.calls.map(([filename]) => filename)).toEqual([
      folder,
      locked,
    ]);
  });
  it("rejects root or invalid selections before any recycle-bin operation", async () => {
    const file = await put("keep.txt");
    await expect(
      call("cleanup_items", { paths: [file, path.parse(selected).root] })
    ).rejects.toThrow("根目录");
    await expect(
      call("cleanup_items", { paths: [file, "relative/path"] })
    ).rejects.toThrow("绝对路径");
    expect(await fs.readFile(file, "utf8")).toBe("1234");
    expect(trashItem).not.toHaveBeenCalled();
  });
  it("scopes scan cancellation and progress to the requesting window and permits a subsequent scan", async () => {
    for (let index = 0; index < 35; index++) await put(index + ".tmp");
    let cancelled = false;
    emit.mockImplementation((owner, event, progress) => {
      if (
        owner === 1 &&
        event === "directory-scan-progress" &&
        progress.scannedCount >= 10 &&
        !cancelled
      ) {
        cancelled = true;
        void call("stop_directory_scan");
      }
    });
    const first = call("analyze_directory_for_cleanup", {
      path: selected,
    }).catch((error) => error);
    const other = call("analyze_directory_for_cleanup", { path: selected }, 2);
    expect(await first).toMatchObject({ code: "DIRECTORY_SCAN_CANCELLED" });
    expect((await other).statistics.totalItems).toBe(35);
    expect(
      emit.mock.calls.filter(([owner]) => owner === 1).at(-1)?.[2].scannedCount
    ).toBe(10);
    expect(
      emit.mock.calls.filter(([owner]) => owner === 2).at(-1)?.[2].scannedCount
    ).toBe(35);
    expect(
      (await call("analyze_directory_for_cleanup", { path: selected }))
        .statistics.totalItems
    ).toBe(35);
  });
  it("waits for an in-flight trash operation on cancellation and retains untouched selections", async () => {
    const first = await put("first"),
      second = await put("second");
    let release!: () => void;
    trashItem.mockImplementation(async (filename: string) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await fs.rename(filename, path.join(temp, "trashed-first"));
    });
    const operation = call("cleanup_items", { paths: [first, second] });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await call("stop_directory_cleanup", {}, 2);
    expect(janitor.hasPendingOperations).toBe(true);
    let stopped = false;
    const stop = call("stop_directory_cleanup").then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stop;
    expect(await operation).toMatchObject({
      successCount: 1,
      errorCount: 0,
      cleanedPaths: [first],
      cancelled: true,
    });
    expect(await fs.readFile(second, "utf8")).toBe("1234");
    expect(trashItem).toHaveBeenCalledTimes(1);
  });
  it("suppresses departed-window progress and drains the current write before shutdown", async () => {
    const first = await put("first"),
      second = await put("second");
    let release!: () => void;
    trashItem.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const operation = call("cleanup_items", { paths: [first, second] });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    janitor.disposeOwner(1);
    const count = emit.mock.calls.length;
    let finished = false;
    const exit = janitor.shutdown().then(() => {
      finished = true;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    await exit;
    expect((await operation).cleanedPaths).toEqual([first]);
    expect(emit).toHaveBeenCalledTimes(count);
    expect(janitor.hasPendingOperations).toBe(false);
    expect(trashItem).toHaveBeenCalledTimes(1);
    await expect(call("cleanup_items", { paths: [second] })).rejects.toThrow(
      "退出"
    );
  });
});
