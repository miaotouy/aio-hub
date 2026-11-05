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
vi.unmock("@/platform/native/core");
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(),
  isTauri: vi.fn(),
  Channel: class {},
}));
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
  vi.resetModules();
});
describe("directory search invoke completion", () => {
  it("keeps event consumers alive when the reply arrives before the final result event", async () => {
    let close!: (requestId: string) => void;
    let requestId = "";
    const received: string[] = [];
    const stop = vi.fn();
    const host = vi.fn(async (_operation: string, payload: any) => {
      requestId = payload.__aiohubChannelRequest;
      expect(payload.__eventDrain.__aiohubChannel).toBeTypeOf("string");
      return { ok: true, value: { totalMatches: 1 } };
    });
    Object.assign(window, {
      aiohub: {
        platform: "electron",
        request: host,
        subscribeChannel: (
          _token: string,
          _callback: unknown,
          onClose: (id: string) => void
        ) => {
          close = onClose;
          return stop;
        },
      },
    });
    const { invoke } = await import("./core");
    let settled = false;
    const result = invoke("dir_search", {
      request: { searchId: "fenced" },
    }).then((value) => {
      settled = true;
      expect(received).toEqual(["last batch"]);
      return value;
    });
    await vi.waitFor(() => expect(host).toHaveBeenCalled());
    await Promise.resolve();
    expect(settled).toBe(false);
    received.push("last batch");
    close(requestId);
    expect(await result).toEqual({ totalMatches: 1 });
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary command calls on the existing reply-only path", async () => {
    const host = vi.fn(async (..._args: unknown[]) => ({
        ok: true,
        value: "value",
      })),
      subscribeChannel = vi.fn();
    Object.assign(window, {
      aiohub: { platform: "electron", request: host, subscribeChannel },
    });
    const { invoke } = await import("./core");
    expect(await invoke("read_text_file_force", { path: "fixture" })).toBe(
      "value"
    );
    expect(subscribeChannel).not.toHaveBeenCalled();
    expect(host.mock.calls[0]?.[1]).not.toHaveProperty("__eventDrain");
  });
});
