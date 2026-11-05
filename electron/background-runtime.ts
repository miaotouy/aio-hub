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

import type {
  HostServiceHandler,
  HostServiceRequest,
  HostServiceResponse,
} from "./background-host-protocol";
import type { NativeWorker } from "./native-plugins";
import { terminateProcessTree } from "./process-runner";
import {
  BACKGROUND_RUNTIME_VERSION,
  type BackgroundWorkerMessage,
} from "./background-runtime-protocol";
import type { BackgroundJsRuntimeStatus } from "../src/background-runtime/protocol";

interface Host {
  spawnWorker(): NativeWorker;
  services?: HostServiceHandler;
  readyTimeoutMs?: number;
  heartbeatTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  terminateTree?(pid: number): Promise<void>;
}
interface Instance {
  worker: NativeWorker;
  generation: number;
  lastServiceId: number;
  initialized: boolean;
  initializationStarted: boolean;
  ready: boolean;
  exited: boolean;
  lastHeartbeat: number;
  lastHeartbeatAt?: number;
  connected: Promise<void>;
  resolveReady(): void;
  rejectReady(error: Error): void;
  exit: Promise<void>;
  resolveExit(): void;
  monitor?: ReturnType<typeof setInterval>;
  bootTimer?: ReturnType<typeof setTimeout>;
  stopping?: Promise<void>;
}
interface Pending {
  instance: Instance;
  owner: number;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
const failure = (code: string, message: string) =>
  Object.assign(Error(message), { code });

/** Application-owned runtime. Documents own RPC waiters, never the worker's lifetime. */
export class BackgroundRuntime {
  private instance?: Instance;
  private generation = 0;
  private nextId = 0;
  private closing = false;
  private shutdownPromise?: Promise<void>;
  private readonly owners = new Map<number, object>();
  private readonly hostOperations = new Set<Promise<void>>();
  private readonly pending = new Map<string, Pending>();
  constructor(private readonly host: Host) {}

  get hasPendingOperations() {
    return !!this.instance || this.hostOperations.size > 0;
  }
  getStatus(): BackgroundJsRuntimeStatus {
    const instance = this.instance;
    return {
      available: !this.closing,
      ready:
        !!instance?.ready &&
        !instance.stopping &&
        !instance.exited &&
        performance.now() - instance.lastHeartbeat <=
          (this.host.heartbeatTimeoutMs ?? 20_000),
      generation: this.generation,
      runtimeVersion: instance?.ready ? BACKGROUND_RUNTIME_VERSION : undefined,
      lastHeartbeatAt: instance?.lastHeartbeatAt,
    };
  }
  private create(): Instance {
    const worker = this.host.spawnWorker();
    let resolveReady!: () => void,
      rejectReady!: (error: Error) => void,
      resolveExit!: () => void;
    const instance: Instance = {
      worker,
      generation: ++this.generation,
      lastServiceId: 0,
      initialized: false,
      initializationStarted: false,
      ready: false,
      exited: false,
      lastHeartbeat: performance.now(),
      connected: new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      }),
      resolveReady: () => resolveReady(),
      rejectReady: (error) => rejectReady(error),
      exit: new Promise<void>((resolve) => {
        resolveExit = resolve;
      }),
      resolveExit: () => resolveExit(),
    };
    // Startup may be interrupted by application shutdown before a caller awaits it.
    void instance.connected.catch(() => {});
    this.instance = instance;
    const fail = (error: Error) => {
      this.rejectInstance(instance, error);
      void this.stop(instance).catch((error) =>
        console.error("后台运行时清理失败", error)
      );
    };
    worker.on("message", (message: BackgroundWorkerMessage) => {
      if (instance.stopping || instance.exited) return;
      if (message?.type === "host-request") {
        this.serve(instance, message);
      } else if (message?.type === "ready" && !instance.ready) {
        if (this.host.services && !instance.initialized) {
          fail(
            failure("RUNTIME_HOST_NOT_INITIALIZED", "后台宿主服务尚未初始化")
          );
          return;
        }
        if (message.runtimeVersion !== BACKGROUND_RUNTIME_VERSION) {
          fail(
            failure(
              "RUNTIME_VERSION_MISMATCH",
              "后台运行时版本不匹配，请重新启动应用"
            )
          );
          return;
        }
        instance.ready = true;
        instance.lastHeartbeat = performance.now();
        instance.lastHeartbeatAt = Date.now();
        clearTimeout(instance.bootTimer);
        instance.resolveReady();
        instance.monitor = setInterval(
          () => {
            if (
              performance.now() - instance.lastHeartbeat >
              (this.host.heartbeatTimeoutMs ?? 20_000)
            )
              fail(
                failure(
                  "RUNTIME_HEARTBEAT_TIMEOUT",
                  "后台运行时响应超时，请重试"
                )
              );
          },
          Math.min(5_000, this.host.heartbeatTimeoutMs ?? 20_000)
        );
      } else if (message?.type === "heartbeat" && instance.ready) {
        instance.lastHeartbeat = performance.now();
        instance.lastHeartbeatAt = Date.now();
      } else if (message?.type === "response") {
        const response = message.response;
        const pending = this.pending.get(response.id);
        if (!pending || pending.instance !== instance) return;
        this.pending.delete(response.id);
        clearTimeout(pending.timer);
        if (response.ok) pending.resolve(response.result);
        else
          pending.reject(
            failure(
              response.error?.code ?? "RUNTIME_CALL_FAILED",
              response.error?.message ?? "后台运行时请求失败"
            )
          );
      }
    });
    worker.once("exit", () => {
      instance.exited = true;
      this.rejectInstance(
        instance,
        failure("RUNTIME_EXITED", "后台运行时已退出，请重试")
      );
      instance.resolveExit();
      if (this.instance === instance) this.instance = undefined;
    });
    worker.on("error", (error: unknown) =>
      fail(failure("RUNTIME_FAILED", "后台运行时出错: " + String(error)))
    );
    instance.bootTimer = setTimeout(
      () =>
        fail(failure("RUNTIME_READY_TIMEOUT", "后台运行时启动超时，请重试")),
      this.host.readyTimeoutMs ?? 15_000
    );
    return instance;
  }
  private serve(instance: Instance, request: HostServiceRequest) {
    if (
      this.closing ||
      this.instance !== instance ||
      instance.stopping ||
      instance.exited
    )
      return;
    // Monotonic IDs bound replay bookkeeping without retaining completed payloads/keys.
    if (
      !Number.isSafeInteger(request.id) ||
      request.id <= instance.lastServiceId
    )
      return;
    instance.lastServiceId = request.id;
    const reply = (response: HostServiceResponse) => {
      if (
        this.instance !== instance ||
        instance.stopping ||
        instance.exited ||
        this.closing
      )
        return;
      try {
        instance.worker.postMessage(response);
      } catch {
        /* The transaction already completed. */
      }
    };
    const reject = (code: string, message: string) =>
      reply({
        type: "host-response",
        id: request.id,
        ok: false,
        error: { code, message },
      });
    if (
      !this.host.services ||
      ![
        "host.initialize",
        "llm.configuration.load",
        "llm.proxy.resolve",
        "context.files.policy",
        "context.assets.root",
        "llm.keys.execute",
      ].includes(request.method)
    ) {
      reject("HOST_METHOD_UNAVAILABLE", "后台宿主服务未实现");
      return;
    }
    if (!instance.ready && request.method !== "host.initialize") {
      reject("HOST_NOT_READY", "后台运行时尚未就绪");
      return;
    }
    if (
      request.method === "host.initialize" &&
      instance.initializationStarted
    ) {
      reject("HOST_ALREADY_INITIALIZED", "后台宿主服务已初始化");
      return;
    }
    if (this.hostOperations.size >= 32) {
      reject("HOST_BUSY", "后台宿主请求较多，请稍后重试");
      return;
    }
    if (request.method === "host.initialize")
      instance.initializationStarted = true;
    const operation = (async () => {
      try {
        const result = await this.host.services!(request);
        if (request.method === "host.initialize") instance.initialized = true;
        reply({ type: "host-response", id: request.id, ok: true, result });
      } catch {
        // Owner errors can contain credential-bearing data or paths. Keep them off the wire.
        reject("HOST_SERVICE_FAILED", "后台宿主服务调用失败");
      }
    })();
    this.hostOperations.add(operation);
    void operation.finally(() => this.hostOperations.delete(operation));
  }
  private rejectInstance(instance: Instance, error: Error) {
    instance.ready = false;
    clearTimeout(instance.bootTimer);
    clearInterval(instance.monitor);
    instance.rejectReady(error);
    for (const [id, pending] of this.pending) {
      if (pending.instance !== instance) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(error);
    }
  }
  private stop(instance: Instance, graceful = false): Promise<void> {
    if (instance.stopping) return instance.stopping;
    const requestShutdown = graceful && instance.ready;
    instance.stopping = (async () => {
      this.rejectInstance(
        instance,
        failure("RUNTIME_STOPPED", "后台运行时已停止")
      );
      if (instance.exited) return;
      const wait = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            instance.exit.then(() => true),
            new Promise<false>((resolve) => {
              timer = setTimeout(
                () => resolve(false),
                this.host.shutdownTimeoutMs ?? 2_000
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      if (requestShutdown) {
        try {
          instance.worker.postMessage({ type: "shutdown" });
          if (await wait()) return;
        } catch {
          /* Fall through to process termination. */
        }
      }
      instance.worker.kill();
      if (await wait()) return;
      if (instance.worker.pid)
        await (this.host.terminateTree ?? terminateProcessTree)(
          instance.worker.pid
        );
      if (!(await wait()))
        throw failure("RUNTIME_SHUTDOWN_TIMEOUT", "后台运行时进程清理超时");
    })();
    return instance.stopping;
  }
  private async ensure(): Promise<Instance> {
    if (this.closing) throw failure("RUNTIME_STOPPED", "应用正在退出");
    if (
      this.instance?.ready &&
      performance.now() - this.instance.lastHeartbeat >
        (this.host.heartbeatTimeoutMs ?? 20_000)
    )
      await this.stop(this.instance);
    if (this.instance?.stopping) await this.instance.stopping;
    if (this.closing) throw failure("RUNTIME_STOPPED", "应用正在退出");
    const instance = this.instance ?? this.create();
    await instance.connected;
    if (!instance.ready || instance.stopping || instance.exited)
      throw failure("RUNTIME_EXITED", "后台运行时已退出，请重试");
    return instance;
  }
  async start(): Promise<BackgroundJsRuntimeStatus> {
    await this.ensure();
    return this.getStatus();
  }
  async call(
    owner: number,
    method: unknown,
    payload: unknown,
    timeoutMs: unknown = 30_000
  ): Promise<unknown> {
    if (
      typeof method !== "string" ||
      !method.length ||
      method.length > 200 ||
      typeof timeoutMs !== "number" ||
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 120_000
    )
      throw failure("INVALID_ARGUMENT", "后台运行时请求参数无效");
    if (!["runtime.ping", "runtime.getInfo"].includes(method))
      throw failure("METHOD_NOT_IMPLEMENTED", "后台运行时方法未实现");
    const token = this.owners.get(owner) ?? {};
    this.owners.set(owner, token);
    const instance = await this.ensure();
    if (this.owners.get(owner) !== token)
      throw failure("DOCUMENT_CLOSED", "请求页面已关闭");
    if (this.pending.size >= 64)
      throw failure("RUNTIME_BUSY", "后台运行时请求较多，请稍后重试");
    const id = `${instance.generation}:${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          failure("RUNTIME_CALL_TIMEOUT", `后台运行时请求超时: ${method}`)
        );
      }, timeoutMs);
      this.pending.set(id, { instance, owner, resolve, reject, timer });
      try {
        instance.worker.postMessage({
          type: "request",
          request: { id, method, payload },
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  disposeOwner(owner: number) {
    this.owners.delete(owner);
    for (const [id, pending] of this.pending) {
      if (pending.owner !== owner) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(failure("DOCUMENT_CLOSED", "请求页面已关闭"));
    }
  }
  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.closing = true;
    this.owners.clear();
    this.shutdownPromise = Promise.allSettled([
      this.instance ? this.stop(this.instance, true) : Promise.resolve(),
      Promise.allSettled([...this.hostOperations]),
    ]).then(([stopped]) => {
      if (stopped.status === "rejected") throw stopped.reason;
    });
    return this.shutdownPromise;
  }
}
