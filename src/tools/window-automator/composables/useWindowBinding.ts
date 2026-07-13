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
 * 窗口绑定 composable
 *
 * 职责：
 *  - 调用 wa_get_windows 拉取可见窗口列表；
 *  - 调用 wa_is_window_valid 校验已绑定的窗口句柄；
 *  - 调用 wa_get_client_rect 获取客户区尺寸（用于百分比坐标自适应）。
 */

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { WindowInfo, ClientRect } from "../types";

const logger = createModuleLogger("window-automator/useWindowBinding");
const errorHandler = createModuleErrorHandler(
  "window-automator/useWindowBinding"
);

export function useWindowBinding() {
  const windows = ref<WindowInfo[]>([]);
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);

  /** 拉取可见窗口列表 */
  async function refresh(excludeSelf = true): Promise<WindowInfo[]> {
    isLoading.value = true;
    lastError.value = null;
    const result = await errorHandler.wrapAsync(
      () => invoke<WindowInfo[]>("wa_get_windows", { excludeSelf }),
      { userMessage: "获取窗口列表失败" }
    );
    isLoading.value = false;
    if (result === null) {
      lastError.value = "获取窗口列表失败";
      return [];
    }
    windows.value = result;
    logger.info("刷新窗口列表", { count: result.length });
    return result;
  }

  /** 检查窗口句柄是否仍有效 */
  async function isValid(hwnd: number): Promise<boolean> {
    if (!hwnd) return false;
    return (
      (await errorHandler.wrapAsync(
        () => invoke<boolean>("wa_is_window_valid", { hwnd }),
        { userMessage: "校验窗口失败" }
      )) ?? false
    );
  }

  /** 获取客户区尺寸（像素） */
  async function getClientRect(hwnd: number): Promise<ClientRect | null> {
    if (!hwnd) return null;
    return await errorHandler.wrapAsync(
      () => invoke<ClientRect>("wa_get_client_rect", { hwnd }),
      { userMessage: "获取窗口尺寸失败" }
    );
  }

  /**
   * 尝试根据保存的 targetWindow 重新匹配当前可见窗口。
   * 匹配优先级：标题完全相同 > 类名完全相同。
   */
  function findReconnectCandidate(
    targetTitle: string,
    targetClassName: string
  ): WindowInfo | null {
    if (!targetTitle && !targetClassName) return null;
    const exactTitle = windows.value.find((w) => w.title === targetTitle);
    if (exactTitle) return exactTitle;
    const exactClass = windows.value.find(
      (w) => w.className === targetClassName
    );
    return exactClass ?? null;
  }

  return {
    windows,
    isLoading,
    lastError,
    refresh,
    isValid,
    getClientRect,
    findReconnectCandidate,
  };
}
