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

import type { NativeWorker } from "./native-plugins";
import { terminateProcessTree } from "./process-runner";
import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
export const codeFormatterCommands = [
  "format_code",
  "code_formatter_status",
] as const;
interface Host {
  spawnWorker(): NativeWorker;
  root: string;
  timeoutMs?: number;
  terminateTree?(pid: number): Promise<void>;
}
interface Owner {
  disposed: boolean;
  count: number;
}
interface Call {
  id: string;
  owner: Owner;
  command: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
}
interface Instance {
  worker: NativeWorker;
  closed: boolean;
  exited: Promise<void>;
  active?: Call;
  stopping?: Promise<void>;
}
/** Shared native formatter with bounded document-owned tasks and a killable process tree. */
export class CodeFormatter {
  private instance?: Instance;
  private owners = new Map<number, Owner>();
  private pending = new Set<Promise<unknown>>();
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  private nextId = 0;
  constructor(private readonly host: Host) {}
  get hasPendingOperations() {
    return this.pending.size > 0 || !!this.instance;
  }
  private create(): Instance {
    const worker = this.host.spawnWorker();
    let onExit!: () => void;
    const instance: Instance = {
      worker,
      closed: false,
      exited: new Promise((resolve) => {
        onExit = resolve;
      }),
    };
    worker.on("message", (message: unknown) => {
      const reply = message as {
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: unknown;
      } | null;
      if (!reply || reply.id !== instance.active?.id) return;
      if (reply.ok === true) instance.active!.resolve(reply.result);
      else
        instance.active!.reject(
          Error(
            typeof reply.error === "string" ? reply.error : "格式化任务失败"
          )
        );
    });
    worker.once("exit", () => {
      instance.closed = true;
      instance.active?.reject(Error("代码格式化进程已退出，请重试"));
      if (this.instance === instance) this.instance = undefined;
      onExit();
    });
    worker.on("error", (error: unknown) => {
      instance.active?.reject(Error("代码格式化进程出错: " + String(error)));
      // The current command awaits process cleanup before the next action starts.
      void this.stop(instance!).catch(() => {});
    });
    return instance;
  }
  private stop(instance: Instance): Promise<void> {
    if (instance.stopping) return instance.stopping;
    if (this.instance === instance) this.instance = undefined;
    instance.stopping = (async () => {
      if (instance.closed) return;
      const terminate = this.host.terminateTree ?? terminateProcessTree;
      if (!instance.closed && instance.worker.pid)
        await terminate(instance.worker.pid);
      if (!instance.closed && !instance.worker.kill())
        instance.worker.once("spawn", () => {
          void (async () => {
            if (instance.worker.pid) await terminate(instance.worker.pid);
            instance.worker.kill();
          })().catch(() => {});
        });
      let timer!: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          instance.exited,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("停止代码格式化进程超时，请重启应用")),
              5000
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })().catch((error) => {
      // A formatter tree with uncertain cleanup must never overlap a replacement.
      this.closing = true;
      throw error;
    });
    return instance.stopping;
  }
  runCommand(
    ownerId: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      if (this.closing) throw Error("应用正在退出");
      if (!(codeFormatterCommands as readonly string[]).includes(command))
        throw Error("不支持的格式化任务");
      if (this.pending.size >= 8)
        throw Error("格式化任务较多，请等待当前操作完成");
      let owner = this.owners.get(ownerId);
      if (!owner) {
        owner = { disposed: false, count: 0 };
        this.owners.set(ownerId, owner);
      }
      if (owner.count >= 2) throw Error("当前窗口的操作正在处理，请稍后重试");
      if (!["php", "rust", "c", "cpp"].includes(String(args.language)))
        throw Error("该语言使用前端格式化引擎");
      if (
        command === "format_code" &&
        (typeof args.code !== "string" ||
          Buffer.byteLength(args.code) > 4 * 1024 * 1024)
      )
        throw Error("代码超过 4 MiB，请分段格式化");
      const configuration = JSON.stringify(args);
      if (Buffer.byteLength(configuration) > 26 * 1024 * 1024)
        throw Error("格式化任务参数过长");
      const accepted = owner;
      accepted.count++;
      const operation = this.tail
        .then(async () => {
          if (accepted.disposed) throw Error("格式化任务已随页面关闭");
          if (this.closing) throw Error("代码格式化服务已停止，请重新启动应用");
          const scratchRoot = path.join(
            this.host.root,
            "code-formatter",
            "jobs"
          );
          await mkdir(scratchRoot, { recursive: true });
          const scratch = await mkdtemp(path.join(scratchRoot, "format-"));
          let instance: Instance | undefined;
          try {
            if (accepted.disposed) throw Error("格式化任务已随页面关闭");
            instance = this.instance ??= this.create();
            let timer!: ReturnType<typeof setTimeout>;
            try {
              const value = await new Promise<unknown>((resolve, reject) => {
                const id = String(++this.nextId);
                instance!.active = {
                  id,
                  owner: accepted,
                  command,
                  resolve,
                  reject,
                };
                timer = setTimeout(() => {
                  reject(Error("格式化运行超时，请缩小代码片段后重试"));
                  void this.stop(instance!).catch(() => {});
                }, this.host.timeoutMs ?? 15000);
                instance!.worker.postMessage({
                  id,
                  command,
                  configuration,
                  scratch,
                });
              });
              if (accepted.disposed) throw Error("格式化任务已随页面关闭");
              return value;
            } finally {
              clearTimeout(timer);
              instance.active = undefined;
              if (instance.stopping) await instance.stopping;
            }
          } finally {
            // A failed stop leaves the service closed and preserves scratch for recovery.
            if (!instance?.stopping || instance.closed)
              await rm(scratch, { recursive: true, force: true });
          }
        })
        .finally(() => {
          accepted.count--;
          this.pending.delete(operation);
        });
      this.tail = operation.catch(() => {});
      this.pending.add(operation);
      return operation;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  disposeOwner(ownerId: number) {
    const owner = this.owners.get(ownerId);
    if (!owner) return;
    owner.disposed = true;
    this.owners.delete(ownerId);
    const instance = this.instance;
    const active = instance?.active;
    if (instance && active?.owner === owner) {
      active.reject(Error("格式化任务已随页面关闭"));
      void this.stop(instance).catch(() => {});
    }
  }

  async shutdown() {
    this.closing = true;
    for (const owner of this.owners.keys()) this.disposeOwner(owner);
    await Promise.allSettled([...this.pending]);
    if (this.instance) await this.stop(this.instance);
  }
}
