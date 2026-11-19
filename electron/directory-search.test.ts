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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorySearch } from "./directory-search";
let service: DirectorySearch,
  runtimes: FakeRuntime[],
  emit: ReturnType<typeof vi.fn>,
  runOperation: ReturnType<typeof vi.fn>;
const done = (searchId = "search-a") => ({
  searchId,
  filesScanned: 2,
  filesMatched: 2,
  totalMatches: 2,
  bytesRead: 12,
  durationMs: 10,
  stopReason: "completed",
  truncated: false,
  cancelled: false,
});
class FakeRuntime {
  resolve!: (json: string) => void;
  reject!: (error: Error) => void;
  events: unknown[] = [];
  cancel = vi.fn(() =>
    this.resolve(
      JSON.stringify({
        ...done(),
        stopReason: "cancelled",
        truncated: true,
        cancelled: true,
      })
    )
  );
  search = vi.fn(
    async (_configuration: string) =>
      new Promise<string>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      })
  );
  drainEvents() {
    return JSON.stringify(this.events.splice(0));
  }
  constructor() {
    runtimes.push(this);
  }
}
const call = (command: string, args: Record<string, unknown> = {}, owner = 1) =>
  service.runCommand(owner, command, args) as Promise<any>;
async function start(searchId = "search-a", owner = 1) {
  const index = runtimes.length;
  const result = call(
    "dir_search",
    { request: { searchId, rootPath: "C:/fixture", pattern: "needle" } },
    owner
  );
  await vi.waitFor(() =>
    expect(runtimes[index]?.resolve).toBeTypeOf("function")
  );
  return { result, runtime: runtimes[index] };
}
beforeEach(() => {
  runtimes = [];
  emit = vi.fn();
  runOperation = vi.fn(async () => "{}");
  service = new DirectorySearch("C:/app", {
    emit,
    loadAddon: () => ({
      DirSearchRuntime: FakeRuntime,
      runDirSearchOperation: runOperation,
    }),
  });
});
afterEach(async () => {
  await service.shutdown();
});
describe("directory search host ownership and lifecycle", () => {
  it("queues searches in arrival order, snapshots arguments and preserves the one-worker budget", async () => {
    const first = await start();
    const request = { searchId: "search-b", pattern: "before" };
    const second = call("dir_search", { request }, 2);
    const third = call("dir_search", { request: { searchId: "search-c" } }, 3);
    request.pattern = "after";
    let settled = false;
    void second.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(runtimes).toHaveLength(1);
    first.runtime.resolve(JSON.stringify(done()));
    expect(await first.result).toEqual(done());
    await vi.waitFor(() => expect(runtimes).toHaveLength(2));
    expect(JSON.parse(runtimes[1].search.mock.calls[0][0])).toEqual({
      searchId: "search-b",
      pattern: "before",
    });
    runtimes[1].resolve(JSON.stringify(done("search-b")));
    expect(await second).toEqual(done("search-b"));
    await vi.waitFor(() => expect(runtimes).toHaveLength(3));
    runtimes[2].resolve(JSON.stringify(done("search-c")));
    expect(await third).toEqual(done("search-c"));
  });
  it("cancels an owned queued search immediately without cancelling the active worker", async () => {
    const first = await start();
    const second = call("dir_search", { request: { searchId: "search-b" } }, 2);
    await call("dir_search_cancel", { searchId: "search-b" }, 1);
    await call("dir_search_cancel", { searchId: "search-b" }, 2);
    expect(await second).toMatchObject({
      searchId: "search-b",
      cancelled: true,
    });
    expect(first.runtime.cancel).not.toHaveBeenCalled();
    expect(runtimes).toHaveLength(1);
    first.runtime.resolve(JSON.stringify(done()));
    await first.result;
  });
  it("drops a disposed owner's queued searches and lets other owners continue", async () => {
    const first = await start();
    const second = call("dir_search", { request: { searchId: "search-b" } }, 2);
    const third = call("dir_search", { request: { searchId: "search-c" } }, 3);
    service.disposeOwner(2);
    expect(await second).toMatchObject({ cancelled: true });
    first.runtime.resolve(JSON.stringify(done()));
    await first.result;
    await vi.waitFor(() => expect(runtimes).toHaveLength(2));
    expect(JSON.parse(runtimes[1].search.mock.calls[0][0]).searchId).toBe(
      "search-c"
    );
    runtimes[1].resolve(JSON.stringify(done("search-c")));
    await third;
  });
  it("delivers streamed and tail batches only to the owner and matching search ID", async () => {
    const task = await start();
    task.runtime.events.push(
      {
        event: "dir-search-result-batch",
        payload: { searchId: "search-a", results: [{ filePath: "a" }] },
      },
      { event: "dir-search-progress", payload: { searchId: "wrong" } }
    );
    await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(1));
    task.runtime.events.push(
      {
        event: "dir-search-result-batch",
        payload: { searchId: "search-a", results: [{ filePath: "tail" }] },
      },
      {
        event: "dir-search-progress",
        payload: { searchId: "search-a", totalMatches: 2 },
      }
    );
    task.runtime.resolve(JSON.stringify(done()));
    await task.result;
    expect(emit.mock.calls).toEqual([
      [
        1,
        "dir-search-result-batch",
        { searchId: "search-a", results: [{ filePath: "a" }] },
      ],
      [
        1,
        "dir-search-result-batch",
        { searchId: "search-a", results: [{ filePath: "tail" }] },
      ],
      [1, "dir-search-progress", { searchId: "search-a", totalMatches: 2 }],
    ]);
    expect(service.hasPendingOperations).toBe(false);
  });
  it("requires both owner and search ID for cancellation and permits a fresh search after drain", async () => {
    const task = await start();
    await call("dir_search_cancel", { searchId: "search-a" }, 2);
    await call("dir_search_cancel", { searchId: "wrong" });
    expect(task.runtime.cancel).not.toHaveBeenCalled();
    expect(
      await call("dir_search_cancel", { searchId: "search-a" })
    ).toBeNull();
    expect(await task.result).toMatchObject({
      cancelled: true,
      stopReason: "cancelled",
    });
    const next = await start("next");
    next.runtime.resolve(JSON.stringify(done("next")));
    expect((await next.result).searchId).toBe("next");
  });
  it("cancels before worker startup without loading a native runtime", async () => {
    const result = call("dir_search", { request: { searchId: "early" } });
    await call("dir_search_cancel", { searchId: "early" });
    expect(await result).toMatchObject({
      searchId: "early",
      stopReason: "cancelled",
    });
    expect(runtimes).toHaveLength(0);
  });
  it("silences disposed owners and waits for native worker completion on exit", async () => {
    const task = await start();
    task.runtime.cancel.mockImplementation(() => {});
    task.runtime.events.push({
      event: "dir-search-progress",
      payload: { searchId: "search-a" },
    });
    service.disposeOwner(1);
    const queued = call("dir_search", { request: { searchId: "queued" } }, 2);
    let ended = false;
    const drain = service.shutdown().then(() => {
      ended = true;
    });
    expect(await queued).toMatchObject({ searchId: "queued", cancelled: true });
    expect(runtimes).toHaveLength(1);
    await new Promise((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);
    task.runtime.resolve(JSON.stringify(done()));
    expect(await task.result).toMatchObject({ cancelled: true });
    await drain;
    expect(emit).not.toHaveBeenCalled();
    await expect(
      call("dir_search", { request: { searchId: "new" } })
    ).rejects.toThrow("退出");
  });
  it("retains all final batches for completed searches and releases the slot after a native failure", async () => {
    const task = await start();
    const next = call("dir_search", { request: { searchId: "next" } });
    task.runtime.reject(new Error("invalid regex"));
    await expect(task.result).rejects.toThrow("invalid regex");
    await vi.waitFor(() => expect(runtimes).toHaveLength(2));
    const retry = { result: next, runtime: runtimes[1] };
    retry.runtime.events.push(
      ...Array.from({ length: 20 }, (_, index) => ({
        event: "dir-search-result-batch",
        payload: { searchId: "next", index },
      }))
    );
    retry.runtime.resolve(JSON.stringify(done("next")));
    await retry.result;
    expect(emit).toHaveBeenCalledTimes(20);
  });
  it("serializes accepted writes, snapshots arguments, and drains them after the owner closes", async () => {
    let finish!: (value: string) => void;
    runOperation.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const request = { filePaths: ["a.txt"], replacement: "before" };
    const first = call("dir_replace", { request });
    const second = call(
      "dir_search_copy_files",
      {
        request: {
          files: ["b.txt"],
          targetDir: "target",
          conflictResolution: "rename",
        },
      },
      2
    );
    request.replacement = "after";
    await vi.waitFor(() => expect(runOperation).toHaveBeenCalledTimes(1));
    service.disposeOwner(1);
    service.disposeOwner(2);
    let ended = false;
    const drain = service.shutdown().then(() => {
      ended = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(ended).toBe(false);
    expect(runOperation.mock.calls[0]).toEqual([
      "dir_replace",
      JSON.stringify({ filePaths: ["a.txt"], replacement: "before" }),
    ]);
    finish('{"filesReplaced":1}');
    expect(await first).toEqual({ filesReplaced: 1 });
    await second;
    await drain;
    expect(runOperation).toHaveBeenCalledTimes(2);
  });
  it("skips disposed queued previews while preserving accepted mutations and later queue recovery", async () => {
    let finish!: (value: string) => void;
    runOperation.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const write = call("dir_replace", { request: {} });
    const preview = call("dir_replace_preview", { request: {} });
    const rejected = expect(preview).rejects.toThrow("窗口关闭");
    service.disposeOwner(1);
    await vi.waitFor(() => expect(runOperation).toHaveBeenCalledTimes(1));
    finish("{}");
    await write;
    await rejected;
    expect(runOperation).toHaveBeenCalledTimes(1);
    await call("dir_replace_single", { request: {} });
    expect(runOperation).toHaveBeenCalledTimes(2);
  });
});
