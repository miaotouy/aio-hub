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
import type { PlatformRuntime } from "./env";
import {
  getHostCapability,
  requireHostCapability,
  type HostCapability,
} from "./capabilities";
import { getNativeDesktopCapabilities } from "../modules/system";
import { platform } from "../native/os";

const host = vi.hoisted(() => ({
  runtime: "tauri" as PlatformRuntime,
  os: "windows",
}));
vi.mock("./env", () => ({
  get currentPlatformRuntime() {
    return host.runtime;
  },
}));
vi.mock("../native/os", () => ({ platform: vi.fn(() => host.os) }));
const windowsFeatures: HostCapability[] = [
  "windowAutomation",
  "screenCapture",
  "externalPlayerOverlay",
];
const sharedFeatures: HostCapability[] = [
  "backgroundJsRuntime",
  "systemCodeFormatting",
];

beforeEach(() => {
  host.runtime = "tauri";
  host.os = "windows";
  vi.mocked(platform)
    .mockReset()
    .mockImplementation(() => host.os as ReturnType<typeof platform>);
});

describe("宿主业务能力契约", () => {
  it("keeps Tauri backend support distinct from Windows-only integrations", () => {
    for (const capability of [...windowsFeatures, ...sharedFeatures]) {
      expect(getHostCapability(capability)).toEqual({
        available: true,
        reasonCode: null,
        reason: null,
      });
      expect(() => requireHostCapability(capability)).not.toThrow();
    }
    expect(getNativeDesktopCapabilities()).toEqual({
      windowAutomation: true,
      screenCapture: true,
      externalPlayerOverlay: true,
    });
    for (const os of ["linux", "macos"]) {
      host.os = os;
      for (const capability of windowsFeatures)
        expect(getHostCapability(capability)).toMatchObject({
          available: false,
          reasonCode: "platform-unavailable",
        });
      for (const capability of sharedFeatures)
        expect(getHostCapability(capability).available).toBe(true);
    }
  });

  it("reports missing Electron integrations without misidentifying Windows", () => {
    host.runtime = "electron";
    for (const capability of [...windowsFeatures, ...sharedFeatures]) {
      expect(getHostCapability(capability)).toMatchObject({
        available: false,
        reasonCode: "host-unavailable",
      });
      expect(() => requireHostCapability(capability)).toThrow(
        expect.objectContaining({
          code: "CAPABILITY_UNAVAILABLE",
          capability,
          reasonCode: "host-unavailable",
        })
      );
    }
    expect(getNativeDesktopCapabilities()).toEqual({
      windowAutomation: false,
      screenCapture: false,
      externalPlayerOverlay: false,
    });
    host.os = "linux";
    expect(getHostCapability("windowAutomation").reasonCode).toBe(
      "platform-unavailable"
    );
  });

  it("requires a desktop host and keeps unknown operating systems conservative", () => {
    for (const runtime of ["browser", "node", "test"] as const) {
      host.runtime = runtime;
      for (const capability of [...windowsFeatures, ...sharedFeatures])
        expect(getHostCapability(capability)).toMatchObject({
          available: false,
          reasonCode: "desktop-required",
        });
    }
    expect(platform).not.toHaveBeenCalled();
    host.runtime = "tauri";
    vi.mocked(platform).mockImplementation(() => {
      throw new Error("OS bridge unavailable");
    });
    expect(getHostCapability("screenCapture").reasonCode).toBe(
      "platform-unavailable"
    );
    expect(getHostCapability("systemCodeFormatting").available).toBe(true);
  });
});
