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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundRuntime } from "./background-runtime";
import { BACKGROUND_RUNTIME_VERSION } from "./background-runtime-protocol";
class Worker extends EventEmitter {
  pid = 1234;
  postMessage = vi.fn((message: any) => {
    if (message.type === "shutdown") this.emit("exit", 0);
  });
  kill = vi.fn(() => {
    this.emit("exit", 0);
    return true;
  });
  ready() {
    this.emit("message", {
      type: "ready",
      runtimeVersion: BACKGROUND_RUNTIME_VERSION,
    });
  }
  reply(index = 0, result: unknown = { pong: true }) {
    const { request } = this.postMessage.mock.calls[index]![0];
    this.emit("message", {
      type: "response",
      response: { id: request.id, ok: true, result },
    });
  }
}
let workers: Worker[];
let runtime: BackgroundRuntime;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  workers = [];
  runtime = new BackgroundRuntime({
    spawnWorker: () => {
      const worker = new Worker();
      workers.push(worker);
      return worker;
    },
    readyTimeoutMs: 100,
    heartbeatTimeoutMs: 100,
    shutdownTimeoutMs: 10,
  });
});
afterEach(async () => {
  await runtime.shutdown();
  vi.useRealTimers();
});
async function start() {
  const connected = runtime.start();
  workers.at(-1)!.ready();
  return connected;
}
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("application-owned background runtime", () => {
  it("shares startup and preserves the worker across document detach/reconnect", async () => {
    const first = runtime.start(),
      second = runtime.start();
    expect(workers).toHaveLength(1);
    workers[0]!.ready();
    expect(await first).toMatchObject({ ready: true, generation: 1 });
    await second;
    const abandoned = runtime.call(10, "runtime.ping", null);
    const abandonedCheck = expect(abandoned).rejects.toMatchObject({
      code: "DOCUMENT_CLOSED",
    });
    const other = runtime.call(20, "runtime.ping", null);
    await flush();
    runtime.disposeOwner(10);
    await abandonedCheck;
    expect(workers[0]!.kill).not.toHaveBeenCalled();
    workers[0]!.reply(0, "stale reply");
    workers[0]!.reply(1, "other window");
    expect(await other).toBe("other window");
    const reconnect = runtime.call(10, "runtime.getInfo", null);
    await flush();
    workers[0]!.reply(2, "same runtime");
    expect(await reconnect).toBe("same runtime");
    expect(workers).toHaveLength(1);
  });
  it("rejects a document detached while waiting for worker startup", async () => {
    const call = runtime.call(10, "runtime.ping", null);
    const check = expect(call).rejects.toMatchObject({
      code: "DOCUMENT_CLOSED",
    });
    runtime.disposeOwner(10);
    workers[0]!.ready();
    await check;
    expect(workers[0]!.postMessage).not.toHaveBeenCalled();
    expect(runtime.getStatus().ready).toBe(true);
  });
  it("fails outstanding calls on exit and reconnects with a fresh generation", async () => {
    await start();
    const call = runtime.call(10, "runtime.ping", null);
    const check = expect(call).rejects.toMatchObject({
      code: "RUNTIME_EXITED",
    });
    await flush();
    workers[0]!.emit("exit", 1);
    await check;
    expect(runtime.getStatus().ready).toBe(false);
    expect(await start()).toMatchObject({ ready: true, generation: 2 });
  });
  it("times out startup and lost heartbeats, then recovers on demand", async () => {
    const first = runtime.start();
    const check = expect(first).rejects.toMatchObject({
      code: "RUNTIME_READY_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(workers[0]!.kill).toHaveBeenCalledTimes(1);
    await start();
    await vi.advanceTimersByTimeAsync(80);
    workers[1]!.emit("message", { type: "heartbeat" });
    await vi.advanceTimersByTimeAsync(80);
    expect(runtime.getStatus().ready).toBe(true);
    await vi.advanceTimersByTimeAsync(140);
    expect(runtime.getStatus().ready).toBe(false);
    expect(workers[1]!.kill).toHaveBeenCalledTimes(1);
    expect(await start()).toMatchObject({ ready: true, generation: 3 });
  });
  it("replaces a stale heartbeat before returning from start, even between watchdog ticks", async () => {
    await start();
    await vi.advanceTimersByTimeAsync(101);
    expect(runtime.getStatus().ready).toBe(false);
    const reconnect = runtime.start();
    await flush();
    expect(workers[0]!.kill).toHaveBeenCalledOnce();
    workers[1]!.ready();
    expect(await reconnect).toMatchObject({ ready: true, generation: 2 });
  });
  it("bounds calls and preserves worker error codes without poisoning later requests", async () => {
    await start();
    await expect(
      runtime.call(10, "runtime.ping", null, Infinity)
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    const timed = runtime.call(10, "runtime.ping", null, 10);
    const timedCheck = expect(timed).rejects.toMatchObject({
      code: "RUNTIME_CALL_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(10);
    await timedCheck;
    const unsupported = runtime.call(10, "runtime.getInfo", null);
    const unsupportedCheck = expect(unsupported).rejects.toMatchObject({
      code: "METHOD_NOT_IMPLEMENTED",
    });
    await flush();
    const { request } = workers[0]!.postMessage.mock.calls[1]![0];
    workers[0]!.emit("message", {
      type: "response",
      response: {
        id: request.id,
        ok: false,
        error: { code: "METHOD_NOT_IMPLEMENTED", message: "unknown method" },
      },
    });
    await unsupportedCheck;
    expect(runtime.getStatus().ready).toBe(true);
    const calls = Array.from({ length: 64 }, () =>
      runtime.call(10, "runtime.ping", null).catch((e) => e.code)
    );
    await flush();
    await expect(runtime.call(20, "runtime.ping", null)).rejects.toMatchObject({
      code: "RUNTIME_BUSY",
    });
    runtime.disposeOwner(10);
    expect(await Promise.all(calls)).toEqual(Array(64).fill("DOCUMENT_CLOSED"));
  });
  it("shuts down once during startup and prevents resurrection", async () => {
    const start = runtime.start();
    const check = expect(start).rejects.toMatchObject({
      code: "RUNTIME_STOPPED",
    });
    await Promise.all([runtime.shutdown(), runtime.shutdown()]);
    await check;
    workers[0]!.ready();
    expect(workers[0]!.kill).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus()).toMatchObject({
      available: false,
      ready: false,
    });
    await expect(runtime.start()).rejects.toMatchObject({
      code: "RUNTIME_STOPPED",
    });
  });
  it("requests graceful resource shutdown for a ready worker before using process termination", async () => {
    await start();
    const worker = workers[0]!;
    const pending = runtime.call(10, "runtime.ping", null);
    const check = expect(pending).rejects.toMatchObject({
      code: "RUNTIME_STOPPED",
    });
    await flush();
    await runtime.shutdown();
    await check;
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: "shutdown" });
    expect(worker.kill).not.toHaveBeenCalled();
    expect(runtime.hasPendingOperations).toBe(false);
  });
  it("escalates a stuck worker's shutdown to its process tree", async () => {
    await runtime.shutdown();
    const worker = new Worker();
    worker.postMessage.mockImplementation(() => {});
    worker.kill.mockImplementation(() => true);
    const terminateTree = vi.fn(async () => {
      worker.emit("exit", 0);
    });
    runtime = new BackgroundRuntime({
      spawnWorker: () => worker,
      terminateTree,
      shutdownTimeoutMs: 10,
    });
    const connected = runtime.start();
    worker.ready();
    await connected;
    const stopping = runtime.shutdown();
    await vi.advanceTimersByTimeAsync(20);
    await stopping;
    expect(terminateTree).toHaveBeenCalledWith(worker.pid);
    expect(runtime.hasPendingOperations).toBe(false);
  });
});
