/**
 * Git 分析器类型定义
 */

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
}

export interface CommitStats {
  additions: number;
  deletions: number;
  files: number;
}

export interface FileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  full_message?: string;
  parents?: string[];
  tags?: string[];
  branches?: string[];
  stats?: CommitStats;
  files?: FileChange[];
}

export type CommitFrequencyGranularity = "day" | "week" | "month" | "year";

export interface ExportConfig {
  format: "markdown" | "json" | "csv" | "html" | "text";
  includeStatistics: boolean;
  includeCommits: boolean;
  includeContributors: boolean;
  includeTimeline: boolean;
  includeCharts: boolean;
  commitRange: "all" | "filtered" | "custom";
  customCount: number;
  dateFormat: "iso" | "local" | "relative" | "timestamp";
  includeAuthor: boolean;
  includeEmail: boolean;
  includeFullMessage: boolean;
  includeFiles: boolean;
  includeTags: boolean;
  includeBranches: boolean;
  includeStats: boolean;
  includeFilterInfo: boolean;
  htmlTheme: "light" | "dark" | "auto";
}

export interface RepoStatistics {
  totalCommits: number;
  contributors: number;
  timeSpan: number;
  averagePerDay: number;
}

export interface GitLoadConfig {
  includeFilePaths: boolean;
  includeLineStats: boolean;
  includeBranchInference: boolean;
}

export interface ExportPreset {
  id: string;
  name: string;
  repoPath: string; // 绑定的仓库路径，为空表示全局通用
  config: ExportConfig;
}
