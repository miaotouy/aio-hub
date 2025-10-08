import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { GitCommit, GitBranch, RepoStatistics } from '../types'

export function useGitRepository() {
  // 状态
  const loading = ref(false)
  const repoPath = ref('')
  const selectedBranch = ref('main')
  const branches = ref<GitBranch[]>([])
  const commits = ref<GitCommit[]>([])
  const filteredCommits = ref<GitCommit[]>([])
  const limitCount = ref(100)

  // 筛选状态
  const searchQuery = ref('')
  const dateRange = ref<[Date, Date] | null>(null)
  const authorFilter = ref('')

  // 分页状态
  const currentPage = ref(1)
  const pageSize = ref(20)

  // 计算属性 - 统计信息
  const statistics = computed<RepoStatistics>(() => {
    const commits = filteredCommits.value
    if (commits.length === 0) {
      return {
        totalCommits: 0,
        contributors: 0,
        timeSpan: 0,
        averagePerDay: 0,
      }
    }

    const authors = new Set(commits.map((c) => c.author))
    const dates = commits.map((c) => new Date(c.date).getTime())
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))

    return {
      totalCommits: commits.length,
      contributors: authors.size,
      timeSpan: days,
      averagePerDay: commits.length / Math.max(days, 1),
    }
  })

  // 计算属性 - 分页后的提交列表
  const paginatedCommits = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredCommits.value.slice(start, end)
  })

  // 方法 - 选择目录
  async function selectDirectory() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: '选择 Git 仓库目录',
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

  // 方法 - 加载仓库
  async function loadRepository() {
    loading.value = true
    try {
      const result = await invoke<{ branches: GitBranch[]; commits: GitCommit[] }>(
        'git_load_repository',
        {
          path: repoPath.value || '.',
          limit: limitCount.value,
        }
      )

      branches.value = result.branches
      commits.value = result.commits
      filteredCommits.value = result.commits

      // 设置当前分支
      const currentBranch = result.branches.find((b) => b.current)
      if (currentBranch) {
        selectedBranch.value = currentBranch.name
      }

      ElMessage.success(`加载了 ${result.commits.length} 条提交记录`)

      return true
    } catch (error) {
      ElMessage.error(`加载仓库失败: ${error}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // 方法 - 切换分支
  async function onBranchChange(branch: string) {
    loading.value = true
    try {
      const result = await invoke<GitCommit[]>('git_get_branch_commits', {
        path: repoPath.value || '.',
        branch,
        limit: limitCount.value,
      })

      commits.value = result
      filteredCommits.value = result
      ElMessage.success(`切换到分支: ${branch}`)

      return true
    } catch (error) {
      ElMessage.error(`切换分支失败: ${error}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // 方法 - 筛选提交
  function filterCommits() {
    let filtered = [...commits.value]

    // 搜索筛选
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      filtered = filtered.filter(
        (c) => c.message.toLowerCase().includes(query) || c.hash.toLowerCase().includes(query)
      )
    }

    // 作者筛选
    if (authorFilter.value) {
      const author = authorFilter.value.toLowerCase()
      filtered = filtered.filter((c) => c.author.toLowerCase().includes(author))
    }

    // 日期筛选
    if (dateRange.value) {
      const [start, end] = dateRange.value
      filtered = filtered.filter((c) => {
        const date = new Date(c.date)
        return date >= start && date <= end
      })
    }

    filteredCommits.value = filtered
    currentPage.value = 1
  }

  // 方法 - 清除筛选
  function clearFilters() {
    searchQuery.value = ''
    dateRange.value = null
    authorFilter.value = ''
    filteredCommits.value = commits.value
    currentPage.value = 1
  }

  // 方法 - 处理路径拖放
  function handlePathDrop(paths: string[]) {
    if (paths.length > 0) {
      repoPath.value = paths[0]
      ElMessage.success(`已设置 Git 仓库路径: ${paths[0]}`)

      // 自动加载仓库
      setTimeout(() => {
        loadRepository()
      }, 500)
    }
  }

  return {
    // 状态
    loading,
    repoPath,
    selectedBranch,
    branches,
    commits,
    filteredCommits,
    limitCount,
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
    loadRepository,
    onBranchChange,
    filterCommits,
    clearFilters,
    handlePathDrop,
  }
}