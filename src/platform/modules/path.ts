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
  join as tauriJoin,
  extname as tauriExtname,
  basename as tauriBasename,
  dirname as tauriDirname,
} from "@tauri-apps/api/path";
import { isTauriRuntime } from "../core/env";
import { getAppConfigDir as getAppDirFromUtils } from "@/utils/appPath";

/**
 * 获取应用数据根目录（单例缓存代理）
 */
export async function getAppConfigDir(): Promise<string> {
  return await getAppDirFromUtils();
}

/**
 * 跨平台路径拼接（在非 Tauri/Web 环境提供可靠的简易 fallback）
 */
export async function joinPath(...segments: string[]): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriJoin(...segments);
    } catch {
      // 降级使用斜杠拼接
    }
  }

  // 纯 JS / Node / 浏览器 fallback
  return segments
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

/**
 * 获取路径扩展名
 */
export async function getExtname(path: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriExtname(path);
    } catch {
      // fallback
    }
  }
  const lastDot = path.lastIndexOf(".");
  return lastDot !== -1 ? path.slice(lastDot + 1) : "";
}

/**
 * 获取基础文件名
 */
export async function getBasename(path: string, ext?: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriBasename(path, ext);
    } catch {
      // fallback
    }
  }
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  let base = lastSlash !== -1 ? normalized.slice(lastSlash + 1) : normalized;
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length);
  }
  return base;
}

/**
 * 获取父目录路径
 */
export async function getDirname(path: string): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriDirname(path);
    } catch {
      // fallback
    }
  }
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash !== -1 ? normalized.slice(0, lastSlash) : ".";
}
