<template>
  <div class="git-analyzer">
    <InfoCard title="Git 仓库分析" class="analyzer-card">
      <template #headerExtra>
        <el-button-group>
          <el-button :icon="Refresh" @click="loadRepository" :loading="loading">
            刷新
          </el-button>
        </el-button-group>
      </template>

      <div class="analyzer-content">
        <!-- 工具栏 -->
        <div class="toolbar">
          <el-row :gutter="12">
            <el-col :span="10">
              <div
                class="path-input-group drop-zone"
                :class="{ 'dragover': isDraggingOver }"
                @dragenter="handleDragEnter"
                @dragover="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
              >
                <el-input
                  v-model="repoPath"
                  placeholder="仓库路径（支持拖拽，留空使用当前目录）"
                  clearable
                  @keyup.enter="loadRepository"
                />
                <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
              </div>
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
                  <el-icon><Search /></el-icon>
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
            <div style="width: 20px;"></div><!-- 日期选择器由于不明原因和作者筛选重叠 -->
            <el-col :span="5">
              <el-input
                v-model="authorFilter"
                placeholder="作者筛选"
                clearable
                @input="filterCommits"
              />
            </el-col>
            <el-col :span="2">
              <el-button @click="clearFilters" :icon="Refresh">
                清除
              </el-button>
            </el-col>
          </el-row>
        </div>

        <!-- 统计信息 -->
        <div class="statistics" v-if="commits.length > 0">
          <el-row :gutter="20">
            <el-col :span="6">
              <el-statistic title="总提交数" :value="statistics.totalCommits" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="贡献者数" :value="statistics.contributors" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="时间跨度" :value="statistics.timeSpan" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="平均提交/天" :value="statistics.averagePerDay" />
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
                      v-for="commit in paginatedCommits"
                      :key="commit.hash"
                      :timestamp="formatDate(commit.date)"
                      placement="top"
                    >
                      <el-card @click="selectCommit(commit)" class="commit-card">
                        <div class="commit-header">
                          <el-tag size="small">
                            {{ commit.hash.substring(0, 7) }}
                          </el-tag>
                          <span class="commit-author">{{ commit.author }}</span>
                          <el-popover v-if="commit.tags && commit.tags.length > 0" placement="top">
                            <template #reference>
                              <el-tag type="warning" size="small">
                                <el-icon><PriceTag /></el-icon>
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
                    style="margin-top: 20px; justify-content: center;"
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
                <el-row :gutter="12" style="margin-top: 20px;">
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
      width="700px"
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
          <el-text style="white-space: pre-wrap;">{{ selectedCommit.fullMessage || selectedCommit.message }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="父提交" v-if="selectedCommit.parents">
          <el-space>
            <el-tag v-for="parent in selectedCommit.parents" :key="parent">
              {{ parent.substring(0, 7) }}
            </el-tag>
          </el-space>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="selectedCommit?.files && selectedCommit.files.length > 0" style="margin-top: 20px;">
        <h4>文件更改 ({{ selectedCommit.files.length }})</h4>
        <el-table :data="selectedCommit.files" style="width: 100%">
          <el-table-column prop="path" label="文件路径" />
          <el-table-column label="更改" width="150">
            <template #default="scope">
              <span class="additions">+{{ scope.row.additions }}</span>
              <span class="deletions" style="margin-left: 10px;">-{{ scope.row.deletions }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import * as echarts from 'echarts'
import { Refresh, Search, FolderOpened, PriceTag } from '@element-plus/icons-vue'
import InfoCard from '../../components/common/InfoCard.vue'

interface GitCommit {
  hash: string
  author: string
  email: string
  date: string
  message: string
  fullMessage?: string
  parents?: string[]
  tags?: string[]
  stats?: {
    additions: number
    deletions: number
    files: number
  }
  files?: Array<{
    path: string
    status: string
    additions: number
    deletions: number
  }>
}

interface GitBranch {
  name: string
  current: boolean
  remote: boolean
}

// 状态
const loading = ref(false)
const repoPath = ref('')
const selectedBranch = ref('main')
const branches = ref<GitBranch[]>([])
const commits = ref<GitCommit[]>([])
const filteredCommits = ref<GitCommit[]>([])
const selectedCommit = ref<GitCommit | null>(null)
const showDetail = ref(false)
const activeTab = ref('list')
const limitCount = ref(100)

// 拖拽状态
const isDraggingOver = ref(false)

// 筛选
const searchQuery = ref('')
const dateRange = ref<[Date, Date] | null>(null)
const authorFilter = ref('')

// 分页
const currentPage = ref(1)
const pageSize = ref(20)

// 图表实例
const frequencyChart = ref<HTMLDivElement>()
const contributorChart = ref<HTMLDivElement>()
const heatmapChart = ref<HTMLDivElement>()

// 计算属性
const statistics = computed(() => {
  const commits = filteredCommits.value
  if (commits.length === 0) {
    return {
      totalCommits: 0,
      contributors: 0,
      timeSpan: 'N/A',
      averagePerDay: '0'
    }
  }

  const authors = new Set(commits.map(c => c.author))
  const dates = commits.map(c => new Date(c.date).getTime())
  const minDate = new Date(Math.min(...dates))
  const maxDate = new Date(Math.max(...dates))
  const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
  
  return {
    totalCommits: commits.length,
    contributors: authors.size,
    timeSpan: `${days} 天`,
    averagePerDay: (commits.length / Math.max(days, 1)).toFixed(1)
  }
})

const paginatedCommits = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredCommits.value.slice(start, end)
})

// 方法
async function selectDirectory() {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: '选择 Git 仓库目录'
    })
    if (typeof selected === 'string') {
      repoPath.value = selected
      ElMessage.success(`已选择目录: ${selected}`)
    }
  } catch (error) {
    console.error('选择目录失败:', error)
    ElMessage.error('选择目录失败')
  }
}

async function loadRepository() {
  loading.value = true
  try {
    const result = await invoke<{ branches: GitBranch[], commits: GitCommit[] }>('git_load_repository', {
      path: repoPath.value || '.',
      limit: limitCount.value
    })
    
    branches.value = result.branches
    commits.value = result.commits
    filteredCommits.value = result.commits
    
    // 设置当前分支
    const currentBranch = result.branches.find(b => b.current)
    if (currentBranch) {
      selectedBranch.value = currentBranch.name
    }
    
    ElMessage.success(`加载了 ${result.commits.length} 条提交记录`)
    
    // 更新图表
    updateCharts()
  } catch (error) {
    ElMessage.error(`加载仓库失败: ${error}`)
  } finally {
    loading.value = false
  }
}

async function onBranchChange(branch: string) {
  loading.value = true
  try {
    const result = await invoke<GitCommit[]>('git_get_branch_commits', {
      path: repoPath.value || '.',
      branch,
      limit: limitCount.value
    })
    
    commits.value = result
    filteredCommits.value = result
    ElMessage.success(`切换到分支: ${branch}`)
    
    updateCharts()
  } catch (error) {
    ElMessage.error(`切换分支失败: ${error}`)
  } finally {
    loading.value = false
  }
}

function filterCommits() {
  let filtered = [...commits.value]
  
  // 搜索筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.message.toLowerCase().includes(query) ||
      c.hash.toLowerCase().includes(query)
    )
  }
  
  // 作者筛选
  if (authorFilter.value) {
    const author = authorFilter.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.author.toLowerCase().includes(author)
    )
  }
  
  // 日期筛选
  if (dateRange.value) {
    const [start, end] = dateRange.value
    filtered = filtered.filter(c => {
      const date = new Date(c.date)
      return date >= start && date <= end
    })
  }
  
  filteredCommits.value = filtered
  currentPage.value = 1
  updateCharts()
}

function clearFilters() {
  searchQuery.value = ''
  dateRange.value = null
  authorFilter.value = ''
  filteredCommits.value = commits.value
  currentPage.value = 1
  updateCharts()
}

function selectCommit(commit: GitCommit) {
  selectedCommit.value = commit
  showDetail.value = true
  loadCommitDetail(commit.hash)
}

async function loadCommitDetail(hash: string) {
  try {
    const detail = await invoke<GitCommit>('git_get_commit_detail', {
      path: repoPath.value || '.',
      hash
    })
    selectedCommit.value = detail
  } catch (error) {
    ElMessage.error(`加载提交详情失败: ${error}`)
  }
}

async function copyCommitHash() {
  if (selectedCommit.value) {
    await navigator.clipboard.writeText(selectedCommit.value.hash)
    ElMessage.success('已复制提交哈希')
  }
}

function updateCharts() {
  if (activeTab.value === 'chart') {
    drawFrequencyChart()
    drawContributorChart()
    drawHeatmapChart()
  }
}

function drawFrequencyChart() {
  if (!frequencyChart.value) return
  
  const chart = echarts.init(frequencyChart.value)
  const dates = filteredCommits.value.map(c => c.date.split('T')[0])
  const dateCounts = dates.reduce((acc, date) => {
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const option = {
    xAxis: {
      type: 'category',
      data: Object.keys(dateCounts)
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      data: Object.values(dateCounts),
      type: 'line',
      smooth: true,
      areaStyle: {}
    }],
    tooltip: {
      trigger: 'axis'
    }
  }
  
  chart.setOption(option)
}

function drawContributorChart() {
  if (!contributorChart.value) return
  
  const chart = echarts.init(contributorChart.value)
  const authorCounts = filteredCommits.value.reduce((acc, c) => {
    acc[c.author] = (acc[c.author] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const data = Object.entries(authorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }))
  
  const option = {
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }],
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    }
  }
  
  chart.setOption(option)
}

function drawHeatmapChart() {
  if (!heatmapChart.value) return
  
  const chart = echarts.init(heatmapChart.value)
  
  // 生成热力图数据
  const heatmapData: Array<[number, number, number]> = []
  const dayMap = new Map<string, number>()
  
  filteredCommits.value.forEach(c => {
    const date = new Date(c.date)
    const day = date.getDay()
    const hour = date.getHours()
    const key = `${day}-${hour}`
    dayMap.set(key, (dayMap.get(key) || 0) + 1)
  })
  
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = dayMap.get(`${day}-${hour}`) || 0
      heatmapData.push([hour, day, count])
    }
  }
  
  const option = {
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${i}:00`)
    },
    yAxis: {
      type: 'category',
      data: ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    },
    visualMap: {
      min: 0,
      max: Math.max(...heatmapData.map(d => d[2])),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%'
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }],
    tooltip: {
      position: 'top',
      formatter: (params: any) => {
        return `${params.value[2]} 次提交`
      }
    }
  }
  
  chart.setOption(option)
}

// 辅助函数
function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('zh-CN')
}

function formatFullDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}

// 拖放监听器
let unlistenDrop: (() => void) | null = null
let unlistenDragEnter: (() => void) | null = null
let unlistenDragOver: (() => void) | null = null
let unlistenDragLeave: (() => void) | null = null

// 判断位置是否在元素内
const isPositionInRect = (position: { x: number, y: number }, rect: DOMRect) => {
  const ratio = window.devicePixelRatio || 1
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  )
}

// 设置 Tauri 后端的文件拖放监听器
const setupFileDropListener = async () => {
  // 监听拖动进入事件
  unlistenDragEnter = await listen('custom-drag-enter', (event: any) => {
    const { position } = event.payload
    const dropZone = document.querySelector('.git-analyzer .path-input-group') as HTMLElement
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      if (isPositionInRect(position, rect)) {
        isDraggingOver.value = true
      }
    }
  })

  // 监听拖动移动事件
  unlistenDragOver = await listen('custom-drag-over', (event: any) => {
    const { position } = event.payload
    const dropZone = document.querySelector('.git-analyzer .path-input-group') as HTMLElement
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      const isInside = isPositionInRect(position, rect)
      if (isInside !== isDraggingOver.value) {
        isDraggingOver.value = isInside
      }
    }
  })

  // 监听拖动离开事件
  unlistenDragLeave = await listen('custom-drag-leave', () => {
    isDraggingOver.value = false
  })

  // 监听文件放下事件
  unlistenDrop = await listen('custom-file-drop', async (event: any) => {
    const { paths, position } = event.payload
    
    // 清除高亮状态
    isDraggingOver.value = false
    
    if (!paths || paths.length === 0) {
      return
    }
    
    const dropZone = document.querySelector('.git-analyzer .path-input-group') as HTMLElement
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      if (isPositionInRect(position, rect)) {
        // 获取第一个路径
        const droppedPath = paths[0]
        
        // 检查是否为目录
        try {
          const isDir = await invoke<boolean>('is_directory', { path: droppedPath })
          if (isDir) {
            repoPath.value = droppedPath
            ElMessage.success(`已设置 Git 仓库路径: ${droppedPath}`)
            
            // 自动加载仓库
            setTimeout(() => {
              loadRepository()
            }, 500)
          } else {
            ElMessage.warning('请拖入 Git 仓库目录而非文件')
          }
        } catch (error) {
          console.error('检查路径类型失败:', error)
          // 如果检查失败，仍然尝试设置路径
          repoPath.value = droppedPath
          ElMessage.info(`已设置路径: ${droppedPath}`)
        }
      }
    }
  })
}

// 前端拖放事件处理 - 用于视觉反馈
const handleDragEnter = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isDraggingOver.value = true
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  if (!isDraggingOver.value) {
    isDraggingOver.value = true
  }
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  const related = e.relatedTarget as HTMLElement
  const currentTarget = e.currentTarget as HTMLElement
  
  if (!currentTarget.contains(related)) {
    isDraggingOver.value = false
  }
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isDraggingOver.value = false
  // 实际的文件处理由 Tauri 后端的 custom-file-drop 事件处理
}

// 监听标签页切换
watch(activeTab, () => {
  updateCharts()
})

// 初始化
onMounted(async () => {
  // 设置拖放监听器
  await setupFileDropListener()
})

// 清理监听器
onUnmounted(() => {
  unlistenDrop?.()
  unlistenDragEnter?.()
  unlistenDragOver?.()
  unlistenDragLeave?.()
})
</script>

<style scoped>
.git-analyzer {
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.analyzer-card {
  height: 100%;
}

.analyzer-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.toolbar {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.path-input-group {
  display: flex;
  gap: 10px;
  position: relative;
  transition: all 0.3s ease;
  border: 2px dashed transparent;
  border-radius: 8px;
  padding: 8px;
  margin: -8px;
}

/* 拖拽悬停效果 */
.path-input-group.drop-zone.dragover {
  border-color: var(--primary-color);
  background-color: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 15px rgba(64, 158, 255, 0.3);
  transform: scale(1.02);
}

.path-input-group.drop-zone.dragover::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 8px;
  background: linear-gradient(45deg, transparent, rgba(64, 158, 255, 0.2), transparent);
  animation: shimmer 2s infinite;
  pointer-events: none;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.path-input-group.drop-zone.dragover :deep(.el-input__wrapper) {
  background-color: rgba(64, 158, 255, 0.08);
  border-color: var(--primary-color);
}

.filters {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.statistics {
  padding: 16px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.commits-container {
  height: calc(100vh - 400px);
  overflow-y: auto;
}

.commit-card {
  cursor: pointer;
  transition: all 0.3s;
  background: var(--el-bg-color-overlay) !important;
}

.commit-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}

:deep(.el-card) {
  background: var(--el-bg-color-overlay);
  border-color: var(--el-border-color-lighter);
}

:deep(.el-card__header) {
  background: var(--el-fill-color-lighter);
  border-bottom-color: var(--el-border-color-lighter);
}

.commit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.commit-author {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.commit-message {
  font-size: 14px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.commit-stats {
  font-size: 12px;
}

.stat-item {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.additions {
  color: var(--el-color-success);
}

.deletions {
  color: var(--el-color-danger);
}

.files {
  color: var(--el-text-color-secondary);
}

.charts-container {
  padding: 20px;
}

.chart {
  height: 300px;
}

/* 优化暗色主题下的统计数字样式 */
:deep(.el-statistic__number) {
  color: var(--el-text-color-primary);
}

:deep(.el-statistic__title) {
  color: var(--el-text-color-regular);
}

/* 优化时间轴样式 */
:deep(.el-timeline-item__timestamp) {
  color: var(--el-text-color-secondary);
}

/* 优化对话框样式 */
:deep(.el-dialog) {
  background: var(--el-bg-color-overlay);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-descriptions__label) {
  background: var(--el-fill-color-lighter);
}

:deep(.el-descriptions__content) {
  background: var(--el-fill-color-light);
}

/* 优化输入框和选择器样式 */
:deep(.el-input__inner),
:deep(.el-select .el-input__inner) {
  background-color: var(--el-fill-color-light);
  border-color: var(--el-border-color);
}

:deep(.el-input__inner:hover),
:deep(.el-select .el-input__inner:hover) {
  border-color: var(--el-border-color-light);
}

/* 修复日期选择器宽度 */
:deep(.el-date-editor) {
  width: 100% !important;
}

:deep(.el-date-editor .el-range-separator) {
  padding: 0 4px;
  line-height: 32px;
}

:deep(.el-date-editor .el-range-input) {
  font-size: 13px;
}

/* 优化分页器样式 */
:deep(.el-pagination) {
  display: flex;
}

:deep(.el-pager li) {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-regular);
}

:deep(.el-pager li.active) {
  background: var(--primary-color);
  color: white;
}

/* 优化标签样式 */
:deep(.el-tag) {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}

:deep(.el-tag--warning) {
  background: rgba(230, 162, 60, 0.1);
  border-color: rgba(230, 162, 60, 0.3);
  color: #e6a23c;
}
</style>