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
 * Git Committer (AI 提交助手) 前端类型定义
 */

/** 仓库配置 */
export interface RepositoryConfig {
  /** 仓库绝对路径 */
  path: string;
  /** 仓库名（目录名） */
  name: string;
  /** 别名（用户自定义） */
  alias?: string;
}

/** 单个仓库的会话记忆 */
export interface RepoSession {
  /** 已打开的 Diff 标签页 */
  openTabs: { path: string; isStaged: boolean }[];
  /** 当前激活的 Tab 文件路径 */
  activeTabPath: string;
  /** Commit Message 草稿 */
  commitDraft: string;
}

/** 文件状态短格式："M" | "A" | "D" | "U" | "R" | "C" | "T" */
export type FileStatusShort = "M" | "A" | "D" | "U" | "R" | "C" | "T";

/** 单个文件的状态（与后端 `FileStatus` 对齐） */
export interface FileStatus {
  path: string;
  status: string;
  isBinary: boolean;
}

/** 仓库整体状态（与后端 `RepoStatus` 对齐） */
export interface RepoStatus {
  branch: string;
  staged: FileStatus[];
  unstaged: FileStatus[];
  ahead: number;
  behind: number;
}

/** Git Committer 全局配置（持久化） */
export interface GitCommitterConfig {
  repositories: RepositoryConfig[];
  currentRepoPath: string;
  sidebarWidth: number;
  rightSidebarWidth: number;
  isRightSidebarExpanded: boolean;
  /** 仓库栏是否固定展开 */
  isRepoBarPinned: boolean;
  repoSessions: Record<string, RepoSession>;
  // 设置项
  autoPushAfterCommit: boolean;
  autoPullOnSwitch: boolean;
  aiIncludeUnstaged: boolean;
  /** 默认 AI 模型（profileId:modelId 组合） */
  defaultModel: string;
  systemPrompt: string;
  /** 是否启用自动刷新 */
  enableAutoRefresh: boolean;
  /** 自动刷新间隔（秒） */
  autoRefreshInterval: number;
}

/** Diff 标签页运行时态 */
export interface DiffTab {
  path: string;
  isStaged: boolean;
  original: string;
  modified: string;
  isBinary: boolean;
  loading: boolean;
}

