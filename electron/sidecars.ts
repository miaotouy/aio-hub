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

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { terminateProcessTree } from "./process-runner";
import { pluginId } from "./plugin-packages";
import {
  resolveSidecar,
  type PluginRuntimeHost,
  type SidecarSpec,
} from "./plugin-runtime-paths";

interface Pending {
  owner?: number;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}
interface Running {
  spec: SidecarSpec;
  generation: string;
  child: ChildProcessWithoutNullStreams;
  owners: Map<number, number>;
  closed: Promise<void>;
  started: Promise<void>;
  pending: Map<number, Pending>;
  nextId: number;
  resident: boolean;
  closing: boolean;
  exited: boolean;
  result?: string;
  failure?: Error;
  stopTask?: Promise<void>;
}
interface SidecarHost extends PluginRuntimeHost {
  emit: (owner: number, event: string, payload: unknown) => void;
  commandTimeoutMs?: number;
  brokerTimeoutMs?: number;
  shutdownGraceMs?: number;
  maxLineBytes?: number;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Sidecar 参数格式无效");
  return value as Record<string, unknown>;
}
function methodName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 256 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error("Sidecar 方法名无效");
  return value;
}

/** Frame bytes before decoding UTF-8; bound partial lines as well as complete messages. */
function lines(
  stream: Readable,
  limit: number,
  consume: (line: string) => void,
  failure: (error: Error) => void
) {
  let buffered = Buffer.alloc(0);
  stream.on("data", (chunk: Buffer) => {
    try {
      buffered = Buffer.concat([buffered, chunk]);
      let end: number;
      while ((end = buffered.indexOf(10)) >= 0) {
        if (end > limit) throw new Error("Sidecar 单条输出超出大小上限");
        consume(buffered.subarray(0, end).toString("utf8").replace(/\r$/, ""));
        buffered = buffered.subarray(end + 1);
      }
      if (buffered.length > limit)
        throw new Error("Sidecar 单条输出超出大小上限");
    } catch (error) {
      buffered = Buffer.alloc(0);
      failure(error as Error);
    }
  });
  stream.on("end", () => {
    if (buffered.length) consume(buffered.toString("utf8").replace(/\r$/, ""));
  });
  stream.on("error", failure);
}

export class Sidecars {
  private residents = new Map<string, Running>();
  private processes = new Set<Running>();
  private operations = new Set<Promise<unknown>>();
  private locks = new Map<string, Promise<unknown>>();
  private epochs = new Map<number, number>();
  private stopping = false;
  constructor(private host: SidecarHost) {}
  get hasPendingOperations() {
    return this.processes.size > 0 || this.operations.size > 0;
  }
  private epoch(owner: number) {
    return this.epochs.get(owner) ?? 0;
  }
  private assertOwner(owner: number, epoch: number) {
    if (this.stopping || this.epoch(owner) !== epoch)
      throw new Error("Sidecar 操作已取消，所属窗口已退出或刷新");
  }
  private track<T>(task: Promise<T>): Promise<T> {
    this.operations.add(task);
    void task.then(
      () => this.operations.delete(task),
      () => this.operations.delete(task)
    );
    return task;
  }
  private exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    const task = (this.locks.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(action);
    this.locks.set(id, task);
    void task.then(
      () => {
        if (this.locks.get(id) === task) this.locks.delete(id);
      },
      () => {
        if (this.locks.get(id) === task) this.locks.delete(id);
      }
    );
    return task;
  }
  run(
    owner: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const epoch = this.epoch(owner);
    return this.track(this.dispatch(owner, epoch, name, args));
  }
  private async dispatch(
    owner: number,
    epoch: number,
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    this.assertOwner(owner, epoch);
    if (name === "execute_sidecar") {
      const input = object(args.request);
      if (input.input !== undefined && typeof input.input !== "string")
        throw new Error("Sidecar 输入需为 JSON 字符串");
      const id = pluginId(input.plugin_id);
      const process = await this.exclusive(id, async () => {
        const spec = await resolveSidecar(this.host, {
          pluginId: id,
          installPath: input.install_path,
          executablePath: input.executable_path,
          args: input.args,
        });
        this.assertOwner(owner, epoch);
        return this.start(spec, owner, epoch, false);
      });
      const timer = setTimeout(() => {
        void this.stop(process, new Error("Sidecar 执行超时"), true);
      }, this.host.commandTimeoutMs ?? 300000);
      try {
        await process.started;
        await this.write(process, input.input ?? "", true);
        await process.closed;
        if (process.failure) throw process.failure;
        return process.result ?? '{"type":"result","data":null}';
      } finally {
        clearTimeout(timer);
        await this.stop(process, new Error("Sidecar 调用结束"), true);
      }
    }
    const id = pluginId(args.pluginId);
    if (name === "sidecar_spawn_resident") {
      return this.exclusive(id, async () => {
        const spec = await resolveSidecar(this.host, {
          ...args,
          resident: true,
        });
        this.assertOwner(owner, epoch);
        let current = this.residents.get(id);
        if (current?.closing) {
          await current.stopTask;
          current = undefined;
        }
        this.assertOwner(owner, epoch);
        if (current && !current.exited) {
          if (JSON.stringify(current.spec) !== JSON.stringify(spec))
            throw new Error("Sidecar 配置已变化，请先停止常驻进程");
          current.owners.set(owner, epoch);
          return current.generation;
        }
        const process = this.start(spec, owner, epoch, true);
        this.residents.set(id, process);
        await process.started;
        this.assertOwner(owner, epoch);
        return process.generation;
      });
    }
    const process = this.residents.get(id);
    if (name === "sidecar_kill_resident") {
      if (!process || process.owners.get(owner) !== epoch) return;
      return this.exclusive(id, async () => {
        if (this.residents.get(id) !== process) return;
        this.releaseOwner(process, owner);
        if (!process.owners.size)
          await this.stop(
            process,
            new Error("Sidecar 调用已取消，插件已停用"),
            false
          );
      });
    }
    if (name !== "sidecar_send_command")
      throw new Error("未知的 Sidecar 命令: " + name);
    if (!process || process.exited || process.closing)
      throw new Error("插件 " + id + " 的常驻进程未启动");
    if (process.owners.get(owner) !== epoch)
      throw new Error("当前窗口尚未启动此 Sidecar 常驻进程");
    return this.send(
      process,
      methodName(args.method),
      args.params ?? {},
      this.host.commandTimeoutMs ?? 300000,
      owner,
      epoch
    );
  }
  private start(
    spec: SidecarSpec,
    owner: number,
    epoch: number,
    resident: boolean
  ): Running {
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.directory,
      env: { ...process.env, AIOHUB_PLUGIN_DATA_DIR: spec.dataDirectory },
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let finish!: () => void;
    const running: Running = {
      spec,
      generation: randomUUID(),
      child,
      owners: new Map([[owner, epoch]]),
      closed: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      started: Promise.resolve(),
      nextId: 1,
      pending: new Map(),
      resident,
      closing: false,
      exited: false,
    };
    running.started = new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    // An early process error must remain observed even if the caller's document disappears.
    void running.started.catch(() => {});
    this.processes.add(running);
    const failure = (error: Error) => {
      running.failure ??= error;
      void this.stop(running, error, true);
    };
    child.on("error", (error) => {
      running.failure ??= new Error("无法启动 Sidecar: " + error.message);
    });
    child.stdin.on("error", failure);
    child.once("close", (code) => {
      running.exited = true;
      if (!running.closing && code !== 0)
        running.failure ??= new Error("Sidecar 进程已退出，退出码: " + code);
      for (const pending of running.pending.values())
        pending.reject(running.failure ?? new Error("Sidecar 进程已退出"));
      running.pending.clear();
      if (this.residents.get(spec.id) === running)
        this.residents.delete(spec.id);
      this.processes.delete(running);
      if (resident && !running.closing)
        this.emit(
          running,
          "exit",
          running.failure?.message ?? "Sidecar 进程已退出"
        );
      finish();
    });
    lines(
      child.stdout,
      this.host.maxLineBytes ?? 16 * 1024 ** 2,
      (line) => {
        if (!running.closing) this.output(running, line);
      },
      failure
    );
    lines(
      child.stderr,
      this.host.maxLineBytes ?? 16 * 1024 ** 2,
      (line) => {
        if (!running.closing) this.emit(running, "log", line);
      },
      failure
    );
    return running;
  }
  private emit(
    process: Running,
    type: string,
    line: string,
    eventName: string | null = null
  ) {
    for (const [owner, epoch] of process.owners) {
      if (this.epoch(owner) !== epoch) continue;
      this.host.emit(
        owner,
        process.resident ? "sidecar-resident-event" : "sidecar-output",
        {
          plugin_id: process.spec.id,
          ...(process.resident
            ? { generation_id: process.generation, event_name: eventName }
            : {}),
          event_type: type,
          data: line,
        }
      );
    }
  }
  private output(process: Running, line: string) {
    let frame: Record<string, unknown>;
    try {
      frame = object(JSON.parse(line));
    } catch {
      this.emit(process, "log", line);
      return;
    }
    const type = typeof frame.type === "string" ? frame.type : "unknown";
    if (!process.resident) {
      if (type === "result" || type === "error") process.result = line;
      this.emit(process, type, line);
      return;
    }
    if (this.residents.get(process.spec.id) !== process) return;
    if (type === "forward") {
      this.track(this.forward(process, frame));
      return;
    }
    if (
      (type === "result" || type === "error") &&
      Number.isSafeInteger(frame.id)
    ) {
      process.pending.get(frame.id as number)?.resolve(line);
      return;
    }
    this.emit(
      process,
      type,
      line,
      type === "event" && typeof frame.event === "string" ? frame.event : null
    );
  }
  private async write(process: Running, value: unknown, end = false) {
    const line = typeof value === "string" ? value : JSON.stringify(value);
    if (Buffer.byteLength(line) > (this.host.maxLineBytes ?? 16 * 1024 ** 2))
      throw new Error("Sidecar 单次输入超出大小上限");
    await new Promise<void>((resolve, reject) => {
      const done = (error?: Error | null) =>
        error
          ? reject(new Error("写入 Sidecar 失败: " + error.message))
          : resolve();
      if (end) process.child.stdin.end(line + "\n", done);
      else process.child.stdin.write(line + "\n", done);
    });
  }
  private send(
    process: Running,
    method: string,
    params: unknown,
    timeout: number,
    owner?: number,
    epoch?: number
  ): Promise<string> {
    if (process.exited || process.closing)
      return Promise.reject(new Error("Sidecar 进程已退出"));
    if (process.pending.size >= 256)
      return Promise.reject(new Error("Sidecar 待处理请求过多，请稍后重试"));
    const id = process.nextId++;
    return new Promise<string>((resolve, reject) => {
      const finish = (error?: Error, line?: string) => {
        clearTimeout(timer);
        process.pending.delete(id);
        if (error) reject(error);
        else resolve(line!);
      };
      const timer = setTimeout(() => {
        const error = new Error(
          "命令执行超时: " + process.spec.id + "." + method
        );
        finish(error);
        void this.stop(process, error, true);
      }, timeout);
      process.pending.set(id, {
        owner,
        resolve: (line) => {
          if (owner !== undefined && this.epoch(owner) !== epoch)
            finish(new Error("Sidecar 调用已取消，窗口已刷新"));
          else finish(undefined, line);
        },
        reject: (error) => finish(error),
      });
      void this.write(process, { id, method, params }).catch((error: Error) => {
        finish(error);
        void this.stop(process, error, true);
      });
    });
  }
  private async forward(source: Running, frame: Record<string, unknown>) {
    let result: unknown = null,
      error: string | null = null;
    let target: Running | undefined;
    try {
      target = this.residents.get(pluginId(frame.target));
      if (
        !target ||
        target.closing ||
        ![...source.owners.keys()].some((owner) => target!.owners.has(owner))
      )
        throw new Error("目标 Sidecar 未在当前窗口启动");
      const response = object(
        JSON.parse(
          await this.send(
            target,
            methodName(frame.method),
            frame.params ?? {},
            this.host.brokerTimeoutMs ?? 120000
          )
        )
      );
      if (this.residents.get(target.spec.id) !== target)
        throw new Error("目标 Sidecar 进程已重启");
      if (response.type === "error")
        error = String(response.data ?? "目标 Sidecar 调用失败");
      else result = response.data ?? null;
    } catch (failure) {
      error = (failure as Error).message;
    }
    if (this.residents.get(source.spec.id) !== source || source.closing) return;
    await this.write(source, {
      type: "event",
      event: "forward_result",
      data: { id: frame.id ?? 0, targetId: frame.target, result, error },
    }).catch(() => {});
  }
  private stop(process: Running, reason: Error, force: boolean): Promise<void> {
    if (process.stopTask) return process.stopTask;
    process.closing = true;
    if (!process.resident && !process.exited) process.failure ??= reason;
    for (const pending of [...process.pending.values()]) pending.reject(reason);
    process.stopTask = (async () => {
      if (!process.exited && !force) {
        await this.write(process, {
          id: 0,
          method: "shutdown",
          params: {},
        }).catch(() => {});
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.host.shutdownGraceMs ?? 5000);
          void process.closed.then(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      if (process.child.pid) await terminateProcessTree(process.child.pid);
      process.child.stdin.destroy();
      process.child.stdout.destroy();
      process.child.stderr.destroy();
      await process.closed;
    })();
    return process.stopTask;
  }
  private releaseOwner(process: Running, owner: number) {
    process.owners.delete(owner);
    for (const pending of [...process.pending.values()])
      if (pending.owner === owner)
        pending.reject(new Error("Sidecar 调用已取消，所属窗口已退出或刷新"));
  }
  disposeOwner(owner: number): void {
    this.epochs.set(owner, this.epoch(owner) + 1);
    for (const process of this.processes) {
      this.releaseOwner(process, owner);
      if (!process.owners.size)
        this.track(
          this.stop(
            process,
            new Error("Sidecar 调用已取消，所属窗口已退出或刷新"),
            true
          )
        );
    }
  }
  async recyclePlugin(id: string, action: () => Promise<void>): Promise<void> {
    return this.exclusive(pluginId(id), async () => {
      await this.stopPlugin(id);
      await action();
    });
  }
  async stopPlugin(id: unknown): Promise<void> {
    const key = pluginId(id);
    await Promise.all(
      [...this.processes]
        .filter((process) => process.spec.id === key)
        .map((process) =>
          this.stop(
            process,
            new Error("Sidecar 调用已取消，插件正在卸载"),
            true
          )
        )
    );
  }
  async shutdown(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled(
      [...this.processes].map((process) =>
        this.stop(process, new Error("Sidecar 调用已取消，应用正在退出"), true)
      )
    );
    await Promise.allSettled([...this.operations]);
  }
}
