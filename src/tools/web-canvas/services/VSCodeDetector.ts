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

import { exists } from "@tauri-apps/plugin-fs";
import { join, localDataDir } from "@tauri-apps/api/path";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/VSCodeDetector");

export class VSCodeDetector {
  /**
   * 扫描可能的 VSCode 路径
   */
  static async scan(): Promise<string | null> {
    const possiblePaths: string[] = [];

    try {
      // 1. User Install (Local AppData)
      const localAppData = await localDataDir();
      possiblePaths.push(
        await join(
          localAppData,
          "Programs",
          "Microsoft VS Code",
          "bin",
          "code.cmd"
        )
      );
      possiblePaths.push(
        await join(localAppData, "Programs", "Microsoft VS Code", "Code.exe")
      );

      // 2. System Install (Program Files)
      // 在 Windows 上，通常是 C:\Program Files
      possiblePaths.push("C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd");
      possiblePaths.push("C:\\Program Files\\Microsoft VS Code\\Code.exe");

      // 3. System Install (x86)
      possiblePaths.push(
        "C:\\Program Files (x86)\\Microsoft VS Code\\bin\\code.cmd"
      );

      for (const path of possiblePaths) {
        try {
          if (await exists(path)) {
            logger.info("找到 VSCode 路径:", { path });
            return path;
          }
        } catch {
          // 忽略单个路径检查失败（例如权限问题）
        }
      }
    } catch (error) {
      logger.error("扫描 VSCode 路径失败", error);
    }

    return null;
  }
}
