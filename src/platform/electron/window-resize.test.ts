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
import { request } from "./client";
import {
  ensureResizeInputTracking,
  startWindowResizeDragging,
} from "./window-resize";

const host = vi.hoisted(() => ({ metadata: { label: "main" } }));
vi.mock("./client", () => ({
  getElectronBridge: () => host,
  request: vi.fn(),
}));
let handle: HTMLElement;
let held = false;
function pointer(
  type: string,
  x = 500,
  y = 300,
  buttons = type === "pointerup" ? 0 : 1
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons,
    screenX: x,
    screenY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
  });
  return event;
}
const tick = () => vi.advanceTimersByTimeAsync(0);
const calls = (method: string) =>
  vi
    .mocked(request)
    .mock.calls.filter(([, args]) => args?.method === method)
    .map(([, args]) => args?.value);
const lastCall = (method: string) => {
  const values = calls(method);
  return values[values.length - 1];
};
const start = () =>
  startWindowResizeDragging("main", "SouthEast", Promise.resolve());

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id)
  );
  ensureResizeInputTracking();
  handle = document.createElement("div");
  document.body.append(handle);
  held = false;
  handle.setPointerCapture = vi.fn(() => {
    held = true;
  });
  handle.hasPointerCapture = vi.fn(() => held);
  handle.releasePointerCapture = vi.fn(() => {
    held = false;
  });
  document.documentElement.style.cursor = "help";
  document.documentElement.style.userSelect = "text";
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async (_operation, args) =>
      args?.method === "startResizeDragging" ? "drag-session" : undefined
    );
});
afterEach(() => {
  document.dispatchEvent(pointer("pointerup"));
  handle.remove();
  document.documentElement.style.cursor = "";
  document.documentElement.style.userSelect = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Electron 指针缩放", () => {
  it("captures a held pointer, forwards its final screen position and restores interaction state", async () => {
    handle.dispatchEvent(pointer("pointerdown"));
    let complete = false;
    const task = start().then(() => {
      complete = true;
    });
    await tick();
    expect(held).toBe(true);
    expect(complete).toBe(false);
    expect(calls("startResizeDragging")).toEqual([
      { direction: "SouthEast", point: { x: 500, y: 300 } },
    ]);
    document.dispatchEvent(pointer("pointermove", 550, 330));
    document.dispatchEvent(pointer("pointermove", 580, 340));
    await tick();
    expect(lastCall("updateResizeDragging")).toEqual({
      id: "drag-session",
      point: { x: 580, y: 340 },
    });
    document.dispatchEvent(pointer("pointerup", 590, 350));
    await task;
    expect(calls("endResizeDragging")).toEqual([
      { id: "drag-session", point: { x: 590, y: 350 }, cancelled: false },
    ]);
    expect(held).toBe(false);
    expect(document.documentElement.style.cursor).toBe("help");
    expect(document.documentElement.style.userSelect).toBe("text");
    const count = vi.mocked(request).mock.calls.length;
    document.dispatchEvent(pointer("pointermove", 600, 400));
    await vi.advanceTimersByTimeAsync(3000);
    expect(vi.mocked(request).mock.calls.length).toBe(count);
  });

  it("finalizes a gesture released before the asynchronous host start returns", async () => {
    let ready!: (value: string) => void;
    vi.mocked(request).mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          ready = resolve;
        })
    );
    handle.dispatchEvent(pointer("pointerdown"));
    const task = start();
    await tick();
    document.dispatchEvent(pointer("pointerup", 530, 315));
    ready("late-session");
    await task;
    expect(calls("endResizeDragging")).toEqual([
      { id: "late-session", point: { x: 530, y: 315 }, cancelled: false },
    ]);
    expect(held).toBe(false);
    expect(document.documentElement.style.userSelect).toBe("text");
  });

  it.each(["startResizeDragging", "updateResizeDragging"])(
    "cleans up %s failures and permits the next gesture",
    async (method) => {
      let fail = true;
      vi.mocked(request).mockImplementation(async (_operation, args) => {
        if (args?.method === method && fail) {
          fail = false;
          throw new Error("host rejected gesture");
        }
        return args?.method === "startResizeDragging"
          ? "retry-session"
          : undefined;
      });
      handle.dispatchEvent(pointer("pointerdown"));
      const rejected = expect(start()).rejects.toThrow("host rejected gesture");
      await tick();
      await rejected;
      expect(held).toBe(false);
      expect(document.documentElement.style.cursor).toBe("help");
      if (method === "updateResizeDragging")
        expect(calls("endResizeDragging").length).toBe(1);
      handle.dispatchEvent(pointer("pointerdown"));
      const retry = start();
      await tick();
      document.dispatchEvent(pointer("pointerup"));
      await retry;
      expect(held).toBe(false);
    }
  );

  it("ends on cancellation, focus loss, lost capture or page exit with no lingering gesture", async () => {
    const endings = [
      {
        event: () =>
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        target: () => document,
        cancelled: true,
      },
      {
        event: () => pointer("pointercancel"),
        target: () => document,
        cancelled: true,
      },
      {
        event: () => new Event("blur"),
        target: () => window,
        cancelled: false,
      },
      {
        event: () => pointer("lostpointercapture"),
        target: () => handle,
        cancelled: false,
      },
      {
        event: () => new Event("pagehide"),
        target: () => window,
        cancelled: false,
      },
    ];
    for (const ending of endings) {
      handle.dispatchEvent(pointer("pointerdown"));
      const task = start();
      await tick();
      ending.target().dispatchEvent(ending.event());
      await task;
      expect(lastCall("endResizeDragging")).toMatchObject({
        cancelled: ending.cancelled,
      });
      expect(held).toBe(false);
    }
    document.dispatchEvent(pointer("pointerup"));
    await expect(start()).rejects.toThrow();
  });
});
