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

import {
  open as tauriOpen,
  save as tauriSave,
  type OpenDialogOptions as TauriOpenOptions,
  type SaveDialogOptions as TauriSaveOptions,
} from "@tauri-apps/plugin-dialog";
import { isTauriRuntime } from "../core/env";
import { PlatformError } from "../core/errors";

export type OpenDialogOptions = TauriOpenOptions;
export type SaveDialogOptions = TauriSaveOptions;

/**
 * 打开文件/目录选择对话框
 * @returns 选中的文件路径（单选时为 string | null，多选时为 string[] | null）
 */
export async function showOpenDialog(
  options: OpenDialogOptions = {}
): Promise<string | string[] | null> {
  if (isTauriRuntime()) {
    try {
      return await tauriOpen(options);
    } catch (err) {
      throw new PlatformError("打开文件选择对话框失败", {
        command: "plugin-dialog:open",
        args: options,
        cause: err,
      });
    }
  }

  // Web 或测试环境 Mock 降级
  return null;
}

/**
 * 打开单文件选择对话框的快捷方法
 */
export async function showOpenFile(
  options: Omit<OpenDialogOptions, "multiple" | "directory"> = {}
): Promise<string | null> {
  const result = await showOpenDialog({
    ...options,
    multiple: false,
    directory: false,
  });
  return typeof result === "string" ? result : null;
}

/**
 * 打开目录选择对话框的快捷方法
 */
export async function showOpenDirectory(
  options: Omit<OpenDialogOptions, "multiple" | "directory"> = {}
): Promise<string | null> {
  const result = await showOpenDialog({
    ...options,
    multiple: false,
    directory: true,
  });
  return typeof result === "string" ? result : null;
}

/**
 * 打开文件保存对话框
 * @returns 用户选择的保存路径，若取消则返回 null
 */
export async function showSaveDialog(
  options: SaveDialogOptions = {}
): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      return await tauriSave(options);
    } catch (err) {
      throw new PlatformError("打开保存对话框失败", {
        command: "plugin-dialog:save",
        args: options,
        cause: err,
      });
    }
  }

  return null;
}
