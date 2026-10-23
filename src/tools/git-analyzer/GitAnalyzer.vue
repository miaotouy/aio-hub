<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="git-analyzer">
    <InfoCard title="Git 仓库分析" class="analyzer-card">
      <template #headerExtra>
        <el-button-group>
          <el-button
            :icon="filterControlsCollapsed ? Expand : Fold"
            @click="filterControlsCollapsed = !filterControlsCollapsed"
          >
            {{ filterControlsCollapsed ? "展开筛选" : "收起筛选" }}
          </el-button>
          <el-button :icon="Setting" @click="showLoadConfig = true">
            设置
          </el-button>
          <el-button
            :icon="Refresh"
            @click="refreshRepository"
            :loading="loading"
          >
            刷新
          </el-button>
          <el-button
            :icon="Upload"
            @click="showExportDialog"
            :disabled="commits.length === 0"
          >
            导出
          </el-button>
        </el-button-group>
      </template>

      <div class="analyzer-content">
        <!-- 控制面板 -->
        <ControlPanel
          v-model:repo-path="repoPath"
          v-model:github-repo="githubRepo"
          v-model:repository-source="repositorySource"
          v-model:selected-branch="selectedBranch"
          v-model:limit-count="limitCount"
          v-model:batch-size="batchSize"
          v-model:commit-range="commitRange"
          v-model:search-query="searchQuery"
          v-model:exclude-query="excludeQuery"
          v-model:date-range="dateRange"
          v-model:author-filter="authorFilter"
          v-model:reverse-order="reverseOrder"
          v-model:commit-type-filter="commitTypeFilter"
          :has-active-filters="hasActiveFilters"
          :filter-summary="filterSummary"
          :loading="loading"
          :enriching="enriching"
          :branches="branches"
          :commits="commits"
          :progress="progress"
          :statistics="statistics"
          :controls-collapsed="filterControlsCollapsed"
          :remote-repository-info="githubRepositoryInfo"
          @select-directory="selectDirectory"
          @load-branches="loadBranches"
          @load-repository="loadRepository"
          @branch-change="handleBranchChange"
          @filter-commits="filterCommits"
          @clear-filters="clearFilters"
          @cancel-loading="cancelLoading"
        />

        <!-- 主内容区 -->
        <div class="main-content">
          <el-tabs v-model="activeTab">
            <!-- 提交列表视图 -->
            <el-tab-pane label="提交列表" name="list">
              <CommitListView
                v-model:current-page="currentPage"
                :loading="loading"
                :commits="commits"
                :filtered-commits="filteredCommits"
                :paginated-commits="paginatedCommits"
                :page-size="pageSize"
                @select-commit="selectCommit"
                @set-range-start="handleSetRangeStart"
                @set-range-end="handleSetRangeEnd"
              />
            </el-tab-pane>

            <!-- 图表视图 -->
            <el-tab-pane label="统计图表" name="chart">
              <ChartsView
                ref="chartsViewRef"
                v-model:frequency-granularity="frequencyGranularity"
              />
            </el-tab-pane>

            <el-tab-pane label="工程指标" name="engineering">
              <EngineeringMetricsView
                v-if="activeTab === 'engineering'"
                :commits="filteredCommits"
                :repository-source="repositorySource"
                :loading="loading"
                :enriching="enriching"
                @enrich-data="enrichEngineeringData"
              />
            </el-tab-pane>

            <el-tab-pane label="AI 洞察" name="insights">
              <AiInsightsView
                v-model:model-combo="insightModelCombo"
                :commits="filteredCommits"
              />
            </el-tab-pane>

            <!-- 导出报告视图 -->
            <el-tab-pane
              label="导出报告"
              name="export"
              :disabled="commits.length === 0"
            >
              <ExportModule
                ref="exportModuleRef"
                :commits="commits"
                :filtered-commits="filteredCommits"
                :statistics="statistics"
                :repo-path="activeRepositoryPath"
                :repository-source="repositorySource"
                :branch="selectedBranch"
                :reverse-order="reverseOrder"
                :initial-config="config?.exportConfig"
                @enrich-commits="handleExportEnrich"
                @cancel-enrich="cancelEnrich"
                @update:exportConfig="handleExportConfigUpdate"
              />
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </InfoCard>

    <!-- 提交详情对话框 -->
    <CommitDetailDialog
      v-model:visible="showDetail"
      :selected-commit="selectedCommit"
      :loading="loading"
      :readonly="repositorySource === 'github'"
      @copy-hash="copyCommitHash"
      @update-message="updateCommitMessage"
    />

    <LoadConfigDialog
      v-model:visible="showLoadConfig"
      :config="gitLoadConfig"
      @update:config="updateLoadConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import {
  Expand,
  Fold,
  Refresh,
  Setting,
  Upload,
} from "@element-plus/icons-vue";
import InfoCard from "@components/common/InfoCard.vue";
import ExportModule from "./components/ExportModule.vue";
import ControlPanel from "./components/ControlPanel.vue";
import CommitListView from "./components/CommitListView.vue";
import ChartsView from "./components/ChartsView.vue";
import EngineeringMetricsView from "./components/EngineeringMetricsView.vue";
import AiInsightsView from "./components/AiInsightsView.vue";
import CommitDetailDialog from "./components/CommitDetailDialog.vue";
import LoadConfigDialog from "./components/LoadConfigDialog.vue";
import {
  gitAnalyzerConfigManager,
  debouncedSaveConfig,
  type GitAnalyzerConfig,
} from "./config/config";
import { useGitAnalyzerState } from "./composables/useGitAnalyzerState";
import { useGitAnalyzerRunner } from "./composables/useGitAnalyzerRunner";
import { useCharts } from "./composables/useCharts";
import { useCommitDetail } from "./composables/useCommitDetail";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { CommitFrequencyGranularity } from "./types";
import {
  loadGitHubRepository,
  type GitHubRepositoryInfo,
} from "./data-sources/github";

// 创建模块日志记录器
const errorHandler = createModuleErrorHandler("GitAnalyzer");

// 配置状态
const config = ref<GitAnalyzerConfig | null>(null);
const repositorySource = ref<"local" | "github">("local");
const githubRepo = ref("");
const lastLocalBranch = ref("main");
const insightModelCombo = ref("");
const githubRepositoryInfo = ref<GitHubRepositoryInfo | null>(null);
const remoteAbortController = ref<AbortController | null>(null);

// 使用状态管理 composable
const {
  loading,
  repoPath,
  lastLoadedRepo,
  lastLoadedLimit,
  selectedBranch,
  branches,
  commits,
  filteredCommits,
  limitCount,
  batchSize,
  commitRange,
  searchQuery,
  excludeQuery,
  dateRange,
  authorFilter,
  reverseOrder,
  commitTypeFilter,
  currentPage,
  pageSize,
  exportConfig,
  exportPresets,
  repoLastPreset,
  loadConfig: gitLoadConfig,
  progress,
  enriching,
  statistics,
  paginatedCommits,
  hasActiveFilters,
  filterSummary,
  updateLoadConfig,
  loadPresetsForRepo,
  resetCommits,
} = useGitAnalyzerState();

// 使用运行器（业务编排层）
const {
  selectDirectory,
  loadBranches,
  loadRepository: loadLocalRepository,
  refreshRepository: refreshLocalRepository,
  onBranchChange,
  filterCommits,
  clearFilters,
  cancelLoading: cancelLocalLoading,
  enrichCommits,
  cancelEnrich,
  updateCommitMessage,
} = useGitAnalyzerRunner();

// Charts 视图引用
const chartsViewRef = ref<InstanceType<typeof ChartsView>>();

// 本地状态
const activeTab = ref("list");
const showLoadConfig = ref(false);
const filterControlsCollapsed = ref(false);
const frequencyGranularity = ref<CommitFrequencyGranularity>("day");
const exportModuleRef = ref<InstanceType<typeof ExportModule>>();
const activeRepositoryPath = computed(() =>
  repositorySource.value === "github" ? githubRepo.value : repoPath.value
);

// 计算图表视图是否可见
const isChartTabActive = computed(() => activeTab.value === "chart");

const { updateCharts, setupResizeObserver } = useCharts(
  filteredCommits,
  frequencyGranularity,
  () => {
    return chartsViewRef.value
      ? {
          frequencyChart: chartsViewRef.value.frequencyChart,
          contributorChart: chartsViewRef.value.contributorChart,
          heatmapChart: chartsViewRef.value.heatmapChart,
        }
      : undefined;
  },
  isChartTabActive
);

const { selectedCommit, showDetail, selectCommit, copyCommitHash, clearCache } =
  useCommitDetail(
    () =>
      repositorySource.value === "github" ? githubRepo.value : repoPath.value,
    () => repositorySource.value,
    (commit) => {
      if (repositorySource.value !== "github") return;
      const index = commits.value.findIndex(
        (item) => item.hash === commit.hash
      );
      if (index >= 0) {
        commits.value[index] = commit;
        filterCommits();
      }
    }
  );

async function loadRemoteRepository() {
  if (loading.value || enriching.value) return false;
  if (!githubRepo.value.trim()) {
    customMessage.warning("请输入 GitHub 公开仓库地址");
    return false;
  }

  remoteAbortController.value?.abort();
  const controller = new AbortController();
  remoteAbortController.value = controller;
  resetCommits();
  branches.value = [];
  githubRepositoryInfo.value = null;
  lastLoadedRepo.value = "";
  lastLoadedLimit.value = 0;
  loading.value = true;
  progress.value = {
    loading: true,
    loaded: 0,
    total: Math.min(limitCount.value || 1000, 1000),
  };

  try {
    const result = await loadGitHubRepository(githubRepo.value, {
      branch: selectedBranch.value,
      limit: limitCount.value,
      signal: controller.signal,
      onProgress: ({ loaded, total }) => {
        progress.value.loaded = loaded;
        progress.value.total = total;
      },
    });
    if (controller.signal.aborted) return false;

    githubRepositoryInfo.value = result.repository;
    selectedBranch.value = result.branch;
    branches.value = [
      { name: result.repository.defaultBranch, current: true, remote: true },
    ];
    commits.value = result.commits;
    commitRange.value = [1, Math.max(1, result.commits.length)];
    filterCommits();
    progress.value.loaded = result.commits.length;
    progress.value.total = result.commits.length;
    if (result.truncated) {
      customMessage.info(
        `已加载最近 ${result.commits.length} 条公开仓库提交，仓库还有更早的记录`
      );
    } else {
      customMessage.success(`已加载 ${result.commits.length} 条公开仓库提交`);
    }
    return true;
  } catch (error) {
    if (!controller.signal.aborted) {
      errorHandler.error(error as Error, "加载 GitHub 公开仓库失败");
    }
    return false;
  } finally {
    if (remoteAbortController.value === controller) {
      remoteAbortController.value = null;
      loading.value = false;
      progress.value.loading = false;
    }
  }
}

function loadRepository() {
  if (loading.value || enriching.value) return Promise.resolve(false);
  return repositorySource.value === "github"
    ? loadRemoteRepository()
    : loadLocalRepository();
}

function refreshRepository() {
  if (loading.value || enriching.value) return Promise.resolve(false);
  return repositorySource.value === "github"
    ? loadRemoteRepository()
    : refreshLocalRepository();
}

function cancelLoading() {
  if (repositorySource.value === "github") {
    remoteAbortController.value?.abort();
    return;
  }
  return cancelLocalLoading();
}

function enrichEngineeringData() {
  if (repositorySource.value === "local") {
    return enrichCommits({
      hashes: filteredCommits.value
        .filter((commit) => !commit.stats || !commit.files)
        .map((commit) => commit.hash),
      includeStats: true,
      includeFiles: true,
    });
  }
  return Promise.resolve(false);
}

function handleExportEnrich(options: Parameters<typeof enrichCommits>[0]) {
  if (repositorySource.value === "local") return enrichCommits(options);
  return Promise.resolve(false);
}

async function handleBranchChange(branch: string) {
  const success =
    repositorySource.value === "github"
      ? await loadRemoteRepository()
      : await onBranchChange(branch);
  if (success) {
    clearCache();
  }
}

// 处理设置范围起始位置（序号从 1 开始）
function handleSetRangeStart(index: number) {
  commitRange.value = [
    Math.min(index, commitRange.value[1]),
    commitRange.value[1],
  ];
  filterCommits();
}

// 处理设置范围结束位置（序号从 1 开始）
function handleSetRangeEnd(index: number) {
  commitRange.value = [
    commitRange.value[0],
    Math.max(index, commitRange.value[0]),
  ];
  filterCommits();
}

// 切换到导出面板
function showExportDialog() {
  if (commits.value.length === 0) {
    customMessage.warning("请先加载仓库数据");
    return;
  }
  activeTab.value = "export";
}

// 处理导出配置更新
function handleExportConfigUpdate(
  newExportConfig: GitAnalyzerConfig["exportConfig"]
) {
  exportConfig.value = newExportConfig;
  saveCurrentConfig();
}

// 标记是否正在加载配置，防止加载过程中的 watch 触发保存
const isConfigLoading = ref(false);

// 加载配置
async function loadConfig() {
  isConfigLoading.value = true;
  try {
    const loadedConfig = await gitAnalyzerConfigManager.load();
    config.value = loadedConfig;

    // 恢复配置到各个状态
    repoPath.value = loadedConfig.repoPath;
    githubRepo.value = loadedConfig.githubRepo ?? "";
    insightModelCombo.value = loadedConfig.insightModelCombo ?? "";
    repositorySource.value = loadedConfig.repositorySource ?? "local";
    selectedBranch.value = loadedConfig.selectedBranch;
    if (repositorySource.value === "local" && selectedBranch.value) {
      lastLocalBranch.value = selectedBranch.value;
    }
    limitCount.value = loadedConfig.limitCount;
    batchSize.value = loadedConfig.batchSize;
    activeTab.value = loadedConfig.activeTab;
    pageSize.value = loadedConfig.pageSize;
    searchQuery.value = loadedConfig.searchQuery;
    excludeQuery.value = loadedConfig.excludeQuery;
    authorFilter.value = loadedConfig.authorFilter;
    reverseOrder.value = loadedConfig.reverseOrder;
    commitTypeFilter.value = loadedConfig.commitTypeFilter;
    frequencyGranularity.value = loadedConfig.frequencyGranularity || "day";

    // 恢复导出配置
    if (loadedConfig.exportConfig) {
      exportConfig.value = {
        ...exportConfig.value,
        ...loadedConfig.exportConfig,
      };
    }

    // 恢复预设
    if (loadedConfig.exportPresets) {
      exportPresets.value = loadedConfig.exportPresets;
    }
    if (loadedConfig.repoLastPreset) {
      repoLastPreset.value = loadedConfig.repoLastPreset;
    }

    // 恢复日期范围（需要将字符串转换为 Date 对象）
    if (loadedConfig.dateRange) {
      dateRange.value = [
        new Date(loadedConfig.dateRange[0]),
        new Date(loadedConfig.dateRange[1]),
      ];
    }
    // commitRange 为 1-based 闭区间；旧版本配置可能是 0-based，这里做归一化
    const loadedRange = loadedConfig.commitRange;
    if (
      Array.isArray(loadedRange) &&
      loadedRange[0] >= 1 &&
      loadedRange[1] >= loadedRange[0]
    ) {
      commitRange.value = loadedRange;
    } else {
      commitRange.value = [1, 1];
    }
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "加载配置失败",
      showToUser: false,
      context: { repoPath: repoPath.value },
    });
  } finally {
    // 延迟结束加载状态，确保 watch 触发的同步逻辑已经跑完
    setTimeout(() => {
      isConfigLoading.value = false;
    }, 200);
  }
}

// 保存当前配置
function saveCurrentConfig() {
  if (!config.value || isConfigLoading.value) {
    return;
  }

  const updatedConfig: GitAnalyzerConfig = {
    version: config.value.version || "1.0.0",
    repoPath: repoPath.value,
    githubRepo: githubRepo.value,
    insightModelCombo: insightModelCombo.value,
    repositorySource: repositorySource.value,
    selectedBranch: selectedBranch.value,
    limitCount: limitCount.value,
    batchSize: batchSize.value,
    activeTab: activeTab.value,
    pageSize: pageSize.value,
    searchQuery: searchQuery.value,
    excludeQuery: excludeQuery.value,
    dateRange: dateRange.value
      ? [
          new Date(dateRange.value[0]).toISOString(),
          new Date(dateRange.value[1]).toISOString(),
        ]
      : null,
    authorFilter: authorFilter.value,
    commitRange: commitRange.value,
    reverseOrder: reverseOrder.value,
    commitTypeFilter: commitTypeFilter.value,
    frequencyGranularity: frequencyGranularity.value,
    exportConfig: exportConfig.value,
    exportPresets: exportPresets.value,
    repoLastPreset: repoLastPreset.value,
  };

  debouncedSaveConfig(updatedConfig);
}
// 监听仓库路径变化，清空缓存并加载预设
watch(repoPath, (newPath) => {
  clearCache(); // 切换仓库时清空缓存
  if (newPath && repositorySource.value === "local") {
    loadPresetsForRepo(newPath);
  }
});

watch(githubRepo, () => {
  clearCache();
  showDetail.value = false;
  if (repositorySource.value === "github") {
    resetCommits();
    githubRepositoryInfo.value = null;
    if (!isConfigLoading.value) selectedBranch.value = "";
  }
});
watch(selectedBranch, (branch) => {
  if (repositorySource.value === "local" && branch) {
    lastLocalBranch.value = branch;
  }
});

watch(repositorySource, (source) => {
  showDetail.value = false;
  remoteAbortController.value?.abort();
  resetCommits();
  branches.value = [];
  githubRepositoryInfo.value = null;
  lastLoadedRepo.value = "";
  lastLoadedLimit.value = 0;
  clearCache();

  if (!isConfigLoading.value) {
    selectedBranch.value = source === "github" ? "" : lastLocalBranch.value;
  }
});

// 监听配置变化并自动保存
watch(
  [
    repoPath,
    githubRepo,
    insightModelCombo,
    repositorySource,
    selectedBranch,
    limitCount,
    batchSize,
    activeTab,
    pageSize,
    searchQuery,
    excludeQuery,
    dateRange,
    authorFilter,
    commitRange,
    reverseOrder,
    commitTypeFilter,
    frequencyGranularity,
    exportConfig,
    exportPresets,
    repoLastPreset,
  ],
  () => {
    saveCurrentConfig();
  },
  { deep: true }
);

// 监听筛选后的 commits 变化，如果图表可见则更新
watch(filteredCommits, () => {
  if (isChartTabActive.value) {
    nextTick(updateCharts);
  }
});

// 监听标签页切换，如果切换到图表页，则更新图表；如果切换到导出页，则更新预览
watch(activeTab, (newTab) => {
  if (newTab === "chart") {
    nextTick(updateCharts);
  } else if (newTab === "export") {
    nextTick(() => {
      exportModuleRef.value?.updatePreview();
    });
  }
});

// 组件挂载
onMounted(async () => {
  // 加载配置
  await loadConfig();

  // 加载预设
  if (repoPath.value && repositorySource.value === "local") {
    loadPresetsForRepo(repoPath.value);
  }

  // 设置图表 ResizeObserver
  const mainContent = document.querySelector(".main-content");
  setupResizeObserver(mainContent);
});

onUnmounted(() => {
  clearCache();
  remoteAbortController.value?.abort();
});
</script>

<style scoped>
.git-analyzer {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.analyzer-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 重要：允许 flex 子元素收缩 */
  overflow: hidden;
}

/* InfoCard 内部的内容容器需要正确的 flex 布局 */
.analyzer-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.analyzer-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  /* 重要：允许内容收缩 */
  overflow: hidden;
}

.toolbar {
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  flex-shrink: 0;
  /* 防止收缩 */
}

.path-input-group {
  display: flex;
  gap: 10px;
}

.filters {
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  flex-shrink: 0;
  /* 防止收缩 */
}

.range-selector {
  padding: 12px 16px 20px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  flex-shrink: 0;
}

.range-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.statistics {
  padding: 8px 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
  flex-shrink: 0;
  /* 防止收缩 */
}

.stat-item-compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4px 0;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-color-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 2px;
  line-height: 1;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 允许收缩 */
  overflow: hidden;
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color-light);
}

/* tabs 组件需要占满高度 */
.main-content :deep(.el-tabs) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.main-content :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.main-content :deep(.el-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.commits-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  /* 给滚动条留空间 */
}

.commit-list {
  padding: 10px;
}

.commit-card {
  cursor: pointer;
  transition: all 0.3s;
  background: var(--container-bg) !important;
}

.commit-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}

:deep(.el-card) {
  background: var(--container-bg);
  border-color: var(--border-color-light);
}

:deep(.el-card__header) {
  background: var(--card-bg);
  border-bottom-color: var(--border-color-light);
}

.commit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.commit-sequence {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-color-primary);
}

.commit-author {
  color: var(--text-color-light);
  font-size: 12px;
}

.commit-message {
  font-size: 14px;
  color: var(--text-color);
  margin-bottom: 4px;
}

.commit-stats {
  font-size: 12px;
}

.stat-item {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
}

.additions {
  color: #67c23a;
}

.deletions {
  color: var(--error-color);
}

.files {
  color: var(--text-color-light);
}

.charts-container {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  min-height: 0;
}

.chart {
  height: 300px;
  min-height: 300px;
  /* 确保图表有最小高度 */
}

/* 日期选择器的特殊样式 - 保留这些因为涉及布局调整 */
:deep(.el-date-editor .el-range-separator) {
  padding: 0 4px;
  line-height: 32px;
}

:deep(.el-date-editor .el-range-input) {
  font-size: 13px;
}

/* 分页器样式 - 保留以确保正确布局 */
:deep(.el-pagination) {
  display: flex;
}

/* 标签页背景透明 - 保留这个特定样式 */
:deep(.el-tabs__nav-wrap) {
  background: transparent;
}

/* 警告标签的特殊样式 - 保留 */
:deep(.el-tag--warning) {
  background: rgba(230, 162, 60, 0.1);
  border-color: rgba(230, 162, 60, 0.3);
  color: #e6a23c;
}

/* loading 遮罩样式 - 保留半透明效果 */
:deep(.el-loading-mask) {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>
