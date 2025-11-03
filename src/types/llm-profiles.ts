/**
 * LLM 服务配置相关的类型定义
 */

import type { ContextPostProcessRule } from '@/tools/llm-chat/types';

/**
 * LLM 服务提供商类型
 * 决定了请求体的格式
 */
export type ProviderType =
  | "openai"
  | "openai-responses"
  | "gemini"
  | "claude"
  | "cohere"
  | "huggingface"
  | "vertexai";

/**
 * LLM 参数支持定义
 */
export interface LlmParameterSupport {
  // 基础参数
  temperature?: boolean;
  maxTokens?: boolean;
  topP?: boolean;
  topK?: boolean;
  frequencyPenalty?: boolean;
  presencePenalty?: boolean;
  seed?: boolean;
  stop?: boolean;

  // 高级参数
  maxCompletionTokens?: boolean;
  reasoningEffort?: boolean;
  logprobs?: boolean;
  topLogprobs?: boolean;
  responseFormat?: boolean;
  tools?: boolean;
  toolChoice?: boolean;
  parallelToolCalls?: boolean;

  // 特殊功能
  thinking?: boolean; // Claude 思考模式
  thinkingConfig?: boolean; // Gemini 思考配置
  webSearch?: boolean; // 网络搜索
  fileSearch?: boolean; // 文件搜索
  reasoning?: boolean; // 推理模式
  codeExecution?: boolean; // 代码执行
  modalities?: boolean; // 多模态输出
  audio?: boolean; // 音频输出
  prediction?: boolean; // 预测输出
}

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
  supportedParameters?: LlmParameterSupport; // 支持的参数类型
}

/**
 * 视觉 Token 计费规则
 */
export interface VisionTokenCost {
  /**
   * 计算方法
   * - 'fixed': 固定成本（每张图片固定 token 数）
   * - 'openai_tile': OpenAI 的瓦片计算法（基础成本 + 瓦片数 × 瓦片成本）
   * - 'claude_3': Claude 3 的动态计算（API 会返回实际值，这里作为预估）
   */
  calculationMethod: 'fixed' | 'openai_tile' | 'claude_3';
  
  /**
   * 计算参数
   * 根据不同的 calculationMethod 使用不同的参数：
   * - 'fixed': 使用 costPerImage
   * - 'openai_tile': 使用 baseCost, tileCost, tileSize
   * - 'claude_3': 使用 costPerImage (作为预估，实际值由 API 返回)
   */
  parameters: {
    /** 固定成本（每张图片的 token 数） */
    costPerImage?: number;
    
    /** 基础成本（例如 OpenAI 的固定 85 tokens） */
    baseCost?: number;
    
    /** 每个瓦片的成本（例如 OpenAI 的 170 tokens per tile） */
    tileCost?: number;
    
    /** 瓦片大小（像素，例如 512x512） */
    tileSize?: number;
  };
}

/**
 * 模型能力标识
 */
export interface ModelCapabilities {
  /** 是否支持视觉输入（VLM） */
  vision?: boolean;
  
  /** 视觉 Token 计费规则（仅当 vision 为 true 时有效） */
  visionTokenCost?: VisionTokenCost;
  
  /** 是否支持联网搜索 */
  webSearch?: boolean;
  /** 是否支持工具调用/函数调用 */
  toolUse?: boolean;
  /** 是否支持代码执行 */
  codeExecution?: boolean;
  /** 是否支持思考模式 */
  thinking?: boolean;
  /** 是否支持文件搜索 */
  fileSearch?: boolean;
  /** 是否支持推理模式 */
  reasoning?: boolean;
  /** 是否支持图像生成 */
  imageGeneration?: boolean;
  /** 是否支持视频生成 */
  videoGeneration?: boolean;
  /** 是否支持音乐生成 */
  musicGeneration?: boolean;
  /** 是否支持嵌入（Embedding） */
  embedding?: boolean;
  /** 是否支持重排（Rerank） */
  rerank?: boolean;
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
  capabilities?: ModelCapabilities;
  /**
   * Token 限制信息（可选）
   */
  tokenLimits?: {
    /** 输出 token 限制 */
    output?: number;
    /** 上下文窗口大小 */
    contextLength?: number;
  };
  /**
   * 架构和模态信息（可选）
   */
  architecture?: {
    /** 模态类型，如 'text->text', 'text+image->text' */
    modality?: string;
    /** 输入模态列表 */
    inputModalities?: string[];
    /** 输出模态列表 */
    outputModalities?: string[];
  };
  /**
   * 支持的生成方法或参数（可选）
   */
  supportedFeatures?: {
    /** 支持的生成方法（Gemini） */
    generationMethods?: string[];
    /** 支持的参数列表（OpenRouter） */
    parameters?: string[];
  };
  /**
   * 默认参数建议（可选）
   */
  defaultParameters?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTemperature?: number;
  };
  /**
   * 价格信息（可选）
   */
  pricing?: {
    /** 输入价格（每 token） */
    prompt?: string;
    /** 输出价格（每 token） */
    completion?: string;
    /** 请求价格 */
    request?: string;
    /** 图片价格 */
    image?: string;
  };
  /**
   * 模型版本（可选）
   */
  version?: string;
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
  /**
   * 默认的上下文后处理规则类型列表（可选）
   * 该模型默认启用的消息处理规则
   *
   * 规则合并策略：
   * - 智能体配置的规则优先级更高
   * - 如果智能体已配置某类型的规则，则不使用模型的默认规则
   * - 如果智能体未配置该类型规则，则会自动应用模型的默认规则
   *
   * 示例：
   * - 模型默认规则：['merge-system-to-head', 'convert-system-to-user']
   * - 智能体规则：['merge-system-to-head'] (自定义了 separator)
   * - 最终生效：智能体的 merge-system-to-head（保留自定义配置）+ 模型的 convert-system-to-user
   */
  defaultPostProcessingRules?: Array<ContextPostProcessRule['type']>;
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
