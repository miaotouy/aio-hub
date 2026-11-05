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
import type { ElectronBridge, HostEvent } from "../../../electron/shared";
import { listen, emitTo } from "./events";
afterEach(() => {
  delete (window as Window & { aiohub?: unknown }).aiohub;
});
describe("Electron event compatibility", () => {
  it("preserves subscription targeting, event envelopes and idempotent teardown", async () => {
    const callbacks = new Set<(value: HostEvent) => void>();
    const request = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const host = {
      platform: "electron",
      request,
      subscribe: (_event: string, callback: (value: HostEvent) => void) => {
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      },
    } as unknown as ElectronBridge;
    Object.assign(window, { aiohub: host });
    const first = vi.fn(),
      second = vi.fn();
    const stopFirst = await listen("progress", first, {
      target: { kind: "Window", label: "main" },
    });
    const firstId = request.mock.calls[0][1].id;
    const stopSecond = await listen("progress", second, {
      target: { kind: "Window", label: "child" },
    });
    const envelope = {
      event: "progress",
      id: firstId,
      payload: { done: 3 },
      windowLabel: "main",
    };
    for (const callback of callbacks) callback(envelope);
    expect(first).toHaveBeenCalledWith(envelope);
    expect(second).not.toHaveBeenCalled();
    await emitTo("child", "progress", { done: 4 });
    expect(request).toHaveBeenCalledWith("events.emit", {
      target: "child",
      event: "progress",
      payload: { done: 4 },
    });
    stopFirst();
    stopFirst();
    expect(
      request.mock.calls.filter(
        ([operation]) => operation === "events.unlisten"
      )
    ).toHaveLength(1);
    stopSecond();
    expect(callbacks.size).toBe(0);
  });
});
