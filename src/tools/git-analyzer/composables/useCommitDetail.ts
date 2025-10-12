import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { invoke } from '@tauri-apps/api/core'
import type { GitCommit } from '../types'
import { createModuleLogger } from '@utils/logger'

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
    loadCommitDetail(commit.hash)
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
      selectedCommit.value = detail
    } catch (error) {
      ElMessage.error(`加载提交详情失败: ${error}`)
    }
  }

  /**
   * 复制提交哈希到剪贴板
   */
  async function copyCommitHash() {
    if (selectedCommit.value) {
      await navigator.clipboard.writeText(selectedCommit.value.hash)
      ElMessage.success('已复制提交哈希')
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
  }
}