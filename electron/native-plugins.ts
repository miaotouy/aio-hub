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

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { NativeSpec, PluginRuntimeHost } from "./plugin-runtime-paths";
import { resolveNative } from "./plugin-runtime-paths";
import { terminateProcessTree } from "./process-runner";

export interface NativeWorker extends EventEmitter {
  postMessage(message: unknown): void;
  kill(): boolean;
  readonly pid?: number;
}
interface Host extends PluginRuntimeHost {
  spawnWorker(spec: NativeSpec): NativeWorker;
  timeoutMs?: number;
  unloadTimeoutMs?: number;
}
interface Pending {
  owner?: number;
  done: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Instance {
  spec: NativeSpec;
  worker: NativeWorker;
  owners: Map<number, number>;
  pending: Map<string, Pending>;
  accepting: boolean;
  closed: boolean;
  exited: Promise<void>;
  stopping?: Promise<void>;
}
function string(
  value: unknown,
  name: string,
  maxBytes = 16 * 1024 ** 2
): string {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    Buffer.byteLength(value, "utf8") > maxBytes
  )
    throw new Error(name + "无效或超过大小限制");
  return value;
}
export class NativePlugins {
  private instances = new Map<string, Instance>();
  private epochs = new Map<number, number>();
  private queues = new Map<string, Promise<unknown>>();
  private operations = new Set<Promise<unknown>>();
  private closing = false;
  constructor(private host: Host) {}
  get hasPendingOperations() {
    return this.operations.size > 0 || this.instances.size > 0;
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.operations.add(promise);
    void promise.finally(() => this.operations.delete(promise)).catch(() => {});
    return promise;
  }
  private enqueue<T>(id: string, action: () => Promise<T>): Promise<T> {
    const promise = (this.queues.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    this.queues.set(id, promise);
    void promise
      .finally(() => {
        if (this.queues.get(id) === promise) this.queues.delete(id);
      })
      .catch(() => {});
    return this.track(promise);
  }
  private checkOwner(owner: number, epoch: number) {
    if (this.closing) throw new Error("应用正在退出");
    if ((this.epochs.get(owner) ?? 0) !== epoch)
      throw new Error("插件所属窗口已离开");
  }
  private fail(instance: Instance, error: Error) {
    instance.accepting = false;
    for (const pending of instance.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    instance.pending.clear();
  }
  private request(
    instance: Instance,
    operation: string,
    data: Record<string, unknown> = {},
    owner?: number
  ): Promise<unknown> {
    if (instance.closed)
      return Promise.reject(new Error("原生插件进程已退出，请重新启用插件"));
    if (instance.pending.size >= 256)
      return Promise.reject(new Error("原生插件请求过多，请稍后重试"));
    const id = randomUUID();
    let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
    const done = new Promise<unknown>((a, b) => {
      resolve = a;
      reject = b;
    });
    const timer = setTimeout(() => {
      this.fail(instance, new Error("原生插件调用超时，请重新启用插件"));
      void this.stop(instance).catch((error) =>
        console.error("停止原生插件失败", error)
      );
    }, this.host.timeoutMs ?? 300_000);
    instance.pending.set(id, { owner, done, resolve, reject, timer });
    try {
      instance.worker.postMessage({ id, operation, ...data });
    } catch (error) {
      this.fail(instance, new Error("原生插件通信失败: " + String(error)));
      void this.stop(instance).catch((error) =>
        console.error("停止原生插件失败", error)
      );
    }
    return done;
  }
  private start(spec: NativeSpec): Instance {
    const worker = this.host.spawnWorker(spec);
    let onExit!: () => void;
    const instance: Instance = {
      spec,
      worker,
      owners: new Map(),
      pending: new Map(),
      accepting: false,
      closed: false,
      exited: new Promise<void>((resolve) => {
        onExit = resolve;
      }),
    };
    this.instances.set(spec.id, instance);
    worker.on("message", (value: unknown) => {
      if (!value || typeof value !== "object") return;
      const reply = value as {
        id?: string;
        ok?: boolean;
        result?: unknown;
        error?: unknown;
      };
      const pending =
        typeof reply.id === "string"
          ? instance.pending.get(reply.id)
          : undefined;
      if (!pending) return;
      instance.pending.delete(reply.id!);
      clearTimeout(pending.timer);
      if (reply.ok === true) pending.resolve(reply.result);
      else
        pending.reject(
          new Error(
            typeof reply.error === "string"
              ? reply.error
              : "原生插件返回了无效响应"
          )
        );
    });
    worker.once("exit", () => {
      instance.closed = true;
      this.fail(instance, new Error("原生插件进程已退出，请重新启用插件"));
      if (this.instances.get(spec.id) === instance)
        this.instances.delete(spec.id);
      onExit();
    });
    worker.on("error", (error: unknown) => {
      this.fail(instance, new Error("原生插件进程出错: " + String(error)));
      void this.stop(instance).catch((error) =>
        console.error("停止原生插件失败", error)
      );
    });
    return instance;
  }
  private stop(instance: Instance): Promise<void> {
    if (instance.stopping) return instance.stopping;
    this.fail(instance, new Error("原生插件已停止"));
    instance.stopping = this.track(
      (async () => {
        if (!instance.closed) {
          const kill = () => {
            instance.worker.kill();
          };
          if (!instance.worker.kill()) instance.worker.once("spawn", kill);
          const force = setTimeout(() => {
            if (instance.worker.pid)
              void terminateProcessTree(instance.worker.pid);
          }, 1000);
          let deadline!: ReturnType<typeof setTimeout>;
          try {
            await Promise.race([
              instance.exited,
              new Promise<never>((_, reject) => {
                deadline = setTimeout(
                  () => reject(new Error("停止原生插件超时，请重启应用")),
                  10000
                );
              }),
            ]);
          } finally {
            clearTimeout(force);
            clearTimeout(deadline);
            instance.worker.removeListener("spawn", kill);
          }
        }
      })()
    );
    return instance.stopping;
  }
  async run(
    owner: number,
    command: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const epoch = this.epochs.get(owner) ?? 0;
    this.checkOwner(owner, epoch);
    if (command === "load_native_plugin") {
      const id = string(args.pluginId, "插件 ID", 128);
      return this.enqueue(id, async () => {
        this.checkOwner(owner, epoch);
        const spec = await resolveNative(this.host, args);
        this.checkOwner(owner, epoch);
        let instance = this.instances.get(id);
        if (instance?.stopping) {
          await instance.stopping;
          instance = undefined;
        }
        if (instance && instance.spec.library !== spec.library)
          throw new Error("同 ID 的另一原生插件已加载，请先卸载");
        if (!instance) {
          instance = this.start(spec);
          try {
            await this.request(instance, "load", { library: spec.library });
          } catch (error) {
            await this.stop(instance);
            throw error;
          }
          instance.accepting = true;
        }
        try {
          this.checkOwner(owner, epoch);
        } catch (error) {
          if (!instance.owners.size && spec.reloadable)
            await this.stop(instance);
          throw error;
        }
        instance.owners.set(owner, epoch);
      });
    }
    const request = args.request as Record<string, unknown> | undefined;
    const id = string(
      command === "call_native_plugin_method"
        ? request?.plugin_id
        : args.pluginId,
      "插件 ID",
      128
    );
    if (command === "unload_native_plugin")
      return this.enqueue(id, async () => {
        this.checkOwner(owner, epoch);
        const instance = this.instances.get(id);
        if (!instance || instance.owners.get(owner) !== epoch)
          throw new Error("原生插件未在当前窗口加载");
        if (!instance.spec.reloadable)
          throw new Error("此插件需重启应用后卸载");
        if (instance.owners.size > 1) {
          instance.owners.delete(owner);
          return;
        }
        instance.accepting = false;
        try {
          let timer!: ReturnType<typeof setTimeout>;
          try {
            await Promise.race([
              Promise.allSettled(
                [...instance.pending.values()].map((p) => p.done)
              ),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(new Error("卸载超时，插件仍在使用中，请稍后重试")),
                  this.host.unloadTimeoutMs ?? 5000
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
          await this.request(instance, "unload");
          await this.stop(instance);
        } catch (error) {
          if (!instance.closed && !instance.stopping) instance.accepting = true;
          throw error;
        }
      });
    if (command !== "call_native_plugin_method")
      throw new Error("未知原生插件命令");
    const instance = this.instances.get(id);
    if (!instance || instance.closed)
      throw new Error("原生插件未加载，请重新启用插件");
    if (instance.owners.get(owner) !== epoch)
      throw new Error("原生插件未在当前窗口加载");
    if (!instance.accepting) throw new Error("原生插件正在停止");
    const method = string(request?.method_name, "方法名", 4096);
    if (!method) throw new Error("方法名为空");
    const payload = string(request?.payload, "载荷");
    return this.track(
      this.request(instance, "call", { method, payload }, owner)
    );
  }
  disposeOwner(owner: number) {
    this.epochs.set(owner, (this.epochs.get(owner) ?? 0) + 1);
    for (const instance of this.instances.values()) {
      instance.owners.delete(owner);
      for (const pending of instance.pending.values())
        if (pending.owner === owner) {
          pending.owner = undefined;
          pending.reject(new Error("插件所属窗口已离开"));
        }
      if (
        !instance.owners.size &&
        instance.spec.reloadable &&
        instance.accepting
      )
        void this.stop(instance).catch((error) =>
          console.error("停止原生插件失败", error)
        );
    }
  }
  recyclePlugin<T>(id: string, trash: () => Promise<T>): Promise<T> {
    return this.enqueue(id, async () => {
      if (this.closing) throw new Error("应用正在退出");
      const instance = this.instances.get(id);
      if (instance) {
        if (!instance.spec.reloadable)
          throw new Error("此插件已加载，请重启应用后卸载");
        await this.stop(instance);
      }
      return trash();
    });
  }
  async shutdown(): Promise<void> {
    this.closing = true;
    await Promise.all(
      [...this.instances.values()].map((instance) => this.stop(instance))
    );
    await Promise.allSettled([...this.operations]);
  }
}
