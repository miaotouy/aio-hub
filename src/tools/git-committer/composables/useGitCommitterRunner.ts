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
import type { RepoStatus, FileStatus, DiffTab } from "../types";
import { errorHandler } from "./useGitCommitterErrorHandler";
import {
  repositories,
  currentRepoPath,
  currentSession,
  repoStatuses,
  isRefreshing,
  setRepoStatus,
  updateCommitDraft,
  autoPullOnSwitch,
  aiIncludeUnstaged,
  defaultModel,
  systemPrompt,
  switchRepo,
} from "./useGitCommitterState";

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

export async function stageFiles(
  repoPath: string,
  files: string[]
): Promise<void> {
  if (!repoPath || repoPath === "__panorama__" || files.length === 0) return;

  // 乐观更新：在请求发送前，立即在前端将文件从 unstaged 移到 staged
  const status = repoStatuses.value[repoPath];
  const backupStaged = status ? [...status.staged] : [];
  const backupUnstaged = status ? [...status.unstaged] : [];

  if (status) {
    const filesSet = new Set(files);
    const movingFiles = status.unstaged.filter((f) => filesSet.has(f.path));
    status.unstaged = status.unstaged.filter((f) => !filesSet.has(f.path));
    status.staged = [...status.staged, ...movingFiles];
  }

  const ok = await errorHandler.wrapAsync(
    async () => {
      await invoke<void>("git_stage_files", {
        path: repoPath,
        files,
      });
      return true;
    },
    { userMessage: "暂存文件失败" }
  );

  if (ok) {
    // 后端成功，刷新真实状态
    await refreshStatus(repoPath);
  } else {
    // 后端失败，回滚状态
    if (status) {
      status.staged = backupStaged;
      status.unstaged = backupUnstaged;
    }
  }
}

export async function unstageFiles(
  repoPath: string,
  files: string[]
): Promise<void> {
  if (!repoPath || repoPath === "__panorama__" || files.length === 0) return;

  // 乐观更新：在请求发送前，立即在前端将文件从 staged 移到 unstaged
  const status = repoStatuses.value[repoPath];
  const backupStaged = status ? [...status.staged] : [];
  const backupUnstaged = status ? [...status.unstaged] : [];

  if (status) {
    const filesSet = new Set(files);
    const movingFiles = status.staged.filter((f) => filesSet.has(f.path));
    status.staged = status.staged.filter((f) => !filesSet.has(f.path));
    status.unstaged = [...status.unstaged, ...movingFiles];
  }

  const ok = await errorHandler.wrapAsync(
    async () => {
      await invoke<void>("git_unstage_files", {
        path: repoPath,
        files,
      });
      return true;
    },
    { userMessage: "取消暂存失败" }
  );

  if (ok) {
    // 后端成功，刷新真实状态
    await refreshStatus(repoPath);
  } else {
    // 后端失败，回滚状态
    if (status) {
      status.staged = backupStaged;
      status.unstaged = backupUnstaged;
    }
  }
}

export async function stageFile(repoPath: string, file: string): Promise<void> {
  await stageFiles(repoPath, [file]);
}

export async function unstageFile(
  repoPath: string,
  file: string
): Promise<void> {
  await unstageFiles(repoPath, [file]);
}

// ===== Diff Tab 管理 =====

/** 加载单个文件的 diff 内容 */
export async function loadFileDiff(
  repoPath: string,
  filePath: string,
  isStaged: boolean
): Promise<DiffTab | null> {
  if (!repoPath || repoPath === "__panorama__") return null;
  const result = await errorHandler.wrapAsync(
    () =>
      invoke<[string, string]>("git_get_file_diff", {
        path: repoPath,
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
  repoPath: string,
  message: string,
  pushAfter: boolean = false
): Promise<boolean> {
  if (!repoPath || repoPath === "__panorama__") return false;
  if (!message.trim()) {
    customMessage.warning("提交信息不能为空");
    return false;
  }
  const ok = await errorHandler.wrapAsync(
    async () => {
      await invoke<void>("git_commit", {
        path: repoPath,
        message,
      });
      return true;
    },
    { userMessage: "提交失败" }
  );
  if (!ok) return false;

  customMessage.success(`提交成功: ${repoPath.split(/[/\\]/).pop()}`);
  if (repoPath === currentRepoPath.value) {
    updateCommitDraft("");
  }
  await refreshStatus(repoPath);

  if (pushAfter) {
    await pushRepo(repoPath);
  }
  return true;
}

/** 推送指定仓库 */
export async function pushRepo(repoPath: string): Promise<boolean> {
  if (!repoPath || repoPath === "__panorama__") return false;
  const ok = await errorHandler.wrapAsync(
    async () => {
      await invoke<void>("git_push", { path: repoPath });
      return true;
    },
    { userMessage: "推送失败" }
  );
  if (ok) {
    customMessage.success("推送成功");
    await refreshStatus(repoPath);
    return true;
  }
  return false;
}

/** 拉取指定仓库 */
export async function pullRepo(repoPath: string): Promise<boolean> {
  if (!repoPath || repoPath === "__panorama__") return false;
  const ok = await errorHandler.wrapAsync(
    async () => {
      await invoke<void>("git_pull", { path: repoPath });
      return true;
    },
    { userMessage: "拉取失败" }
  );
  if (ok) {
    customMessage.success("拉取成功");
    await refreshStatus(repoPath);
    return true;
  }
  return false;
}

/** 切换仓库（带可选的自动拉取） */
export async function switchRepoWithAutoPull(path: string): Promise<void> {
  if (path === currentRepoPath.value) return;
  switchRepo(path);
  if (path === "__panorama__") return;
  if (autoPullOnSwitch.value) {
    await pullRepo(path);
  }
  await refreshStatus(path);
}

// ===== AI 生成 Commit Message =====

/** 获取指定仓库需提交的文件列表（staged 优先，可选包含 unstaged） */
export function getCommitCandidateFiles(repoPath: string): {
  files: FileStatus[];
  isStaged: boolean;
} {
  const status = repoStatuses.value[repoPath];
  if (!status) return { files: [], isStaged: false };

  if (status.staged.length > 0) {
    return { files: status.staged, isStaged: true };
  }
  if (aiIncludeUnstaged.value && status.unstaged.length > 0) {
    return { files: status.unstaged, isStaged: false };
  }
  return { files: [], isStaged: false };
}

/** 组装指定仓库候选文件的 diff 文本（用于 LLM Prompt） */
export async function buildDiffPrompt(
  repoPath: string
): Promise<string | null> {
  const { files, isStaged } = getCommitCandidateFiles(repoPath);
  if (files.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const f of files) {
    if (f.isBinary) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    const diff = await loadFileDiff(repoPath, f.path, isStaged);
    if (!diff || diff.isBinary) {
      parts.push(`### ${f.path}\n[二进制文件，无文本差异]`);
      continue;
    }
    parts.push(
      `### ${f.path} (${f.status})\n--- original ---\n${diff.original}\n--- modified ---\n${diff.modified}`
    );
  }
  return parts.join("\n\n");
}

/** 调用 LLM 流式生成指定仓库的 commit message */
export async function generateCommitMessage(
  repoPath: string,
  onStream: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string | null> {
  const combo = defaultModel.value;
  const [profileId, modelId] = parseModelCombo(combo);
  if (!profileId || !modelId) {
    customMessage.warning("请先在设置中选择 AI 模型");
    return null;
  }

  const diffText = await buildDiffPrompt(repoPath);
  if (!diffText) {
    customMessage.warning("没有可生成提交信息的文件变更");
    return null;
  }

  const systemPromptText = systemPrompt.value;
  const requestId = `gc-${repoPath.split(/[/\\]/).pop()}-${Date.now()}`;

  try {
    const response = await sendRequest({
      profileId,
      modelId,
      messages: [
        { role: "system", content: systemPromptText },
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
    errorHandler.error(
      error,
      `AI 生成提交信息失败: ${repoPath.split(/[/\\]/).pop()}`
    );
    return null;
  }
}

// ===== 全局一键操作 (全景模式下沉逻辑) =====

/** 一键暂存所有活跃仓库 */
export async function stageAllRepos(
  activeRepos: { path: string }[]
): Promise<void> {
  await Promise.all(
    activeRepos.map(async (repo) => {
      const status = repoStatuses.value[repo.path];
      if (!status) return;
      const files = status.unstaged.map((f) => f.path);
      if (files.length > 0) {
        await stageFiles(repo.path, files);
      }
    })
  );
}

/** 一键取消暂存所有活跃仓库 */
export async function unstageAllRepos(
  activeRepos: { path: string }[]
): Promise<void> {
  await Promise.all(
    activeRepos.map(async (repo) => {
      const status = repoStatuses.value[repo.path];
      if (!status) return;
      const files = status.staged.map((f) => f.path);
      if (files.length > 0) {
        await unstageFiles(repo.path, files);
      }
    })
  );
}

/** 一键推送所有有未推送提交的仓库 */
export async function pushAllRepos(): Promise<number> {
  let successCount = 0;
  for (const repo of repositories.value) {
    const status = repoStatuses.value[repo.path];
    if (status && status.ahead > 0) {
      const ok = await pushRepo(repo.path);
      if (ok) successCount++;
    }
  }
  return successCount;
}
