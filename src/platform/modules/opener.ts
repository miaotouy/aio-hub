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
  openUrl as tauriOpenUrl,
  revealItemInDir as tauriRevealItemInDir,
  openPath as tauriOpenPath,
} from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../core/env";
import { PlatformError } from "../core/errors";

/**
 * 用系统默认浏览器打开 URL
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriOpenUrl(url);
      return;
    } catch (err) {
      throw new PlatformError(`打开外部链接失败: ${url}`, {
        command: "plugin-opener:openUrl",
        args: { url },
        cause: err,
      });
    }
  }

  // 纯 Web 环境直接在新窗口打开
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * 在系统文件资源管理器中定位并选中文件/目录
 */
export async function revealInFileManager(filePath: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriRevealItemInDir(filePath);
      return;
    } catch (err) {
      throw new PlatformError(`文件管理器定位失败: ${filePath}`, {
        command: "plugin-opener:revealItemInDir",
        args: { filePath },
        cause: err,
      });
    }
  }
}

/**
 * 用系统默认关联应用直接打开指定路径
 */
export async function openPathWithDefaultApp(filePath: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriOpenPath(filePath);
      return;
    } catch (err) {
      throw new PlatformError(`打开文件路径失败: ${filePath}`, {
        command: "plugin-opener:openPath",
        args: { filePath },
        cause: err,
      });
    }
  }
}
