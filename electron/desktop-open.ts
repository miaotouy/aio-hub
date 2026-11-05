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

import fs from "node:fs/promises";
import { filePath } from "./filesystem";
import { externalUrl } from "./security";

export interface DesktopOpenHost {
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  openExternal(url: string): Promise<void>;
}

/** One native opener boundary for SDK operations and legacy business commands. */
export async function desktopOpen(
  name: string,
  args: Record<string, unknown>,
  host: DesktopOpenHost
): Promise<void | string> {
  if (name === "open_url" || name === "opener.url") {
    if (typeof args.url !== "string") throw new Error("需要有效的外部链接");
    await host.openExternal(externalUrl(args.url));
    return;
  }
  const target = filePath(
    name === "open_file_directory" ? args.filePath : args.path,
    undefined,
    {}
  );
  const info =
    name === "opener.reveal" ? await fs.lstat(target) : await fs.stat(target);
  const reveal =
    name === "opener.reveal" ||
    (name === "open_file_directory" && !info.isDirectory());
  if (reveal) host.showItemInFolder(target);
  else {
    const error = await host.openPath(target);
    if (error) throw new Error(error);
  }
  if (name === "open_file_directory")
    return "已请求在文件管理器中显示: " + target;
}
