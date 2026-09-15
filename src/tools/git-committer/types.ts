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
  /** 仓库专属 AI System Prompt；未设置或为空时继承全局提示词 */
  systemPrompt?: string;
  /** 仓库图标背景色（#RRGGBB）；未设置时使用色盘自动分配的随机色 */
  color?: string;
}

/** 已打开的 Diff 标签页引用（可持久化） */
export interface DiffTabRef {
  path: string;
  isStaged: boolean;
  /** 提交来源：非空表示该标签查看某次提交的文件差异或提交总览 */
  commitHash?: string;
}

/** 单个仓库的会话记忆 */
export interface RepoSession {
  /** 已打开的 Diff 标签页 */
  openTabs: DiffTabRef[];
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

/** 单仓库工作流运行时状态（不持久化，按仓库隔离） */
export interface RepoWorkflowState {
  isPulling: boolean;
  isPushing: boolean;
  isGenerating: boolean;
  isCommitting: boolean;
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
  /** Diff 是否默认折叠未更改区域 */
  hideUnchangedRegions: boolean;
  repoSessions: Record<string, RepoSession>;
  // 设置项
  autoPushAfterCommit: boolean;
  autoPullOnSwitch: boolean;
  aiIncludeUnstaged: boolean;
  /** 默认 AI 模型（profileId:modelId 组合） */
  defaultModel: string;
  /** AI 生成提交信息时使用的语言 */
  commitLanguage: string;
  systemPrompt: string;
  /** 是否启用自动刷新 */
  enableAutoRefresh: boolean;
  /** 自动刷新间隔（秒） */
  autoRefreshInterval: number;
  /** 仓库图标候选色盘；为空时回退内置默认色板 */
  repoAvatarPalette: string[];
}

/** 提交行级统计（与后端 `CommitStats` 对齐） */
export interface CommitStats {
  additions: number;
  deletions: number;
  files: number;
}

/** 提交文件变更（与后端 `FileChange` 对齐） */
export interface CommitFileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

/** 提交摘要（与后端 `GitCommit` 对齐，详情字段按需惰性加载） */
export interface GitCommitSummary {
  hash: string;
  author: string;
  email: string;
  date: string;
  /** 提交标题（首行） */
  message: string;
  /** 完整提交信息：标题 + 正文 */
  full_message?: string;
  parents?: string[];
  tags?: string[];
  branches?: string[];
  stats?: CommitStats | null;
  files?: CommitFileChange[] | null;
}

/** 提交中单个文件相对父提交的文本差异（与后端 `CommitFileDiff` 对齐） */
export interface CommitFileDiff {
  path: string;
  original: string;
  modified: string;
  isBinary: boolean;
}

/** Diff 标签页运行时态 */
export interface DiffTab {
  path: string;
  isStaged: boolean;
  /** 提交来源：非空表示该标签来自某次提交 */
  commitHash?: string;
  original: string;
  modified: string;
  isBinary: boolean;
  loading: boolean;
  /** 加载失败时的错误信息 */
  error?: string;
}
