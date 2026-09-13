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

import { invoke } from "@tauri-apps/api/core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { parseRemoteInfo, type RemoteInfo } from "../utils";

const errorHandler = createModuleErrorHandler("git-committer/remote-info");

/** 按仓库路径缓存解析结果，避免每次悬停都重复读取远端 */
const remoteCache = new Map<string, RemoteInfo | null>();

/** 读取并解析仓库远端信息；无远端或平台未知时返回 null */
export async function getRemoteInfo(
  repoPath: string
): Promise<RemoteInfo | null> {
  if (remoteCache.has(repoPath)) {
    return remoteCache.get(repoPath) ?? null;
  }

  const url = await errorHandler.wrapAsync(
    () => invoke<string | null>("git_get_remote_url", { path: repoPath }),
    { userMessage: "读取远端仓库信息失败", showToUser: false }
  );

  const info = url ? parseRemoteInfo(url) : null;
  remoteCache.set(repoPath, info);
  return info;
}

/** 清空远端信息缓存，仓库配置变化时可调用 */
export function clearRemoteInfoCache(): void {
  remoteCache.clear();
}
