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