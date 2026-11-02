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
  readTextFile as tauriReadTextFile,
  writeTextFile as tauriWriteTextFile,
  exists as tauriExists,
  mkdir as tauriMkdir,
  remove as tauriRemove,
  readDir as tauriReadDir,
  BaseDirectory,
  type DirEntry,
} from "@tauri-apps/plugin-fs";

export { BaseDirectory };
export type { DirEntry };
import { isTauriRuntime } from "../core/env";
import { invoke } from "../core/bridge";
import { PlatformError } from "../core/errors";

/**
 * 检查路径是否存在
 */
export async function pathExists(filePath: string): Promise<boolean> {
  if (isTauriRuntime()) {
    try {
      return await tauriExists(filePath);
    } catch {
      // 尝试后端 force 命令
      try {
        return await invoke("path_exists", { path: filePath });
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * 强制读取文本文件内容（UTF-8）
 */
export async function readTextFile(filePath: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriReadTextFile(filePath);
    } catch {
      // 降级使用 Rust force 命令（绕过部分 Windows 锁文件或权限限制）
      return await invoke("read_text_file_force", { path: filePath });
    }
  }

  throw new PlatformError(`非原生环境下无法读取文件: ${filePath}`, {
    command: "fs:readTextFile",
    args: { filePath },
  });
}

/**
 * 强制写入文本文件内容
 */
export async function writeTextFile(
  filePath: string,
  content: string
): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriWriteTextFile(filePath, content);
      return;
    } catch {
      // 降级使用 Rust force 命令
      await invoke("write_text_file_force", { path: filePath, content });
      return;
    }
  }

  throw new PlatformError(`非原生环境下无法写入文件: ${filePath}`, {
    command: "fs:writeTextFile",
    args: { filePath },
  });
}

/**
 * 读取二进制文件
 */
export async function readFileBinary(filePath: string): Promise<number[]> {
  return await invoke("read_file_binary", { path: filePath });
}

/**
 * 写入二进制文件
 */
export async function writeFileBinary(
  filePath: string,
  content: number[]
): Promise<void> {
  await invoke("write_file_force", { path: filePath, content });
}

/**
 * 安全删除 AppData 目录下的子目录
 */
export async function deleteDirectoryInAppData(
  relativePath: string
): Promise<void> {
  await invoke("delete_directory_in_app_data", { relativePath });
}

/**
 * 安全复制文件到 AppData
 */
export async function copyFileToAppData(
  sourcePath: string,
  subdirectory: string,
  newFilename?: string
): Promise<string> {
  return await invoke("copy_file_to_app_data", {
    sourcePath,
    subdirectory,
    newFilename,
  });
}

/**
 * 创建目录（默认递归创建）
 */
export async function createDir(
  dirPath: string,
  recursive = true
): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriMkdir(dirPath, { recursive });
      return;
    } catch {
      await invoke("create_dir_force", { path: dirPath });
      return;
    }
  }
}

/**
 * 安全删除文件（移至回收站）
 */
export async function deleteToTrash(filePath: string): Promise<void> {
  await invoke("delete_file_to_trash", { filePath });
}

export interface ReadDirOptions {
  baseDir?: BaseDirectory;
}

export interface RemoveOptions {
  baseDir?: BaseDirectory;
  recursive?: boolean;
}

/**
 * 直接删除文件或目录
 */
export async function removeFileOrDir(
  targetPath: string,
  options: boolean | RemoveOptions = false
): Promise<void> {
  const opts = typeof options === "boolean" ? { recursive: options } : options;
  if (isTauriRuntime()) {
    try {
      await tauriRemove(targetPath, opts);
      return;
    } catch (err) {
      throw new PlatformError(`删除路径失败: ${targetPath}`, {
        command: "fs:remove",
        args: { targetPath, options: opts },
        cause: err,
      });
    }
  }
}

/**
 * 读取目录下的文件项列表
 */
export async function readDirectory(
  dirPath: string,
  options?: ReadDirOptions
): Promise<DirEntry[]> {
  if (isTauriRuntime()) {
    try {
      return await tauriReadDir(dirPath, options);
    } catch (err) {
      throw new PlatformError(`读取目录失败: ${dirPath}`, {
        command: "fs:readDir",
        args: { dirPath, options },
        cause: err,
      });
    }
  }
  return [];
}
