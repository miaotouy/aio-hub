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
 * Git Committer 全局状态管理与持久化
 *
 * 基于 ConfigManager 进行防抖持久化（默认 500ms），写入
 * `appData/git-committer/config.json`，重启后无缝恢复现场。
 */

import { ref, computed, watch } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type {
  GitCommitterConfig,
  RepositoryConfig,
  RepoSession,
  RepoStatus,
} from "../types";

const logger = createModuleLogger("git-committer/state");

export const DEFAULT_SYSTEM_PROMPT =
  "你是一个专业的 Git 提交信息生成助手。请根据提供的代码差异（diff），生成符合 Conventional Commits 规范的提交信息。请直接输出提交信息，不要包含任何解释或 Markdown 标记。";

const configManager = createConfigManager<GitCommitterConfig>({
  moduleName: "git-committer",
  fileName: "config.json",
  createDefault: () => ({
    repositories: [],
    currentRepoPath: "",
    sidebarWidth: 260,
    rightSidebarWidth: 280,
    isRightSidebarExpanded: true,
    isRepoBarPinned: false,
    repoSessions: {},
    autoPushAfterCommit: false,
    autoPullOnSwitch: false,
    aiIncludeUnstaged: false,
    defaultModel: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    enableAutoRefresh: true,
    autoRefreshInterval: 10,
  }),
});

// ===== 响应式单例状态 =====
export const repositories = ref<RepositoryConfig[]>([]);
export const currentRepoPath = ref<string>("");
export const sidebarWidth = ref<number>(260);
export const rightSidebarWidth = ref<number>(280);
export const isRightSidebarExpanded = ref<boolean>(true);
export const isRepoBarPinned = ref<boolean>(false);
export const repoSessions = ref<Record<string, RepoSession>>({});

// 设置项（也持久化）
export const autoPushAfterCommit = ref<boolean>(false);
export const autoPullOnSwitch = ref<boolean>(false);
export const aiIncludeUnstaged = ref<boolean>(false);
export const defaultModel = ref<string>("");
export const systemPrompt = ref<string>(DEFAULT_SYSTEM_PROMPT);
export const enableAutoRefresh = ref<boolean>(true);
export const autoRefreshInterval = ref<number>(10);

// 运行时状态（不持久化）
export const repoStatuses = ref<Record<string, RepoStatus>>({});
export const isRefreshing = ref<boolean>(false);

// ===== 计算属性 =====
export const currentRepo = computed<RepositoryConfig | null>(() => {
  if (currentRepoPath.value === "__panorama__") {
    return {
      path: "__panorama__",
      name: "全景模式",
      alias: "全景模式",
    };
  }
  return (
    repositories.value.find((r) => r.path === currentRepoPath.value) || null
  );
});

export const currentStatus = computed<RepoStatus | null>(() =>
  currentRepoPath.value
    ? repoStatuses.value[currentRepoPath.value] || null
    : null
);

export const currentSession = computed<RepoSession>(() => {
  const key = currentRepoPath.value;
  if (!key) {
    return { openTabs: [], activeTabPath: "", commitDraft: "" };
  }
  if (!repoSessions.value[key]) {
    repoSessions.value[key] = {
      openTabs: [],
      activeTabPath: "",
      commitDraft: "",
    };
  }
  return repoSessions.value[key];
});

// ===== 持久化加载 =====
let initialized = false;

export async function loadRepositories(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const config = await configManager.load();
  repositories.value = config.repositories || [];
  currentRepoPath.value = config.currentRepoPath || "";
  sidebarWidth.value = config.sidebarWidth ?? 260;
  rightSidebarWidth.value = config.rightSidebarWidth ?? 280;
  isRightSidebarExpanded.value = config.isRightSidebarExpanded ?? true;
  isRepoBarPinned.value = config.isRepoBarPinned ?? false;
  repoSessions.value = config.repoSessions || {};

  // 恢复设置项
  autoPushAfterCommit.value = config.autoPushAfterCommit ?? false;
  autoPullOnSwitch.value = config.autoPullOnSwitch ?? false;
  aiIncludeUnstaged.value = config.aiIncludeUnstaged ?? false;
  defaultModel.value = config.defaultModel ?? "";
  systemPrompt.value = config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  enableAutoRefresh.value = config.enableAutoRefresh ?? true;
  autoRefreshInterval.value = config.autoRefreshInterval ?? 10;

  // 校正 currentRepoPath（可能指向已被删除的仓库，且排除全景模式）
  if (
    currentRepoPath.value &&
    currentRepoPath.value !== "__panorama__" &&
    !repositories.value.some((r) => r.path === currentRepoPath.value)
  ) {
    currentRepoPath.value = repositories.value[0]?.path || "";
  }

  logger.debug("配置已加载", {
    repoCount: repositories.value.length,
    currentRepoPath: currentRepoPath.value,
  });
}

/** 收集当前需要持久化的配置快照 */
function snapshot(): GitCommitterConfig {
  return {
    repositories: repositories.value,
    currentRepoPath: currentRepoPath.value,
    sidebarWidth: sidebarWidth.value,
    rightSidebarWidth: rightSidebarWidth.value,
    isRightSidebarExpanded: isRightSidebarExpanded.value,
    isRepoBarPinned: isRepoBarPinned.value,
    repoSessions: repoSessions.value,
    autoPushAfterCommit: autoPushAfterCommit.value,
    autoPullOnSwitch: autoPullOnSwitch.value,
    aiIncludeUnstaged: aiIncludeUnstaged.value,
    defaultModel: defaultModel.value,
    systemPrompt: systemPrompt.value,
    enableAutoRefresh: enableAutoRefresh.value,
    autoRefreshInterval: autoRefreshInterval.value,
  };
}

/** 触发防抖保存 */
function persist(): void {
  configManager.saveDebounced(snapshot());
}

// 监听所有持久化字段的变化
watch(
  [
    repositories,
    currentRepoPath,
    sidebarWidth,
    rightSidebarWidth,
    isRightSidebarExpanded,
    isRepoBarPinned,
    repoSessions,
    autoPushAfterCommit,
    autoPullOnSwitch,
    aiIncludeUnstaged,
    defaultModel,
    systemPrompt,
    enableAutoRefresh,
    autoRefreshInterval,
  ],
  () => {
    if (initialized) persist();
  },
  { deep: true }
);

// ===== 仓库与 Session 操作 =====

/** 添加仓库 */
export function addRepository(repo: RepositoryConfig): void {
  if (repositories.value.some((r) => r.path === repo.path)) {
    return;
  }
  repositories.value.push(repo);
  if (!currentRepoPath.value) {
    currentRepoPath.value = repo.path;
  }
  persist();
}

/** 移除仓库 */
export function removeRepository(path: string): void {
  repositories.value = repositories.value.filter((r) => r.path !== path);
  delete repoSessions.value[path];
  delete repoStatuses.value[path];
  if (currentRepoPath.value === path) {
    currentRepoPath.value = repositories.value[0]?.path || "";
  }
  persist();
}

/** 切换当前仓库 */
export function switchRepo(path: string): void {
  if (path === currentRepoPath.value) return;
  currentRepoPath.value = path;
  persist();
}

/** 更新单个仓库的状态 */
export function setRepoStatus(path: string, status: RepoStatus): void {
  repoStatuses.value[path] = status;
}

/** 更新当前 commit 草稿（持久化由 repoSessions deep watch 接管） */
export function updateCommitDraft(text: string): void {
  const session = currentSession.value;
  session.commitDraft = text;
}

/** 更新指定仓库的 commit 草稿 */
export function updateRepoCommitDraft(path: string, text: string): void {
  if (!path) return;
  if (!repoSessions.value[path]) {
    repoSessions.value[path] = {
      openTabs: [],
      activeTabPath: "",
      commitDraft: "",
    };
  }
  repoSessions.value[path].commitDraft = text;
}

/** 恢复默认系统提示词 */
export function restoreDefaultSystemPrompt(): void {
  systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
}
