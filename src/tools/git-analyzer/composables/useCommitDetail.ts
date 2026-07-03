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

import { ref } from "vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { invoke } from "@tauri-apps/api/core";
import type { GitCommit } from "../types";
import { createModuleLogger } from "@utils/logger";
import { commitCache } from "./useCommitCache";

const logger = createModuleLogger("git-analyzer:useCommitDetail");
const errorHandler = createModuleErrorHandler("git-analyzer:useCommitDetail");

export function useCommitDetail(repoPath: () => string) {
  // 状态
  const selectedCommit = ref<GitCommit | null>(null);
  const showDetail = ref(false);

  /**
   * 检查缓存的 commit 数据是否包含完整的行统计信息
   * 主加载路径在 includeFiles=true 但 includeLineStats=false 时，
   * 只会填充文件路径和状态，additions/deletions 全为 0 且无 stats 字段。
   */
  function isCacheComplete(cached: GitCommit): boolean {
    // 如果有 stats 字段，说明经过了完整的 diff 计算
    if (cached.stats) return true;
    // 如果没有 files，说明还没加载文件信息，也视为不完整
    if (!cached.files || cached.files.length === 0) return false;
    // 如果有 files 但没有 stats，检查是否有任何文件有非零的行统计
    return cached.files.some((f) => f.additions > 0 || f.deletions > 0);
  }

  /**
   * 选择提交并显示详情
   */
  function selectCommit(commit: GitCommit) {
    selectedCommit.value = commit;
    showDetail.value = true;

    // 检查统一缓存
    const cached = commitCache.getCommitDetail(commit.hash);
    if (cached && isCacheComplete(cached)) {
      logger.debug("使用缓存的 commit 详细信息", {
        sha: commit.hash.substring(0, 8),
      });
      selectedCommit.value = cached;
    } else {
      // 缓存未命中或数据不完整（缺少行统计），从后端加载
      if (cached) {
        logger.debug("缓存数据不完整（缺少行统计），重新加载", {
          sha: commit.hash.substring(0, 8),
        });
      }
      loadCommitDetail(commit.hash);
    }
  }

  /**
   * 加载提交详情
   */
  async function loadCommitDetail(hash: string) {
    try {
      const detail = await invoke<GitCommit>("git_get_commit_detail", {
        path: repoPath() || ".",
        hash,
      });
      logger.debug("从后端成功获取 commit 详细信息", {
        sha: hash.substring(0, 8),
        fullSha: hash,
        author: detail.author,
        date: detail.date,
        message: detail.message.substring(0, 100),
      });

      // 更新统一缓存
      commitCache.setCommitDetail(hash, detail);
      selectedCommit.value = detail;
    } catch (error) {
      errorHandler.error(error, "加载提交详情失败");
    }
  }

  /**
   * 复制提交哈希到剪贴板
   */
  async function copyCommitHash() {
    if (selectedCommit.value) {
      await navigator.clipboard.writeText(selectedCommit.value.hash);
      customMessage.success("已复制提交哈希");
    }
  }

  /**
   * 格式化日期为本地化字符串
   */
  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString("zh-CN");
  }

  /**
   * 格式化日期为完整的本地化字符串
   */
  function formatFullDate(date: string): string {
    return new Date(date).toLocaleString("zh-CN");
  }

  /**
   * 清空缓存（在切换仓库或分支时调用）
   */
  function clearCache() {
    commitCache.clearDetailCache();
  }

  return {
    // 状态
    selectedCommit,
    showDetail,

    // 方法
    selectCommit,
    loadCommitDetail,
    copyCommitHash,
    formatDate,
    formatFullDate,
    clearCache,
  };
}
