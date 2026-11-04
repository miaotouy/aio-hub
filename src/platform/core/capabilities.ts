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

import { currentPlatformRuntime } from "./env";
import { platform } from "../native/os";

const definitions = {
  backgroundJsRuntime: { label: "后台 JavaScript 运行时", windowsOnly: false },
  systemCodeFormatting: { label: "系统代码格式化", windowsOnly: false },
  windowAutomation: { label: "窗口绑定和方案执行", windowsOnly: true },
  screenCapture: { label: "屏幕监控", windowsOnly: true },
  externalPlayerOverlay: { label: "外部播放器弹幕覆盖", windowsOnly: true },
} as const;

export type HostCapability = keyof typeof definitions;
export type HostCapabilityStatus =
  | { available: true; reasonCode: null; reason: null }
  | {
      available: false;
      reasonCode:
        "desktop-required" | "platform-unavailable" | "host-unavailable";
      reason: string;
    };

/** Business capabilities, separate from desktop-host and operating-system detection. */
export function getHostCapability(
  capability: HostCapability
): HostCapabilityStatus {
  const { label, windowsOnly } = definitions[capability];
  if (
    currentPlatformRuntime !== "tauri" &&
    currentPlatformRuntime !== "electron"
  ) {
    return {
      available: false,
      reasonCode: "desktop-required",
      reason: "请在 AIO Hub 桌面应用中使用" + label + "。",
    };
  }
  if (windowsOnly) {
    let windows = false;
    try {
      windows = platform() === "windows";
    } catch {
      /* Missing native OS information. */
    }
    if (!windows)
      return {
        available: false,
        reasonCode: "platform-unavailable",
        reason: label + "需要 Windows 桌面版。",
      };
  }
  if (currentPlatformRuntime === "electron") {
    return {
      available: false,
      reasonCode: "host-unavailable",
      reason: label + "尚未接入 Electron 版，可在 Tauri 版中使用。",
    };
  }
  return { available: true, reasonCode: null, reason: null };
}

export function requireHostCapability(capability: HostCapability): void {
  const status = getHostCapability(capability);
  if (!status.available)
    throw Object.assign(new Error(status.reason), {
      code: "CAPABILITY_UNAVAILABLE",
      capability,
      reasonCode: status.reasonCode,
    });
}
