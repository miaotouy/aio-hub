import { ref } from 'vue'
import { customMessage } from '@/utils/customMessage'
import { invoke } from '@tauri-apps/api/core'
import type { GitCommit } from '../types'
import { createModuleLogger } from '@utils/logger'
import { commitCache } from './useCommitCache'

const logger = createModuleLogger('git-analyzer:useCommitDetail')

export function useCommitDetail(repoPath: () => string) {
  // 状态
  const selectedCommit = ref<GitCommit | null>(null)
  const showDetail = ref(false)

  /**
   * 选择提交并显示详情
   */
  function selectCommit(commit: GitCommit) {
    selectedCommit.value = commit
    showDetail.value = true
    
    // 检查统一缓存
    const cached = commitCache.getCommitDetail(commit.hash)
    if (cached) {
      logger.debug('使用缓存的 commit 详细信息', { sha: commit.hash.substring(0, 8) })
      selectedCommit.value = cached
    } else {
      // 缓存未命中，从后端加载
      loadCommitDetail(commit.hash)
    }
  }

  /**
   * 加载提交详情
   */
  async function loadCommitDetail(hash: string) {
    try {
      const detail = await invoke<GitCommit>('git_get_commit_detail', {
        path: repoPath() || '.',
        hash,
      })
      logger.debug('从后端成功获取 commit 详细信息', {
        sha: hash.substring(0, 8),
        fullSha: hash,
        author: detail.author,
        date: detail.date,
        message: detail.message.substring(0, 100),
      })
      
      // 更新统一缓存
      commitCache.setCommitDetail(hash, detail)
      selectedCommit.value = detail
    } catch (error) {
      customMessage.error(`加载提交详情失败: ${error}`)
    }
  }

  /**
   * 复制提交哈希到剪贴板
   */
  async function copyCommitHash() {
    if (selectedCommit.value) {
      await navigator.clipboard.writeText(selectedCommit.value.hash)
      customMessage.success('已复制提交哈希')
    }
  }

  /**
   * 格式化日期为本地化字符串
   */
  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('zh-CN')
  }

  /**
   * 格式化日期为完整的本地化字符串
   */
  function formatFullDate(date: string): string {
    return new Date(date).toLocaleString('zh-CN')
  }

  /**
   * 清空缓存（在切换仓库或分支时调用）
   */
  function clearCache() {
    commitCache.clearDetailCache()
  }

  return {
    // 状态
    selectedCommit,
    showDetail,

    // 方法
    selectCommit,
    loadCommitDetail,
    copyCommitHash,
    formatDate,
    formatFullDate,
    clearCache,
  }
}