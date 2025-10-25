/**
 * 模型元数据匹配规则配置类型定义
 * 
 * 这是一个通用的模型元数据管理系统，支持为模型预设任意属性，
 * 包括但不限于：图标、分组、能力标签、上下文长度、价格等。
 */

/**
 * 匹配规则类型
 */
export type MetadataMatchType = 'provider' | 'model' | 'modelPrefix' | 'modelGroup';

/**
 * 模型元数据属性
 * 
 * 这是一个开放的接口，允许存储任意模型相关的元数据。
 * 你可以根据需要添加新的属性字段。
 */
export interface ModelMetadataProperties {
  /** 图标路径（相对于 public 目录或绝对路径） */
  icon?: string;
  
  /** 分组名称 */
  group?: string;
  
  /** 模型能力（与 LlmModelInfo.capabilities 结构相同） */
  capabilities?: import('./llm-profiles').ModelCapabilities;
  
  /** 上下文长度（token 数） */
  contextLength?: number;
  
  /** 价格信息 */
  pricing?: {
    /** 输入价格（每百万 token） */
    input?: number;
    /** 输出价格（每百万 token） */
    output?: number;
    /** 价格单位（如：'USD', 'CNY'） */
    unit?: string;
    /** 额外说明（如：'按需计费', '包月套餐'） */
    note?: string;
  };
  
  /** 模型描述 */
  description?: string;
  
  /** 推荐用途（如：['对话', '代码生成', '文档分析']） */
  recommendedFor?: string[];
  
  /** 模型版本 */
  version?: string;
  
  /** 发布日期（ISO 8601 格式） */
  releaseDate?: string;
  
  /** API 端点 URL */
  apiEndpoint?: string;
  
  /** 支持的功能特性 */
  features?: {
    /** 是否支持流式输出 */
    streaming?: boolean;
    /** 是否支持函数调用 */
    functionCalling?: boolean;
    /** 是否支持视觉输入 */
    vision?: boolean;
    /** 是否支持音频输入 */
    audio?: boolean;
    /** 其他自定义特性 */
    [key: string]: boolean | undefined;
  };
  
  /** 任意其他元数据（允许动态扩展） */
  [key: string]: unknown;
}

/**
 * 模型元数据匹配规则
 * 
 * 定义了一个匹配规则，当模型 ID 或提供商满足条件时，
 * 将应用 properties 中定义的元数据。
 */
export interface ModelMetadataRule {
  /** 唯一标识 */
  id: string;
  
  /** 匹配类型 */
  matchType: MetadataMatchType;
  
  /** 匹配值（可以是字符串或正则表达式） */
  matchValue: string;
  
  /** 匹配成功后应用的元数据属性 */
  properties: ModelMetadataProperties;
  
  /** 优先级（数字越大优先级越高，默认 0） */
  priority?: number;
  
  /** 是否启用（默认 true） */
  enabled?: boolean;
  
  /** 是否使用正则表达式匹配（仅对 model、modelPrefix 有效） */
  useRegex?: boolean;
  
  /** 备注说明 */
  description?: string;
}

/**
 * 元数据配置存储结构
 */
export interface ModelMetadataStore {
  /** 配置版本 */
  version: string;
  
  /** 配置规则列表 */
  rules: ModelMetadataRule[];
  
  /** 最后更新时间 */
  updatedAt?: string;
}

/**
 * 预设图标信息
 * 
 * 用于在 UI 中展示可选的预设图标，
 * 保持向后兼容原有的图标选择器功能。
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