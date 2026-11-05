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
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SavedWindowState {
  bounds: WindowBounds;
  maximized: boolean;
}
interface StateWindow {
  isDestroyed(): boolean;
  getNormalBounds(): WindowBounds;
  isMaximized(): boolean;
  isMinimized(): boolean;
}
function validState(value: unknown): value is SavedWindowState {
  if (!value || typeof value !== "object") return false;
  const { bounds, maximized } = value as SavedWindowState;
  return (
    !!bounds &&
    typeof maximized === "boolean" &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(
      Number.isSafeInteger
    ) &&
    Math.abs(bounds.x) <= 10_000_000 &&
    Math.abs(bounds.y) <= 10_000_000 &&
    bounds.width >= 100 &&
    bounds.height >= 100 &&
    bounds.width <= 16384 &&
    bounds.height <= 16384
  );
}
/** Small synchronous snapshots also survive Windows session-end, which cannot await writes. */
export class WindowStateStore {
  private target: string;
  private maximized = new WeakMap<StateWindow, boolean>();
  constructor(root: string) {
    this.target = path.join(root, "electron-windows.json");
  }
  private read(): Record<string, unknown> {
    try {
      if (fs.statSync(this.target).size > 1024 * 1024)
        throw Error("窗口配置过大");
      const config: unknown = JSON.parse(fs.readFileSync(this.target, "utf8"));
      if (!config || typeof config !== "object" || Array.isArray(config))
        throw Error("窗口配置格式无效");
      return config as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
  labels(): string[] {
    return Object.keys(this.read());
  }
  get(label: string, workAreas: WindowBounds[]): SavedWindowState | undefined {
    const saved = this.read()[label];
    if (!validState(saved)) return;
    const b = saved.bounds;
    // Keep enough of the title bar reachable when displays or their work areas change.
    const reachable = workAreas.some(
      (area) =>
        Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x) >=
          100 &&
        b.y >= area.y &&
        b.y + 40 <= area.y + area.height
    );
    return reachable ? saved : undefined;
  }
  rememberMaximized(win: StateWindow, maximized: boolean): void {
    if (!win.isMinimized()) this.maximized.set(win, maximized);
  }
  save(windows: Iterable<readonly [string, StateWindow]>): void {
    const snapshots: [string, SavedWindowState][] = [];
    for (const [label, win] of windows) {
      if (win.isDestroyed()) continue;
      const state = {
        bounds: { ...win.getNormalBounds() },
        maximized: win.isMinimized()
          ? (this.maximized.get(win) ?? win.isMaximized())
          : win.isMaximized(),
      };
      if (validState(state)) snapshots.push([label, state]);
    }
    if (!snapshots.length) return;
    const config = this.read();
    for (const [label, state] of snapshots)
      Object.defineProperty(config, label, {
        value: state,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    const temp = this.target + "." + randomUUID() + ".tmp";
    try {
      fs.writeFileSync(temp, JSON.stringify(config), {
        encoding: "utf8",
        flag: "wx",
        flush: true,
      });
      fs.renameSync(temp, this.target);
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  clear(): void {
    fs.rmSync(this.target, { force: true });
  }
}

export function restoreWindowState(
  win: Pick<StateWindow, "getNormalBounds"> & {
    setBounds(bounds: WindowBounds): void;
    maximize(): void;
  },
  saved: SavedWindowState,
  correctRounding = false
): void {
  win.setBounds(saved.bounds);
  if (correctRounding) {
    // Windows DIP enclosure can round a previously captured size outward again.
    const actual = win.getNormalBounds(),
      target = saved.bounds;
    const corrected = {
      x: target.x - (actual.x - target.x),
      y: target.y - (actual.y - target.y),
      width: target.width - (actual.width - target.width),
      height: target.height - (actual.height - target.height),
    };
    if (
      validState({ bounds: corrected, maximized: false }) &&
      Object.keys(target).some(
        (key) =>
          actual[key as keyof WindowBounds] !==
          target[key as keyof WindowBounds]
      )
    )
      win.setBounds(corrected);
  }
  if (saved.maximized) win.maximize();
}
