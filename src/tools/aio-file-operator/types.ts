/**
 * aio-file-operator 类型定义
 */

/** 文件条目信息 */
export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modified: number | null;
  created: number | null;
}

/** 读取文件参数 */
export interface ReadFileParams {
  path: string;
}

/** 写入文件参数 */
export interface WriteFileParams {
  path: string;
  content: string;
  /** 是否允许覆盖已有文件。若为 false，文件已存在时会自动累加序号（如 report(1).txt） */
  allowOverwrite?: boolean;
}

/** 追加文件参数 */
export interface AppendFileParams {
  path: string;
  content: string;
}

/** 删除文件参数 */
export interface DeleteFileParams {
  path: string;
}

/** 列出目录参数 */
export interface ListDirectoryParams {
  path: string;
}

/** 应用 Diff 参数 */
export interface ApplyDiffParams {
  path: string;
  search: string;
  replace: string;
  startLine?: number;
}

/** 创建目录参数 */
export interface CreateDirectoryParams {
  path: string;
}

/** 文件操作结果 */
export interface FileOperationResult {
  success: boolean;
  message: string;
  data?: any;
}

/** 操作日志条目 */
export interface OperationLogEntry {
  timestamp: number;
  method: string;
  params: Record<string, any>;
  result: FileOperationResult;
}

/** 工具配置 */
export interface AioFileOperatorConfig {
  /** 允许访问的沙箱目录列表 */
  allowedDirectories: string[];
  /** 最大文件大小（字节），默认 10MB */
  maxFileSize: number;
  /** 是否启用操作日志 */
  enableAuditLog: boolean;
  /** 文件覆盖策略 */
  overwritePolicy: "follow" | "always" | "never";
}
