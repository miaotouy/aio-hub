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

import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { ElectronChannel } from "./channel";
import { cloneHostValue, request } from "./client";
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
});
describe("Electron renderer IPC contract", () => {
  it("transfers reactive state while preserving binary bytes", async () => {
    const state = reactive({
      theme: { name: "深色" },
      bytes: new Uint8Array([0, 128, 255]),
    });
    const host = vi.fn().mockResolvedValue({ ok: true, value: "saved" });
    Object.assign(window, { aiohub: { platform: "electron", request: host } });
    await expect(request("command", { state })).resolves.toBe("saved");
    const sent = host.mock.calls[0][1];
    const cloned = structuredClone(sent);
    expect(cloned.state.theme).toEqual({ name: "深色" });
    expect(Array.from(cloned.state.bytes)).toEqual([0, 128, 255]);
    const repeated = { value: 1 };
    expect(cloneHostValue([repeated, repeated])).toEqual([
      { value: 1 },
      { value: 1 },
    ]);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => cloneHostValue(cyclic)).toThrow("循环引用");
  });
  it("preserves actionable host error codes across context isolation", async () => {
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        request: async () => ({
          ok: false,
          error: { code: "ENOENT", message: "文件已移动" },
        }),
      },
    });
    await expect(request("fs")).rejects.toMatchObject({
      code: "ENOENT",
      message: "文件已移动",
    });
  });
});

// Protect callback transport, subscription lifetime, and the isolation between simultaneous commands.
describe("Electron command channels", () => {
  it("subscribes before invoke and serializes proxy-wrapped channels without exposing callbacks", async () => {
    const received: unknown[] = [],
      listeners = new Map<string, (payload: unknown) => void>();
    const channel = new ElectronChannel((payload) => received.push(payload));
    const stop = vi.fn();
    let close!: (requestId: string) => void;
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        subscribeChannel: (
          token: string,
          callback: (payload: unknown) => void,
          onClose: (requestId: string) => void
        ) => {
          close = onClose;
          listeners.set(token, callback);
          return stop;
        },
        request: async (
          _operation: string,
          payload: {
            args: {
              onEvent: { __aiohubChannel: string };
              again: { __aiohubChannel: string };
            };
            __aiohubChannelRequest: string;
          }
        ) => {
          const cloned = structuredClone(payload);
          const token = cloned.args.onEvent.__aiohubChannel;
          expect(cloned.args.again).toEqual(cloned.args.onEvent);
          listeners.get(token)!({ type: "progress" });
          channel.onmessage = (value) => received.push({ updated: value });
          listeners.get(token)!({ type: "done" });
          close(payload.__aiohubChannelRequest);
          return { ok: true, value: 7 };
        },
      },
    });
    await expect(
      request(
        "command",
        reactive({ args: { onEvent: channel, again: channel } })
      )
    ).resolves.toBe(7);
    expect(received).toEqual([
      { type: "progress" },
      { updated: { type: "done" } },
    ]);
    expect(listeners.size).toBe(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("isolates concurrent channels and keeps a reused channel subscribed until every invocation settles", async () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const finish: (() => void)[] = [],
      closeCommand: (() => void)[] = [];
    const closeListeners = new Map<string, (id: string) => void>();
    const messagesA: unknown[] = [],
      messagesB: unknown[] = [];
    const a = new ElectronChannel((value) => messagesA.push(value)),
      b = new ElectronChannel((value) => messagesB.push(value));
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        subscribeChannel: (
          token: string,
          callback: (payload: unknown) => void,
          onClose: (id: string) => void
        ) => {
          closeListeners.set(token, onClose);
          expect(listeners.has(token)).toBe(false);
          listeners.set(token, callback);
          return () => listeners.delete(token);
        },
        request: (
          _operation: string,
          payload: {
            onEvent: { __aiohubChannel: string };
            __aiohubChannelRequest: string;
          }
        ) => {
          closeCommand.push(() =>
            closeListeners.get(payload.onEvent.__aiohubChannel)!(
              payload.__aiohubChannelRequest
            )
          );
          return new Promise((resolve) =>
            finish.push(() => resolve({ ok: true, value: undefined }))
          );
        },
      },
    });
    const one = request("command", { onEvent: a }),
      two = request("command", { onEvent: b }),
      reused = request("command", { onEvent: a });
    const [aToken, bToken] = [...listeners.keys()];
    listeners.get(aToken)!("A");
    listeners.get(bToken)!("B");
    expect(messagesA).toEqual(["A"]);
    expect(messagesB).toEqual(["B"]);
    let completed = false;
    void one.then(() => {
      completed = true;
    });
    finish[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);
    // A trailing event arriving after the invoke reply must still be delivered.
    listeners.get(aToken)!("trailing");
    expect(messagesA).toEqual(["A", "trailing"]);
    closeCommand[0]();
    await one;
    expect(listeners.has(aToken)).toBe(true);
    closeCommand[2]();
    finish[2]();
    await reused;
    expect(listeners.has(aToken)).toBe(false);
    expect(listeners.has(bToken)).toBe(true);
    finish[1]();
    closeCommand[1]();
    await two;
    expect(listeners.size).toBe(0);
  });
  it("releases channel listeners on structured host errors and thrown transport errors", async () => {
    const stop = vi.fn();
    const transport = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "ESEARCH", message: "读取失败" },
      })
      .mockRejectedValueOnce(new Error("宿主断开"));
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        subscribeChannel: () => stop,
        request: transport,
      },
    });
    const channel = new ElectronChannel();
    await expect(
      request("command", { onEvent: channel })
    ).rejects.toMatchObject({ code: "ESEARCH" });
    await expect(request("command", { onEvent: channel })).rejects.toThrow(
      "宿主断开"
    );
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
