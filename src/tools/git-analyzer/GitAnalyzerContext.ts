import { ref, computed } from "vue";
import type { GitCommit, GitBranch, RepoStatistics } from "./types";

/**
 * Git 分析器上下文
 * 集中管理所有响应式状态
 */
export class GitAnalyzerContext {
  // ==================== 仓库基础状态 ====================
  public readonly loading = ref(false);
  public readonly repoPath = ref("");
  public readonly selectedBranch = ref("main");
  public readonly branches = ref<GitBranch[]>([]);

  // ==================== 提交数据 ====================
  public readonly commits = ref<GitCommit[]>([]);
  public readonly filteredCommits = ref<GitCommit[]>([]);

  // ==================== 加载配置 ====================
  public readonly limitCount = ref(100);
  public readonly batchSize = ref(20);
  public readonly commitRange = ref<[number, number]>([0, 0]);

  // ==================== 筛选状态 ====================
  public readonly searchQuery = ref("");
  public readonly dateRange = ref<[Date, Date] | null>(null);
  public readonly authorFilter = ref("");
  public readonly reverseOrder = ref(false);
  public readonly commitTypeFilter = ref<string[]>([]);

  // ==================== 分页状态 ====================
  public readonly currentPage = ref(1);
  public readonly pageSize = ref(20);

  // ==================== 增量加载状态 ====================
  public readonly lastLoadedRepo = ref("");
  public readonly lastLoadedBranch = ref("");
  public readonly lastLoadedLimit = ref(0);

  // ==================== 进度状态 ====================
  public readonly progress = ref({
    loading: false,
    loaded: 0,
    total: 0,
  });

  // ==================== 计算属性 - 统计信息 ====================
  public readonly statistics = computed<RepoStatistics>(() => {
    const commits = this.filteredCommits.value;
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
  public readonly paginatedCommits = computed(() => {
    const start = (this.currentPage.value - 1) * this.pageSize.value;
    const end = start + this.pageSize.value;
    return this.filteredCommits.value.slice(start, end);
  });

  // ==================== 状态重置方法 ====================

  /**
   * 重置进度状态
   */
  public resetProgress() {
    this.progress.value = {
      loading: false,
      loaded: 0,
      total: 0,
    };
  }

  /**
   * 重置筛选条件
   */
  public resetFilters() {
    this.searchQuery.value = "";
    this.dateRange.value = null;
    this.authorFilter.value = "";
    this.reverseOrder.value = false;
    this.commitTypeFilter.value = [];
    this.currentPage.value = 1;
  }

  /**
   * 重置所有提交数据
   */
  public resetCommits() {
    this.commits.value = [];
    this.filteredCommits.value = [];
    this.commitRange.value = [0, 0];
  }
}