<template>
  <div class="git-analyzer">
    <InfoCard title="Git 仓库分析" class="analyzer-card">
      <template #headerExtra>
        <el-button-group>
          <el-button :icon="Refresh" @click="refreshRepository" :loading="loading"> 刷新 </el-button>
          <el-button :icon="Upload" @click="showExportDialog" :disabled="commits.length === 0">
            导出
          </el-button>
        </el-button-group>
      </template>

      <div class="analyzer-content">
        <!-- 工具栏 -->
        <div class="toolbar">
          <el-row :gutter="12">
            <el-col :span="10">
              <DropZone
                drop-id="git-analyzer-path"
                variant="input"
                :directory-only="true"
                :multiple="false"
                :auto-execute="true"
                hide-content
                @drop="handlePathDrop"
              >
                <div class="path-input-group">
                  <el-input
                    v-model="repoPath"
                    placeholder="仓库路径（支持拖拽，留空使用当前目录）"
                    clearable
                    @keyup.enter="loadRepository"
                  />
                  <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
                </div>
              </DropZone>
            </el-col>
            <el-col :span="6">
              <el-select
                v-model="selectedBranch"
                placeholder="选择分支"
                @change="onBranchChange"
                style="width: 100%"
              >
                <el-option
                  v-for="branch in branches"
                  :key="branch.name"
                  :label="branch.current ? `${branch.name} (当前)` : branch.name"
                  :value="branch.name"
                />
              </el-select>
            </el-col>
            <el-col :span="3">
              <el-tooltip content="设置要加载的提交记录数量" placement="top">
                <el-input-number
                  v-model="limitCount"
                  :min="10"
                  :max="5000"
                  :step="10"
                  placeholder="显示条数"
                  style="width: 100%"
                />
              </el-tooltip>
            </el-col>
            <el-col :span="2">
              <el-button type="primary" @click="loadRepository" :loading="loading">
                加载仓库
              </el-button>
            </el-col>
          </el-row>
        </div>

        <!-- 筛选器 -->
        <div class="filters">
          <el-row :gutter="12">
            <el-col :span="6">
              <el-input
                v-model="searchQuery"
                placeholder="搜索提交信息..."
                clearable
                @input="filterCommits"
              >
                <template #prefix>
                  <el-icon>
                    <Search />
                  </el-icon>
                </template>
              </el-input>
            </el-col>
            <el-col :span="8">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                @change="filterCommits"
                style="width: 100%"
                size="default"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-col>
            <div style="width: 20px"></div>
            <!-- 日期选择器由于不明原因和作者筛选重叠 -->
            <el-col :span="5">
              <el-input
                v-model="authorFilter"
                placeholder="作者筛选"
                clearable
                @input="filterCommits"
              />
            </el-col>
            <el-col :span="2">
              <el-button @click="clearFilters" :icon="Refresh"> 清除 </el-button>
            </el-col>
          </el-row>
        </div>

        <!-- 范围选择器 -->
        <div class="range-selector" v-if="commits.length > 0">
          <el-row :gutter="16" align="middle">
            <el-col :span="3">
              <span class="range-label">提交范围:</span>
            </el-col>
            <el-col :span="16">
              <el-slider
                v-model="commitRange"
                :max="commits.length"
                range
                :disabled="commits.length === 0"
                @change="filterCommits"
                :marks="{ [0]: '最新', [commits.length]: '最旧' }"
              />
            </el-col>
            <el-col :span="5">
              <span class="range-label"
                >范围: {{ commitRange[0] }} - {{ commitRange[1] }} (共
                {{ commitRange[1] - commitRange[0] }} 条)</span
              >
            </el-col>
          </el-row>
        </div>

        <!-- 统计信息 -->
        <div class="statistics" v-if="commits.length > 0">
          <el-row :gutter="16">
            <el-col :span="6">
              <div class="stat-item-compact">
                <span class="stat-value">{{ statistics.totalCommits }}</span>
                <span class="stat-label">总提交数</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item-compact">
                <span class="stat-value">{{ statistics.contributors }}</span>
                <span class="stat-label">贡献者数</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item-compact">
                <span class="stat-value">{{ statistics.timeSpan }}</span>
                <span class="stat-label">时间跨度(天)</span>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item-compact">
                <span class="stat-value">{{ statistics.averagePerDay.toFixed(1) }}</span>
                <span class="stat-label">平均提交/天</span>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- 主内容区 -->
        <div class="main-content">
          <el-tabs v-model="activeTab">
            <!-- 提交列表视图 -->
            <el-tab-pane label="提交列表" name="list">
              <div class="commits-container" v-loading="loading">
                <div class="commit-list" v-if="filteredCommits.length > 0">
                  <el-timeline>
                    <el-timeline-item
                      v-for="(commit, index) in paginatedCommits"
                      :key="commit.hash"
                      :timestamp="formatDate(commit.date)"
                      placement="top"
                    >
                      <el-card @click="selectCommit(commit)" class="commit-card">
                        <div class="commit-header">
                          <span class="commit-sequence">#{{ (currentPage - 1) * pageSize + index + 1 }}</span>
                          <el-tag size="small">
                            {{ commit.hash.substring(0, 7) }}
                          </el-tag>
                          <span class="commit-author">{{ commit.author }}</span>
                          <el-popover v-if="commit.tags && commit.tags.length > 0" placement="top">
                            <template #reference>
                              <el-tag type="warning" size="small">
                                <el-icon>
                                  <PriceTag />
                                </el-icon>
                                {{ commit.tags.length }}
                              </el-tag>
                            </template>
                            <div>
                              <el-tag v-for="tag in commit.tags" :key="tag" style="margin: 2px">
                                {{ tag }}
                              </el-tag>
                            </div>
                          </el-popover>
                        </div>
                        <div class="commit-message">{{ commit.message }}</div>
                        <div class="commit-stats" v-if="commit.stats">
                          <el-space size="small">
                            <span class="stat-item additions">+{{ commit.stats.additions }}</span>
                            <span class="stat-item deletions">-{{ commit.stats.deletions }}</span>
                            <span class="stat-item files">{{ commit.stats.files }} 文件</span>
                          </el-space>
                        </div>
                      </el-card>
                    </el-timeline-item>
                  </el-timeline>

                  <el-pagination
                    v-model:current-page="currentPage"
                    :page-size="pageSize"
                    :total="filteredCommits.length"
                    layout="prev, pager, next"
                    style="margin-top: 20px; justify-content: center"
                  />
                </div>

                <el-empty v-else description="暂无提交记录" />
              </div>
            </el-tab-pane>

            <!-- 图表视图 -->
            <el-tab-pane label="统计图表" name="chart">
              <div class="charts-container">
                <el-row :gutter="12">
                  <el-col :span="12">
                    <el-card>
                      <template #header>提交频率</template>
                      <div ref="frequencyChart" class="chart"></div>
                    </el-card>
                  </el-col>
                  <el-col :span="12">
                    <el-card>
                      <template #header>贡献者统计</template>
                      <div ref="contributorChart" class="chart"></div>
                    </el-card>
                  </el-col>
                </el-row>
                <el-row :gutter="12" style="margin-top: 20px">
                  <el-col :span="24">
                    <el-card>
                      <template #header>提交热力图</template>
                      <div ref="heatmapChart" class="chart"></div>
                    </el-card>
                  </el-col>
                </el-row>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </InfoCard>

    <!-- 提交详情对话框 -->
    <el-dialog
      v-model="showDetail"
      :title="`提交详情: ${selectedCommit?.hash?.substring(0, 7)}`"
      width="800px"
      top="8vh"
    >
      <el-descriptions v-if="selectedCommit" :column="1" border>
        <el-descriptions-item label="哈希">
          <el-text type="info">{{ selectedCommit.hash }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="作者">
          {{ selectedCommit.author }} &lt;{{ selectedCommit.email }}&gt;
        </el-descriptions-item>
        <el-descriptions-item label="日期">
          {{ formatFullDate(selectedCommit.date) }}
        </el-descriptions-item>
        <el-descriptions-item label="提交信息">
          <el-text style="white-space: pre-wrap">{{
            selectedCommit.full_message || selectedCommit.message
          }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="父提交" v-if="selectedCommit.parents">
          <el-space>
            <el-tag v-for="parent in selectedCommit.parents" :key="parent">
              {{ parent.substring(0, 7) }}
            </el-tag>
          </el-space>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="selectedCommit?.files && selectedCommit.files.length > 0" style="margin-top: 20px">
        <h4>文件更改 ({{ selectedCommit.files.length }})</h4>
        <el-table :data="selectedCommit.files" style="width: 100%">
          <el-table-column prop="path" label="文件路径" />
          <el-table-column label="更改" width="150">
            <template #default="scope">
              <span class="additions">+{{ scope.row.additions }}</span>
              <span class="deletions" style="margin-left: 10px">-{{ scope.row.deletions }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-space>
          <el-button @click="copyCommitHash">复制哈希</el-button>
          <el-button @click="showDetail = false">关闭</el-button>
        </el-space>
      </template>
    </el-dialog>

    <!-- 导出模块 -->
    <ExportModule
      v-model:visible="showExport"
      :commits="commits"
      :filtered-commits="filteredCommits"
      :statistics="statistics"
      :repo-path="repoPath"
      :branch="selectedBranch"
      :initial-config="config?.exportConfig"
      @update:exportConfig="handleExportConfigUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search, FolderOpened, PriceTag, Upload } from '@element-plus/icons-vue'
import InfoCard from '../../components/common/InfoCard.vue'
import DropZone from '../../components/common/DropZone.vue'
import ExportModule from './components/ExportModule.vue'
import { gitAnalyzerConfigManager, debouncedSaveConfig, type GitAnalyzerConfig } from './config'
import { useGitRepository } from './composables/useGitRepository'
import { useCharts } from './composables/useCharts'
import { useCommitDetail } from './composables/useCommitDetail'
import { createModuleLogger } from '@utils/logger'

// 创建模块日志记录器
const logger = createModuleLogger('GitAnalyzer')

// 配置状态
const config = ref<GitAnalyzerConfig | null>(null)

// 使用 composables
const {
  // 状态
  loading,
  repoPath,
  selectedBranch,
  branches,
  commits,
  filteredCommits,
  limitCount,
  commitRange,
  searchQuery,
  dateRange,
  authorFilter,
  currentPage,
  pageSize,
  // 计算属性
  statistics,
  paginatedCommits,
  // 方法
  selectDirectory,
  loadRepository: loadRepo,
  refreshRepository: refreshRepo,
  onBranchChange: switchBranch,
  filterCommits: doFilter,
  clearFilters,
  handlePathDrop,
} = useGitRepository()

const {
  // DOM 引用
  frequencyChart,
  contributorChart,
  heatmapChart,
  // 方法
  updateCharts,
  setupResizeObserver,
} = useCharts(filteredCommits)

const {
  // 状态
  selectedCommit,
  showDetail,
  // 方法
  selectCommit,
  copyCommitHash,
  formatDate,
  formatFullDate,
} = useCommitDetail(() => repoPath.value)

// 本地状态
const activeTab = ref('list')
const showExport = ref(false)

// 包装 loadRepository 以在成功后更新图表（增量加载）
async function loadRepository() {
  const success = await loadRepo()
  if (success) {
    updateCharts()
  }
}

// 包装 refreshRepository 以在成功后更新图表（全量刷新）
async function refreshRepository() {
  const success = await refreshRepo()
  if (success) {
    updateCharts()
  }
}

// 包装 onBranchChange 以在成功后更新图表
async function onBranchChange(branch: string) {
  const success = await switchBranch(branch)
  if (success) {
    updateCharts()
  }
}

// 包装 filterCommits 以在筛选后更新图表
function filterCommits() {
  doFilter()
  updateCharts()
}

// 显示导出对话框
function showExportDialog() {
  if (commits.value.length === 0) {
    ElMessage.warning('请先加载仓库数据')
    return
  }
  showExport.value = true
}

// 处理导出配置更新
function handleExportConfigUpdate(newExportConfig: GitAnalyzerConfig['exportConfig']) {
  if (!config.value) return

  config.value.exportConfig = newExportConfig
  debouncedSaveConfig(config.value)
}

// 加载配置
async function loadConfig() {
  try {
    const loadedConfig = await gitAnalyzerConfigManager.load()
    config.value = loadedConfig

    // 恢复配置到各个状态
    repoPath.value = loadedConfig.repoPath
    selectedBranch.value = loadedConfig.selectedBranch
    limitCount.value = loadedConfig.limitCount
    activeTab.value = loadedConfig.activeTab
    pageSize.value = loadedConfig.pageSize
    searchQuery.value = loadedConfig.searchQuery
    authorFilter.value = loadedConfig.authorFilter

    // 恢复日期范围（需要将字符串转换为 Date 对象）
    if (loadedConfig.dateRange) {
      dateRange.value = [new Date(loadedConfig.dateRange[0]), new Date(loadedConfig.dateRange[1])]
    }
    commitRange.value = loadedConfig.commitRange || [0, 0]
  } catch (error) {
    logger.error('加载配置失败', error, { repoPath: repoPath.value })
  }
}

// 保存当前配置
function saveCurrentConfig() {
  if (!config.value) return

  const updatedConfig: GitAnalyzerConfig = {
    ...config.value,
    repoPath: repoPath.value,
    selectedBranch: selectedBranch.value,
    limitCount: limitCount.value,
    activeTab: activeTab.value,
    pageSize: pageSize.value,
    searchQuery: searchQuery.value,
    dateRange: dateRange.value
      ? [dateRange.value[0].toISOString(), dateRange.value[1].toISOString()]
      : null,
    authorFilter: authorFilter.value,
    commitRange: commitRange.value,
}

debouncedSaveConfig(updatedConfig)
}

// 监听配置变化并自动保存
watch(
  [repoPath, selectedBranch, limitCount, activeTab, pageSize, searchQuery, dateRange, authorFilter, commitRange],
  () => {
    saveCurrentConfig()
  },
  { deep: true }
)

// 监听标签页切换
watch(activeTab, () => {
  if (activeTab.value === 'chart') {
    nextTick(() => {
      updateCharts()
    })
  }
})

// 组件挂载
onMounted(async () => {
  // 加载配置
  await loadConfig()

  // 设置图表 ResizeObserver
  const mainContent = document.querySelector('.main-content')
  setupResizeObserver(mainContent)
})
</script>

<style scoped>
.git-analyzer {
  padding: 20px;
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
