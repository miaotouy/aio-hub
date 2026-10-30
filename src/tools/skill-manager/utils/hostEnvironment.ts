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

import type { TerminalPreferences } from "../types";

/** 按宿主平台解析自动终端偏好，显式选择始终优先。 */
export function resolveTerminalEnvironment(
  osPlatform: string,
  prefs: TerminalPreferences
) {
  const shell =
    prefs.defaultShell === "auto-detect"
      ? osPlatform === "windows"
        ? "powershell"
        : osPlatform === "macos"
          ? "zsh"
          : "bash"
      : prefs.defaultShell;
  return {
    shell,
    shellDesc:
      shell === "powershell"
        ? "PowerShell"
        : shell === "cmd"
          ? "cmd.exe"
          : shell,
    chainStyle:
      prefs.commandChainStyle === "semicolon" ||
      (prefs.commandChainStyle === "auto" && shell === "powershell")
        ? "使用 `;` 串联命令"
        : "使用 `&&` 串联命令",
    pathStyle:
      shell === "powershell" || shell === "cmd"
        ? "`\\`（反斜杠）"
        : "`/`（正斜杠）",
  };
}
