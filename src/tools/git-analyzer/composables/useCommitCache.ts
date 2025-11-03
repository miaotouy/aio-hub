import type { GitCommit } from '../types'
import { createModuleLogger } from '@utils/logger'

const logger = createModuleLogger('git-analyzer:cache')

/**
 * Git Commit 缓存服务
 * 
 * 统一管理提交详情的缓存，支持：
 * 1. 单个提交详情缓存（CommitDetailDialog 使用）
 * 2. 批量提交文件信息缓存（ExportModule 使用）
 */
class CommitCacheService {
  // 单个提交详情缓存: hash -> GitCommit
  private detailCache = new Map<string, GitCommit>()
  
  // 批量文件信息缓存: `${repoPath}:${branch}` -> GitCommit[]
  private batchCache = new Map<string, GitCommit[]>()

  /**
   * 生成批量缓存的键
   */
  private getBatchCacheKey(repoPath: string, branch: string): string {
    return `${repoPath}:${branch}`
  }

  /**
   * 获取单个提交的详情
   */
  getCommitDetail(hash: string): GitCommit | undefined {
    return this.detailCache.get(hash)
  }

  /**
   * 设置单个提交的详情
   */
  setCommitDetail(hash: string, commit: GitCommit): void {
    this.detailCache.set(hash, commit)
    logger.debug('缓存单个提交详情', { sha: hash.substring(0, 8) })
  }

  /**
   * 获取批量提交的文件信息
   */
  getBatchCommits(repoPath: string, branch: string): GitCommit[] | undefined {
    const key = this.getBatchCacheKey(repoPath, branch)
    return this.batchCache.get(key)
  }

  /**
   * 设置批量提交的文件信息
   * 同时更新单个提交详情缓存
   */
  setBatchCommits(repoPath: string, branch: string, commits: GitCommit[]): void {
    const key = this.getBatchCacheKey(repoPath, branch)
    this.batchCache.set(key, commits)
    
    // 同时将每个 commit 添加到详情缓存中
    commits.forEach(commit => {
      if (commit.files) {
        this.detailCache.set(commit.hash, commit)
      }
    })
    
    logger.debug('缓存批量提交文件信息', { 
      cacheKey: key,
      count: commits.length,
      withFiles: commits.filter(c => c.files).length
    })
  }

  /**
   * 清空指定仓库/分支的批量缓存
   */
  clearBatchCache(repoPath: string, branch: string): void {
    const key = this.getBatchCacheKey(repoPath, branch)
    if (this.batchCache.has(key)) {
      this.batchCache.delete(key)
      logger.debug('已清空批量缓存', { cacheKey: key })
    }
  }

  /**
   * 清空所有单个提交详情缓存
   */
  clearDetailCache(): void {
    this.detailCache.clear()
    logger.debug('已清空所有提交详情缓存')
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.detailCache.clear()
    this.batchCache.clear()
    logger.debug('已清空所有缓存')
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      detailCacheSize: this.detailCache.size,
      batchCacheKeys: Array.from(this.batchCache.keys()),
      batchCacheTotalCommits: Array.from(this.batchCache.values()).reduce(
        (sum, commits) => sum + commits.length, 
        0
      )
    }
  }
}

// 创建单例实例
export const commitCache = new CommitCacheService()