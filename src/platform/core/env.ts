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

/**
 * 平台运行时类型
 */
export type PlatformRuntime = "tauri" | "electron" | "browser" | "node" | "test";

/**
 * 探测当前运行环境
 */
export function detectPlatformRuntime(): PlatformRuntime {
  // 1. 测试环境 / Node 环境
  if (typeof process !== "undefined" && process.env?.VITEST) {
    return "test";
  }

  // 2. 检查是否有 window 对象
  if (typeof window === "undefined") {
    return "node";
  }

  // 3. Electron 环境探测（通过 preload 挂载的 window.aiohub 或 process.versions.electron）
  if (
    (window as any).__ELECTRON__ ||
    (window as any).aiohub?.platform === "electron" ||
    navigator.userAgent.includes("Electron")
  ) {
    return "electron";
  }

  // 4. Tauri 环境探测（window.__TAURI_INTERNALS__ 或 window.__TAURI__）
  if (
    (window as any).__TAURI_INTERNALS__ ||
    (window as any).__TAURI__ ||
    (window as any).__TAURI_METADATA__
  ) {
    return "tauri";
  }

  // 5. 纯浏览器开发/降级
  return "browser";
}

/** 当前运行时单例缓存 */
export const currentPlatformRuntime: PlatformRuntime = detectPlatformRuntime();

/** 是否为 Tauri 运行环境 */
export function isTauriRuntime(): boolean {
  return currentPlatformRuntime === "tauri";
}

/** 是否为 Electron 运行环境 */
export function isElectronRuntime(): boolean {
  return currentPlatformRuntime === "electron";
}

/** 是否为纯 Web 或测试降级环境 */
export function isBrowserOrTest(): boolean {
  return currentPlatformRuntime === "browser" || currentPlatformRuntime === "test";
}
