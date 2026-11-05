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
import { createRequire } from "node:module";
import { DirectoryJanitor } from "./directory-janitor";
import { filePath } from "./filesystem";
import type {
  DedupAnalysisResult,
  DedupScanProgress,
} from "../src/tools/content-deduplicator/types";

interface Runtime {
  scan(path: string, configuration: string): Promise<string>;
  cancel(): void;
  drainProgress(): string;
}
interface Addon {
  DedupRuntime: new () => Runtime;
}
interface Host {
  trashItem(filename: string): Promise<void>;
  emit?(owner: number, event: string, payload: unknown): unknown;
  loadAddon?(filename: string): Addon;
}
interface Task {
  owner: number;
  kind: "scan" | "preview";
  controller: AbortController;
  silent: boolean;
  runtime?: Runtime;
  promise: Promise<unknown>;
}
function cancelled() {
  return Object.assign(new Error("扫描已被用户取消"), {
    code: "DEDUP_SCAN_CANCELLED",
  });
}
export class ContentDeduplicator {
  private readonly active = new Set<Task>();
  private readonly deletion: DirectoryJanitor;
  private closing = false;
  private addon?: Addon;
  constructor(
    private readonly appPath: string,
    private readonly host: Host
  ) {
    this.deletion = new DirectoryJanitor({
      trashItem: host.trashItem,
      filesOnly: true,
      emit: (owner, event, payload) => {
        if (event !== "directory-cleanup-progress") return;
        const progress = payload as {
          processedCount: number;
          totalCount: number;
          currentItem: string;
        };
        host.emit?.(owner, "dedup-delete-progress", {
          current: progress.processedCount,
          total: progress.totalCount,
          currentFile: progress.currentItem,
        });
      },
    });
  }
  get hasPendingOperations() {
    return this.active.size > 0 || this.deletion.hasPendingOperations;
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    if (command === "stop_dedup_scan") return this.stopScan(owner);
    if (this.closing) return Promise.reject(new Error("应用正在退出"));
    if (command === "delete_duplicate_files")
      return this.deletion.runCommand(owner, "cleanup_items", args);
    if (
      command !== "scan_content_duplicates" &&
      command !== "read_file_content_for_diff"
    )
      return Promise.reject(new Error("不支持的内容查重操作"));
    const kind = command === "scan_content_duplicates" ? "scan" : "preview";
    if (
      kind === "scan" &&
      [...this.active].some(
        (task) => task.owner === owner && task.kind === kind
      )
    )
      return Promise.reject(new Error("当前窗口已有内容扫描正在运行"));
    const task: Task = {
      owner,
      kind,
      controller: new AbortController(),
      silent: false,
      promise: Promise.resolve(),
    };
    this.active.add(task);
    task.promise = Promise.resolve()
      .then<unknown>(() =>
        kind === "scan" ? this.scan(task, args) : this.preview(task, args)
      )
      .finally(() => this.active.delete(task));
    return task.promise;
  }
  private abort(task: Task) {
    task.controller.abort(cancelled());
    task.runtime?.cancel();
  }
  private async stopScan(owner: number): Promise<null> {
    const tasks = [...this.active].filter(
      (task) => task.owner === owner && task.kind === "scan"
    );
    for (const task of tasks) this.abort(task);
    await Promise.allSettled(tasks.map((task) => task.promise));
    return null;
  }
  disposeOwner(owner: number) {
    for (const task of this.active)
      if (task.owner === owner) {
        task.silent = true;
        this.abort(task);
      }
    this.deletion.disposeOwner(owner);
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    for (const task of this.active) {
      task.silent = true;
      this.abort(task);
    }
    await Promise.allSettled(
      [...this.active]
        .map((task) => task.promise)
        .concat(this.deletion.shutdown())
    );
  }
  private async scan(
    task: Task,
    args: Record<string, unknown>
  ): Promise<DedupAnalysisResult> {
    const signal = task.controller.signal;
    const selected = filePath(args.path, undefined, {});
    const root = await fs.realpath(selected);
    if (!(await fs.stat(root)).isDirectory())
      throw new Error("请选择目录：" + selected);
    signal.throwIfAborted();
    if (
      !args.config ||
      typeof args.config !== "object" ||
      Array.isArray(args.config)
    )
      throw new Error("扫描配置无效");
    this.addon ??= (
      this.host.loadAddon ??
      ((file) => createRequire(import.meta.url)(file) as Addon)
    )(path.join(this.appPath, "native-runtime/knowledge-addon.node"));
    const runtime = (task.runtime = new this.addon.DedupRuntime());
    let progressError: unknown;
    const drain = () => {
      const events = JSON.parse(runtime.drainProgress()) as DedupScanProgress[];
      if (!task.silent && !signal.aborted)
        for (const event of events)
          this.host.emit?.(task.owner, "dedup-scan-progress", event);
    };
    const timer = setInterval(() => {
      try {
        drain();
      } catch (error) {
        progressError = error;
        runtime.cancel();
      }
    }, 50);
    try {
      const json = await runtime.scan(root, JSON.stringify(args.config));
      signal.throwIfAborted();
      if (progressError) throw progressError;
      drain();
      return JSON.parse(json) as DedupAnalysisResult;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (progressError) throw progressError;
      throw error;
    } finally {
      clearInterval(timer);
    }
  }
  private async preview(
    task: Task,
    args: Record<string, unknown>
  ): Promise<string> {
    const signal = task.controller.signal;
    const filename = filePath(args.path, undefined, {});
    const maxKb = args.maxSizeKb ?? 512;
    if (
      typeof maxKb !== "number" ||
      !Number.isSafeInteger(maxKb) ||
      maxKb < 0 ||
      maxKb > 65536
    )
      throw new Error("预览大小需为 0 到 65536 KiB 的整数");
    const max = maxKb * 1024;
    const physical = async () => {
      const real = await fs.realpath(filename),
        info = await fs.lstat(filename);
      signal.throwIfAborted();
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        path.relative(filename, real) !== ""
      )
        throw new Error("请选择真实的普通文件：" + filename);
      return info;
    };
    const before = await physical();
    if (before.size > max) throw new Error("文件过大，无法预览：" + filename);
    const handle = await fs.open(filename, "r");
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== before.dev ||
        opened.ino !== before.ino
      )
        throw new Error("文件已发生变化，请重新选择：" + filename);
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        signal.throwIfAborted();
        const buffer = Buffer.alloc(Math.min(65536, max + 1 - total));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total > max) throw new Error("文件过大，无法预览：" + filename);
        chunks.push(buffer.subarray(0, bytesRead));
      }
      const after = await physical(),
        current = await handle.stat();
      signal.throwIfAborted();
      if (
        after.dev !== opened.dev ||
        after.ino !== opened.ino ||
        current.size !== total ||
        current.mtimeMs !== opened.mtimeMs
      )
        throw new Error("文件已发生变化，请重新读取：" + filename);
      try {
        return new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(Buffer.concat(chunks, total));
      } catch {
        throw new Error("文件内容无法按 UTF-8 读取：" + filename);
      }
    } finally {
      await handle.close();
    }
  }
}
