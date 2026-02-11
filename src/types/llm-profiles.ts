/**
 * LLM 服务配置相关的类型定义
 */
import type { SettingItem } from "./settings-renderer";

/**
 * 上下文后处理规则 (简易定义，避免循环依赖和跨端导入问题)
 */
export interface ContextPostProcessRule {
  type: string;
  enabled: boolean;
  [key: string]: any;
}

/**
 * LLM 服务提供商类型
 * 决定了请求体的格式
 */
/**
 * 网络请求策略
 */
export type NetworkStrategy = "auto" | "proxy" | "native";

export type ProviderType =
  | "openai"
  | "openai-compatible"
  | "azure"
  | "deepseek"
  | "claude"
  | "gemini"
  | "siliconflow"
  | "groq"
  | "ollama"
  | "openrouter"
  | "openai-responses"
  | "xai"
  | "cohere"
  | "vertexai"
  | "suno";

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
  repetitionPenalty?: boolean;
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
  thinkingLevel?: boolean; // Gemini 思考级别
  mediaResolution?: boolean; // Gemini 媒体分辨率
  webSearch?: boolean; // 网络搜索
  fileSearch?: boolean; // 文件搜索
  codeExecution?: boolean; // 代码执行
  safetySettings?: boolean; // 安全设置 (Gemini)
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
  /**
   * 该渠道类型特有的配置项定义（可选）
   * 使用声明式 SettingItem 描述，由 SettingListRenderer 动态渲染
   * 配置值存储在 LlmProfile.options 中
   */
  configFields?: SettingItem[];
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
   * - 'gemini_2_0': Gemini 2.0 的瓦片计算法
   */
  calculationMethod: "fixed" | "openai_tile" | "claude_3" | "gemini_2_0";

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
  /**
   * 思考能力的配置模式
   * - 'none': 无思考能力配置
   * - 'switch': 简单的启用/禁用开关
   * - 'budget': 开关 + Token 预算滑块
   * - 'effort': 推理等级/工作量选择器
   */
  thinkingConfigType?: "none" | "switch" | "budget" | "effort";
  /** 可用的推理等级选项 (当 thinkingConfigType 为 'effort' 时使用) */
  reasoningEffortOptions?: string[];
  /** 是否支持文件搜索 */
  fileSearch?: boolean;
  /** 是否支持图像生成 */
  imageGeneration?: boolean;
  /** 是否支持迭代微调 (基于上下文的多轮对话式生成) */
  iterativeRefinement?: boolean;
  /** 是否支持音频输入/输出 */
  audio?: boolean;
  /** 是否支持音频生成 (TTS) */
  audioGeneration?: boolean;
  /** 是否支持视频输入 */
  video?: boolean;
  /** 是否支持视频生成 */
  videoGeneration?: boolean;
  /** 是否支持音乐生成 */
  musicGeneration?: boolean;
  /** 是否支持嵌入（Embedding） */
  embedding?: boolean;
  /** 是否支持重排（Rerank） */
  rerank?: boolean;
  /** 是否支持计算机使用（Computer Use） */
  computerUse?: boolean;

  /**
   * 是否偏好使用对话接口 (Chat) 来实现其他功能 (如生图、语音)
   * 适用于原生多模态模型 (如 Gemini 3 Pro, GPT-4o-audio) 或某些特定渠道的补丁
   */
  preferChat?: boolean;

  /**
   * 是否支持 FIM (Fill In the Middle) 补全
   * 用于代码补全等场景，提供前缀和后缀让模型补全中间内容
   *
   * 支持的模型示例：
   * - DeepSeek: 通过 /beta 端点的 completions API
   */
  fim?: boolean;

  /**
   * 是否支持对话前缀续写 (Prefix Completion)
   * 允许在 messages 最后一条消息设置 role: assistant 和 prefix: true
   * 让模型从指定的前缀继续生成
   *
   * 支持的模型示例：
   * - DeepSeek: 通过 /beta 端点
   * - Gemini: 原生支持续写
   */
  prefixCompletion?: boolean;

  /**
   * 是否支持 JSON 输出模式
   * 允许强制模型输出合法的 JSON 对象
   *
   * 支持的模型示例：
   * - DeepSeek: 通过 response_format: {'type': 'json_object'}
   * - OpenAI (GPT-4o, GPT-4-Turbo 等): 通过 response_format: { type: "json_object" }
   */
  jsonOutput?: boolean;

  /**
   * 文档处理能力
   * - true: 支持原生文档格式
   * - false 或 undefined: 不支持，需要提取为文本或提示用户
   *
   * 支持的模型示例：
   * - Claude (Anthropic): 支持 PDF 通过 document 类型 + base64
   * - Gemini: 支持 PDF 通过 inline_data，最多 3600 页
   * - GPT-4o/GPT-5 (OpenAI Responses): 支持 PDF 通过 file_url/file_id/file_data
   */
  document?: boolean;

  /**
   * 文档格式（仅当 document 为 true 时有效）
   * 指定该模型使用的文档传输格式
   *
   * - 'base64': Claude/Gemini 格式，直接在消息中嵌入 base64 编码的文档
   * - 'openai_file': OpenAI Responses 格式，支持 file_url/file_id/file_data 三种方式
   */
  documentFormat?: "base64" | "openai_file";

  /**
   * 文档 Token 计费规则（仅当 document 为 true 时有效）
   * 用于计算 PDF 等文档的 token 消耗
   */
  documentTokenCost?: {
    /**
     * 计算方法
     * - 'per_page': 按页计算（如 Gemini: 258 tokens/page）
     * - 'dynamic': 动态计算（API 返回实际值）
     */
    calculationMethod: "per_page" | "dynamic";

    /** 每页的 token 数（仅当 calculationMethod 为 'per_page' 时使用） */
    tokensPerPage?: number;
  };
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
   * [LLM Chat 专属] 默认的上下文后处理规则列表（可选）
   * 该模型默认启用的消息处理规则。
   * 注意：此配置仅在 LLM Chat 工具中生效，不会影响其他工具。
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
  defaultPostProcessingRules?: ContextPostProcessRule[];
  /**
   * 模型专属的自定义参数（可选）
   * 用于支持非标准的 API 参数，例如模型路由配置等
   * 会在请求时与标准参数合并
   */
  customParameters?: Record<string, any>;
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
   * 放宽证书校验 (可选)
   * 允许自签名证书或不匹配的证书，解决某些私有部署服务的 HTTPS 连接问题
   */
  relaxIdCerts?: boolean;
  /**
   * 强制使用 HTTP/1.1 (可选)
   * 提高与某些老旧或自建服务的兼容性
   */
  http1Only?: boolean;
  /**
   * 自定义请求头（可选）
   */
  customHeaders?: Record<string, string>;
  /**
   * 模型分组的展开状态（可选）
   * key 为分组名称，value 为是否展开
   */
  modelGroupsExpandState?: Record<string, boolean>;
  /**
   * 网络请求策略 (可选)
   * - 'auto': 自动选择 (默认)
   * - 'proxy': 强制使用后端 Rust 代理 (支持底层网络配置, 绕过 CORS)
   * - 'native': 强制使用前端原生请求 (由 Tauri 劫持, 性能较好)
   */
  networkStrategy?: NetworkStrategy;
  /**
   * 渠道类型特有的扩展配置（可选）
   * 由 ProviderTypeInfo.configFields 定义的配置项，值存储在此
   * 例如 Azure 的 apiVersion、deploymentId 等
   */
  options?: Record<string, any>;
  /**
   * 自定义 API 端点（可选）
   * 用于高级配置，直接指定完整的 URL
   */
  customEndpoints?: {
    /** 聊天补全端点 (Chat Completions)，例如 '/v1/chat/completions' */
    chatCompletions?: string;
    /** 文本补全端点 (Completions)，例如 '/v1/completions' */
    completions?: string;
    /** 模型列表端点 (Models)，例如 '/v1/models' */
    models?: string;
    /** 嵌入端点 (Embeddings)，例如 '/v1/embeddings' */
    embeddings?: string;
    /** 重排端点 (Rerank)，例如 '/v1/rerank' */
    rerank?: string;
    /** 图像生成端点 (Images Generations)，例如 '/v1/images/generations' */
    imagesGenerations?: string;
    /** 图像编辑端点 (Images Edits)，例如 '/v1/images/edits' */
    imagesEdits?: string;
    /** 图像变体端点 (Images Variations)，例如 '/v1/images/variations' */
    imagesVariations?: string;
    /** 语音合成端点 (Audio Speech)，例如 '/v1/audio/speech' */
    audioSpeech?: string;
    /** 语音转文字端点 (Audio Transcriptions)，例如 '/v1/audio/transcriptions' */
    audioTranscriptions?: string;
    /** 语音翻译端点 (Audio Translations)，例如 '/v1/audio/translations' */
    audioTranslations?: string;
    /** 内容审查端点 (Moderations)，例如 '/v1/moderations' */
    moderations?: string;
    /** 视频生成端点 (Videos)，例如 '/v1/videos' */
    videos?: string;
    /** 视频查询端点 (Video Status)，例如 '/v1/videos/{video_id}' */
    videoStatus?: string;
  };
}

/**
 * LlmProfile 的默认值
 */
export const DEFAULT_LLM_PROFILE: Partial<LlmProfile> = {
  enabled: true,
  apiKeys: [],
  models: [],
  networkStrategy: "auto",
  relaxIdCerts: false,
  http1Only: false,
  customHeaders: {},
  modelGroupsExpandState: {},
  customEndpoints: {},
};
