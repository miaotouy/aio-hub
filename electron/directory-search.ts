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

import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { SearchSummary } from "../src/tools/dir-search/types";
interface Runtime {
  search(configuration: string): Promise<string>;
  cancel(): void;
  drainEvents(): string;
}
interface Addon {
  DirSearchRuntime: new () => Runtime;
  runDirSearchOperation(
    command: string,
    configuration: string
  ): Promise<string>;
}
interface Host {
  emit?(owner: number, event: string, payload: unknown): unknown;
  loadAddon?(filename: string): Addon;
}
interface Task {
  owner: number;
  searchId: string;
  cancelled: boolean;
  silent: boolean;
  runtime?: Runtime;
  configuration: string;
  promise: Promise<SearchSummary>;
  resolve: (result: SearchSummary) => void;
  reject: (error: unknown) => void;
}
const operations = new Set([
  "dir_replace",
  "dir_replace_single",
  "dir_replace_preview",
  "dir_search_copy_files",
  "dir_search_move_files",
]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("请求参数无效");
  return value as Record<string, unknown>;
}
function identity(value: unknown): string {
  if (value == null) return randomUUID();
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    value.includes("\0")
  )
    throw new Error("搜索身份无效");
  return value;
}
function cancelledSummary(searchId: string): SearchSummary {
  return {
    searchId,
    filesScanned: 0,
    filesMatched: 0,
    totalMatches: 0,
    bytesRead: 0,
    durationMs: 0,
    stopReason: "cancelled",
    truncated: true,
    cancelled: true,
  };
}
/** Retains the directory tool's app-wide one-search / four-worker resource contract. */
export class DirectorySearch {
  private scan?: Task;
  private readonly scans = new Map<string, Task>();
  private readonly scanQueue: Task[] = [];
  private readonly pending = new Set<Promise<unknown>>();
  private readonly previews = new Set<{ owner: number; disposed: boolean }>();
  private tail: Promise<unknown> = Promise.resolve();
  private addon?: Addon;
  private closing = false;
  constructor(
    private readonly appPath: string,
    private readonly host: Host
  ) {}
  get hasPendingOperations() {
    return this.pending.size > 0;
  }
  private getAddon() {
    return (this.addon ??= (
      this.host.loadAddon ??
      ((file) => createRequire(import.meta.url)(file) as Addon)
    )(path.join(this.appPath, "native-runtime/knowledge-addon.node")));
  }
  private track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation
      .finally(() => this.pending.delete(operation))
      .catch(() => {});
    return operation;
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      if (command === "dir_search_cancel")
        return this.cancel(owner, identity(args.searchId));
      if (this.closing) throw new Error("应用正在退出");
      const request = { ...object(args.request) };
      if (command === "dir_search") {
        const searchId = identity(request.searchId);
        request.searchId = searchId;
        if (this.scans.has(searchId)) throw new Error("搜索身份已在使用");
        // Snapshot accepted arguments so callers cannot change a queued search.
        const configuration = JSON.stringify(request);
        let resolve!: Task["resolve"];
        let reject!: Task["reject"];
        const promise = new Promise<SearchSummary>((onResolve, onReject) => {
          resolve = onResolve;
          reject = onReject;
        });
        const task: Task = {
          owner,
          searchId,
          configuration,
          cancelled: false,
          silent: false,
          promise,
          resolve,
          reject,
        };
        this.scans.set(searchId, task);
        this.scanQueue.push(task);
        queueMicrotask(() => this.startNextSearch());
        return this.track(promise);
      }
      if (!operations.has(command)) throw new Error("不支持的目录搜索操作");
      // Freeze accepted arguments before waiting in the mutation queue.
      const configuration = JSON.stringify(request);
      const preview =
        command === "dir_replace_preview"
          ? { owner, disposed: false }
          : undefined;
      if (preview) this.previews.add(preview);
      const operation = this.tail
        .catch(() => {})
        .then(async () => {
          if (preview?.disposed) throw new Error("预览已随窗口关闭");
          const json = await this.getAddon().runDirSearchOperation(
            command,
            configuration
          );
          if (preview?.disposed) throw new Error("预览已随窗口关闭");
          return JSON.parse(json) as unknown;
        })
        .finally(() => {
          if (preview) this.previews.delete(preview);
        });
      this.tail = operation;
      return this.track(operation);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private startNextSearch() {
    if (this.scan || this.closing) return;
    const task = this.scanQueue.shift();
    if (!task) return;
    this.scan = task;
    const finish = () => {
      this.scans.delete(task.searchId);
      this.scan = undefined;
      queueMicrotask(() => this.startNextSearch());
    };
    void this.search(task).then(
      (result) => {
        finish();
        task.resolve(result);
      },
      (error: unknown) => {
        finish();
        task.reject(error);
      }
    );
  }
  private abort(task: Task) {
    task.cancelled = true;
    if (this.scan === task) {
      // Keep the active slot until native work and final event draining finish.
      task.runtime?.cancel();
    } else {
      this.scanQueue.splice(this.scanQueue.indexOf(task), 1);
      this.scans.delete(task.searchId);
      task.resolve(cancelledSummary(task.searchId));
    }
  }
  private async cancel(owner: number, searchId: string): Promise<null> {
    const task = this.scans.get(searchId);
    if (task?.owner === owner) {
      this.abort(task);
      await Promise.allSettled([task.promise]);
    }
    return null;
  }
  disposeOwner(owner: number) {
    for (const task of this.scans.values()) {
      if (task.owner === owner) {
        task.silent = true;
        this.abort(task);
      }
    }
    for (const preview of this.previews)
      if (preview.owner === owner) preview.disposed = true;
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    for (const task of this.scans.values()) {
      task.silent = true;
      this.abort(task);
    }
    for (const preview of this.previews) preview.disposed = true;
    await Promise.allSettled([...this.pending]);
  }
  private async search(task: Task): Promise<SearchSummary> {
    if (task.cancelled) return cancelledSummary(task.searchId);
    const runtime = (task.runtime = new (this.getAddon().DirSearchRuntime)());
    let eventError: unknown;
    const drain = () => {
      const events = JSON.parse(runtime.drainEvents()) as {
        event: string;
        payload: { searchId: string };
      }[];
      if (task.silent || task.cancelled) return;
      for (const event of events)
        if (
          event.payload.searchId === task.searchId &&
          ["dir-search-result-batch", "dir-search-progress"].includes(
            event.event
          )
        )
          this.host.emit?.(task.owner, event.event, event.payload);
    };
    const timer = setInterval(() => {
      try {
        drain();
      } catch (error) {
        eventError = error;
        runtime.cancel();
      }
    }, 25);
    try {
      const json = await runtime.search(task.configuration);
      if (eventError) throw eventError;
      drain();
      const result = JSON.parse(json) as SearchSummary;
      return task.cancelled
        ? {
            ...result,
            stopReason: "cancelled",
            truncated: true,
            cancelled: true,
          }
        : result;
    } catch (error) {
      throw eventError ?? error;
    } finally {
      clearInterval(timer);
    }
  }
}
