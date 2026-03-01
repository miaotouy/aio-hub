import { ref, computed } from "vue";
import type { GitCommit, GitBranch, RepoStatistics, ExportConfig } from "../types";
import { commitCache } from "./useCommitCache";

// ==================== 单例状态（模块级别）====================
// 将所有状态定义在模块级别，确保所有调用使用同一个实例

const loading = ref(false);
const repoPath = ref("");
const selectedBranch = ref("main");
const branches = ref<GitBranch[]>([]);

const commits = ref<GitCommit[]>([]);
const filteredCommits = ref<GitCommit[]>([]);

const limitCount = ref(100);
const batchSize = ref(20);
const includeFiles = ref(true);
const commitRange = ref<[number, number]>([0, 0]);

const searchQuery = ref("");
const dateRange = ref<[Date, Date] | null>(null);
const authorFilter = ref("");
const reverseOrder = ref(false);
const commitTypeFilter = ref<string[]>([]);

const currentPage = ref(1);
const pageSize = ref(20);

// 导出配置
const exportConfig = ref<ExportConfig>({
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
  includeStats: true,
  includeFilterInfo: true,
  htmlTheme: "light",
});

const lastLoadedRepo = ref("");
const lastLoadedBranch = ref("");
const lastLoadedLimit = ref(0);

const loadingFiles = ref(false);

const progress = ref({
  loading: false,
  loaded: 0,
  total: 0,
});

// ==================== 计算属性 ====================

const hasActiveFilters = computed(() => {
  return !!(searchQuery.value || dateRange.value || authorFilter.value || commitTypeFilter.value.length > 0);
});

const filterSummary = computed(() => {
  const parts: string[] = [];
  if (searchQuery.value) {
    parts.push(`关键词: "${searchQuery.value}"`);
  }
  if (authorFilter.value) {
    parts.push(`作者: "${authorFilter.value}"`);
  }
  if (dateRange.value) {
    const [start, end] = dateRange.value;
    // 格式化日期为 YYYY-MM-DD
    const formatDate = (d: Date | string) => {
      const date = typeof d === "string" ? new Date(d) : d;
      return date.toISOString().split("T")[0];
    };
    parts.push(`日期: ${formatDate(start)} 至 ${formatDate(end)}`);
  }
  if (commitTypeFilter.value.length > 0) {
    parts.push(`类型: ${commitTypeFilter.value.join(", ")}`);
  }

  if (parts.length === 0) {
    return "当前未应用任何筛选条件。";
  }
  return `已应用的筛选条件: ${parts.join("; ")}。`;
});

const statistics = computed<RepoStatistics>(() => {
  const commitsValue = filteredCommits.value;
  if (commitsValue.length === 0) {
    return {
      totalCommits: 0,
      contributors: 0,
      timeSpan: 0,
      averagePerDay: 0,
    };
  }

  const authors = new Set(commitsValue.map((c) => c.author));
  const dates = commitsValue.map((c) => new Date(c.date).getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    totalCommits: commitsValue.length,
    contributors: authors.size,
    timeSpan: days,
    averagePerDay: commitsValue.length / Math.max(days, 1),
  };
});

const paginatedCommits = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredCommits.value.slice(start, end);
});

// ==================== 状态重置方法 ====================

function resetProgress() {
  progress.value = {
    loading: false,
    loaded: 0,
    total: 0,
  };
}

function resetFilters() {
  searchQuery.value = "";
  dateRange.value = null;
  authorFilter.value = "";
  reverseOrder.value = false;
  commitTypeFilter.value = [];
  currentPage.value = 1;
}

function resetCommits() {
  commits.value = [];
  filteredCommits.value = [];
  commitRange.value = [0, 0];
  commitCache.clearAll();
}

/**
 * Git 分析器状态管理 Composable
 *
 * 采用单例模式，所有状态都定义在模块级别
 * 确保无论在哪里调用，都使用同一个状态实例
 */
export function useGitAnalyzerState() {
  return {
    // 状态
    loading,
    loadingFiles,
    repoPath,
    selectedBranch,
    branches,
    commits,
    filteredCommits,
    limitCount,
    batchSize,
    includeFiles,
    commitRange,
    searchQuery,
    dateRange,
    authorFilter,
    reverseOrder,
    commitTypeFilter,
    currentPage,
    pageSize,
    exportConfig,
    lastLoadedRepo,
    lastLoadedBranch,
    lastLoadedLimit,
    progress,

    // 计算属性
    statistics,
    paginatedCommits,
    hasActiveFilters,
    filterSummary,

    // 方法
    resetProgress,
    resetFilters,
    resetCommits,
  };
}
