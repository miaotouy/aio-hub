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
      <el-form label-width="100px">
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportConfig.format">
            <el-radio-button value="markdown">Markdown</el-radio-button>
            <el-radio-button value="json">JSON</el-radio-button>
            <el-radio-button value="csv">CSV</el-radio-button>
            <el-radio-button value="html">HTML</el-radio-button>
            <el-radio-button value="text">纯文本</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="包含内容">
          <el-checkbox-group v-model="exportConfig.includes">
            <el-checkbox value="statistics">统计信息</el-checkbox>
            <el-checkbox value="commits">提交记录</el-checkbox>
            <el-checkbox value="contributors">贡献者列表</el-checkbox>
            <el-checkbox value="timeline">时间线</el-checkbox>
            <el-checkbox value="charts">图表数据</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="提交范围" v-if="exportConfig.includes.includes('commits')">
          <el-radio-group v-model="exportConfig.commitRange">
            <el-radio value="all">全部提交</el-radio>
            <el-radio value="filtered">当前筛选结果</el-radio>
            <el-radio value="custom">自定义数量</el-radio>
          </el-radio-group>
          <el-input-number
            v-if="exportConfig.commitRange === 'custom'"
            v-model="exportConfig.customCount"
            :min="1"
            :max="totalCommits"
            style="margin-left: 10px"
          />
        </el-form-item>

        <el-form-item label="日期格式">
          <el-select v-model="exportConfig.dateFormat">
            <el-option label="ISO 8601" value="iso" />
            <el-option label="本地时间" value="local" />
            <el-option label="相对时间" value="relative" />
            <el-option label="Unix 时间戳" value="timestamp" />
          </el-select>
        </el-form-item>

        <!-- HTML 主题选项 -->
        <el-form-item label="HTML 主题" v-if="exportConfig.format === 'html'">
          <el-radio-group v-model="exportConfig.htmlTheme">
            <el-radio-button value="light">浅色主题</el-radio-button>
            <el-radio-button value="dark">深色主题</el-radio-button>
            <el-radio-button value="auto">跟随系统</el-radio-button>
          </el-radio-group>
          <el-tooltip content="导出的 HTML 文件将使用选择的主题配色" placement="top">
            <el-icon style="margin-left: 10px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="隐私选项">
          <el-checkbox v-model="exportConfig.includeAuthor">
            显示作者名称
          </el-checkbox>
          <el-tooltip content="导出时包含作者的名称" placement="top">
            <el-icon style="margin-left: 5px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
          <el-checkbox v-model="exportConfig.includeEmail" :disabled="!exportConfig.includeAuthor">
            显示作者邮箱
          </el-checkbox>
          <el-tooltip content="导出时包含作者的邮箱地址（需要先启用显示作者名称）" placement="top">
            <el-icon style="margin-left: 5px; color: var(--text-color-light)">
              <QuestionFilled />
            </el-icon>
          </el-tooltip>
        </el-form-item>

        <el-form-item label="其他选项">
          <el-checkbox v-model="exportConfig.includeFullMessage">
            包含完整提交消息
          </el-checkbox>
          <el-checkbox v-model="exportConfig.includeFiles">
            包含文件变更详情
          </el-checkbox>
          <el-checkbox v-model="exportConfig.includeTags">
            包含标签信息
          </el-checkbox>
          <el-checkbox v-model="exportConfig.includeStats">
            包含代码统计
          </el-checkbox>
        </el-form-item>
      </el-form>

      <!-- 预览区域 -->
      <div class="preview-section">
        <div class="preview-header">
          <span>内容预览</span>
          <el-button-group>
            <el-button size="small" @click="updatePreview" :icon="RefreshRight" :loading="generating">
              刷新预览
            </el-button>
            <el-button size="small" @click="copyToClipboard" :icon="CopyDocument">
              复制
            </el-button>
            <el-button size="small" @click="downloadFile" :icon="Download">
              下载
            </el-button>
          </el-button-group>
        </div>
        <div class="preview-content" v-loading="generating">
          <el-scrollbar height="400px">
            <pre v-if="exportConfig.format !== 'html'" class="preview-text">{{ previewContent }}</pre>
            <div v-else v-html="previewContent" class="preview-html"></div>
          </el-scrollbar>
        </div>
      </div>
    </div>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleExport" :loading="exporting">
          导出文件
        </el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Download, RefreshRight, QuestionFilled } from '@element-plus/icons-vue'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

interface GitCommit {
  hash: string
  author: string
  email: string
  date: string
  message: string
  full_message?: string  // 注意：后端使用 snake_case
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

interface ExportConfig {
  format: 'markdown' | 'json' | 'csv' | 'html' | 'text'
  includes: string[]
  commitRange: 'all' | 'filtered' | 'custom'
  customCount: number
  dateFormat: 'iso' | 'local' | 'relative' | 'timestamp'
  includeAuthor: boolean
  includeEmail: boolean
  includeFullMessage: boolean
  includeFiles: boolean
  includeTags: boolean
  includeStats: boolean
  htmlTheme: 'light' | 'dark' | 'auto'
}

const props = defineProps<{
  commits: GitCommit[]
  filteredCommits: GitCommit[]
  statistics: {
    totalCommits: number
    contributors: number
    timeSpan: number
    averagePerDay: number
  }
  repoPath: string
  branch: string
  initialConfig?: {
    format: 'markdown' | 'json' | 'csv' | 'html' | 'text'
    includes: string[]
    commitRange: 'all' | 'filtered' | 'custom'
    customCount: number
    dateFormat: 'iso' | 'local' | 'relative' | 'timestamp'
    includeAuthor: boolean
    includeEmail: boolean
    includeFullMessage: boolean
    includeFiles: boolean
    includeTags: boolean
    includeStats: boolean
    htmlTheme: 'light' | 'dark' | 'auto'
  }
}>()

const emit = defineEmits<{
  close: []
  'update:exportConfig': [config: ExportConfig]
}>()

const visible = defineModel<boolean>('visible', { required: true })
const generating = ref(false)
const exporting = ref(false)
const previewContent = ref('')

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
  htmlTheme: 'light'
})

// 初始化配置
if (props.initialConfig) {
  exportConfig.value = { ...exportConfig.value, ...props.initialConfig }
}

const totalCommits = computed(() => props.commits.length)

// 格式化日期
function formatDate(date: string, format: string): string {
  const d = new Date(date)
  
  switch (format) {
    case 'iso':
      return d.toISOString()
    case 'local':
      return d.toLocaleString('zh-CN')
    case 'relative':
      return getRelativeTime(d)
    case 'timestamp':
      return String(d.getTime())
    default:
      return d.toLocaleString('zh-CN')
  }
}

// 获取相对时间
function getRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  if (days < 365) return `${Math.floor(days / 30)} 月前`
  return `${Math.floor(days / 365)} 年前`
}

// 获取要导出的提交记录
function getCommitsToExport(): GitCommit[] {
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
}

// 生成 Markdown 格式
function generateMarkdown(): string {
  const lines: string[] = []
  const config = exportConfig.value
  
  lines.push(`# Git 仓库分析报告`)
  lines.push('')
  lines.push(`**仓库路径**: ${props.repoPath || '当前目录'}`)
  lines.push(`**分支**: ${props.branch}`)
  lines.push(`**生成时间**: ${new Date().toLocaleString('zh-CN')}`)
  lines.push('')
  
  // 统计信息
  if (config.includes.includes('statistics')) {
    lines.push('## 📊 统计信息')
    lines.push('')
    lines.push(`- **总提交数**: ${props.statistics.totalCommits}`)
    lines.push(`- **贡献者数**: ${props.statistics.contributors}`)
    lines.push(`- **时间跨度**: ${props.statistics.timeSpan} 天`)
    lines.push(`- **平均提交/天**: ${props.statistics.averagePerDay.toFixed(2)}`)
    lines.push('')
  }
  
  // 贡献者列表
  if (config.includes.includes('contributors')) {
    const contributors = getContributorStats()
    lines.push('## 👥 贡献者统计')
    lines.push('')
    lines.push('| 贡献者 | 提交数 | 占比 |')
    lines.push('|--------|--------|------|')
    contributors.slice(0, 10).forEach(c => {
      const percentage = ((c.count / props.statistics.totalCommits) * 100).toFixed(1)
      lines.push(`| ${c.name} | ${c.count} | ${percentage}% |`)
    })
    lines.push('')
  }
  
  // 提交记录
  if (config.includes.includes('commits')) {
    const commits = getCommitsToExport()
    lines.push('## 📝 提交记录')
    lines.push('')
    lines.push(`共 ${commits.length} 条记录`)
    lines.push('')
    
    commits.forEach(commit => {
      lines.push(`### ${commit.hash.substring(0, 7)} - ${formatDate(commit.date, config.dateFormat)}`)
      lines.push('')
      if (config.includeAuthor) {
        if (config.includeEmail) {
          lines.push(`**作者**: ${commit.author} <${commit.email}>`)
        } else {
          lines.push(`**作者**: ${commit.author}`)
        }
        lines.push('')
      }
      if (config.includeFullMessage && commit.full_message) {
        lines.push(`**提交信息**:`)
        lines.push('')
        lines.push(commit.full_message)
      } else {
        lines.push(`**提交信息**: ${commit.message}`)
      }
      
      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        lines.push('')
        lines.push(`**标签**: ${commit.tags.join(', ')}`)
      }
      
      if (config.includeStats && commit.stats) {
        lines.push('')
        lines.push(`**统计**: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`)
      }
      
      if (config.includeFiles && commit.files && commit.files.length > 0) {
        lines.push('')
        lines.push('**文件变更**:')
        commit.files.forEach(file => {
          lines.push(`  - ${file.path} (+${file.additions} -${file.deletions})`)
        })
      }
      
      lines.push('')
      lines.push('---')
      lines.push('')
    })
  }
  
  return lines.join('\n')
}

// 生成 JSON 格式
function generateJSON(): string {
  const data: any = {
    repository: props.repoPath || '当前目录',
    branch: props.branch,
    generatedAt: new Date().toISOString(),
    statistics: props.statistics
  }
  
  const config = exportConfig.value
  
  if (config.includes.includes('contributors')) {
    data.contributors = getContributorStats()
  }
  
  if (config.includes.includes('commits')) {
    const commits = getCommitsToExport()
    data.commits = commits.map(commit => ({
      hash: commit.hash,
      ...(config.includeAuthor ? { author: commit.author } : {}),
      ...(config.includeAuthor && config.includeEmail ? { email: commit.email } : {}),
      date: formatDate(commit.date, config.dateFormat),
      message: commit.message,
      ...(config.includeFullMessage && commit.full_message ? { full_message: commit.full_message } : {}),
      ...(config.includeTags && commit.tags ? { tags: commit.tags } : {}),
      ...(config.includeStats && commit.stats ? { stats: commit.stats } : {}),
      ...(config.includeFiles && commit.files ? { files: commit.files } : {})
    }))
  }
  
  return JSON.stringify(data, null, 2)
}

// 生成 CSV 格式
function generateCSV(): string {
  const lines: string[] = []
  const config = exportConfig.value
  
  if (config.includes.includes('commits')) {
    const commits = getCommitsToExport()
    
    // 头部
    const headers = ['Hash']
    if (config.includeAuthor) {
      headers.push('Author')
      if (config.includeEmail) {
        headers.push('Email')
      }
    }
    headers.push('Date', 'Message')
    if (config.includeStats) {
      headers.push('Additions', 'Deletions', 'Files Changed')
    }
    if (config.includeTags) {
      headers.push('Tags')
    }
    lines.push(headers.join(','))
    
    // 数据行
    commits.forEach(commit => {
      const row = [commit.hash.substring(0, 7)]
      
      if (config.includeAuthor) {
        row.push(`"${commit.author}"`)
        if (config.includeEmail) {
          row.push(commit.email)
        }
      }
      
      row.push(
        formatDate(commit.date, config.dateFormat),
        `"${commit.message.replace(/"/g, '""')}"`
      )
      
      if (config.includeStats && commit.stats) {
        row.push(String(commit.stats.additions))
        row.push(String(commit.stats.deletions))
        row.push(String(commit.stats.files))
      }
      
      if (config.includeTags) {
        row.push(commit.tags ? `"${commit.tags.join(', ')}"` : '')
      }
      
      lines.push(row.join(','))
    })
  }
  
  return lines.join('\n')
}

// 生成 HTML 格式
function generateHTML(): string {
  const config = exportConfig.value
  
  // 生成独特的 CSS 类前缀，避免样式污染
  const cssPrefix = 'git-export-' + Date.now()
  
  // 根据主题选择生成不同的样式
  const getThemeStyles = () => {
    if (config.htmlTheme === 'dark') {
      return `
    /* 深色主题 */
    .${cssPrefix}-root {
      --bg-primary: #1a1a1a;
      --bg-secondary: #2d2d2d;
      --bg-card: #2d2d2d;
      --text-primary: #e0e0e0;
      --text-secondary: #b0b0b0;
      --border-color: #404040;
      --accent-color: #4a9eff;
      --success-color: #4caf50;
      --danger-color: #f44336;
      --hover-bg: #3a3a3a;
    }`
    } else if (config.htmlTheme === 'auto') {
      return `
    /* 自动主题 - 浅色模式 */
    .${cssPrefix}-root {
      --bg-primary: #f5f5f5;
      --bg-secondary: #ffffff;
      --bg-card: #ffffff;
      --text-primary: #333333;
      --text-secondary: #7f8c8d;
      --border-color: #ecf0f1;
      --accent-color: #3498db;
      --success-color: #27ae60;
      --danger-color: #e74c3c;
      --hover-bg: #f8f9fa;
    }
    
    /* 自动主题 - 深色模式 */
    @media (prefers-color-scheme: dark) {
      .${cssPrefix}-root {
        --bg-primary: #1a1a1a;
        --bg-secondary: #2d2d2d;
        --bg-card: #2d2d2d;
        --text-primary: #e0e0e0;
        --text-secondary: #b0b0b0;
        --border-color: #404040;
        --accent-color: #4a9eff;
        --success-color: #4caf50;
        --danger-color: #f44336;
        --hover-bg: #3a3a3a;
      }
    }`
    } else {
      // 默认浅色主题
      return `
    /* 浅色主题 */
    .${cssPrefix}-root {
      --bg-primary: #f5f5f5;
      --bg-secondary: #ffffff;
      --bg-card: #ffffff;
      --text-primary: #333333;
      --text-secondary: #7f8c8d;
      --border-color: #ecf0f1;
      --accent-color: #3498db;
      --success-color: #27ae60;
      --danger-color: #e74c3c;
      --hover-bg: #f8f9fa;
    }`
    }
  }
  
  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Git 仓库分析报告</title>
  <style>
    /* 重置样式，使用独特的类名避免污染 */
    .${cssPrefix}-root * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    ${getThemeStyles()}
    
    /* 通用样式 */
    .${cssPrefix}-root {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-primary);
      min-height: 100vh;
    }
    
    .${cssPrefix}-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .${cssPrefix}-h1 {
      color: var(--text-primary);
      border-bottom: 3px solid var(--accent-color);
      padding-bottom: 10px;
      margin-bottom: 20px;
      font-size: 2em;
    }
    
    .${cssPrefix}-h2 {
      color: var(--text-primary);
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 1.5em;
    }
    
    .${cssPrefix}-info {
      background: var(--bg-card);
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
      border: 1px solid var(--border-color);
    }
    
    .${cssPrefix}-info p {
      margin: 5px 0;
      color: var(--text-primary);
    }
    
    .${cssPrefix}-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }
    
    .${cssPrefix}-stat-card {
      background: var(--bg-card);
      padding: 20px;
      border-radius: 5px;
      text-align: center;
      border: 1px solid var(--border-color);
    }
    
    .${cssPrefix}-stat-value {
      font-size: 2em;
      font-weight: bold;
      color: var(--accent-color);
    }
    
    .${cssPrefix}-stat-label {
      color: var(--text-secondary);
      margin-top: 5px;
    }
    
    .${cssPrefix}-table {
      width: 100%;
      background: var(--bg-card);
      border-collapse: collapse;
      margin: 20px 0;
      border: 1px solid var(--border-color);
      border-radius: 5px;
      overflow: hidden;
    }
    
    .${cssPrefix}-table th,
    .${cssPrefix}-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-primary);
    }
    
    .${cssPrefix}-table th {
      background: var(--accent-color);
      color: white;
      font-weight: 600;
    }
    
    .${cssPrefix}-table tr:hover {
      background: var(--hover-bg);
    }
    
    .${cssPrefix}-table tr:last-child td {
      border-bottom: none;
    }
    
    .${cssPrefix}-commit {
      background: var(--bg-card);
      padding: 15px;
      margin: 15px 0;
      border-radius: 5px;
      border: 1px solid var(--border-color);
    }
    
    .${cssPrefix}-commit p {
      margin: 8px 0;
      color: var(--text-primary);
    }
    
    .${cssPrefix}-commit-hash {
      display: inline-block;
      padding: 2px 8px;
      background: var(--danger-color);
      color: white;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 0.9em;
    }
    
    .${cssPrefix}-commit-date {
      float: right;
      color: var(--text-secondary);
    }
    
    .${cssPrefix}-commit pre {
      white-space: pre-wrap;
      font-family: inherit;
      color: var(--text-primary);
      margin: 10px 0;
    }
    
    .${cssPrefix}-additions {
      color: var(--success-color);
      font-weight: 500;
    }
    
    .${cssPrefix}-deletions {
      color: var(--danger-color);
      font-weight: 500;
      margin-left: 10px;
    }
    
    .${cssPrefix}-files-count {
      color: var(--text-secondary);
      margin-left: 10px;
    }
  </style>
</head>
<body class="${cssPrefix}-root">
  <div class="${cssPrefix}-container">
    <h1 class="${cssPrefix}-h1">Git 仓库分析报告</h1>
    
    <div class="${cssPrefix}-info">
      <p><strong>仓库路径:</strong> ${props.repoPath || '当前目录'}</p>
      <p><strong>分支:</strong> ${props.branch}</p>
      <p><strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
    </div>`
  
  // 统计信息
  if (config.includes.includes('statistics')) {
    html += `
    <h2 class="${cssPrefix}-h2">📊 统计信息</h2>
    <div class="${cssPrefix}-stats">
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${props.statistics.totalCommits}</div>
        <div class="${cssPrefix}-stat-label">总提交数</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${props.statistics.contributors}</div>
        <div class="${cssPrefix}-stat-label">贡献者数</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${props.statistics.timeSpan}</div>
        <div class="${cssPrefix}-stat-label">时间跨度(天)</div>
      </div>
      <div class="${cssPrefix}-stat-card">
        <div class="${cssPrefix}-stat-value">${props.statistics.averagePerDay.toFixed(2)}</div>
        <div class="${cssPrefix}-stat-label">平均提交/天</div>
      </div>
    </div>`
  }
  
  // 贡献者列表
  if (config.includes.includes('contributors')) {
    const contributors = getContributorStats()
    html += `
    <h2 class="${cssPrefix}-h2">👥 贡献者统计</h2>
    <table class="${cssPrefix}-table">
      <thead>
        <tr>
          <th>贡献者</th>
          <th>提交数</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>`
    
    contributors.slice(0, 10).forEach(c => {
      const percentage = ((c.count / props.statistics.totalCommits) * 100).toFixed(1)
      html += `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.count}</td>
          <td>${percentage}%</td>
        </tr>`
    })
    
    html += `
      </tbody>
    </table>`
  }
  
  // 提交记录
  if (config.includes.includes('commits')) {
    const commits = getCommitsToExport()
    html += `
    <h2 class="${cssPrefix}-h2">📝 提交记录 (${commits.length} 条)</h2>`
    
    commits.slice(0, 100).forEach(commit => {
      html += `
    <div class="${cssPrefix}-commit">
      <p>
        <span class="${cssPrefix}-commit-hash">${commit.hash.substring(0, 7)}</span>
        ${config.includeAuthor ? `<strong>${escapeHtml(commit.author)}</strong>${config.includeEmail ? ` &lt;${escapeHtml(commit.email)}&gt;` : ''}` : ''}
        <span class="${cssPrefix}-commit-date">${formatDate(commit.date, config.dateFormat)}</span>
      </p>`
      
      if (config.includeFullMessage && commit.full_message) {
        html += `<pre>${escapeHtml(commit.full_message)}</pre>`
      } else {
        html += `<p>${escapeHtml(commit.message)}</p>`
      }
      
      if (config.includeStats && commit.stats) {
        html += `
      <p>
        <span class="${cssPrefix}-additions">+${commit.stats.additions}</span>
        <span class="${cssPrefix}-deletions">-${commit.stats.deletions}</span>
        <span class="${cssPrefix}-files-count">${commit.stats.files} 文件</span>
      </p>`
      }
      
      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        html += `
      <p><strong>标签:</strong> ${commit.tags.map(t => escapeHtml(t)).join(', ')}</p>`
      }
      
      html += `
    </div>`
    })
  }
  
  html += `
  </div>
</body>
</html>`
  
  return html
}

// 生成纯文本格式
function generateText(): string {
  const lines: string[] = []
  const config = exportConfig.value
  
  lines.push('=' .repeat(60))
  lines.push('Git 仓库分析报告')
  lines.push('=' .repeat(60))
  lines.push('')
  lines.push(`仓库路径: ${props.repoPath || '当前目录'}`)
  lines.push(`分支: ${props.branch}`)
  lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`)
  lines.push('')
  
  if (config.includes.includes('statistics')) {
    lines.push('-'.repeat(40))
    lines.push('统计信息')
    lines.push('-'.repeat(40))
    lines.push(`总提交数: ${props.statistics.totalCommits}`)
    lines.push(`贡献者数: ${props.statistics.contributors}`)
    lines.push(`时间跨度: ${props.statistics.timeSpan} 天`)
    lines.push(`平均提交/天: ${props.statistics.averagePerDay.toFixed(2)}`)
    lines.push('')
  }
  
  if (config.includes.includes('contributors')) {
    const contributors = getContributorStats()
    lines.push('-'.repeat(40))
    lines.push('贡献者统计')
    lines.push('-'.repeat(40))
    contributors.slice(0, 10).forEach(c => {
      const percentage = ((c.count / props.statistics.totalCommits) * 100).toFixed(1)
      lines.push(`${c.name}: ${c.count} 次提交 (${percentage}%)`)
    })
    lines.push('')
  }
  
  if (config.includes.includes('commits')) {
    const commits = getCommitsToExport()
    lines.push('-'.repeat(40))
    lines.push(`提交记录 (${commits.length} 条)`)
    lines.push('-'.repeat(40))
    lines.push('')
    
    commits.forEach(commit => {
      lines.push(`[${commit.hash.substring(0, 7)}] ${formatDate(commit.date, config.dateFormat)}`)
      if (config.includeAuthor) {
        if (config.includeEmail) {
          lines.push(`作者: ${commit.author} <${commit.email}>`)
        } else {
          lines.push(`作者: ${commit.author}`)
        }
      }
      if (config.includeFullMessage && commit.full_message) {
        lines.push(`提交信息:`)
        lines.push(commit.full_message)
      } else {
        lines.push(`提交信息: ${commit.message}`)
      }
      
      if (config.includeStats && commit.stats) {
        lines.push(`变更: +${commit.stats.additions} -${commit.stats.deletions} (${commit.stats.files} 文件)`)
      }
      
      if (config.includeTags && commit.tags && commit.tags.length > 0) {
        lines.push(`标签: ${commit.tags.join(', ')}`)
      }
      
      lines.push('')
    })
  }
  
  return lines.join('\n')
}

// HTML 转义函数，防止 XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

// 获取贡献者统计
function getContributorStats() {
  const authorCounts = props.filteredCommits.reduce((acc, c) => {
    acc[c.author] = (acc[c.author] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  return Object.entries(authorCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

// 更新预览
async function updatePreview() {
  generating.value = true
  try {
    switch (exportConfig.value.format) {
      case 'markdown':
        previewContent.value = generateMarkdown()
        break
      case 'json':
        previewContent.value = generateJSON()
        break
      case 'csv':
        previewContent.value = generateCSV()
        break
      case 'html':
        previewContent.value = generateHTML()
        break
      case 'text':
        previewContent.value = generateText()
        break
    }
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
    text: 'txt'
  }
  
  const extension = formatExtensions[exportConfig.value.format]
  const fileName = `git-analysis-${new Date().getTime()}.${extension}`
  
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
      text: 'txt'
    }
    
    const extension = formatExtensions[exportConfig.value.format]
    const defaultName = `git-analysis-${new Date().getTime()}.${extension}`
    
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{
        name: exportConfig.value.format.toUpperCase(),
        extensions: [extension]
      }]
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
watch(exportConfig, (newConfig) => {
  emit('update:exportConfig', newConfig)
}, { deep: true })

// 监听对话框打开时更新预览
watch(() => visible.value, (val) => {
  if (val) {
    // 如果有初始配置，重新应用
    if (props.initialConfig) {
      exportConfig.value = { ...exportConfig.value, ...props.initialConfig }
    }
    updatePreview()
  }
})
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

.preview-section {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color-light);
  font-weight: 500;
}

.preview-content {
  background: var(--container-bg);
  height: 400px;
}

.preview-text {
  padding: 16px;
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
}

.preview-html {
  padding: 16px;
}

/* 覆盖 HTML 预览中的样式 */
.preview-html :deep(h1),
.preview-html :deep(h2),
.preview-html :deep(h3) {
  margin-top: 0;
}

.preview-html :deep(table) {
  margin: 10px 0;
}

:deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

:deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* 修复 radio-button 样式问题 */
:deep(.el-radio-button) {
  .el-radio-button__inner {
    border: 1px solid var(--el-border-color);
    border-radius: 4px !important;
    margin-right: 8px;
  }
  
  &:not(:last-child) .el-radio-button__inner {
    border-right: 1px solid var(--el-border-color);
  }
  
  &.is-active .el-radio-button__inner {
    border-color: var(--el-color-primary);
    background-color: var(--el-color-primary);
    color: var(--el-color-white);
  }
  
  &:hover .el-radio-button__inner {
    border-color: var(--el-color-primary);
  }
}
</style>