// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundRuntime } from "./background-runtime";
import { BackgroundHostClient } from "./background-host-client";
import { createBackgroundHostServices } from "./background-host-services";
import {
  BACKGROUND_RUNTIME_VERSION,
  type BackgroundHostMessage,
} from "./background-runtime-protocol";
import type {
  HostServiceHandler,
  HostServiceRequest,
} from "./background-host-protocol";
import { LlmConfiguration } from "./llm-configuration";
import { LlmKeyState } from "./llm-key-state";
import type { LlmProfile } from "../src/types/llm-profiles";

const environment = {
  root: "fixture-data",
  runtimeRoot: "fixture-app",
};
const profile: LlmProfile = {
  id: "fixture",
  name: "Fixture",
  enabled: true,
  type: "openai-compatible",
  baseUrl: "http://127.0.0.1:9",
  apiKeys: ["fixture-alpha", "fixture-beta"],
  models: [],
};
class Worker extends EventEmitter {
  pid = 1234;
  client = new BackgroundHostClient((message) => this.emit("message", message));
  replies: BackgroundHostMessage[] = [];
  postMessage(message: BackgroundHostMessage) {
    this.replies.push(message);
    if (message.type === "host-response") this.client.receive(message);
    if (message.type === "shutdown") this.kill();
  }
  kill() {
    this.emit("exit", 0);
    this.client.close();
    return true;
  }
  ready() {
    this.emit("message", {
      type: "ready",
      runtimeVersion: BACKGROUND_RUNTIME_VERSION,
    });
  }
}
const runtimes: BackgroundRuntime[] = [];
const owners: Array<{ shutdown(): Promise<void> }> = [];
const roots: string[] = [];
const releaseGates: Array<() => void> = [];
const clients: BackgroundHostClient[] = [];
afterEach(async () => {
  for (const release of releaseGates.splice(0)) release();
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.shutdown()));
  for (const owner of owners.splice(0)) await owner.shutdown();
  for (const client of clients.splice(0)) client.close();
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
  vi.useRealTimers();
});
function setup(services: HostServiceHandler) {
  const workers: Worker[] = [];
  const runtime = new BackgroundRuntime({
    services,
    spawnWorker: () => {
      const worker = new Worker();
      workers.push(worker);
      return worker;
    },
  });
  runtimes.push(runtime);
  async function start() {
    const pending = runtime.start();
    const worker = workers.at(-1)!;
    expect(await worker.client.call("host.initialize", undefined)).toEqual(
      environment
    );
    worker.ready();
    await pending;
    return worker;
  }
  return { runtime, workers, start };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  releaseGates.push(resolve);
  return { promise, resolve };
}

describe("Main-owned services for the background utility process", () => {
  it("shares real configuration and key rotation with window calls, without exposing UI mutations", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "aiohub-worker-owner-")
    );
    roots.push(root);
    const configuration = new LlmConfiguration(root),
      keys = new LlmKeyState(root);
    owners.push(keys, configuration);
    const initial = await configuration.load();
    await configuration.save([profile], initial.revision);
    const services = createBackgroundHostServices({
      environment,
      configuration,
      keys,
    });
    const { runtime, start } = setup(services);
    const worker = await start();
    expect(
      (await worker.client.call("llm.configuration.load", undefined))
        .profiles[0]?.apiKeys
    ).toEqual(profile.apiKeys);
    expect(await worker.client.keys.pickKey(profile)).toBe("fixture-alpha");
    expect((await keys.run({ method: "pick", profile })).key).toBe(
      "fixture-beta"
    );
    await keys.run({
      method: "autoDisable",
      profileId: profile.id,
      enabled: true,
    });
    await worker.client.keys.reportFailure(
      profile.id,
      "fixture-alpha",
      new Error("bad fixture-alpha"),
      { forceBroken: true }
    );
    const state = await keys.run({ method: "load" });
    expect(JSON.stringify(state)).not.toContain("bad fixture-alpha");
    expect(await worker.client.keys.pickKey(profile)).toBe("fixture-beta");
    const reply = await worker.client.call("llm.keys.execute", {
      method: "success",
      profileId: profile.id,
      key: "fixture-beta",
    });
    expect(reply).toEqual({ key: undefined, unavailable: undefined });
    await expect(
      worker.client.call("llm.keys.execute", {
        method: "reset",
        profileId: profile.id,
      } as never)
    ).rejects.toMatchObject({ code: "HOST_SERVICE_FAILED" });
    const before = worker.replies.length;
    for (const method of [
      "host.initialize",
      "llm.configuration.load",
      "llm.keys.execute",
      "unknown",
    ])
      await expect(
        runtime.call(10, method, {
          type: "host-request",
          params: { method: "reset" },
        })
      ).rejects.toMatchObject({ code: "METHOD_NOT_IMPLEMENTED" });
    expect(worker.replies).toHaveLength(before);
  });
  it("requires initialization before readiness and rejects pre-ready credential requests", async () => {
    const services = vi.fn(async () => environment);
    const { runtime, workers } = setup(services);
    const started = runtime.start();
    const check = expect(started).rejects.toMatchObject({
      code: "RUNTIME_HOST_NOT_INITIALIZED",
    });
    const worker = workers[0]!;
    await expect(
      worker.client.call("llm.configuration.load", undefined)
    ).rejects.toMatchObject({ code: "HOST_NOT_READY" });
    expect(services).not.toHaveBeenCalled();
    worker.ready();
    await check;
  });
  it("keeps admitted writes across worker crashes, isolates generations, and drains before owner shutdown", async () => {
    const gate = deferred();
    let calls = 0,
      committed = false;
    const { runtime, start, workers } = setup(async (request) => {
      if (request.method === "host.initialize") return environment;
      calls++;
      await gate.promise;
      committed = true;
      return { key: "fixture-alpha" };
    });
    const first = await start();
    const abandoned = first.client.call("llm.keys.execute", {
      method: "success",
      profileId: "fixture",
      key: "fixture-alpha",
    });
    const check = expect(abandoned).rejects.toMatchObject({
      code: "HOST_CLOSED",
    });
    first.kill();
    await check;
    const second = await start();
    expect(workers).toHaveLength(2);
    const before = second.replies.filter(
      (message) => message.type === "host-response"
    ).length;
    let drained = false;
    const shutdown = runtime.shutdown().then(() => {
      expect(committed).toBe(true);
      drained = true;
    });
    await tick();
    expect(drained).toBe(false);
    first.emit("message", {
      type: "host-request",
      id: 99,
      method: "llm.configuration.load",
    });
    second.emit("message", {
      type: "host-request",
      id: 99,
      method: "llm.configuration.load",
    });
    expect(calls).toBe(1);
    gate.resolve();
    await shutdown;
    expect(
      second.replies.filter((message) => message.type === "host-response")
    ).toHaveLength(before);
    expect(runtime.hasPendingOperations).toBe(false);
  });
  it("drains accepted owner work even when process termination fails", async () => {
    vi.useFakeTimers();
    const gate = deferred();
    const worker = new Worker();
    worker.kill = () => true;
    const runtime = new BackgroundRuntime({
      services: async (request) => {
        if (request.method === "host.initialize") return environment;
        await gate.promise;
        return null;
      },
      spawnWorker: () => worker,
      shutdownTimeoutMs: 10,
      terminateTree: async () => {
        throw new Error("fixture termination failed");
      },
    });
    runtimes.push(runtime);
    const starting = runtime.start();
    await worker.client.call("host.initialize", undefined);
    worker.ready();
    await starting;
    const pending = worker.client
      .call("llm.configuration.load", undefined)
      .catch(() => {});
    let finished = false;
    const stopping = runtime.shutdown().catch((error) => {
      finished = true;
      throw error;
    });
    const check = expect(stopping).rejects.toThrow(
      "fixture termination failed"
    );
    await vi.advanceTimersByTimeAsync(20);
    expect(finished).toBe(false);
    gate.resolve();
    await check;
    // The synthetic failed-kill process is released explicitly after verifying the drain.
    worker.emit("exit", 0);
    worker.client.close();
    await pending;
    runtimes.splice(runtimes.indexOf(runtime), 1);
  });
  it("bounds all accepted owner operations, rejects wire replays, and recovers after saturation", async () => {
    const gate = deferred();
    const received: HostServiceRequest[] = [];
    const { runtime, start } = setup(async (request) => {
      if (request.method === "host.initialize") return environment;
      received.push(request);
      await gate.promise;
      return null;
    });
    const worker = await start();
    const command = {
      method: "success",
      profileId: "fixture",
      key: "fixture-alpha",
    };
    for (let id = 2; id <= 33; id++)
      worker.emit("message", {
        type: "host-request",
        id,
        method: "llm.keys.execute",
        params: command,
      });
    worker.emit("message", {
      type: "host-request",
      id: 33,
      method: "llm.keys.execute",
      params: command,
    });
    worker.emit("message", {
      type: "host-request",
      id: 34,
      method: "llm.keys.execute",
      params: command,
    });
    expect(received).toHaveLength(32);
    expect(worker.replies.at(-1)).toMatchObject({
      id: 34,
      ok: false,
      error: { code: "HOST_BUSY" },
    });
    gate.resolve();
    await tick();
    worker.emit("message", {
      type: "host-request",
      id: 35,
      method: "llm.keys.execute",
      params: command,
    });
    await tick();
    expect(received).toHaveLength(33);
    expect(runtime.getStatus().ready).toBe(true);
  });
  it("sanitizes owner failures and rejects unknown internal methods without dispatch", async () => {
    const services = vi.fn(async (request: HostServiceRequest) => {
      if (request.method === "host.initialize") return environment;
      throw Object.assign(new Error("secret fixture-alpha"), {
        code: "fixture-alpha",
      });
    });
    const { start } = setup(services);
    const worker = await start();
    await expect(
      worker.client.call("llm.configuration.load", undefined)
    ).rejects.toMatchObject({
      code: "HOST_SERVICE_FAILED",
      message: "后台宿主服务调用失败",
    });
    await expect(
      worker.client.call("host.initialize", undefined)
    ).rejects.toMatchObject({ code: "HOST_ALREADY_INITIALIZED" });
    worker.emit("message", {
      type: "host-request",
      id: 4,
      method: "llm.configuration.save",
      params: { profiles: [] },
    });
    expect(worker.replies.at(-1)).toMatchObject({
      ok: false,
      error: { code: "HOST_METHOD_UNAVAILABLE" },
    });
    expect(services).toHaveBeenCalledTimes(2);
  });
});

describe("utility host client lifetime", () => {
  it("detaches aborted/time-limited waiters, ignores late replies, closes pending waits and bounds admission", async () => {
    vi.useFakeTimers();
    const sent: HostServiceRequest[] = [];
    const client = new BackgroundHostClient(
      (message) => sent.push(message),
      10
    );
    clients.push(client);
    const abort = new AbortController();
    const first = client.call(
      "llm.configuration.load",
      undefined,
      abort.signal
    );
    const firstCheck = expect(first).rejects.toThrow("fixture abort");
    abort.abort(new Error("fixture abort"));
    await firstCheck;
    client.receive({
      type: "host-response",
      id: sent[0]!.id,
      ok: true,
      result: "stale",
    });
    const timeout = client.call("llm.configuration.load", undefined);
    const timeoutCheck = expect(timeout).rejects.toMatchObject({
      code: "HOST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(10);
    await timeoutCheck;
    const waits = Array.from({ length: 32 }, () =>
      client
        .call("llm.configuration.load", undefined)
        .catch((error) => error.code)
    );
    await expect(
      client.call("llm.configuration.load", undefined)
    ).rejects.toMatchObject({ code: "HOST_BUSY" });
    client.close();
    expect(await Promise.all(waits)).toEqual(Array(32).fill("HOST_CLOSED"));
    await expect(
      client.call("host.initialize", undefined)
    ).rejects.toMatchObject({ code: "HOST_CLOSED" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves key-unavailable metadata for existing model middleware", async () => {
    let client!: BackgroundHostClient;
    client = new BackgroundHostClient((message) =>
      client.receive({
        type: "host-response",
        id: message.id,
        ok: true,
        result: {
          unavailable: {
            message: "cooldown",
            profileId: "fixture",
            reason: "all-enabled-circuit-broken",
            retryAt: 123,
          },
        },
      })
    );
    clients.push(client);
    await expect(client.keys.pickKey(profile)).rejects.toMatchObject({
      name: "ApiKeyUnavailableError",
      reason: "all-enabled-circuit-broken",
      retryAt: 123,
    });
  });
});
