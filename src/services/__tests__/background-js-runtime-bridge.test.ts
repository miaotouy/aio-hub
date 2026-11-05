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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@/platform/native/core";
import { getBackgroundRuntimeHost } from "@/platform/modules/background-runtime";
import { listen } from "@/platform/native/events";
import {
  BACKGROUND_JS_RUNTIME_EVENTS as events,
  BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
  type BackgroundJsRuntimeRequest,
} from "@/background-runtime/protocol";
import { BackgroundJsRuntimeBridge } from "../background-js-runtime-bridge";

const bus = vi.hoisted(() => ({
  runtime: "tauri",
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  release: vi.fn(),
  emitTo: vi.fn(),
}));
vi.mock("@/platform/core/env", () => ({
  get currentPlatformRuntime() {
    return bus.runtime;
  },
}));
vi.mock("@/platform/modules/background-runtime", () => ({
  getBackgroundRuntimeHost: vi.fn(() => null),
}));
vi.mock("@/platform/native/events", () => ({
  listen: vi.fn(
    async (event: string, callback: (event: { payload: unknown }) => void) => {
      bus.handlers.set(event, callback);
      return () => {
        bus.release(event);
        bus.handlers.delete(event);
      };
    }
  ),
}));
vi.mock("@/platform/native/window", () => ({
  getCurrentWindow: () => ({ emitTo: bus.emitTo }),
}));
let bridge: BackgroundJsRuntimeBridge;
beforeEach(() => {
  bus.runtime = "tauri";
  vi.mocked(getBackgroundRuntimeHost).mockReturnValue(null);
  bus.handlers.clear();
  vi.clearAllMocks();
  vi.mocked(invoke)
    .mockReset()
    .mockResolvedValue({ available: true, ready: true, generation: 1 });
  bus.emitTo.mockImplementation(
    async (
      _label: string,
      _event: string,
      request: BackgroundJsRuntimeRequest
    ) => {
      bus.handlers.get(events.response)?.({
        payload: { id: request.id, ok: true, result: { pong: true } },
      });
    }
  );
  bridge = new BackgroundJsRuntimeBridge();
});
afterEach(async () => {
  await bridge.stop();
  vi.useRealTimers();
});

describe("后台 JavaScript 运行时连接", () => {
  it("fails explicit unsupported-host calls before subscribing or dispatching", async () => {
    bus.runtime = "browser";
    await expect(bridge.start()).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
      capability: "backgroundJsRuntime",
      reasonCode: "desktop-required",
    });
    await expect(bridge.call("runtime.ping", null)).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    expect(listen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(bus.emitTo).not.toHaveBeenCalled();
  });

  it("coalesces startup and delivers responses across stop/reconnect", async () => {
    await Promise.all([bridge.start(), bridge.start()]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("background_runtime_get_status");
    expect(listen).toHaveBeenCalledTimes(2);
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(bus.emitTo).toHaveBeenCalledWith(
      BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
      events.request,
      expect.objectContaining({ method: "runtime.ping", payload: null })
    );
    await bridge.stop();
    expect(bus.release).toHaveBeenCalledTimes(2);
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("releases partial subscriptions when startup fails, then permits retry", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("status unavailable"));
    await expect(bridge.start()).rejects.toThrow("status unavailable");
    expect(bus.handlers.size).toBe(0);
    expect(bus.release).toHaveBeenCalledTimes(2);
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(listen).toHaveBeenCalledTimes(4);
  });
  it("routes Electron directly through the host and reconnects after local stop", async () => {
    bus.runtime = "electron";
    const host = {
      start: vi.fn(async () => ({
        available: true,
        ready: true,
        generation: 1,
      })),
      call: vi.fn().mockResolvedValue({ pong: true }),
    };
    vi.mocked(getBackgroundRuntimeHost).mockReturnValue(host);
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(host.call).toHaveBeenCalledWith("runtime.ping", null, 30_000);
    expect(listen).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    host.call.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = bridge.call("runtime.getInfo", null);
    const checked = expect(pending).rejects.toThrow("bridge stopped");
    await vi.waitFor(() => expect(host.call).toHaveBeenCalledTimes(2));
    await bridge.stop();
    await checked;
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    finish("old result");
    expect(host.start).toHaveBeenCalledTimes(2);
  });

  it("settles synchronous dispatch failures and clears their deadline", async () => {
    vi.useFakeTimers();
    bus.emitTo.mockImplementationOnce(() => {
      throw Error("document unavailable");
    });
    await expect(bridge.call("runtime.ping", null)).rejects.toThrow(
      "document unavailable"
    );
    expect(vi.getTimerCount()).toBe(0);
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
  });

  it("releases readiness waiters on stop and permits retry after timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue({
      available: true,
      ready: false,
      generation: 0,
    });
    const waiting = bridge.call("runtime.ping", null);
    const waitingCheck = expect(waiting).rejects.toThrow("bridge stopped");
    await vi.advanceTimersByTimeAsync(0);
    await bridge.stop();
    await waitingCheck;
    expect(vi.getTimerCount()).toBe(0);
    const timed = bridge.call("runtime.ping", null);
    const timedCheck = expect(timed).rejects.toThrow("not ready");
    await vi.advanceTimersByTimeAsync(15_000);
    await timedCheck;
    bus.handlers.get(events.ready)?.({
      payload: { generation: 1, runtimeVersion: "fixture" },
    });
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("discards stale subscription completion without disturbing a newer connection", async () => {
    let finish!: (unlisten: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = bridge.start();
    const check = expect(first).rejects.toThrow("bridge stopped");
    await bridge.stop();
    await bridge.start();
    const release = vi.fn();
    finish(release);
    await check;
    expect(release).toHaveBeenCalledOnce();
    await expect(bridge.call("runtime.ping", null)).resolves.toEqual({
      pong: true,
    });
    expect(bus.handlers.size).toBe(2);
  });
});
