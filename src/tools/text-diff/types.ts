/**
 * 文件读取结果
 */
export interface FileReadResult {
  /** 文件内容 */
  content: string;
  /** 文件路径 */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 推断的语言类型 */
  language: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 文件保存结果
 */
export interface FileSaveResult {
  /** 保存的文件路径 */
  filePath: string;
  /** 文件名 */
  fileName: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * 补丁生成选项
 */
export interface PatchOptions {
  /** 旧文件名 */
  oldFileName?: string;
  /** 新文件名 */
  newFileName?: string;
  /** 是否忽略行尾空白 */
  ignoreWhitespace?: boolean;
  /** 上下文行数 */
  context?: number;
}

/**
 * 补丁生成结果
 */
export interface PatchResult {
  /** 补丁内容 */
  patch: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
}