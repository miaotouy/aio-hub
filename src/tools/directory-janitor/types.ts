/**
 * 目录清理工具类型定义
 */

/** 项目信息 */
export interface ItemInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
}

/** 统计信息 */
export interface Statistics {
  totalItems: number;
  totalSize: number;
  totalDirs: number;
  totalFiles: number;
}

/** 分析结果 */
export interface AnalysisResult {
  items: ItemInfo[];
  statistics: Statistics;
}

/** 清理结果 */
export interface CleanupResult {
  successCount: number;
  errorCount: number;
  freedSpace: number;
  errors: string[];
}

/** 目录扫描进度 */
export interface DirectoryScanProgress {
  currentPath: string;
  scannedCount: number;
  currentDepth: number;
  foundItems: number;
}

/** 配置状态 */
export interface ScanConfig {
  scanPath: string;
  namePattern: string;
  minAgeDays?: number;
  minSizeMB?: number;
  maxDepth: number;
}

/** 过滤条件 */
export interface FilterConfig {
  filterNamePattern: string;
  filterMinAgeDays?: number;
  filterMinSizeMB?: number;
}