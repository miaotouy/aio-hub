import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { GitCommit, GitBranch, RepoStatistics } from '../types'
import { createModuleLogger } from '@utils/logger'

const logger = createModuleLogger('GitRepository')

export function useGitRepository() {
  // 状态
  const loading = ref(false)
  const repoPath = ref('')
  const selectedBranch = ref('main')
  const branches = ref<GitBranch[]>([])
  const commits = ref<GitCommit[]>([])
  const filteredCommits = ref<GitCommit[]>([])
  const limitCount = ref(100)
  const commitRange = ref<[number, number]>([0, 0])

  // 筛选状态
  const searchQuery = ref('')
  const dateRange = ref<[Date, Date] | null>(null)
  const authorFilter = ref('')
  const reverseOrder = ref(false)

  // 分页状态
  const currentPage = ref(1)
  const pageSize = ref(20)

  // 增量加载状态：记录上次加载的仓库路径和分支
  const lastLoadedRepo = ref('')
  const lastLoadedBranch = ref('')
  const lastLoadedLimit = ref(0)

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
      logger.error('选择目录失败', error, {
        action: 'selectDirectory',
        context: '用户选择 Git 仓库目录时发生错误'
      })
      ElMessage.error('选择目录失败')
    }
  }

  // 方法 - 加载仓库（增量加载）
  async function loadRepository() {
    loading.value = true
    try {
      const currentRepoPath = repoPath.value || '.'
      const currentBranch = selectedBranch.value

      // 检查是否是同一个仓库和分支，且只是增加了数量限制
      const isSameRepo = lastLoadedRepo.value === currentRepoPath
      const isSameBranch = lastLoadedBranch.value === currentBranch
      const isIncrementalLoad = isSameRepo && isSameBranch && limitCount.value > lastLoadedLimit.value

      if (isIncrementalLoad) {
        // 增量加载：只加载新增的部分
        const skip = lastLoadedLimit.value
        const newLimit = limitCount.value - lastLoadedLimit.value

        const newCommits = await invoke<GitCommit[]>('git_get_incremental_commits', {
          path: currentRepoPath,
          branch: currentBranch,
          skip,
          limit: newLimit,
        })

        // 将新提交添加到现有列表末尾
        commits.value = [...commits.value, ...newCommits]
        filteredCommits.value = commits.value

        // 更新记录
        lastLoadedLimit.value = limitCount.value

        ElMessage.success(`增量加载了 ${newCommits.length} 条新提交记录，当前共 ${commits.value.length} 条`)
      } else {
        // 全量加载
        const result = await invoke<{ branches: GitBranch[]; commits: GitCommit[] }>(
          'git_load_repository',
          {
            path: currentRepoPath,
            limit: limitCount.value,
          }
        )

        branches.value = result.branches
        commits.value = result.commits
        filteredCommits.value = result.commits

        // 重置提交范围
        commitRange.value = [0, result.commits.length]

        // 设置当前分支
        const currentBranchInfo = result.branches.find((b) => b.current)
        if (currentBranchInfo) {
          selectedBranch.value = currentBranchInfo.name
        }

        // 更新记录
        lastLoadedRepo.value = currentRepoPath
        lastLoadedBranch.value = selectedBranch.value
        lastLoadedLimit.value = limitCount.value

        ElMessage.success(`加载了 ${result.commits.length} 条提交记录`)
      }

      return true
    } catch (error) {
      ElMessage.error(`加载仓库失败: ${error}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // 方法 - 刷新仓库（全量重载）
  async function refreshRepository() {
    loading.value = true
    try {
      const currentRepoPath = repoPath.value || '.'

      const result = await invoke<{ branches: GitBranch[]; commits: GitCommit[] }>(
        'git_load_repository',
        {
          path: currentRepoPath,
          limit: limitCount.value,
        }
      )

      branches.value = result.branches
      commits.value = result.commits
      filteredCommits.value = result.commits

      // 重置提交范围
      commitRange.value = [0, result.commits.length]

      // 设置当前分支
      const currentBranch = result.branches.find((b) => b.current)
      if (currentBranch) {
        selectedBranch.value = currentBranch.name
      }

      // 更新记录
      lastLoadedRepo.value = currentRepoPath
      lastLoadedBranch.value = selectedBranch.value
      lastLoadedLimit.value = limitCount.value

      ElMessage.success(`刷新完成，加载了 ${result.commits.length} 条提交记录`)

      return true
    } catch (error) {
      ElMessage.error(`刷新仓库失败: ${error}`)
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

      // 重置提交范围
      commitRange.value = [0, result.length]

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
    // 首先根据范围选择器从原始列表中切片
    let filtered = commits.value.slice(commitRange.value[0], commitRange.value[1])

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

    // 倒序排列
    if (reverseOrder.value) {
      filtered = [...filtered].reverse()
    }

    filteredCommits.value = filtered
    currentPage.value = 1
  }

  // 方法 - 清除筛选
  function clearFilters() {
    searchQuery.value = ''
    dateRange.value = null
    authorFilter.value = ''
    reverseOrder.value = false
    // 重新应用筛选（此时只会应用范围选择）
    filterCommits()
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
    commitRange,
    searchQuery,
    dateRange,
    authorFilter,
    reverseOrder,
    currentPage,
    pageSize,

    // 计算属性
    statistics,
    paginatedCommits,

    // 方法
    selectDirectory,
    loadRepository,
    refreshRepository,
    onBranchChange,
    filterCommits,
    clearFilters,
    handlePathDrop,
  }
}