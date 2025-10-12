/**
 * LLM 服务配置相关的类型定义
 */

/**
 * LLM 服务提供商类型
 * 决定了请求体的格式
 */
export type ProviderType = 'openai' | 'openai-responses' | 'gemini' | 'claude' | 'cohere' | 'huggingface' | 'vertexai';

/**
 * 服务提供商类型的显示信息
 */
export interface ProviderTypeInfo {
  type: ProviderType;
  name: string;
  description: string;
  defaultBaseUrl: string;
  supportsModelList: boolean; // 是否支持从 API 自动获取模型列表
  modelListEndpoint?: string; // 模型列表端点（相对路径）
}

/**
 * 单个模型的信息
 */
export interface LlmModelInfo {
  /**
   * 模型ID，用于 API 请求，例如 'gpt-4o', 'llava'
   */
  id: string;
  /**
   * 显示名称，用于 UI 展示，例如 'GPT-4o', 'LLaVA 1.5'
   */
  name: string;
  /**
   * 可选的分组名称，用于在 UI 中对模型进行分类
   */
  group?: string;
  /**
   * 模型所属的提供商标识 (e.g., 'openai', 'gemini', 'anthropic')
   * 用于 UI 显示 logo 等
   */
  provider?: string;
  /**
   * 模型能力标识
   */
  capabilities?: {
    /** 是否支持视觉输入（VLM） */
    vision?: boolean;
    /** 是否支持联网搜索 */
    webSearch?: boolean;
    /** 是否支持工具调用/函数调用 */
    toolUse?: boolean;
    /** 是否支持代码执行 */
    codeExecution?: boolean;
  };
  /**
   * 自定义模型图标路径（可选）
   * 优先级高于 provider 图标和全局匹配规则
   */
  icon?: string;
  /**
   * 模型描述信息（可选）
   * 用于在 UI 中显示模型的特性和用途说明
   */
  description?: string;
}

/**
 * 用户创建的单个 LLM 渠道配置
 */
export interface LlmProfile {
  /**
   * 配置实例的唯一ID (uuid)
   */
  id: string;
  /**
   * 用户自定义的渠道名称，例如 "我的本地 Ollama"
   */
  name: string;
  /**
   * 服务提供商类型
   */
  type: ProviderType;
  /**
   * API 基础地址，例如 'https://api.openai.com' 或 'http://localhost:11434'
   */
  baseUrl: string;
  /**
   * API Keys 列表，支持多个 Key 用于负载均衡和轮询
   */
  apiKeys: string[];
  /**
   * 是否启用该配置
   */
  enabled: boolean;
  /**
   * 该配置下用户添加的可用模型列表
   */
  models: LlmModelInfo[];
  /**
   * 渠道 Logo 的 URL 地址（可选）
   */
  logoUrl?: string;
  /**
   * 自定义供应商图标路径（可选）
   */
  icon?: string;
  /**
   * 自定义请求头（可选）
   */
  customHeaders?: Record<string, string>;
  /**
   * 模型分组的展开状态（可选）
   * key 为分组名称，value 为是否展开
   */
  modelGroupsExpandState?: Record<string, boolean>;
}