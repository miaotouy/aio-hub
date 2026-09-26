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

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  appDataDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: tauri.appDataDir,
}));

describe("getAppConfigDir", () => {
  beforeEach(() => {
    vi.resetModules();
    tauri.invoke.mockReset();
    tauri.appDataDir.mockReset();
  });

  it("uses the native data root selected by the installer for concurrent callers", async () => {
    tauri.invoke.mockResolvedValue("D:\\AIO Hub\\com.mty.aiohub");
    const { getAppConfigDir } = await import("../appPath");

    await expect(
      Promise.all([getAppConfigDir(), getAppConfigDir()])
    ).resolves.toEqual([
      "D:\\AIO Hub\\com.mty.aiohub",
      "D:\\AIO Hub\\com.mty.aiohub",
    ]);
    expect(tauri.invoke).toHaveBeenCalledTimes(1);
    expect(tauri.invoke).toHaveBeenCalledWith("get_app_config_dir");
    expect(tauri.appDataDir).not.toHaveBeenCalled();
  });

  it("falls back to Tauri's platform default when the native command is unavailable", async () => {
    tauri.invoke.mockRejectedValue(new Error("Tauri unavailable"));
    tauri.appDataDir.mockResolvedValue(
      "C:\\Users\\AIO\\AppData\\Roaming\\com.mty.aiohub"
    );
    const { getAppConfigDir } = await import("../appPath");

    await expect(getAppConfigDir()).resolves.toBe(
      "C:\\Users\\AIO\\AppData\\Roaming\\com.mty.aiohub"
    );
    expect(tauri.appDataDir).toHaveBeenCalledTimes(1);
  });
});
