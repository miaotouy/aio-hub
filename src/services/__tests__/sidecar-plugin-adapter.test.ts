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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginManifest } from "../plugin-types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@/platform/native/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/platform/native/events", () => ({
  listen: mocks.listen,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("../plugin-config.service", () => ({
  pluginConfigService: {
    createPluginSettingsAPI: () => ({
      getAll: vi.fn().mockResolvedValue({ configured: true }),
    }),
  },
}));
vi.mock("../plugin-manager", () => ({
  pluginManager: { updateRuntimeState: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../plugin-environment.service", () => ({
  pluginEnvironmentService: { get: () => ({ platform: "test" }) },
}));
vi.mock("../plugin-loader", () => ({
  getCurrentPlatform: () => "win32-x64",
}));

import { SidecarPluginAdapter } from "../sidecar-plugin-adapter";

const manifest = {
  id: "test-sidecar",
  name: "Test Sidecar",
  version: "1.0.0",
  description: "test",
  type: "sidecar",
  methods: [{ name: "work" }, { name: "healthCheck" }],
  sidecar: {
    resident: true,
    executable: { "win32-x64": "bin/test-sidecar.exe" },
    startupMethod: "healthCheck",
    startupParams: {},
  },
} as PluginManifest;

describe("SidecarPluginAdapter resident timeout recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects a top-level host context into API v3 one-shot requests", async () => {
    let outputListener:
      ((event: { payload: Record<string, unknown> }) => void) | undefined;
    mocks.listen.mockImplementation(
      (_eventName: string, callback: typeof outputListener) => {
        outputListener = callback;
        return Promise.resolve(vi.fn());
      }
    );
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "execute_sidecar") {
        return Promise.resolve('{"type":"result","data":{"ok":true}}');
      }
      return Promise.resolve();
    });
    const oneshotManifest = {
      ...manifest,
      host: { appVersion: ">=0.0.0", apiVersion: 3 },
      sidecar: {
        executable: { "win32-x64": "bin/test-sidecar.exe" },
      },
    } as PluginManifest;
    const adapter = new SidecarPluginAdapter(
      oneshotManifest,
      "C:/plugins/test-sidecar"
    );

    await adapter.enable();
    await expect(
      adapter.callPluginMethod("work", { value: 1 })
    ).resolves.toEqual({ ok: true });

    expect(outputListener).toBeTypeOf("function");
    const executeCall = mocks.invoke.mock.calls.find(
      ([command]) => command === "execute_sidecar"
    );
    const payload = JSON.parse(executeCall?.[1].request.input);
    expect(payload).toMatchObject({
      method: "work",
      params: { value: 1 },
      settings: { configured: true },
      environment: { platform: "test" },
      hostContext: {
        pluginApiVersion: 3,
        sidecarProtocolVersion: 3,
      },
    });
  });

  it("restarts the resident process and reruns startup after a command timeout", async () => {
    const timeout = new Error("命令执行超时 (300s): test-sidecar.work");
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "sidecar_send_command") {
        const sendCount = mocks.invoke.mock.calls.filter(
          ([name]) => name === "sidecar_send_command"
        ).length;
        return sendCount === 1
          ? Promise.reject(timeout)
          : Promise.resolve('{"type":"result","data":{"ready":true}}');
      }
      return Promise.resolve();
    });

    const adapter = new SidecarPluginAdapter(
      manifest,
      "C:/plugins/test-sidecar"
    );
    adapter.enabled = true;

    await expect(adapter.callPluginMethod("work", {})).rejects.toBe(timeout);

    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      "sidecar_send_command",
      "sidecar_kill_resident",
      "sidecar_spawn_resident",
      "sidecar_send_command",
    ]);
    expect(mocks.invoke.mock.calls[3][1]).toMatchObject({
      method: "healthCheck",
      params: {
        hostContext: {
          pluginApiVersion: 3,
          sidecarProtocolVersion: 3,
        },
      },
    });
  });

  it("does not respawn a resident process after the plugin is disabled", async () => {
    const timeout = new Error("命令执行超时 (300s): test-sidecar.work");
    let releaseRecoveryKill: (() => void) | undefined;
    let killCount = 0;
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "sidecar_send_command") {
        return Promise.reject(timeout);
      }
      if (command === "sidecar_kill_resident") {
        killCount += 1;
        if (killCount === 1) {
          return new Promise<void>((resolve) => {
            releaseRecoveryKill = resolve;
          });
        }
      }
      return Promise.resolve();
    });

    const adapter = new SidecarPluginAdapter(
      manifest,
      "C:/plugins/test-sidecar"
    );
    adapter.enabled = true;

    const callError = adapter
      .callPluginMethod("work", {})
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(releaseRecoveryKill).toBeTypeOf("function"));
    await adapter.disable();
    releaseRecoveryKill?.();

    expect(await callError).toBe(timeout);
    expect(
      mocks.invoke.mock.calls.some(
        ([command]) => command === "sidecar_spawn_resident"
      )
    ).toBe(false);
  });

  it("ignores events emitted by an older resident process generation", async () => {
    let residentListener: ((event: { payload: unknown }) => void) | undefined;
    mocks.listen.mockImplementation(
      (_eventName: string, callback: (event: { payload: unknown }) => void) => {
        residentListener = callback;
        return Promise.resolve(vi.fn());
      }
    );
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "sidecar_spawn_resident") return "generation-current";
      if (command === "sidecar_send_command") {
        return '{"type":"result","data":{"ready":true}}';
      }
      return undefined;
    });
    const adapter = new SidecarPluginAdapter(
      manifest,
      "C:/plugins/test-sidecar"
    );
    await adapter.enable();
    const callback = vi.fn();
    adapter.onSidecarEvent("progress", callback);

    const emitGeneration = (generationId: string) =>
      residentListener?.({
        payload: {
          plugin_id: "test-sidecar",
          generation_id: generationId,
          event_type: "event",
          event_name: "progress",
          data: '{"type":"event","event":"progress","data":{"done":1}}',
        },
      });
    emitGeneration("generation-old");
    emitGeneration("generation-current");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ done: 1 });
  });
  it("keeps concurrent one-shot calls independent and waits for each command reply", async () => {
    let outputListener:
      ((event: { payload: Record<string, unknown> }) => void) | undefined;
    mocks.listen.mockImplementation((_name, listener) => {
      outputListener = listener;
      return Promise.resolve(vi.fn());
    });
    mocks.invoke.mockImplementation((command, args) => {
      if (command !== "execute_sidecar") return Promise.resolve();
      const input = JSON.parse(args.request.input);
      outputListener?.({
        payload: {
          plugin_id: manifest.id,
          event_type: "result",
          data: '{"type":"result","data":"unrelated event"}',
        },
      });
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve(
              JSON.stringify({ type: "result", data: input.params.value })
            ),
          input.params.delay
        )
      );
    });
    const adapter = new SidecarPluginAdapter(
      { ...manifest, sidecar: { ...manifest.sidecar!, resident: false } },
      "C:/plugins/test-sidecar"
    );
    await adapter.enable();
    await expect(
      Promise.all([
        adapter.callPluginMethod("work", { value: "first", delay: 20 }),
        adapter.callPluginMethod("work", { value: "second", delay: 0 }),
      ])
    ).resolves.toEqual(["first", "second"]);
  });
  it("rejects a one-shot backend failure even after a result event", async () => {
    let outputListener:
      ((event: { payload: Record<string, unknown> }) => void) | undefined;
    mocks.listen.mockImplementation((_name, listener) => {
      outputListener = listener;
      return Promise.resolve(vi.fn());
    });
    mocks.invoke.mockImplementation((command) => {
      if (command !== "execute_sidecar") return Promise.resolve();
      outputListener?.({
        payload: {
          plugin_id: manifest.id,
          event_type: "result",
          data: '{"type":"result","data":"early"}',
        },
      });
      return Promise.reject(new Error("Sidecar 进程已退出，退出码: 9"));
    });
    const adapter = new SidecarPluginAdapter(
      { ...manifest, sidecar: { ...manifest.sidecar!, resident: false } },
      "C:/plugins/test-sidecar"
    );
    await adapter.enable();
    await expect(adapter.callPluginMethod("work", {})).rejects.toThrow(
      "退出码: 9"
    );
  });
  it("buffers startup events until the generation is known and preserves false-valued event data", async () => {
    let listener:
      ((event: { payload: Record<string, unknown> }) => void) | undefined;
    const event = (generation: string, data: unknown) => ({
      payload: {
        plugin_id: manifest.id,
        generation_id: generation,
        event_type: "event",
        event_name: "status",
        data: JSON.stringify({ type: "event", event: "status", data }),
      },
    });
    mocks.listen.mockImplementation((_name, callback) => {
      listener = callback;
      return Promise.resolve(vi.fn());
    });
    mocks.invoke.mockImplementation((command) => {
      if (command === "sidecar_spawn_resident") {
        listener?.(event("current", false));
        listener?.(event("stale", true));
        return Promise.resolve("current");
      }
      return Promise.resolve('{"type":"result","data":{}}');
    });
    const callback = vi.fn();
    const adapter = new SidecarPluginAdapter(
      manifest,
      "C:/plugins/test-sidecar"
    );
    adapter.onSidecarEvent("status", callback);
    await adapter.enable();
    expect(callback.mock.calls).toEqual([[false]]);
  });
  it("restores a crashed resident without replaying the failed business command", async () => {
    let calls = 0;
    mocks.invoke.mockImplementation((command) => {
      if (command === "sidecar_send_command")
        return ++calls === 1
          ? Promise.reject(new Error("Sidecar 进程已退出"))
          : Promise.resolve('{"type":"result","data":{}}');
      return Promise.resolve("next-generation");
    });
    const adapter = new SidecarPluginAdapter(
      manifest,
      "C:/plugins/test-sidecar"
    );
    adapter.enabled = true;
    await expect(adapter.callPluginMethod("work", {})).rejects.toThrow(
      "已退出"
    );
    expect(
      mocks.invoke.mock.calls
        .filter(([command]) => command === "sidecar_send_command")
        .map(([, args]) => args.method)
    ).toEqual(["work", "healthCheck"]);
  });
});
