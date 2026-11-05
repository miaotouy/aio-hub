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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { WindowStateStore, restoreWindowState } from "./window-state";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aio-window-state-"));
  roots.push(root);
  return { root, store: new WindowStateStore(root) };
}
const area = { x: 0, y: 0, width: 1920, height: 1080 };
function window(
  bounds = { x: 120, y: 80, width: 1000, height: 700 },
  maximized = false
) {
  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    getNormalBounds: () => bounds,
    isMaximized: () => maximized,
  };
}
it("captures close-time normal bounds before the window is destroyed and survives a new owner", () => {
  const { root, store } = setup();
  const win = window(undefined, true);
  store.save([["main", win]]);
  win.isDestroyed = () => true;
  win.isMaximized = () => false;
  const restored = new WindowStateStore(root);
  expect(restored.get("main", [area])).toEqual({
    bounds: { x: 120, y: 80, width: 1000, height: 700 },
    maximized: true,
  });
});
it("preserves other windows across close snapshots, batches and reset", () => {
  const { store } = setup();
  store.save([
    ["main", window()],
    ["tool", window(undefined, true)],
  ]);
  store.save([["main", window({ x: 400, y: 100, width: 800, height: 600 })]]);
  expect(store.get("tool", [area])?.maximized).toBe(true);
  expect(store.get("main", [area])?.bounds.x).toBe(400);
  store.clear();
  expect(store.labels()).toEqual([]);
  store.save([["main", window()]]);
  expect(store.labels()).toEqual(["main"]);
});
it("ignores invalid or destroyed snapshots without losing the last usable geometry", () => {
  const { store } = setup();
  store.save([["main", window()]]);
  store.save([
    ["main", window({ x: NaN, y: 0, width: 1000, height: 700 })],
    ["closed", { ...window(), isDestroyed: () => true }],
  ]);
  expect(store.get("main", [area])?.bounds.x).toBe(120);
  expect(store.labels()).toEqual(["main"]);
});
it("requires a reachable title bar and accepts negative-coordinate displays", () => {
  const { store } = setup();
  store.save([["main", window({ x: -1200, y: 30, width: 1000, height: 700 })]]);
  expect(store.get("main", [area])).toBeUndefined();
  expect(store.get("main", [{ ...area, x: -1920 }])?.bounds.x).toBe(-1200);
  store.save([["main", window({ x: 100, y: -600, width: 1000, height: 700 })]]);
  expect(store.get("main", [area])).toBeUndefined();
});
it("keeps corrupt configuration intact and safely ignores malformed saved entries", () => {
  const { root, store } = setup();
  const target = path.join(root, "electron-windows.json");
  fs.writeFileSync(target, "{broken");
  expect(() => store.save([["main", window()]])).toThrow();
  expect(fs.readFileSync(target, "utf8")).toBe("{broken");
  fs.writeFileSync(
    target,
    JSON.stringify({
      main: {
        bounds: { x: 1, y: 1, width: "1000", height: 700 },
        maximized: false,
      },
    })
  );
  expect(store.get("main", [area])).toBeUndefined();
});

it("retains maximization while minimized and honors a subsequent explicit unmaximize", () => {
  const { store } = setup();
  const win = window();
  store.rememberMaximized(win, true);
  win.isMinimized = () => true;
  store.rememberMaximized(win, false);
  store.save([["main", win]]);
  expect(store.get("main", [area])?.maximized).toBe(true);
  win.isMinimized = () => false;
  store.rememberMaximized(win, false);
  store.save([["main", win]]);
  expect(store.get("main", [area])?.maximized).toBe(false);
});
it("restores captured size without accumulating Windows DIP enclosure rounding", () => {
  let bounds = { x: 120, y: 80, width: 1001, height: 701 };
  const saved = { bounds: { ...bounds }, maximized: true };
  let maximized = false;
  const win = {
    getNormalBounds: () => bounds,
    setBounds: (value: typeof bounds) => {
      bounds = { ...value, width: value.width + 1 };
    },
    maximize: () => {
      maximized = true;
    },
  };
  for (let i = 0; i < 3; i++) restoreWindowState(win, saved, true);
  expect(bounds).toEqual(saved.bounds);
  expect(maximized).toBe(true);
});
