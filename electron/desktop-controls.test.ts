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
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DesktopControls, readDesktopSettings } from "./desktop-controls";

function fixture() {
  const tray = { destroy: vi.fn() };
  const state = { companions: false, ready: true, deliveries: [] as string[] };
  const actions = {
    createTray: vi.fn(() => tray),
    showMain: vi.fn(async () => {}),
    hideMain: vi.fn(),
    minimizeMain: vi.fn(),
    hasCompanions: () => state.companions,
    confirmExit: vi.fn(async () => {}),
    emitSettings: vi.fn((section: string) => {
      if (!state.ready) return false;
      state.deliveries.push(section);
      return true;
    }),
  };
  return { actions, tray, state, controls: new DesktopControls(actions) };
}
afterEach(() => vi.restoreAllMocks());
describe("桌面托盘与主窗口契约", () => {
  it("serializes toggles, removes only after showing the main window, and recovers from creation failures", async () => {
    const { controls, actions, tray } = fixture();
    actions.createTray.mockImplementationOnce(() => {
      throw Error("tray creation failed");
    });
    await expect(controls.setShowTrayIcon(true)).rejects.toThrow(
      "tray creation failed"
    );
    expect(controls.trayVisible).toBe(false);
    await Promise.all([
      controls.setShowTrayIcon(true),
      controls.setShowTrayIcon(true),
      controls.setShowTrayIcon(false),
      controls.setShowTrayIcon(true),
    ]);
    expect(controls.trayVisible).toBe(true);
    expect(actions.createTray).toHaveBeenCalledTimes(3);
    expect(tray.destroy).toHaveBeenCalledTimes(1);
    expect(actions.showMain.mock.invocationCallOrder[0]).toBeLessThan(
      tray.destroy.mock.invocationCallOrder[0]
    );
    actions.showMain.mockRejectedValueOnce(Error("show failed"));
    await expect(controls.setShowTrayIcon(false)).rejects.toThrow(
      "show failed"
    );
    expect(controls.trayVisible).toBe(true);
    controls.destroy();
    expect(controls.trayVisible).toBe(false);
  });
  it("hides only with a recovery tray and keeps companion windows anchored to a visible main window", async () => {
    const { controls, actions, state } = fixture();
    await controls.hideMain();
    expect(actions.minimizeMain).toHaveBeenCalledTimes(1);
    expect(actions.hideMain).not.toHaveBeenCalled();
    await controls.setShowTrayIcon(true);
    await controls.requestMainClose();
    expect(actions.hideMain).toHaveBeenCalledTimes(1);
    state.companions = true;
    await controls.requestMainClose();
    expect(actions.showMain).toHaveBeenCalledTimes(1);
    expect(actions.hideMain).toHaveBeenCalledTimes(1);
    await controls.updateTraySetting(false);
    await controls.requestMainClose();
    expect(actions.confirmExit).toHaveBeenCalledTimes(1);
    await controls.setShowTrayIcon(false);
    await controls.updateTraySetting(true);
    await controls.requestMainClose();
    expect(actions.confirmExit).toHaveBeenCalledTimes(2);
  });
  it("coalesces overlapping native confirmations without forcing the app to exit", async () => {
    const { controls, actions } = fixture();
    let release!: () => void;
    actions.confirmExit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const first = controls.requestMainClose(),
      second = controls.requestMainClose();
    await Promise.resolve();
    await Promise.resolve();
    expect(actions.confirmExit).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });
  it("delivers the latest settings target once after the main page subscribes and restores the main window", async () => {
    const { controls, actions, state } = fixture();
    state.ready = false;
    await controls.navigateToSettings("appearance");
    await controls.navigateToSettings("general");
    expect(state.deliveries).toEqual([]);
    state.ready = true;
    controls.deliverSettings();
    controls.deliverSettings();
    expect(state.deliveries).toEqual(["general"]);
    expect(actions.showMain).toHaveBeenCalledTimes(2);
    await expect(controls.navigateToSettings("")).rejects.toThrow();
  });
  it("loads saved startup switches and defaults missing or malformed settings without changing the file", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "aio-electron-desktop-")
    );
    try {
      expect(await readDesktopSettings(root)).toEqual({
        showTrayIcon: true,
        minimizeToTray: true,
      });
      const dir = path.join(root, "app-settings");
      await fs.mkdir(dir);
      const file = path.join(dir, "settings.json");
      await fs.writeFile(
        file,
        JSON.stringify({ showTrayIcon: false, minimizeToTray: false })
      );
      expect(await readDesktopSettings(root)).toEqual({
        showTrayIcon: false,
        minimizeToTray: false,
      });
      await fs.writeFile(file, '{"showTrayIcon":"false"}');
      expect(await readDesktopSettings(root)).toEqual({
        showTrayIcon: true,
        minimizeToTray: true,
      });
      await fs.writeFile(file, "invalid json");
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await readDesktopSettings(root)).toEqual({
        showTrayIcon: true,
        minimizeToTray: true,
      });
      expect(await fs.readFile(file, "utf8")).toBe("invalid json");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
