import { ref, computed } from 'vue';
import type { GitCommit, GitBranch, RepoStatistics } from '../types';

/**
 * Git 分析器状态管理 Composable
 * 
 * 提供去中心化的状态管理，UI 和业务逻辑可以按需组合使用
 * 不再使用中心化的 Context 类
 */
export function useGitAnalyzerState() {
  // ==================== 仓库基础状态 ====================
  const loading = ref(false);
  const repoPath = ref('');
  const selectedBranch = ref('main');
  const branches = ref<GitBranch[]>([]);

  // ==================== 提交数据 ====================
  const commits = ref<GitCommit[]>([]);
  const filteredCommits = ref<GitCommit[]>([]);

  // ==================== 加载配置 ====================
  const limitCount = ref(100);
  const batchSize = ref(20);
  const commitRange = ref<[number, number]>([0, 0]);

  // ==================== 筛选状态 ====================
  const searchQuery = ref('');
  const dateRange = ref<[Date, Date] | null>(null);
  const authorFilter = ref('');
  const reverseOrder = ref(false);
  const commitTypeFilter = ref<string[]>([]);

  // ==================== 分页状态 ====================
  const currentPage = ref(1);
  const pageSize = ref(20);

  // ==================== 增量加载状态 ====================
  const lastLoadedRepo = ref('');
  const lastLoadedBranch = ref('');
  const lastLoadedLimit = ref(0);

  // ==================== 进度状态 ====================
  const progress = ref({
    loading: false,
    loaded: 0,
    total: 0,
  });

  // ==================== 计算属性 - 统计信息 ====================
  const statistics = computed<RepoStatistics>(() => {
    const commits = filteredCommits.value;
    if (commits.length === 0) {
      return {
        totalCommits: 0,
        contributors: 0,
        timeSpan: 0,
        averagePerDay: 0,
      };
    }

    const authors = new Set(commits.map((c) => c.author));
    const dates = commits.map((c) => new Date(c.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      totalCommits: commits.length,
      contributors: authors.size,
      timeSpan: days,
      averagePerDay: commits.length / Math.max(days, 1),
    };
  });

  // ==================== 计算属性 - 分页后的提交列表 ====================
  const paginatedCommits = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return filteredCommits.value.slice(start, end);
  });

  // ==================== 状态重置方法 ====================

  /**
   * 重置进度状态
   */
  function resetProgress() {
    progress.value = {
      loading: false,
      loaded: 0,
      total: 0,
    };
  }

  /**
   * 重置筛选条件
   */
  function resetFilters() {
    searchQuery.value = '';
    dateRange.value = null;
    authorFilter.value = '';
    reverseOrder.value = false;
    commitTypeFilter.value = [];
    currentPage.value = 1;
  }

  /**
   * 重置所有提交数据
   */
  function resetCommits() {
    commits.value = [];
    filteredCommits.value = [];
    commitRange.value = [0, 0];
  }

  // ==================== 返回接口 ====================

  return {
    // 状态
    loading,
    repoPath,
    selectedBranch,
    branches,
    commits,
    filteredCommits,
    limitCount,
    batchSize,
    commitRange,
    searchQuery,
    dateRange,
    authorFilter,
    reverseOrder,
    commitTypeFilter,
    currentPage,
    pageSize,
    lastLoadedRepo,
    lastLoadedBranch,
    lastLoadedLimit,
    progress,
    
    // 计算属性
    statistics,
    paginatedCommits,
    
    // 方法
    resetProgress,
    resetFilters,
    resetCommits,
  };
}