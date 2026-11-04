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
});

describe("后台 JavaScript 运行时连接", () => {
  it("fails explicit unsupported-host calls before subscribing or dispatching", async () => {
    bus.runtime = "electron";
    await expect(bridge.start()).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
      capability: "backgroundJsRuntime",
      reasonCode: "host-unavailable",
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
});
