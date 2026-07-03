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

import { createConfigManager } from "../../../utils/configManager";
import type { CommitFrequencyGranularity, ExportPreset } from "../types";

/**
 * Git 分析器配置接口
 */
export interface GitAnalyzerConfig {
  version: string;
  // 基本设置
  repoPath: string;
  selectedBranch: string;
  limitCount: number;
  batchSize: number;
  activeTab: string;
  pageSize: number;

  // 筛选器设置
  searchQuery: string;
  excludeQuery: string;
  dateRange: [string, string] | null;
  authorFilter: string;
  commitRange: [number, number];
  reverseOrder: boolean;
  commitTypeFilter: string[];
  frequencyGranularity: CommitFrequencyGranularity;

  // 导出配置
  exportConfig: {
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
  };

  // 导出预设
  exportPresets?: ExportPreset[];
  // 仓库上次使用的预设 ID
  repoLastPreset?: Record<string, string>;
}

/**
 * 创建默认配置
 */
function createDefaultConfig(): GitAnalyzerConfig {
  return {
    version: "1.0.0",
    // 基本设置
    repoPath: "",
    selectedBranch: "main",
    limitCount: 100,
    batchSize: 20,
    activeTab: "list",
    pageSize: 20,

    // 筛选器设置
    searchQuery: "",
    excludeQuery: "",
    dateRange: null,
    authorFilter: "",
    commitRange: [0, 0],
    reverseOrder: false,
    commitTypeFilter: [],
    frequencyGranularity: "day",

    // 导出配置
    exportConfig: {
      format: "markdown",
      includeStatistics: true,
      includeCommits: true,
      includeContributors: true,
      includeTimeline: false,
      includeCharts: false,
      commitRange: "filtered",
      customCount: 100,
      dateFormat: "local",
      includeAuthor: true,
      includeEmail: false,
      includeFullMessage: false,
      includeFiles: false,
      includeTags: true,
      includeBranches: true,
      includeStats: false,
      includeFilterInfo: true,
      htmlTheme: "auto",
    },

    // 默认预设
    exportPresets: [
      {
        id: "preset-default-markdown",
        name: "默认 Markdown 报告",
        repoPath: "",
        config: {
          format: "markdown",
          includeStatistics: true,
          includeCommits: true,
          includeContributors: true,
          includeTimeline: false,
          includeCharts: false,
          commitRange: "filtered",
          customCount: 100,
          dateFormat: "local",
          includeAuthor: true,
          includeEmail: false,
          includeFullMessage: false,
          includeFiles: false,
          includeTags: true,
          includeBranches: true,
          includeStats: false,
          includeFilterInfo: true,
          htmlTheme: "auto",
        },
      },
      {
        id: "preset-brief-json",
        name: "简要 JSON 数据",
        repoPath: "",
        config: {
          format: "json",
          includeStatistics: true,
          includeCommits: true,
          includeContributors: false,
          includeTimeline: false,
          includeCharts: false,
          commitRange: "filtered",
          customCount: 100,
          dateFormat: "iso",
          includeAuthor: true,
          includeEmail: true,
          includeFullMessage: true,
          includeFiles: false,
          includeTags: false,
          includeBranches: false,
          includeStats: false,
          includeFilterInfo: false,
          htmlTheme: "auto",
        },
      },
      {
        id: "preset-full-html",
        name: "完整 HTML 报告",
        repoPath: "",
        config: {
          format: "html",
          includeStatistics: true,
          includeCommits: true,
          includeContributors: true,
          includeTimeline: true,
          includeCharts: true,
          commitRange: "filtered",
          customCount: 100,
          dateFormat: "local",
          includeAuthor: true,
          includeEmail: true,
          includeFullMessage: true,
          includeFiles: true,
          includeTags: true,
          includeBranches: true,
          includeStats: true,
          includeFilterInfo: true,
          htmlTheme: "auto",
        },
      },
    ],
    repoLastPreset: {},
  };
}

/**
 * Git 分析器配置管理器
 */
export const gitAnalyzerConfigManager = createConfigManager<GitAnalyzerConfig>({
  moduleName: "git-analyzer",
  fileName: "config.json",
  version: "1.0.0",
  createDefault: createDefaultConfig,
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 深度合并导出配置
    const mergedExportConfig = {
      ...defaultConfig.exportConfig,
      ...loadedConfig.exportConfig,
    };

    return {
      ...defaultConfig,
      ...loadedConfig,
      exportConfig: mergedExportConfig,
      exportPresets: loadedConfig.exportPresets || defaultConfig.exportPresets,
      repoLastPreset:
        loadedConfig.repoLastPreset || defaultConfig.repoLastPreset,
      version: defaultConfig.version,
    };
  },
});

/**
 * 保存配置的防抖函数
 */
export const debouncedSaveConfig = gitAnalyzerConfigManager.saveDebounced;
