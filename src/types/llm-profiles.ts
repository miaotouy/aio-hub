/**
 * LLM 服务配置相关的类型定义
 */

/**
 * LLM 服务提供商类型
 * 决定了请求体的格式
 */
export type ProviderType = 'openai' | 'gemini' | 'claude';

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
   * 是否为视觉模型（VLM）
   */
  isVision?: boolean;
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
   * API Key
   */
  apiKey: string;
  /**
   * 是否启用该配置
   */
  enabled: boolean;
  /**
   * 该配置下用户添加的可用模型列表
   */
  models: LlmModelInfo[];
}