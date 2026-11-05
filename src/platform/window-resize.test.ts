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
import { startWindowResize } from "./modules/window";
const host = vi.hoisted(() => ({
  electron: false,
  resizable: false,
  start: vi.fn(),
  set: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./core/env", () => ({
  isNativeRuntime: () => true,
  isElectronRuntime: () => host.electron,
}));
vi.mock("./core/bridge", () => ({ invoke: vi.fn() }));
vi.mock("./native/window", () => ({
  getCurrentWindow: () => ({
    label: "main",
    isResizable: host.read,
    setResizable: host.set,
    startResizeDragging: host.start,
  }),
}));
beforeEach(() => {
  host.electron = false;
  host.resizable = false;
  host.read.mockReset().mockImplementation(async () => host.resizable);
  host.set.mockReset().mockImplementation(async (value: boolean) => {
    host.resizable = value;
  });
  host.start.mockReset().mockImplementation(async () => {
    expect(host.resizable).toBe(true);
  });
});

describe("共享窗口缩放门面", () => {
  it.each([false, true])(
    "preserves an initial resizable=%s mode on completion and failure",
    async (original) => {
      host.resizable = original;
      await startWindowResize("East");
      expect(host.resizable).toBe(original);
      host.start.mockRejectedValueOnce(new Error("native drag failed"));
      await expect(startWindowResize("West")).rejects.toThrow(
        "native drag failed"
      );
      expect(host.resizable).toBe(original);
      await startWindowResize("SouthEast");
      expect(host.resizable).toBe(original);
    }
  );

  it("restores a partially enabled setting and coalesces overlapping requests", async () => {
    host.set.mockImplementationOnce(async (value) => {
      host.resizable = value;
      throw new Error("enable failed");
    });
    await expect(startWindowResize("North")).rejects.toThrow("enable failed");
    expect(host.resizable).toBe(false);
    let release!: () => void;
    host.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const first = startWindowResize("South"),
      second = startWindowResize("South");
    await Promise.resolve();
    await Promise.resolve();
    expect(host.start).toHaveBeenCalledTimes(1);
    expect(host.resizable).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(host.resizable).toBe(false);
  });

  it("keeps Electron's temporary resize mode owned by the main-process gesture", async () => {
    host.electron = true;
    host.start.mockImplementationOnce(async () => {
      host.resizable = true;
      await Promise.resolve();
      host.resizable = false;
    });
    await startWindowResize("NorthWest");
    expect(host.resizable).toBe(false);
    expect(host.read).not.toHaveBeenCalled();
    expect(host.set).not.toHaveBeenCalled();
  });
});
