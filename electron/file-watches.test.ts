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

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FileWatches, type FileWatchMessage } from "./file-watches";
let root: string, service: FileWatches;
let events: { owner: number; message: FileWatchMessage }[];
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "aio-file-watch-"));
  events = [];
  service = new FileWatches((owner, message) => {
    events.push({ owner, message });
    return true;
  });
});
afterEach(async () => {
  service.disposeAll();
  vi.restoreAllMocks();
  await fsp.rm(root, { recursive: true, force: true });
});
const has = (filename: string, owner = 1) =>
  events.some(
    (event) =>
      event.owner === owner && event.message.event.paths.includes(filename)
  );
describe("renderer-owned file watching", () => {
  it("reports nested create/write/rename/delete paths from a recursive directory", async () => {
    const nested = path.join(root, "nested");
    await fsp.mkdir(nested);
    await service.start(1, randomUUID(), root, { recursive: true }, {});
    const file = path.join(nested, "中文 file.txt");
    await fsp.writeFile(file, "first");
    await vi.waitFor(() => expect(has(file)).toBe(true));
    events = [];
    await fsp.writeFile(file, "second");
    await vi.waitFor(() => expect(has(file)).toBe(true));
    const renamed = path.join(nested, "renamed.txt");
    events = [];
    await fsp.rename(file, renamed);
    await vi.waitFor(() => expect(has(file) || has(renamed)).toBe(true));
    events = [];
    await fsp.unlink(renamed);
    await vi.waitFor(() => expect(has(renamed)).toBe(true));
    expect(
      events.every(({ message }) =>
        message.event.paths.every(
          (value) => !path.relative(root, value).startsWith("..")
        )
      )
    ).toBe(true);
  });
  it("survives atomic file replacement and keeps identical ids isolated across owners", async () => {
    const file = path.join(root, "document.txt"),
      id = randomUUID();
    await fsp.writeFile(file, "initial");
    await service.start(1, id, file, {}, {});
    await service.start(2, id, file, {}, {});
    for (const text of ["external edit 1", "external edit 2"]) {
      events = [];
      const temporary = path.join(root, "replacement.tmp");
      await fsp.writeFile(temporary, text);
      await fsp.rename(temporary, file);
      await vi.waitFor(() => {
        expect(has(file, 1)).toBe(true);
        expect(has(file, 2)).toBe(true);
      });
    }
    service.stop(1, id);
    service.stop(1, id);
    events = [];
    await fsp.writeFile(file, "owner two continues");
    await vi.waitFor(() => expect(has(file, 2)).toBe(true));
    expect(has(file, 1)).toBe(false);
  });
  it("batches multi-path changes and resolves base-directory and file URL inputs", async () => {
    const a = path.join(root, "a"),
      b = path.join(root, "b");
    await fsp.mkdir(a);
    await fsp.mkdir(b);
    await service.start(
      1,
      randomUUID(),
      ["a", "b"],
      { baseDir: 42, delayMs: 50 },
      { 42: root }
    );
    await service.start(2, randomUUID(), pathToFileURL(a).href, {}, {});
    const one = path.join(a, "one.txt"),
      two = path.join(b, "two.txt");
    await fsp.writeFile(one, "one");
    await fsp.writeFile(two, "two");
    await vi.waitFor(() => {
      expect(has(one)).toBe(true);
      expect(has(two)).toBe(true);
      expect(has(one, 2)).toBe(true);
    });
    expect(
      events
        .filter((event) => event.owner === 1)
        .every((event) => event.message.event.paths.length > 0)
    ).toBe(true);
  });
  it("rejects invalid/missing roots and permits reusing a failed registration", async () => {
    const id = randomUUID();
    await expect(
      service.start(1, id, [root, path.join(root, "missing")], {}, {})
    ).rejects.toMatchObject({ code: "ENOENT" });
    for (const options of [
      { delayMs: -1 },
      { recursive: "yes" },
      { delayMs: 1.5 },
    ])
      await expect(service.start(1, id, root, options, {})).rejects.toThrow();
    await expect(
      service.start(1, id, "../escape", { baseDir: 42 }, { 42: root })
    ).rejects.toThrow();
    await service.start(1, id, root, {}, {});
    const file = path.join(root, "working.txt");
    await fsp.writeFile(file, "working");
    await vi.waitFor(() => expect(has(file)).toBe(true));
  });
  it("revokes pending setup on navigation without removing a successor registration", async () => {
    const stat = fsp.stat.bind(fsp),
      id = randomUUID();
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fsp, "stat").mockImplementationOnce(async (filename) => {
      entered();
      await block;
      return stat(filename);
    });
    const old = service.start(1, id, root, {}, {});
    await waiting;
    service.disposeOwner(1);
    await service.start(1, id, root, {}, {});
    const rejected = expect(old).rejects.toThrow("注册已取消");
    release();
    await rejected;
    const file = path.join(root, "successor.txt");
    await fsp.writeFile(file, "new document");
    await vi.waitFor(() => expect(has(file)).toBe(true));
  });
  it("reports asynchronous watcher failures and releases all roots", async () => {
    const handles: (EventEmitter & { close: ReturnType<typeof vi.fn> })[] = [];
    vi.spyOn(fs, "watch").mockImplementation(() => {
      const handle = Object.assign(new EventEmitter(), { close: vi.fn() });
      handles.push(handle);
      return handle as unknown as fs.FSWatcher;
    });
    const b = path.join(root, "b");
    await fsp.mkdir(b);
    await service.start(1, randomUUID(), [root, b], {}, {});
    handles[0].emit(
      "error",
      Object.assign(new Error("resource exhausted"), { code: "ENOSPC" })
    );
    expect(events).toHaveLength(1);
    expect(events[0].message).toMatchObject({
      error: { code: "ENOSPC" },
      event: { type: "other", paths: [root, b] },
    });
    expect(
      handles.every((handle) => handle.close.mock.calls.length === 1)
    ).toBe(true);
  });
});
