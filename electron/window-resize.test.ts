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
import { WindowResizes } from "./window-resize";
import type { WindowResizeDirection } from "./shared";

function fixture(resizable = false, owner = 10) {
  const state = {
    resizable,
    destroyed: false,
    visible: true,
    minimized: false,
    maximized: false,
    fullscreen: false,
    bounds: { x: 100, y: 80, width: 800, height: 600 },
  };
  const window = {
    webContents: { id: owner },
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isMinimized: () => state.minimized,
    isMaximized: () => state.maximized,
    isFullScreen: () => state.fullscreen,
    isResizable: () => state.resizable,
    setResizable: vi.fn((value: boolean) => {
      state.resizable = value;
    }),
    getBounds: () => ({ ...state.bounds }),
    setBounds: vi.fn((bounds: typeof state.bounds) => {
      state.bounds = { ...bounds };
    }),
    getMinimumSize: () => [300, 200] as [number, number],
    getMaximumSize: () => [1000, 750] as [number, number],
  };
  return { state, window };
}
const origin = { x: 500.25, y: -20.5 };
const begin = (
  manager: WindowResizes,
  target: ReturnType<typeof fixture>,
  direction: WindowResizeDirection = "SouthEast"
) =>
  manager.begin(target.window, target.window.webContents.id, {
    direction,
    point: origin,
  });

afterEach(() => vi.useRealTimers());
describe("窗口缩放会话", () => {
  it("resizes all eight directions with fixed opposing edges and clamped DIP bounds", () => {
    const manager = new WindowResizes();
    const cases: [WindowResizeDirection, number[]][] = [
      ["North", [100, 120, 800, 560]],
      ["NorthEast", [100, 120, 860, 560]],
      ["East", [100, 80, 860, 600]],
      ["SouthEast", [100, 80, 860, 640]],
      ["South", [100, 80, 800, 640]],
      ["SouthWest", [160, 80, 740, 640]],
      ["West", [160, 80, 740, 600]],
      ["NorthWest", [160, 120, 740, 560]],
    ];
    for (const [direction, [x, y, width, height]] of cases) {
      const target = fixture();
      const id = begin(manager, target, direction);
      expect(target.state.resizable).toBe(true);
      manager.end(target.window, 10, {
        id,
        point: { x: origin.x + 60.4, y: origin.y + 40.4 },
      });
      expect(target.state.bounds).toEqual({ x, y, width, height });
      expect(target.state.resizable).toBe(false);
    }
    const target = fixture(true);
    const id = begin(manager, target, "NorthWest");
    manager.update(target.window, 10, {
      id,
      point: { x: origin.x + 2000, y: origin.y + 2000 },
    });
    expect(target.state.bounds).toEqual({
      x: 600,
      y: 480,
      width: 300,
      height: 200,
    });
    manager.update(target.window, 10, {
      id,
      point: { x: origin.x - 2000, y: origin.y - 2000 },
    });
    expect(target.state.bounds).toEqual({
      x: -100,
      y: -70,
      width: 1000,
      height: 750,
    });
    manager.end(target.window, 10, { id });
    expect(target.state.resizable).toBe(true);
  });

  it("uses restored configured limits when a fixed window exposes its current size as constraints", () => {
    const manager = new WindowResizes(),
      target = fixture();
    target.window.getMinimumSize = () =>
      target.state.resizable
        ? [300, 200]
        : [target.state.bounds.width, target.state.bounds.height];
    target.window.getMaximumSize = () =>
      target.state.resizable
        ? [1000, 750]
        : [target.state.bounds.width, target.state.bounds.height];
    const id = begin(manager, target);
    manager.end(target.window, 10, {
      id,
      point: { x: origin.x + 80, y: origin.y + 40 },
    });
    expect(target.state.bounds).toEqual({
      x: 100,
      y: 80,
      width: 880,
      height: 640,
    });
    expect(target.state.resizable).toBe(false);
  });

  it("isolates window owners, validates starts and keeps stale releases away from a newer drag", () => {
    const manager = new WindowResizes(),
      first = fixture(),
      second = fixture(false, 20);
    expect(() =>
      manager.begin(first.window, 20, { direction: "East", point: origin })
    ).toThrow();
    expect(() =>
      manager.begin(first.window, 10, { direction: "invalid", point: origin })
    ).toThrow();
    expect(() =>
      manager.begin(first.window, 10, {
        direction: "East",
        point: { x: NaN, y: 0 },
      })
    ).toThrow();
    expect(first.state.resizable).toBe(false);
    const id = begin(manager, first),
      secondId = begin(manager, second);
    expect(() =>
      manager.update(first.window, 20, { id, point: origin })
    ).toThrow();
    expect(() =>
      manager.update(second.window, 20, { id, point: origin })
    ).toThrow();
    expect(second.state.resizable).toBe(true);
    manager.end(first.window, 10, { id });
    const newerId = begin(manager, first);
    manager.end(first.window, 10, { id });
    expect(first.state.resizable).toBe(true);
    manager.end(first.window, 10, { id: newerId });
    manager.end(second.window, 20, { id: secondId });
    expect(first.state.resizable).toBe(false);
    expect(second.state.resizable).toBe(false);
    first.state.maximized = true;
    expect(() => begin(manager, first)).toThrow();
    expect(first.state.resizable).toBe(false);
  });

  it("rolls back cancellation and restores the original mode after partial native failures", () => {
    const manager = new WindowResizes(),
      target = fixture();
    let id = begin(manager, target);
    manager.update(target.window, 10, {
      id,
      point: { x: origin.x + 50, y: origin.y + 30 },
    });
    manager.end(target.window, 10, { id, cancelled: true });
    expect(target.state.bounds).toEqual({
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    });
    expect(target.state.resizable).toBe(false);
    id = begin(manager, target);
    target.window.setBounds.mockImplementationOnce(() => {
      throw new Error("native bounds rejected");
    });
    expect(() =>
      manager.update(target.window, 10, {
        id,
        point: { x: origin.x + 100, y: origin.y },
      })
    ).toThrow("native bounds rejected");
    expect(target.state.resizable).toBe(false);
    target.window.setResizable.mockImplementationOnce((value) => {
      target.state.resizable = value;
      throw new Error("native setting rejected");
    });
    expect(() => begin(manager, target)).toThrow("native setting rejected");
    expect(target.state.resizable).toBe(false);
    id = begin(manager, target);
    manager.end(target.window, 10, { id });
    expect(target.state.resizable).toBe(false);
  });

  it("releases on lifecycle cancellation or heartbeat expiry while allowing active drags to renew", () => {
    vi.useFakeTimers();
    const manager = new WindowResizes(vi.fn(), 100),
      target = fixture();
    let id = begin(manager, target);
    vi.advanceTimersByTime(80);
    manager.update(target.window, 10, { id, point: origin });
    vi.advanceTimersByTime(80);
    expect(target.state.resizable).toBe(true);
    vi.advanceTimersByTime(21);
    expect(target.state.resizable).toBe(false);
    expect(() =>
      manager.update(target.window, 10, { id, point: origin })
    ).toThrow();
    id = begin(manager, target);
    manager.cancel(10);
    expect(target.state.resizable).toBe(false);
    manager.cancel(10);
    id = begin(manager, target);
    target.state.destroyed = true;
    manager.cancel(10);
    const replacement = fixture();
    const finalId = begin(manager, replacement);
    manager.end(replacement.window, 10, { id: finalId });
    expect(replacement.state.resizable).toBe(false);
    expect(finalId).not.toBe(id);
  });
});
