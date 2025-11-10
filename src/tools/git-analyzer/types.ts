/**
 * Git 分析器类型定义
 */

export interface GitBranch {
  name: string
  current: boolean
  remote: boolean
}

export interface GitCommit {
  hash: string
  author: string
  email: string
  date: string
  message: string
  full_message?: string
  parents?: string[]
  tags?: string[]
  branches?: string[]
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

export interface ExportConfig {
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
  includeBranches: boolean
  includeStats: boolean
  includeFilterInfo: boolean
  htmlTheme: 'light' | 'dark' | 'auto'
}

export interface RepoStatistics {
  totalCommits: number
  contributors: number
  timeSpan: number
  averagePerDay: number
}