/**
 * 内容查重工具类型定义
 *
 * 与 Rust 后端 content_deduplicator.rs 的结构一一对应
 */

// ==================== 配置类型 ====================

/** 规范化选项 */
export interface NormalizeOptions {
  /** 忽略空白字符 */
  ignoreWhitespace: boolean;
  /** 忽略标点 */
  ignorePunctuation: boolean;
  /** 大小写敏感 */
  caseSensitive: boolean;
  /** 保留换行（代码需要） */
  preserveLineBreaks: boolean;
}

/** 相似度配置（传给 Rust 的完整配置） */
export interface SimilarityConfig {
  /** 扩展名白名单（空数组表示所有文本文件） */
  extensions: string[];
  /** glob 忽略模式 */
  ignorePatterns: string[];
  /** 最大文件大小 (MB) */
  maxFileSizeMb: number;
  /** 尺寸差异阈值（默认 0.05 即 5%） */
  sizeDiffThreshold: number;
  /** 最小相似度阈值（默认 0.85） */
  minSimilarity: number;
  /** 小文件阈值 (bytes)，默认 3072 (3KB) */
  suspiciousSizeLimit: number;
  /** 预设名称 */
  preset: string;
  /** 规范化选项 */
  normalizeOptions: NormalizeOptions;
}

// ==================== 结果类型 ====================

/** 文件信息 */
export interface DedupFileInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
  extension: string;
  isText: boolean;
}

/** 相似文件 */
export interface SimilarFile {
  file: DedupFileInfo;
  similarity: number;
  matchType: "exact" | "normalized" | "fuzzy";
  diffSummary: string | null;
}

/** 重复组元数据 */
export interface DuplicateGroupMetadata {
  isSuspicious: boolean;
  totalWastedBytes: number;
  avgSimilarity: number;
}

/** 重复组 */
export interface DuplicateGroup {
  id: string;
  representativeFile: DedupFileInfo;
  similarFiles: SimilarFile[];
  metadata: DuplicateGroupMetadata;
}

/** 统计信息 */
export interface DedupStatistics {
  totalFilesScanned: number;
  totalTextFiles: number;
  totalGroups: number;
  totalDuplicates: number;
  totalWastedBytes: number;
}

/** 跳过的文件 */
export interface SkippedFile {
  path: string;
  reason: string;
}

/** 扫描结果 */
export interface DedupAnalysisResult {
  groups: DuplicateGroup[];
  statistics: DedupStatistics;
  skippedFiles: SkippedFile[];
}

/** 删除结果 */
export interface DedupDeleteResult {
  successCount: number;
  errorCount: number;
  freedSpace: number;
  errors: string[];
}

// ==================== 进度类型 ====================

/** 阶段进度 */
export interface StageProgress {
  current: number;
  total: number;
}

/** 扫描进度事件 */
export interface DedupScanProgress {
  stage: "collecting" | "size-filter" | "fingerprint" | "hashing" | "building";
  stageProgress: StageProgress;
  foundGroups: number;
  currentFile: string | null;
}

/** 删除进度事件 */
export interface DedupDeleteProgress {
  current: number;
  total: number;
  currentFile: string;
}

// ==================== UI 状态类型 ====================

/** 排序方式 */
export type SortBy = "wastedBytes" | "similarity" | "fileCount";

/** 筛选匹配类型 */
export type FilterMatchType = "all" | "exact" | "normalized" | "fuzzy";
