/**
 * 符号链接移动工具的类型定义
 */

/**
 * 文件项
 */
export interface FileItem {
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  isDirectory?: boolean;
  isCrossDevice?: boolean;
  warning?: string;
}

/**
 * 文件验证结果
 */
export interface FileValidation {
  isDirectory: boolean;
  isCrossDevice: boolean;
  exists: boolean;
}

/**
 * 操作日志
 */
export interface OperationLog {
  timestamp: number;
  operationType: string;
  linkType: string;
  sourceCount: number;
  successCount: number;
  errorCount: number;
  errors: string[];
  durationMs: number;
  targetDirectory: string;
  sourcePaths: string[];
  totalSize: number;
  processedFiles: string[];
}

/**
 * 进度事件
 */
export interface CopyProgress {
  currentFile: string;
  copiedBytes: number;
  totalBytes: number;
  progressPercentage: number;
}

/**
 * 链接类型
 */
export type LinkType = 'symlink' | 'link';

/**
 * 操作模式
 */
export type OperationMode = 'move' | 'link-only';

/**
 * 移动和链接选项
 */
export interface MoveAndLinkOptions {
  sourcePaths: string[];
  targetDir: string;
  linkType: LinkType;
  baseSourceDir?: string; // 镜像搬家模式的基准源目录
}

/**
 * 仅创建链接选项
 */
export interface CreateLinksOnlyOptions {
  sourcePaths: string[];
  targetDir: string;
  linkType: LinkType;
  baseSourceDir?: string; // 镜像搬家模式的基准源目录
}

/**
 * 验证文件选项
 */
export interface ValidateFileOptions {
  sourcePath: string;
  targetDir: string;
  linkType: LinkType;
}

/**
 * 格式化的日志摘要
 */
export interface FormattedLogSummary {
  time: string;
  operationType: string;
  linkType: string;
  status: 'success' | 'partial' | 'failed';
  summary: string;
  details: {
    totalFiles: number;
    successFiles: number;
    failedFiles: number;
    totalSize: string;
    duration: string;
    targetDirectory: string;
  };
  errors?: string[];
}