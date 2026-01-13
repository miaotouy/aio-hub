/**
 * 正则工具模块的类型定义
 */

/** 单条正则规则 */
export interface RegexRule {
  id: string;
  enabled: boolean;
  regex: string;
  replacement: string;
  name?: string; // 规则名称，可选字段
}

/** 正则预设 */
export interface RegexPreset {
  id: string;
  name: string;
  description?: string;
  rules: RegexRule[];
  createdAt?: number;
  updatedAt?: number;
}

/** 预设配置文件结构 */
export interface PresetsConfig {
  presets: RegexPreset[];
  activePresetId: string | null;
  version: string;
}

/** 日志条目 */
export interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'warn' | 'error';
}

/** 规则应用结果 */
export interface ApplyResult {
  text: string;
  appliedRulesCount: number;
  logs: LogEntry[];
}

/** 文本处理选项 */
export interface TextProcessOptions {
  /** 源文本 */
  sourceText: string;
  /** 预设ID列表（按顺序应用） */
  presetIds: string[];
}

/** 文本处理结果 */
export interface TextProcessResult {
  /** 处理后的文本 */
  text: string;
  /** 应用的规则总数 */
  totalRulesApplied: number;
  /** 日志条目 */
  logs: LogEntry[];
}

/** 文件处理选项 */
export interface FileProcessOptions {
  /** 文件路径列表 */
  filePaths: string[];
  /** 输出目录 */
  outputDir: string;
  /** 预设ID列表（按顺序应用） */
  presetIds: string[];
  /** 是否强制保存为 .txt */
  forceTxt?: boolean;
  /** 文件名后缀 */
  filenameSuffix?: string;
}

/** 文件处理结果（来自 Rust 后端） */
export interface FileProcessResult {
  /** 成功处理的文件数 */
  success_count: number;
  /** 失败的文件数 */
  error_count: number;
  /** 总匹配次数 */
  total_matches: number;
  /** 处理耗时（毫秒） */
  duration_ms: number;
  /** 错误映射表 */
  errors?: Record<string, string>;
  /** 后端日志 */
  logs?: Array<{ level: string; message: string }>;
}

/** 格式化的处理摘要 */
export interface FormattedProcessSummary {
  /** 摘要信息 */
  summary: string;
  /** 详细信息 */
  details: {
    /** 成功数 */
    successCount: number;
    /** 失败数 */
    errorCount?: number;
    /** 总匹配数 */
    totalMatches?: number;
    /** 耗时 */
    duration?: string;
    /** 应用的规则数 */
    rulesApplied?: number;
  };
}

/** 一键处理选项 */
export interface OneClickOptions {
  /** 预设ID列表 */
  presetIds: string[];
}