// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

/** 目录清理进度 */
export interface DirectoryCleanupProgress {
  currentItem: string;
  processedCount: number;
  totalCount: number;
  successCount: number;
  errorCount: number;
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
