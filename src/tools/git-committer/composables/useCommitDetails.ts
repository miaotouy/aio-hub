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
 * 提交详情共享缓存。
 *
 * 提交历史展开、悬浮卡片与多文件 Diff 视图都需要 `git_get_commit_detail`
 * 的结果；按仓库 + 提交哈希缓存并合并并发请求，避免重复 IPC。
 */

import { invoke } from "@tauri-apps/api/core";
import { errorHandler } from "./useGitCommitterErrorHandler";
import type { GitCommitSummary } from "../types";

const cache = new Map<string, GitCommitSummary>();
const inFlight = new Map<string, Promise<GitCommitSummary | null>>();

function cacheKey(repoPath: string, hash: string): string {
  return `${repoPath}::${hash}`;
}

/** 读取提交详情；命中缓存或已有进行中的请求时直接复用。 */
export async function loadCommitDetail(
  repoPath: string,
  hash: string
): Promise<GitCommitSummary | null> {
  if (!repoPath || !hash) return null;
  const key = cacheKey(repoPath, hash);

  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const result = await errorHandler.wrapAsync(
      () =>
        invoke<GitCommitSummary>("git_get_commit_detail", {
          path: repoPath,
          hash,
        }),
      { userMessage: "加载提交详情失败", showToUser: false }
    );
    if (result) cache.set(key, result);
    return result ?? null;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, task);
  return task;
}

/** 清空缓存；仓库或分支切换时调用，避免展示过期提交详情。 */
export function clearCommitDetailsCache(): void {
  cache.clear();
  inFlight.clear();
}
