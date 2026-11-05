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

import { spawn, type SpawnOptions } from "node:child_process";

export type TerminalLauncher = (
  executable: string,
  args: string[],
  options: SpawnOptions
) => Promise<void>;
const launch: TerminalLauncher = (executable, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, options);
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
/** This explicit UI action starts a user-owned interactive terminal, separate from Git jobs. */
export async function openGitTerminal(
  root: string,
  launcher = launch,
  platform = process.platform
): Promise<void> {
  const options: SpawnOptions = {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  };
  try {
    if (platform === "win32") {
      try {
        await launcher("wt.exe", ["-d", root], options);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await launcher("powershell.exe", ["-NoLogo", "-NoExit"], options);
      }
    } else if (platform === "darwin")
      await launcher("open", ["-a", "Terminal", root], options);
    else
      await launcher(
        "x-terminal-emulator",
        ["--working-directory=" + root],
        options
      );
  } catch {
    throw new Error("无法打开系统终端，请确认已安装可用终端");
  }
}
