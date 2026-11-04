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

import { getCurrentWindow } from "@/platform/native/window";
import {
  listen as tauriListen,
  type UnlistenFn,
} from "@/platform/native/events";
import { isNativeRuntime, isElectronRuntime } from "../core/env";
import { invoke } from "../core/bridge";

const resizeTasks = new Map<string, Promise<void>>();
type ResizeDirection = Parameters<
  ReturnType<typeof getCurrentWindow>["startResizeDragging"]
>[0];

/** Drag through the host adapter; restore temporary native-resize settings on every outcome. */
export async function startWindowResize(
  direction: ResizeDirection
): Promise<void> {
  if (!isNativeRuntime()) throw new Error("请在桌面应用中调整窗口大小");
  const window = getCurrentWindow();
  const existing = resizeTasks.get(window.label);
  if (existing) return existing;
  const task = (async () => {
    // Electron owns the temporary setting in the main process, including renderer loss.
    if (isElectronRuntime()) return window.startResizeDragging(direction);
    const resizable = await window.isResizable();
    let failed = false,
      failure: unknown;
    try {
      if (!resizable) await window.setResizable(true);
      await window.startResizeDragging(direction);
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      if (!resizable) {
        try {
          await window.setResizable(false);
        } catch (error) {
          if (failed)
            throw Object.assign(new Error("窗口缩放失败，且无法恢复缩放设置"), {
              cause: failure,
              restoreError: error,
            });
          throw error;
        }
      }
    }
    if (failed) throw failure;
  })().finally(() => {
    if (resizeTasks.get(window.label) === task)
      resizeTasks.delete(window.label);
  });
  resizeTasks.set(window.label, task);
  return task;
}

/** Existing app file-drop event; keep its payload contract at the host boundary. */
export function onFileDropPaths(
  handler: (paths: string[]) => void
): Promise<UnlistenFn> {
  return tauriListen<string[]>("tauri-file-drop", (event) =>
    handler(event.payload)
  );
}

export interface WindowDestroyedEvent {
  label?: string;
  windowLabel?: string;
}

export async function onWindowDestroyed(
  handler: (event: WindowDestroyedEvent) => void
): Promise<UnlistenFn> {
  if (isNativeRuntime()) {
    return tauriListen<{ label?: string }>("tauri://destroyed", (event) => {
      handler({
        label: event.payload?.label,
        windowLabel: (event as any).windowLabel,
      });
    });
  }

  return () => {};
}

/**
 * 最小化当前窗口
 */
export async function minimizeCurrentWindow(): Promise<void> {
  if (isNativeRuntime()) {
    const win = getCurrentWindow();
    await win.minimize();
  }
}

/**
 * 切换当前窗口最大化/还原状态
 */
export async function toggleMaximizeCurrentWindow(): Promise<void> {
  if (isNativeRuntime()) {
    const win = getCurrentWindow();
    await win.toggleMaximize();
  }
}

/**
 * 关闭当前窗口
 */
export async function closeCurrentWindow(): Promise<void> {
  if (isNativeRuntime()) {
    const win = getCurrentWindow();
    await win.close();
  }
}

/**
 * 查询当前窗口是否已最大化
 */
export async function isCurrentWindowMaximized(): Promise<boolean> {
  if (isNativeRuntime()) {
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
