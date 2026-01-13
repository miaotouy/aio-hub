import { createConfigManager } from '../../../utils/configManager'

/**
 * Git 分析器配置接口
 */
export interface GitAnalyzerConfig {
  version: string
  // 基本设置
  repoPath: string
  selectedBranch: string
  limitCount: number
  batchSize: number
  activeTab: string
  pageSize: number
  
  // 筛选器设置
  searchQuery: string
  dateRange: [string, string] | null
  authorFilter: string
  commitRange: [number, number]
  reverseOrder: boolean
  commitTypeFilter: string[]
  
  // 导出配置
  exportConfig: {
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
    includeFilterInfo: boolean
    htmlTheme: 'light' | 'dark' | 'auto'
  }
}

/**
 * 创建默认配置
 */
function createDefaultConfig(): GitAnalyzerConfig {
  return {
    version: '1.0.0',
    // 基本设置
    repoPath: '',
    selectedBranch: 'main',
    limitCount: 100,
    batchSize: 20,
    activeTab: 'list',
    pageSize: 20,
    
    // 筛选器设置
    searchQuery: '',
    dateRange: null,
    authorFilter: '',
    commitRange: [0, 0],
    reverseOrder: false,
    commitTypeFilter: [],
    
    // 导出配置
    exportConfig: {
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
      includeFilterInfo: true,
      htmlTheme: 'auto'
    }
  }
}

/**
 * Git 分析器配置管理器
 */
export const gitAnalyzerConfigManager = createConfigManager<GitAnalyzerConfig>({
  moduleName: 'git-analyzer',
  fileName: 'config.json',
  version: '1.0.0',
  createDefault: createDefaultConfig,
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 深度合并导出配置
    const mergedExportConfig = {
      ...defaultConfig.exportConfig,
      ...loadedConfig.exportConfig
    }
    
    return {
      ...defaultConfig,
      ...loadedConfig,
      exportConfig: mergedExportConfig,
      version: defaultConfig.version
    }
  }
})

/**
 * 保存配置的防抖函数
 */
export const debouncedSaveConfig = gitAnalyzerConfigManager.saveDebounced