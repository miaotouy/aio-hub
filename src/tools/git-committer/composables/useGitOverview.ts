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
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { errorHandler } from "./useGitCommitterErrorHandler";
import type {
  RepoOverview,
  MergeResult,
} from "../types";
import { refreshStatus } from "./useGitCommitterRunner";

/** 当前激活仓库的全景概览数据 */
export const repoOverview = ref<RepoOverview | null>(null);
/** 是否正在加载全景概览 */
export const isLoadingOverview = ref<boolean>(false);

/** 异步加载仓库概览信息 */
export async function loadRepoOverview(repoPath: string): Promise<RepoOverview | null> {
  if (!repoPath || repoPath === "__panorama__") {
    repoOverview.value = null;
    return null;
  }

  isLoadingOverview.value = true;
  try {
    const data = await errorHandler.wrapAsync(
      () => invoke<RepoOverview>("git_get_repo_overview", { path: repoPath }),
      { userMessage: "获取仓库概览信息失败", showToUser: true }
    );
    if (data) {
      repoOverview.value = data;
    }
    return data;
  } finally {
    isLoadingOverview.value = false;
  }
}

/** 检出/切换分支 */
export async function checkoutBranch(
  repoPath: string,
  branchName: string
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_checkout_branch", {
        path: repoPath,
        branchName,
      }),
    { userMessage: `切换到分支 ${branchName} 失败`, showToUser: true }
  );
  if (result !== null) {
    customMessage.success(`已切换到分支 ${branchName}`);
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 新建分支 */
export async function createBranch(
  repoPath: string,
  branchName: string,
  startPoint?: string
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_create_branch", {
        path: repoPath,
        branchName,
        startPoint: startPoint || null,
      }),
    { userMessage: `新建分支 ${branchName} 失败`, showToUser: true }
  );
  if (result !== null) {
    customMessage.success(`成功创建分支 ${branchName}`);
    await loadRepoOverview(repoPath);
    return true;
  }
  return false;
}

/** 删除分支 */
export async function deleteBranch(
  repoPath: string,
  branchName: string,
  force = false
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_delete_branch", {
        path: repoPath,
        branchName,
        force,
      }),
    { userMessage: `删除分支 ${branchName} 失败`, showToUser: true }
  );
  if (result !== null) {
    customMessage.success(`已删除分支 ${branchName}`);
    await loadRepoOverview(repoPath);
    return true;
  }
  return false;
}

/** 合并分支 */
export async function mergeBranch(
  repoPath: string,
  branchName: string
): Promise<MergeResult | null> {
  const res = await errorHandler.wrapAsync(
    () =>
      invoke<MergeResult>("git_merge_branch", {
        path: repoPath,
        branchName,
      }),
    { userMessage: `合并分支 ${branchName} 失败`, showToUser: true }
  );

  if (res) {
    if (res.success) {
      customMessage.success(`分支 ${branchName} 合并成功`);
    } else if (res.hasConflicts) {
      customMessage.warning(`合并出现冲突，请检查工作区解决冲突`);
    } else {
      customMessage.error(`合并未成功: ${res.message}`);
    }
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
  }
  return res;
}

/** 创建标签 */
export async function createTag(
  repoPath: string,
  tagName: string,
  targetHash?: string,
  message?: string
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_create_tag", {
        path: repoPath,
        tagName,
        targetHash: targetHash || null,
        message: message || null,
      }),
    { userMessage: `创建标签 ${tagName} 失败`, showToUser: true }
  );
  if (result !== null) {
    customMessage.success(`已成功创建标签 ${tagName}`);
    await loadRepoOverview(repoPath);
    return true;
  }
  return false;
}

/** 删除标签 */
export async function deleteTag(
  repoPath: string,
  tagName: string
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_delete_tag", {
        path: repoPath,
        tagName,
      }),
    { userMessage: `删除标签 ${tagName} 失败`, showToUser: true }
  );
  if (result !== null) {
    customMessage.success(`已删除标签 ${tagName}`);
    await loadRepoOverview(repoPath);
    return true;
  }
  return false;
}

/** 保存 Stash */
export async function saveStash(
  repoPath: string,
  message?: string,
  includeUntracked = false
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_stash_save", {
        path: repoPath,
        message: message || null,
        includeUntracked,
      }),
    { userMessage: "保存储藏失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("已将当前更改保存到储藏库 (Stash)");
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 弹出 Stash (Pop) */
export async function popStash(
  repoPath: string,
  index?: number
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_stash_pop", {
        path: repoPath,
        index: index !== undefined ? index : null,
      }),
    { userMessage: "弹出储藏失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("储藏已弹出并应用到工作区");
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 应用 Stash (Apply) */
export async function applyStash(
  repoPath: string,
  index?: number
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_stash_apply", {
        path: repoPath,
        index: index !== undefined ? index : null,
      }),
    { userMessage: "应用储藏失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("储藏已应用到工作区");
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 删除 Stash (Drop) */
export async function dropStash(
  repoPath: string,
  index?: number
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_stash_drop", {
        path: repoPath,
        index: index !== undefined ? index : null,
      }),
    { userMessage: "删除储藏失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("已删除指定储藏");
    await loadRepoOverview(repoPath);
    return true;
  }
  return false;
}

/** 撤销最近一次提交 (Soft Reset HEAD~1) */
export async function undoLastCommit(repoPath: string): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () => invoke<void>("git_undo_last_commit", { path: repoPath }),
    { userMessage: "撤销提交失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("已撤销上一次提交，所有更改已保留在暂存区");
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 追加到上次提交 (Amend) */
export async function commitAmend(
  repoPath: string,
  message: string
): Promise<boolean> {
  if (!message.trim()) {
    customMessage.warning("提交信息不能为空");
    return false;
  }
  const result = await errorHandler.wrapAsync(
    () => invoke<void>("git_commit_amend", { path: repoPath, message }),
    { userMessage: "追加提交失败", showToUser: true }
  );
  if (result !== null) {
    customMessage.success("成功追加修改到上次提交");
    await Promise.all([refreshStatus(repoPath), loadRepoOverview(repoPath)]);
    return true;
  }
  return false;
}

/** 在终端中打开仓库目录 */
export async function openTerminal(repoPath: string): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    () => invoke<void>("git_open_terminal", { path: repoPath }),
    { userMessage: "打开系统终端失败", showToUser: true }
  );
  return result !== null;
}
