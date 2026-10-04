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
  writeText as tauriWriteText,
  readText as tauriReadText,
} from "@tauri-apps/plugin-clipboard-manager";
import { isTauriRuntime } from "../core/env";
import { PlatformError } from "../core/errors";

/**
 * 将文本写入系统剪贴板
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await tauriWriteText(text);
      return;
    } catch (err) {
      throw new PlatformError("写入剪贴板失败", {
        command: "plugin-clipboard-manager:writeText",
        args: { text },
        cause: err,
      });
    }
  }

  // 纯浏览器 Fallback
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // 降级失败
    }
  }
}

/**
 * 从系统剪贴板读取文本
 */
export async function readClipboardText(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await tauriReadText();
    } catch (err) {
      throw new PlatformError("读取剪贴板失败", {
        command: "plugin-clipboard-manager:readText",
        cause: err,
      });
    }
  }

  // 纯浏览器 Fallback
  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }

  return "";
}
