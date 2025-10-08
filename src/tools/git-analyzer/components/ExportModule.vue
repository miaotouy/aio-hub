<template>
  <el-dialog
    v-model="visible"
    title="导出分析报告"
    width="1000px"
    :close-on-click-modal="false"
    @close="handleClose"
    top="4vh"
    class="export-dialog"
  >
    <div class="export-module">
      <!-- 导出配置 -->
      <ExportConfiguration v-model:config="exportConfig" :total-commits="totalCommits" />

      <!-- 预览区域 -->
      <ExportPreview
        :content="previewContent"
        :format="exportConfig.format"
        :generating="generating"
        :loading-files="loadingFiles"
        @refresh="updatePreview"
        @copy="copyToClipboard"
        @download="downloadFile"
      />
    </div>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleExport" :loading="exporting"> 导出文件 </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import type { GitCommit, ExportConfig, RepoStatistics } from '../types'
import { useReportGenerator } from '../composables/useReportGenerator'
import ExportConfiguration from './ExportConfiguration.vue'
import ExportPreview from './ExportPreview.vue'

const props = defineProps<{
  commits: GitCommit[]
  filteredCommits: GitCommit[]
  statistics: RepoStatistics
  repoPath: string
  branch: string
  initialConfig?: Partial<ExportConfig>
}>()

const emit = defineEmits<{
  close: []
  'update:exportConfig': [config: ExportConfig]
}>()

const visible = defineModel<boolean>('visible', { required: true })
const generating = ref(false)
const exporting = ref(false)
const previewContent = ref('')
const commitsWithFiles = ref<GitCommit[]>([])
const loadingFiles = ref(false)

const exportConfig = ref<ExportConfig>({
  format: 'markdown',
  includes: ['statistics', 'commits', 'contributors'],
  commitRange: 'filtered',
  customCount: 100,
  dateFormat: 'local',
  includeAuthor: true,
  includeEmail: false,
  includeFullMessage: false,
  includeFiles: false,
  includeTags: true,
  includeStats: true,
  htmlTheme: 'light',
})

// 初始化配置
if (props.initialConfig) {
  exportConfig.value = { ...exportConfig.value, ...props.initialConfig }
}

const totalCommits = computed(() => props.commits.length)

// 生成导出文件名
function generateFileName(extension: string): string {
  // 从仓库路径提取项目名
  const projectName = props.repoPath
    ? props.repoPath.split(/[/\\]/).filter(Boolean).pop() || 'git-repo'
    : 'git-repo'

  // 格式化日期为 YYYY-MM-DD
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}`

  return `${projectName}_提交统计_${dateStr}.${extension}`
}

// 获取要导出的提交记录
function getCommitsToExport(): GitCommit[] {
  // 先根据范围获取基础提交列表
  const base: GitCommit[] = (() => {
    switch (exportConfig.value.commitRange) {
      case 'all':
        return props.commits
      case 'filtered':
        return props.filteredCommits
      case 'custom':
        return props.filteredCommits.slice(0, exportConfig.value.customCount)
      default:
        return props.filteredCommits
    }
  })()

  // 如果需要文件变更信息，合并文件数据
  return getMergedCommits(base)
}

// 加载带文件信息的提交列表
async function loadCommitsWithFiles() {
  if (!exportConfig.value.includeFiles) {
    commitsWithFiles.value = []
    return
  }

  loadingFiles.value = true
  try {
    // 使用后端接口一次性加载所有提交的文件信息
    const commits = await invoke<GitCommit[]>('git_load_commits_with_files', {
      path: props.repoPath || '.',
      branch: null,
      limit: props.commits.length,
    })

    commitsWithFiles.value = commits
    ElMessage.success('已加载文件变更信息')
  } catch (error) {
    console.error('加载文件信息失败:', error)
    ElMessage.error('加载文件信息失败')
    commitsWithFiles.value = []
  } finally {
    loadingFiles.value = false
  }
}

// 获取合并后的提交数据（优先使用带文件信息的版本）
function getMergedCommits(commits: GitCommit[]): GitCommit[] {
  if (!exportConfig.value.includeFiles || commitsWithFiles.value.length === 0) {
    return commits
  }

  // 创建一个 hash -> commit 的映射
  const filesMap = new Map<string, GitCommit>()
  commitsWithFiles.value.forEach((c) => filesMap.set(c.hash, c))

  // 合并数据
  return commits.map((commit) => {
    const withFiles = filesMap.get(commit.hash)
    if (withFiles && withFiles.files) {
      return { ...commit, files: withFiles.files }
    }
    return commit
  })
}

// 初始化报告生成器
const reportGenerator = useReportGenerator({
  config: exportConfig,
  repoPath: props.repoPath,
  branch: props.branch,
  statistics: props.statistics,
  commits: props.commits,
  getCommitsToExport,
})

// 更新预览
async function updatePreview() {
  generating.value = true
  try {
    previewContent.value = reportGenerator.generateReport()
  } catch (error) {
    console.error('生成预览失败:', error)
    ElMessage.error('生成预览失败')
  } finally {
    generating.value = false
  }
}

// 复制到剪贴板
async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(previewContent.value)
    ElMessage.success('已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

// 下载文件
async function downloadFile() {
  const formatExtensions: Record<string, string> = {
    markdown: 'md',
    json: 'json',
    csv: 'csv',
    html: 'html',
    text: 'txt',
  }

  const extension = formatExtensions[exportConfig.value.format]
  const fileName = generateFileName(extension)

  // 创建 Blob 并下载
  const blob = new Blob([previewContent.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  ElMessage.success(`已下载: ${fileName}`)
}

// 导出文件（使用 Tauri 的文件保存对话框）
async function handleExport() {
  exporting.value = true
  try {
    const formatExtensions: Record<string, string> = {
      markdown: 'md',
      json: 'json',
      csv: 'csv',
      html: 'html',
      text: 'txt',
    }

    const extension = formatExtensions[exportConfig.value.format]
    const defaultName = generateFileName(extension)

    const filePath = await save({
      defaultPath: defaultName,
      filters: [
        {
          name: exportConfig.value.format.toUpperCase(),
          extensions: [extension],
        },
      ],
    })

    if (filePath) {
      await writeTextFile(filePath, previewContent.value)
      ElMessage.success(`文件已保存: ${filePath}`)
      visible.value = false
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

// 关闭对话框
function handleClose() {
  emit('close')
}

// 监听配置变化并通知父组件
watch(
  exportConfig,
  (newConfig) => {
    emit('update:exportConfig', newConfig)
  },
  { deep: true }
)

// 监听对话框打开时更新预览
watch(
  () => visible.value,
  async (val) => {
    if (val) {
      // 如果有初始配置，重新应用
      if (props.initialConfig) {
        exportConfig.value = { ...exportConfig.value, ...props.initialConfig }
      }

      // 如果勾选了包含文件变更列表，先加载文件信息
      if (exportConfig.value.includeFiles) {
        await loadCommitsWithFiles()
      }

      updatePreview()
    }
  }
)

// 监听 includeFiles 选项变化
watch(
  () => exportConfig.value.includeFiles,
  async (includeFiles) => {
    if (includeFiles && visible.value && commitsWithFiles.value.length === 0) {
      await loadCommitsWithFiles()
      updatePreview()
    }
  }
)
</script>

<style scoped>
.export-module {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
}

/* 对话框整体样式优化 */
:deep(.export-dialog) {
  .el-dialog__body {
    padding: 20px;
    max-height: calc(90vh - 120px);
    overflow-y: auto;
  }
}
</style>
