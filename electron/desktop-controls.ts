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

import fs from "node:fs/promises";
import path from "node:path";

export interface DesktopSettings {
  showTrayIcon: boolean;
  minimizeToTray: boolean;
}
export async function readDesktopSettings(
  root: string
): Promise<DesktopSettings> {
  const defaults = { showTrayIcon: true, minimizeToTray: true };
  try {
    const value = JSON.parse(
      await fs.readFile(
        path.join(root, "app-settings", "settings.json"),
        "utf8"
      )
    );
    return {
      showTrayIcon:
        typeof value?.showTrayIcon === "boolean"
          ? value.showTrayIcon
          : defaults.showTrayIcon,
      minimizeToTray:
        typeof value?.minimizeToTray === "boolean"
          ? value.minimizeToTray
          : defaults.minimizeToTray,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("桌面设置读取失败，沿用默认设置", error);
    return defaults;
  }
}
interface DesktopActions {
  createTray(): { destroy(): void };
  showMain(): Promise<void>;
  hideMain(): void;
  minimizeMain(): void;
  hasCompanions(): boolean;
  confirmExit(): Promise<void>;
  emitSettings(sectionId: string): boolean;
}
/** Owns native tray state and the main-window close policy; persistence stays in app-settings. */
export class DesktopControls {
  private tray?: { destroy(): void };
  private pendingSection?: string;
  private changingTray = Promise.resolve();
  private closing?: Promise<void>;
  minimizeToTray = true;
  constructor(private actions: DesktopActions) {}
  get trayVisible() {
    return !!this.tray;
  }
  setShowTrayIcon(show: boolean): Promise<void> {
    const task = this.changingTray
      .catch(() => {})
      .then(async () => {
        if (show) {
          this.tray ??= this.actions.createTray();
        } else if (this.tray) {
          // Keep an OS-visible recovery path before removing the tray.
          await this.actions.showMain();
          this.tray.destroy();
          this.tray = undefined;
        }
      });
    this.changingTray = task;
    return task;
  }
  async updateTraySetting(enabled: boolean) {
    this.minimizeToTray = enabled;
    if (!enabled) await this.actions.showMain();
  }
  async hideMain() {
    if (this.actions.hasCompanions()) await this.actions.showMain();
    else if (!this.tray) this.actions.minimizeMain();
    else this.actions.hideMain();
  }
  requestMainClose(): Promise<void> {
    if (this.closing) return this.closing;
    const task = (async () => {
      if (this.minimizeToTray && this.tray) await this.hideMain();
      else {
        await this.actions.showMain();
        await this.actions.confirmExit();
      }
    })().finally(() => {
      if (this.closing === task) this.closing = undefined;
    });
    this.closing = task;
    return task;
  }
  async navigateToSettings(sectionId: string) {
    if (!sectionId || sectionId.length > 256 || sectionId.includes("\0"))
      throw new Error("设置页面标识无效");
    this.pendingSection = sectionId;
    await this.actions.showMain();
    this.deliverSettings();
  }
  deliverSettings() {
    if (
      this.pendingSection !== undefined &&
      this.actions.emitSettings(this.pendingSection)
    )
      this.pendingSection = undefined;
  }
  destroy() {
    this.tray?.destroy();
    this.tray = undefined;
  }
}
