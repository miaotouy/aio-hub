/**
 * 模型图标配置类型定义
 */

/**
 * 图标匹配规则类型
 */
export type IconMatchType = 'provider' | 'model' | 'modelPrefix' | 'modelGroup';

/**
 * 图标配置项
 */
export interface ModelIconConfig {
  /** 唯一标识 */
  id: string;
  /** 匹配类型 */
  matchType: IconMatchType;
  /** 匹配值 */
  matchValue: string;
  /** 图标路径（相对于 public 目录或绝对路径） */
  iconPath: string;
  /** 优先级（数字越大优先级越高） */
  priority?: number;
  /** 是否启用 */
  enabled?: boolean;
  /** 备注说明 */
  description?: string;
}

/**
 * 图标配置存储结构
 */
export interface ModelIconConfigStore {
  /** 配置版本 */
  version: string;
  /** 配置列表 */
  configs: ModelIconConfig[];
  /** 最后更新时间 */
  updatedAt?: string;
}

/**
 * 预设图标信息
 */
export interface PresetIconInfo {
  /** 图标名称 */
  name: string;
  /** 图标路径（相对于预设目录） */
  path: string;
  /** 推荐用于的提供商/模型 */
  suggestedFor?: string[];
  /** 图标分类 */
  category?: string;
}