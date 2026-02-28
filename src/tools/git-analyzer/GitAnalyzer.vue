<template>
  <div class="git-analyzer">
    <InfoCard title="Git 仓库分析" class="analyzer-card">
      <template #headerExtra>
        <el-button-group>
          <el-button :icon="Refresh" @click="refreshRepository" :loading="loading"> 刷新 </el-button>
          <el-button :icon="Upload" @click="showExportDialog" :disabled="commits.length === 0"> 导出 </el-button>
        </el-button-group>
      </template>

      <div class="analyzer-content">
        <!-- 控制面板 -->
        <ControlPanel
          v-model:repo-path="repoPath"
          v-model:selected-branch="selectedBranch"
          v-model:limit-count="limitCount"
          v-model:batch-size="batchSize"
          v-model:commit-range="commitRange"
          v-model:search-query="searchQuery"
          v-model:date-range="dateRange"
          v-model:author-filter="authorFilter"
          v-model:reverse-order="reverseOrder"
          v-model:commit-type-filter="commitTypeFilter"
          :has-active-filters="hasActiveFilters"
          :filter-summary="filterSummary"
          :loading="loading"
          :branches="branches"
          :commits="commits"
          :progress="progress"
          :statistics="statistics"
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
              />
            </el-tab-pane>

            <!-- 图表视图 -->
            <el-tab-pane label="统计图表" name="chart">
              <ChartsView ref="chartsViewRef" />
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
      @copy-hash="copyCommitHash"
      @update-message="updateCommitMessage"
    />

    <!-- 导出模块 -->
    <ExportModule
      v-model:visible="showExport"
      :commits="commits"
      :filtered-commits="filteredCommits"
      :statistics="statistics"
      :repo-path="repoPath"
      :branch="selectedBranch"
      :reverse-order="reverseOrder"
      :initial-config="config?.exportConfig"
      @update:exportConfig="handleExportConfigUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { Refresh, Upload } from "@element-plus/icons-vue";
import InfoCard from "@components/common/InfoCard.vue";
import ExportModule from "./components/ExportModule.vue";
import ControlPanel from "./components/ControlPanel.vue";
import CommitListView from "./components/CommitListView.vue";
import ChartsView from "./components/ChartsView.vue";
import CommitDetailDialog from "./components/CommitDetailDialog.vue";
import { gitAnalyzerConfigManager, debouncedSaveConfig, type GitAnalyzerConfig } from "./config/config";
import { useGitAnalyzerState } from "./composables/useGitAnalyzerState";
import { useGitAnalyzerRunner } from "./composables/useGitAnalyzerRunner";
import { useCharts } from "./composables/useCharts";
import { useCommitDetail } from "./composables/useCommitDetail";
import { createModuleErrorHandler } from "@/utils/errorHandler";

// 创建模块日志记录器
const errorHandler = createModuleErrorHandler("GitAnalyzer");

// 配置状态
const config = ref<GitAnalyzerConfig | null>(null);

// 使用状态管理 composable
const {
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
  exportConfig,
  progress,
  statistics,
  paginatedCommits,
  hasActiveFilters,
  filterSummary,
} = useGitAnalyzerState();

// 使用运行器（业务编排层）
const {
  selectDirectory,
  loadBranches,
  loadRepository,
  refreshRepository,
  onBranchChange,
  filterCommits,
  clearFilters,
  cancelLoading,
  updateCommitMessage,
} = useGitAnalyzerRunner();


// Charts 视图引用
const chartsViewRef = ref<InstanceType<typeof ChartsView>>();

// 本地状态
const activeTab = ref("list");
const showExport = ref(false);

// 计算图表视图是否可见
const isChartTabActive = computed(() => activeTab.value === "chart");

const { updateCharts, setupResizeObserver } = useCharts(
  filteredCommits,
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

const { selectedCommit, showDetail, selectCommit, copyCommitHash, clearCache } = useCommitDetail(() => repoPath.value);

// 处理分支切换，并在成功后清空缓存
async function handleBranchChange(branch: string) {
  const success = await onBranchChange(branch);
  if (success) {
    clearCache(); // 切换分支时清空缓存
  }
}
// 显示导出对话框

function showExportDialog() {
  if (commits.value.length === 0) {
    customMessage.warning("请先加载仓库数据");
    return;
  }
  showExport.value = true;
}

// 处理导出配置更新
function handleExportConfigUpdate(newExportConfig: GitAnalyzerConfig["exportConfig"]) {
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
    selectedBranch.value = loadedConfig.selectedBranch;
    limitCount.value = loadedConfig.limitCount;
    batchSize.value = loadedConfig.batchSize;
    activeTab.value = loadedConfig.activeTab;
    pageSize.value = loadedConfig.pageSize;
    searchQuery.value = loadedConfig.searchQuery;
    authorFilter.value = loadedConfig.authorFilter;
    reverseOrder.value = loadedConfig.reverseOrder;
    commitTypeFilter.value = loadedConfig.commitTypeFilter;

    // 恢复导出配置
    if (loadedConfig.exportConfig) {
      exportConfig.value = { ...exportConfig.value, ...loadedConfig.exportConfig };
    }

    // 恢复日期范围（需要将字符串转换为 Date 对象）
    if (loadedConfig.dateRange) {
      dateRange.value = [new Date(loadedConfig.dateRange[0]), new Date(loadedConfig.dateRange[1])];
    }
    commitRange.value = loadedConfig.commitRange || [0, 0];
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
    selectedBranch: selectedBranch.value,
    limitCount: limitCount.value,
    batchSize: batchSize.value,
    activeTab: activeTab.value,
    pageSize: pageSize.value,
    searchQuery: searchQuery.value,
    dateRange: dateRange.value
      ? [new Date(dateRange.value[0]).toISOString(), new Date(dateRange.value[1]).toISOString()]
      : null,
    authorFilter: authorFilter.value,
    commitRange: commitRange.value,
    reverseOrder: reverseOrder.value,
    commitTypeFilter: commitTypeFilter.value,
    exportConfig: exportConfig.value,
  };

  debouncedSaveConfig(updatedConfig);
}
// 监听仓库路径变化，清空缓存
watch(repoPath, () => {
  clearCache(); // 切换仓库时清空缓存
});

// 监听配置变化并自动保存
watch(
  [
    repoPath,
    selectedBranch,
    limitCount,
    batchSize,
    activeTab,
    pageSize,
    searchQuery,
    dateRange,
    authorFilter,
    commitRange,
    reverseOrder,
    commitTypeFilter,
    exportConfig,
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

// 监听标签页切换，如果切换到图表页，则更新图表
watch(activeTab, (newTab) => {
  if (newTab === "chart") {
    nextTick(updateCharts);
  }
});

// 组件挂载
onMounted(async () => {
  // 加载配置
  await loadConfig();

  // 设置图表 ResizeObserver
  const mainContent = document.querySelector(".main-content");
  setupResizeObserver(mainContent);
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
