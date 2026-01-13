/**
 * 代码格式化选项
 */
export interface FormatOptions {
  /** 使用单引号 */
  singleQuote?: boolean;
  /** 尾随逗号 */
  trailingComma?: 'none' | 'es5' | 'all';
  /** 额外的 Prettier 选项 */
  [key: string]: any;
}

/**
 * 代码格式化结果
 */
export interface FormatResult {
  /** 格式化后的代码 */
  formatted: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果有） */
  error?: string;
  /** 警告信息（如果有） */
  warning?: string;
}

/**
 * 支持的语言类型
 */
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'html'
  | 'css'
  | 'markdown'
  | 'php'
  | 'xml'
  | 'yaml';