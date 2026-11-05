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
import type { OperationLog } from "../src/tools/symlink-mover/types";
interface Runtime {
  operate(command: string, configuration: string): Promise<string>;
  cancel(): void;
  drainEvents(): string;
}
interface Addon {
  SymlinkMoverRuntime: new () => Runtime;
  runSymlinkMoverQuery(command: string, configuration: string): Promise<string>;
}
interface Host {
  emit?(owner: number, event: string, payload: unknown): unknown;
  loadAddon?(filename: string): Addon;
}
interface Task {
  owner: number;
  id: string;
  cancelled: boolean;
  silent: boolean;
  runtime?: Runtime;
  promise: Promise<unknown>;
}
const queries = new Set([
  "validate_file_for_link",
  "validate_files_for_link",
  "preflight_symlink_operation",
]);
export class SymlinkMover {
  private addon?: Addon;
  private task?: Task;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly queries = new Set<{ owner: number; disposed: boolean }>();
  private readonly history: OperationLog[] = [];
  private readonly latestByOwner = new Map<number, OperationLog>();
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
      if (command === "cancel_move_operation")
        return this.cancel(owner, args.operationId);
      if (this.closing) throw new Error("应用正在退出");
      if (command === "get_latest_operation_log")
        return Promise.resolve(
          structuredClone(
            this.latestByOwner.get(owner) ?? this.history.at(-1) ?? null
          )
        );
      if (command === "get_all_operation_logs")
        return Promise.resolve(structuredClone(this.history));
      const configuration = JSON.stringify(args);
      if (queries.has(command)) {
        const query = { owner, disposed: false };
        this.queries.add(query);
        const operation = Promise.resolve()
          .then(async () => {
            if (query.disposed) throw new Error("文件查询已随窗口关闭");
            const json = await this.getAddon().runSymlinkMoverQuery(
              command,
              configuration
            );
            if (query.disposed) throw new Error("文件查询已随窗口关闭");
            return JSON.parse(json) as unknown;
          })
          .finally(() => {
            this.queries.delete(query);
          });
        return this.track(operation);
      }
      if (!["move_and_link", "create_links_only"].includes(command))
        throw new Error("不支持的文件链接操作");
      if (this.task)
        throw new Error("已有文件搬移或链接任务正在运行，请等待其完成");
      const id = args.operationId ?? randomUUID();
      if (typeof id !== "string" || !id || id.length > 256 || id.includes("\0"))
        throw new Error("文件任务身份无效");
      const task: Task = {
        owner,
        id,
        cancelled: false,
        silent: false,
        promise: Promise.resolve(),
      };
      this.task = task;
      task.promise = Promise.resolve()
        .then(() => this.operate(task, command, configuration))
        .finally(() => {
          if (this.task === task) this.task = undefined;
        });
      return this.track(task.promise);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private abort(task: Task) {
    task.cancelled = true;
    task.runtime?.cancel();
  }
  private async cancel(owner: number, id: unknown): Promise<null> {
    const task = this.task;
    if (task?.owner === owner && (id == null || id === task.id)) {
      this.abort(task);
      await Promise.allSettled([task.promise]);
    }
    return null;
  }
  disposeOwner(owner: number) {
    if (this.task?.owner === owner) {
      this.task.silent = true;
      this.abort(this.task);
    }
    for (const query of this.queries)
      if (query.owner === owner) query.disposed = true;
    this.latestByOwner.delete(owner);
  }
  async shutdown() {
    this.closing = true;
    if (this.task) {
      this.task.silent = true;
      this.abort(this.task);
    }
    for (const query of this.queries) query.disposed = true;
    await Promise.allSettled([...this.pending]);
  }
  private async operate(task: Task, command: string, configuration: string) {
    if (task.cancelled) throw new Error("操作已被用户取消");
    const runtime = (task.runtime =
      new (this.getAddon().SymlinkMoverRuntime)());
    let eventError: unknown;
    const drain = () => {
      const events = JSON.parse(runtime.drainEvents()) as Record<
        string,
        unknown
      >[];
      if (!task.silent && !task.cancelled)
        for (const payload of events)
          this.host.emit?.(task.owner, "copy-progress", {
            ...payload,
            operationId: task.id,
          });
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
      const json = await runtime.operate(command, configuration);
      drain();
      const outcome = JSON.parse(json) as {
        message: string;
        log: OperationLog;
      };
      this.history.push(outcome.log);
      if (this.history.length > 100) this.history.shift();
      if (!task.silent) this.latestByOwner.set(task.owner, outcome.log);
      if (eventError) throw eventError;
      return outcome.message;
    } finally {
      clearInterval(timer);
    }
  }
}
