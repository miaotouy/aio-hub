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
export const windowAutomationCommands = [
  "wa_get_windows",
  "wa_get_self_pid",
  "wa_get_pixel",
  "wa_capture_window",
  "wa_send_click",
  "wa_send_keypress",
  "wa_get_client_rect",
  "wa_is_window_valid",
] as const;
interface Host {
  spawnWorker(): NativeWorker;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
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
/** One isolated native process, serialized actions, document-owned bounded requests. */
export class WindowAutomation {
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
          Error(typeof reply.error === "string" ? reply.error : "窗口操作失败")
        );
    });
    worker.once("exit", () => {
      instance.closed = true;
      instance.active?.reject(Error("窗口自动化进程已退出，请重试"));
      if (this.instance === instance) this.instance = undefined;
      onExit();
    });
    worker.on("error", (error: unknown) => {
      instance.active?.reject(Error("窗口自动化进程出错: " + String(error)));
      // The current command awaits process cleanup before the next action starts.
      void this.stop(instance).catch(() => {});
    });
    return instance;
  }
  private stop(instance: Instance): Promise<void> {
    if (instance.stopping) return instance.stopping;
    if (this.instance === instance) this.instance = undefined;
    instance.stopping = (async () => {
      if (instance.closed) return;
      if (!instance.worker.kill())
        instance.worker.once("spawn", () => instance.worker.kill());
      const force = setTimeout(() => {
        if (!instance.closed && instance.worker.pid)
          void terminateProcessTree(instance.worker.pid).catch(() => {});
      }, 1000);
      let timer!: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          instance.exited,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("停止窗口自动化进程超时，请重启应用")),
              5000
            );
          }),
        ]);
      } finally {
        clearTimeout(force);
        clearTimeout(timer);
      }
    })().catch((error) => {
      // A process that could still inject input must never overlap a replacement.
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
      if ((this.host.platform ?? process.platform) !== "win32")
        throw Error("窗口自动化需要 Windows 桌面版");
      if (!(windowAutomationCommands as readonly string[]).includes(command))
        throw Error("不支持的窗口操作");
      if (this.pending.size >= 32)
        throw Error("窗口任务较多，请等待当前操作完成");
      let owner = this.owners.get(ownerId);
      if (!owner) {
        owner = { disposed: false, count: 0 };
        this.owners.set(ownerId, owner);
      }
      if (owner.count >= 8) throw Error("当前窗口的操作正在处理，请稍后重试");
      const configuration = JSON.stringify(args);
      if (Buffer.byteLength(configuration) > 8192)
        throw Error("窗口操作参数过长");
      const accepted = owner;
      accepted.count++;
      const operation = this.tail
        .then(async () => {
          if (accepted.disposed) throw Error("窗口操作已随页面关闭");
          if (this.closing) throw Error("窗口自动化服务已停止，请重新启动应用");
          const instance = (this.instance ??= this.create());
          let timer!: ReturnType<typeof setTimeout>;
          try {
            const value = await new Promise<unknown>((resolve, reject) => {
              const id = String(++this.nextId);
              instance.active = {
                id,
                owner: accepted,
                command,
                resolve,
                reject,
              };
              timer = setTimeout(() => {
                reject(Error("目标窗口响应超时，请检查目标程序后重试"));
                void this.stop(instance).catch(() => {});
              }, this.host.timeoutMs ?? 5000);
              instance.worker.postMessage({
                id,
                command,
                configuration,
                selfPid: process.pid,
              });
            });
            if (accepted.disposed) throw Error("窗口操作已随页面关闭");
            if (command === "wa_capture_window") {
              if (typeof value !== "string" || value.length > 32 * 1024 * 1024)
                throw Error("窗口截图返回数据无效");
              return Uint8Array.from(Buffer.from(value, "base64")).buffer;
            }
            return value;
          } finally {
            clearTimeout(timer);
            instance.active = undefined;
            if (instance.stopping) await instance.stopping;
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
    // Let atomic input finish key-up/focus restoration; read-only calls can be killed immediately.
    if (
      instance &&
      active?.owner === owner &&
      !["wa_send_click", "wa_send_keypress"].includes(active.command)
    ) {
      active.reject(Error("窗口操作已随页面关闭"));
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
