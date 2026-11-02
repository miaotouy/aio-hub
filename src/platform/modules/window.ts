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

import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "../core/env";
import { invoke } from "../core/bridge";

/**
 * 最小化当前窗口
 */
export async function minimizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) {
    const win = getCurrentWindow();
    await win.minimize();
  }
}

/**
 * 切换当前窗口最大化/还原状态
 */
export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) {
    const win = getCurrentWindow();
    await win.toggleMaximize();
  }
}

/**
 * 关闭当前窗口
 */
export async function closeCurrentWindow(): Promise<void> {
  if (isTauriRuntime()) {
    const win = getCurrentWindow();
    await win.close();
  }
}

/**
 * 查询当前窗口是否已最大化
 */
export async function isCurrentWindowMaximized(): Promise<boolean> {
  if (isTauriRuntime()) {
    const win = getCurrentWindow();
    return await win.isMaximized();
  }
  return false;
}

/**
 * 保存指定窗口的位置与尺寸配置
 */
export async function saveWindowConfig(label: string): Promise<void> {
  await invoke("save_window_config", { label });
}

/**
 * 清除所有已保存的窗口配置
 */
export async function clearAllWindowConfigs(): Promise<void> {
  await invoke("clear_all_window_configs");
}

/**
 * 关闭指定的分离窗口
 */
export async function closeDetachedWindow(label: string): Promise<void> {
  await invoke("close_detached_window", { label });
}
