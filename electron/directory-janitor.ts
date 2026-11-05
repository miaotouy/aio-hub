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
import type { Stats } from "node:fs";
import path from "node:path";
import { filePath } from "./filesystem";
import { withinPath } from "./file-security";
import type {
  AnalysisResult,
  CleanupResult,
  ItemInfo,
} from "../src/tools/directory-janitor/types";

type Kind = "scan" | "cleanup";
interface Task {
  owner: number;
  kind: Kind;
  controller: AbortController;
  silent: boolean;
  promise: Promise<unknown>;
}
interface Host {
  filesOnly?: boolean;
  trashItem: (filename: string) => Promise<void>;
  emit?: (owner: number, event: string, payload: unknown) => unknown;
}
interface TreeEntry {
  filename: string;
  depth: number;
  visible: boolean;
  size: number;
  info?: Stats;
  parent?: TreeEntry;
}
function integer(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(label + "需为非负整数");
  return value;
}
function pattern(value: unknown): ((name: string) => boolean) | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 1024 || value.includes("\0"))
    throw new Error("名称模式无效，请使用 * 或 ? 匹配文件名");
  const tokens = [...value];
  return (name) => {
    const chars = [...name];
    let patternIndex = 0,
      nameIndex = 0,
      star = -1,
      retry = 0;
    while (nameIndex < chars.length) {
      if (
        tokens[patternIndex] === "?" ||
        tokens[patternIndex] === chars[nameIndex]
      ) {
        patternIndex++;
        nameIndex++;
      } else if (tokens[patternIndex] === "*") {
        star = patternIndex++;
        retry = nameIndex;
      } else if (star >= 0) {
        patternIndex = star + 1;
        nameIndex = ++retry;
      } else return false;
    }
    while (tokens[patternIndex] === "*") patternIndex++;
    return patternIndex === tokens.length;
  };
}
function samePath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}
function changedPath(filename: string): Error {
  return new Error(
    "路径包含链接或扫描期间发生变化，请重新选择真实路径：" + filename
  );
}
async function validatePhysical(
  filename: string,
  signal: AbortSignal
): Promise<Stats> {
  signal.throwIfAborted();
  const real = await fs.realpath(filename);
  const info = await fs.lstat(filename);
  signal.throwIfAborted();
  if (info.isSymbolicLink() || !samePath(filename, real))
    throw changedPath(filename);
  if (!info.isFile() && !info.isDirectory())
    throw new Error("仅支持普通文件和目录：" + filename);
  return info;
}
/** Post-order sizing visits each ordinary entry once and never follows descendant links. */
async function sizedTree(
  filename: string,
  signal: AbortSignal,
  visit: (entry: TreeEntry) => void,
  rejectLinks: boolean
): Promise<number> {
  const root: TreeEntry = { filename, depth: -1, visible: true, size: 0 };
  const stack = [root];
  while (stack.length) {
    signal.throwIfAborted();
    const entry = stack.pop()!;
    if (entry.info) {
      entry.parent!.size += entry.size;
      visit(entry);
      continue;
    }
    const info = await fs.lstat(entry.filename);
    signal.throwIfAborted();
    if (info.isSymbolicLink()) {
      if (rejectLinks) throw changedPath(entry.filename);
      continue;
    }
    if (!info.isFile() && !info.isDirectory()) {
      if (rejectLinks)
        throw new Error("目录包含特殊文件，请单独处理：" + entry.filename);
      continue;
    }
    entry.info = info;
    if (!info.isDirectory()) {
      entry.size = info.size;
      if (entry.parent) entry.parent.size += entry.size;
      visit(entry);
      continue;
    }
    await validatePhysical(entry.filename, signal);
    if (entry.parent) stack.push(entry);
    const names = await fs.readdir(entry.filename);
    signal.throwIfAborted();
    for (let index = names.length - 1; index >= 0; index--) {
      const name = names[index],
        visible = entry.visible && !name.startsWith(".");
      // A hidden root child contributes to no visible directory's size.
      if (!rejectLinks && entry === root && !visible) continue;
      stack.push({
        filename: path.join(entry.filename, name),
        parent: entry,
        depth: entry.depth + 1,
        visible,
        size: 0,
      });
    }
  }
  signal.throwIfAborted();
  return root.size;
}

export class DirectoryJanitor {
  private readonly active = new Set<Task>();
  private closing = false;
  constructor(private readonly host: Host) {}
  get hasPendingOperations(): boolean {
    return this.active.size > 0;
  }
  private emit(task: Task, event: string, payload: unknown) {
    if (!task.silent && !task.controller.signal.aborted)
      this.host.emit?.(task.owner, event, payload);
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (command === "stop_directory_scan") return this.cancel(owner, "scan");
    if (command === "stop_directory_cleanup")
      return this.cancel(owner, "cleanup");
    if (this.closing) return Promise.reject(new Error("应用正在退出"));
    if (
      command !== "analyze_directory_for_cleanup" &&
      command !== "cleanup_items"
    )
      return Promise.reject(new Error("不支持的目录清理操作"));
    const kind: Kind = command === "cleanup_items" ? "cleanup" : "scan";
    if (
      [...this.active].some(
        (task) =>
          task.kind === kind && (kind === "cleanup" || task.owner === owner)
      )
    )
      return Promise.reject(
        new Error(
          kind === "cleanup"
            ? "已有目录清理任务正在运行，请等待完成"
            : "当前窗口已有目录扫描正在运行"
        )
      );
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
        kind === "scan" ? this.scan(task, args) : this.cleanup(task, args)
      )
      .finally(() => this.active.delete(task));
    return task.promise;
  }
  private async cancel(owner: number, kind: Kind): Promise<null> {
    const tasks = [...this.active].filter(
      (task) => task.owner === owner && task.kind === kind
    );
    for (const task of tasks) this.abort(task);
    await Promise.allSettled(tasks.map((task) => task.promise));
    return null;
  }
  private abort(task: Task) {
    task.controller.abort(
      Object.assign(
        new Error(
          task.kind === "scan" ? "扫描已被用户取消" : "清理已被用户取消"
        ),
        {
          code:
            task.kind === "scan"
              ? "DIRECTORY_SCAN_CANCELLED"
              : "DIRECTORY_CLEANUP_CANCELLED",
        }
      )
    );
  }
  disposeOwner(owner: number) {
    for (const task of this.active)
      if (task.owner === owner) {
        task.silent = true;
        this.abort(task);
      }
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    for (const task of this.active) {
      task.silent = true;
      this.abort(task);
    }
    await Promise.allSettled([...this.active].map((task) => task.promise));
  }
  private async scan(
    task: Task,
    args: Record<string, unknown>
  ): Promise<AnalysisResult> {
    const signal = task.controller.signal;
    const selected = filePath(args.path, undefined, {}),
      matcher = pattern(args.namePattern);
    const minAge = integer(args.minAgeDays, "最小年龄"),
      minSize = integer(args.minSizeMb, "最小大小"),
      maxDepth = integer(args.maxDepth, "最大深度");
    const root = await fs.realpath(selected),
      info = await fs.stat(root);
    signal.throwIfAborted();
    if (!info.isDirectory()) throw new Error("请选择目录：" + selected);
    const items: ItemInfo[] = [],
      now = Date.now(),
      progress = {
        currentPath: root,
        scannedCount: 0,
        currentDepth: 0,
        foundItems: 0,
      };
    this.emit(task, "directory-scan-progress", { ...progress });
    if (maxDepth !== 0)
      await sizedTree(
        root,
        signal,
        (entry) => {
          if (
            entry.depth < 0 ||
            !entry.visible ||
            (maxDepth != null && entry.depth >= maxDepth)
          )
            return;
          const name = path.basename(entry.filename),
            modified = Math.max(0, Math.floor(entry.info!.mtimeMs / 1000));
          if (
            (!matcher || matcher(name)) &&
            (minAge == null ||
              Math.floor(Math.max(0, now / 1000 - modified) / 86400) >=
                minAge) &&
            (minSize == null || entry.size / 1024 ** 2 >= minSize)
          )
            items.push({
              path: entry.filename,
              name,
              isDir: entry.info!.isDirectory(),
              size: entry.size,
              modified,
            });
          Object.assign(progress, {
            currentPath: entry.filename,
            scannedCount: progress.scannedCount + 1,
            currentDepth: entry.depth,
            foundItems: items.length,
          });
          if (progress.scannedCount % 10 === 0)
            this.emit(task, "directory-scan-progress", { ...progress });
        },
        false
      );
    signal.throwIfAborted();
    this.emit(task, "directory-scan-progress", {
      ...progress,
      currentPath: root,
      currentDepth: 0,
    });
    return {
      items,
      statistics: {
        totalItems: items.length,
        totalSize: items.reduce((total, item) => total + item.size, 0),
        totalDirs: items.filter((item) => item.isDir).length,
        totalFiles: items.filter((item) => !item.isDir).length,
      },
    };
  }
  private async cleanup(
    task: Task,
    args: Record<string, unknown>
  ): Promise<CleanupResult> {
    if (!Array.isArray(args.paths)) throw new Error("请选择要清理的路径列表");
    const requested = args.paths.map((value) => filePath(value, undefined, {}));
    if (
      requested.some((filename) =>
        samePath(filename, path.parse(filename).root)
      )
    )
      throw new Error("请选择具体文件或子目录，磁盘与共享根目录需保留");
    const unique = new Set<string>();
    const paths = requested.filter((filename) => {
      const key =
        process.platform === "win32" ? filename.toLowerCase() : filename;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    });
    // Process containing directories first, regardless of selection order.
    paths.sort((left, right) => left.length - right.length);
    const result: CleanupResult = {
      successCount: 0,
      errorCount: 0,
      freedSpace: 0,
      errors: [],
      cleanedPaths: [],
      cancelled: false,
    };
    const roots: string[] = [],
      signal = task.controller.signal;
    for (const [index, filename] of paths.entries()) {
      if (signal.aborted) {
        result.cancelled = true;
        break;
      }
      try {
        if (!roots.some((root) => withinPath(filename, root))) {
          const before = await validatePhysical(filename, signal);
          if (this.host.filesOnly && !before.isFile())
            throw new Error("仅支持回收普通文件：" + filename);
          const size = before.isDirectory()
            ? await sizedTree(filename, signal, () => {}, true)
            : before.size;
          const after = await validatePhysical(filename, signal);
          if (
            after.dev !== before.dev ||
            after.ino !== before.ino ||
            after.isDirectory() !== before.isDirectory()
          )
            throw changedPath(filename);
          signal.throwIfAborted();
          // The system trash operation is atomic from this task's perspective; cancellation waits for it.
          await this.host.trashItem(filename);
          roots.push(filename);
          result.freedSpace += size;
        }
        result.successCount++;
        result.cleanedPaths!.push(filename);
      } catch (error) {
        if (signal.aborted) {
          result.cancelled = true;
          break;
        }
        result.errorCount++;
        result.errors.push(
          "清理失败 " +
            filename +
            "：" +
            (error instanceof Error ? error.message : String(error))
        );
      }
      this.emit(task, "directory-cleanup-progress", {
        currentItem: filename,
        processedCount: index + 1,
        totalCount: paths.length,
        successCount: result.successCount,
        errorCount: result.errorCount,
      });
    }
    result.cancelled =
      result.cancelled ||
      (signal.aborted &&
        result.successCount + result.errorCount < paths.length);
    return result;
  }
}
