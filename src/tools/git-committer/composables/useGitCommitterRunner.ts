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
 * Git Committer 业务编排层
 *
 * 封装：刷新状态、暂存/取消暂存、Diff Tab 管理、AI 生成 commit message、提交/推送。
 */

import { invoke } from "@tauri-apps/api/core";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import type { RepoStatus, FileStatus, DiffTab } from "../types";
import { errorHandler } from "./useGitCommitterErrorHandler";
import {
  repositories,
  currentRepoPath,
  currentStatus,
  currentSession,
  repoStatuses,
  isRefreshing,
  setRepoStatus,
  updateCommitDraft,
  autoPullOnSwitchRef,
  autoPushAfterCommitRef,
  aiIncludeUnstagedRef,
  defaultModelRef,
  systemPromptRef,
  switchRepo,
} from "./useGitCommitterState";

const logger = createModuleLogger("git-committer/runner");
const { sendRequest } = useLlmRequest();

// ===== 状态刷新 =====

/** 刷新单个仓库状态 */
export async function refreshStatus(
  repoPath: string
): Promise<RepoStatus | null> {
  if (!repoPath || repoPath === "__panorama__") return null;
  const status = await errorHandler.wrapAsync(
    () => invoke<RepoStatus>("git_get_repo_status", { path: repoPath }),
    { userMessage: "刷新仓库状态失败" }
  );
  if (status) {
    setRepoStatus(repoPath, status);
  }
  return status;
}

/** 并发刷新所有仓库状态 */
export async function refreshAllStatuses(): Promise<void> {
  if (repositories.value.length === 0) return;
  isRefreshing.value = true;
  try {
    await Promise.all(
      repositories.value.map((r) => refreshStatus(r.path).catch(() => null))
    );
  } finally {
    isRefreshing.value = false;
  }
}

/** 刷新当前仓库状态 */
export async function refreshCurrentStatus(): Promise<void> {
  if (!currentRepoPath.value) return;
  await refreshStatus(currentRepoPath.value);
}

// ===== 暂存 / 取消暂存 =====

export async function stageFiles(files: string[]): Promise<void> {
  if (
    !currentRepoPath.value ||
    currentRepoPath.value === "__panorama__" ||
    files.length === 0
  )
    return;
  const ok = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_stage_files", {
        path: currentRepoPath.value,
        files,
      }),
    { userMessage: "暂存文件失败" }
  );
  if (ok !== null) {
    await refreshCurrentStatus();
  }
}

export async function unstageFiles(files: string[]): Promise<void> {
  if (
    !currentRepoPath.value ||
    currentRepoPath.value === "__panorama__" ||
    files.length === 0
  )
    return;
  const ok = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_unstage_files", {
        path: currentRepoPath.value,
        files,
      }),
    { userMessage: "取消暂存失败" }
  );
  if (ok !== null) {
    await refreshCurrentStatus();
  }
}

export async function stageFile(file: string): Promise<void> {
  await stageFiles([file]);
}

export async function unstageFile(file: string): Promise<void> {
  await unstageFiles([file]);
}

// ===== Diff Tab 管理 =====

/** 加载单个文件的 diff 内容 */
export async function loadFileDiff(
  filePath: string,
  isStaged: boolean
): Promise<DiffTab | null> {
  if (!currentRepoPath.value || currentRepoPath.value === "__panorama__")
    return null;
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<[string, string]>("git_get_file_diff", {
        path: currentRepoPath.value,
        filePath,
        isStaged,
      }),
    {
      userMessage: "加载文件差异失败",
      showToUser: false,
    }
  );
  if (!result) {
    // 二进制文件等情况：返回降级 Tab
    return {
      path: filePath,
      isStaged,
      original: "",
      modified: "",
      isBinary: true,
      loading: false,
    };
  }
  return {
    path: filePath,
    isStaged,
    original: result[0],
    modified: result[1],
    isBinary: false,
    loading: false,
  };
}

/** 打开或激活一个 Diff 标签页 */
export async function openDiffTab(
  filePath: string,
  isStaged: boolean
): Promise<void> {
  const session = currentSession.value;
  // 已存在则仅激活
  const existing = session.openTabs.find(
    (t) => t.path === filePath && t.isStaged === isStaged
  );
  if (existing) {
    session.activeTabPath = buildTabKey(filePath, isStaged);
    return;
  }
  session.openTabs.push({ path: filePath, isStaged });
  session.activeTabPath = buildTabKey(filePath, isStaged);
}

/** 关闭一个 Diff 标签页 */
export function closeDiffTab(filePath: string, isStaged: boolean): void {
  const session = currentSession.value;
  const key = buildTabKey(filePath, isStaged);
  session.openTabs = session.openTabs.filter(
    (t) => !(t.path === filePath && t.isStaged === isStaged)
  );
  if (session.activeTabPath === key) {
    session.activeTabPath = session.openTabs[0]
      ? buildTabKey(session.openTabs[0].path, session.openTabs[0].isStaged)
      : "";
  }
}

/** 构造 Tab 唯一键 */
function buildTabKey(filePath: string, isStaged: boolean): string {
  return `${isStaged ? "S" : "W"}:${filePath}`;
}

// ===== 提交 / 推送 / 拉取 =====

/** 执行提交 */
export async function executeCommit(
  message: string,
  pushAfter: boolean = false
): Promise<boolean> {
  if (!currentRepoPath.value || currentRepoPath.value === "__panorama__")
    return false;
  if (!message.trim()) {
    customMessage.warning("提交信息不能为空");
    return false;
  }
  const ok = await errorHandler.wrapAsync(
    () =>
      invoke<void>("git_commit", {
        path: currentRepoPath.value,
        message,
      }),
    { userMessage: "提交失败" }
  );
  if (ok === null) return false;

  customMessage.success("提交成功");
  updateCommitDraft("");
  await refreshCurrentStatus();

  if (pushAfter) {
    await pushCurrent();
  }
  return true;
}

/** 推送当前仓库 */
export async function pushCurrent(): Promise<boolean> {
  if (!currentRepoPath.value || currentRepoPath.value === "__panorama__")
    return false;
  const ok = await errorHandler.wrapAsync(
    () => invoke<void>("git_push", { path: currentRepoPath.value }),
    { userMessage: "推送失败" }
  );
  if (ok !== null) {
    customMessage.success("推送成功");
    await refreshCurrentStatus();
    return true;
  }
  return false;
}

/** 拉取当前仓库 */
export async function pullCurrent(): Promise<boolean> {
  if (!currentRepoPath.value || currentRepoPath.value === "__panorama__")
    return false;
  const ok = await errorHandler.wrapAsync(
    () => invoke<void>("git_pull", { path: currentRepoPath.value }),
    { userMessage: "拉取失败" }
  );
  if (ok !== null) {
    customMessage.success("拉取成功");
    await refreshCurrentStatus();
    return true;
  }
  return false;
}
/** 切换仓库（带可选的自动拉取） */
export async function switchRepoWithAutoPull(path: string): Promise<void> {
  if (path === currentRepoPath.value) return;
  switchRepo(path);
  if (path === "__panorama__") return;
  if (autoPullOnSwitchRef.value) {
    await pullCurrent();
  }
  await refreshStatus(path);
}

// ===== AI 生成 Commit Message =====

/** 当前需提交的文件列表（staged 优先，可选包含 unstaged） */
export function getCommitCandidateFiles(): {
  files: FileStatus[];
  isStaged: boolean;
} {
  const status = currentStatus.value;
  if (!status) return { files: [], isStaged: false };

  if (status.staged.length > 0) {
    return { files: status.staged, isStaged: true };
  }
  if (aiIncludeUnstagedRef.value && status.unstaged.length > 0) {
    return { files: status.unstaged, isStaged: false };
  }
  return { files: [], isStaged: false };
}

/** 组装当前候选文件的 diff 文本（用于 LLM Prompt） */
export async function buildDiffPrompt(): Promise<string | null> {
  const { files, isStaged } = getCommitCandidateFiles();
  if (files.length === 0) {
    customMessage.warning("没有可生成提交信息的文件变更");
    return null;
  }

  const parts: string[] = [];
  for (const f of files) {
    if (f.isBinary) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    const diff = await loadFileDiff(f.path, isStaged);
    if (!diff || diff.isBinary) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    // 简易 diff 文本：仅展示修改后内容片段（避免完整 patch 过长）
    parts.push(
      `### ${f.path} (${f.status})\n--- original ---\n${diff.original}\n--- modified ---\n${diff.modified}`
    );
  }
  return parts.join("\n\n");
}

/** 调用 LLM 流式生成 commit message */
export async function generateCommitMessage(
  onStream: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string | null> {
  const combo = defaultModelRef.value;
  const [profileId, modelId] = parseModelCombo(combo);
  if (!profileId || !modelId) {
    customMessage.warning("请先在设置中选择 AI 模型");
    return null;
  }

  const diffText = await buildDiffPrompt();
  if (!diffText) return null;

  const systemPrompt = systemPromptRef.value;
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `gc-${Date.now()}`;

  try {
    const response = await sendRequest({
      profileId,
      modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: diffText },
      ],
      stream: true,
      onStream: (chunk: string) => onStream(chunk),
      signal,
      requestId,
      inspectorContext: {
        toolName: "git-committer",
        purpose: "generate-commit-message",
      },
    } as any);
    return response?.content || null;
  } catch (error) {
    logger.error("AI 生成提交信息失败", error as Error);
    customMessage.error("AI 生成提交信息失败");
    return null;
  }
}

// 重新导出常用 state，方便组件统一引用
export {
  repositories,
  currentRepoPath,
  currentStatus,
  currentSession,
  repoStatuses,
  isRefreshing,
  autoPullOnSwitchRef,
  autoPushAfterCommitRef,
  aiIncludeUnstagedRef,
  defaultModelRef,
  systemPromptRef,
};

