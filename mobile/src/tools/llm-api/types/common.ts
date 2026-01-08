/**
 * LLM 请求通用类型定义
 */

/**
 * 视频元数据（Gemini 特有）
 * 用于控制视频输入的处理方式
 */
export interface VideoMetadata {
  /** 视频剪辑开始时间（格式：MM:SS 或秒数字符串如 "1250s"） */
  startOffset?: string;
  /** 视频剪辑结束时间（格式：MM:SS 或秒数字符串如 "1570s"） */
  endOffset?: string;
  /** 采样帧率（每秒帧数），默认 1 FPS */
  fps?: number;
}

/**
 * 媒体内容的数据源定义
 */
export type MediaSource =
  | {
    /** 内联 Base64 数据 */
    type: "base64";
    media_type: string;
    data: string;
  }
  | {
    /** 通过文件服务（如 Gemini Files API）上传后获得的 URI */
    type: "file_uri";
    file_uri: string;
    mime_type: string;
  };

// =================================================================
// 定义不同类型的消息内容
// =================================================================

export interface TextContent {
  type: "text";
  text: string;
  /** 缓存控制（Claude 特有） */
  cacheControl?: {
    type: "ephemeral";
  };
}

export interface ImageContent {
  type: "image";
  imageBase64: string;
  /** 媒体类型，如果不提供将自动推断 */
  mimeType?: string;
  /** 缓存控制（Claude 特有） */
  cacheControl?: {
    type: "ephemeral";
  };
}

export interface AudioContent {
  type: "audio";
  source: MediaSource;
}

export interface VideoContent {
  type: "video";
  source: MediaSource;
  videoMetadata?: VideoMetadata;
}

export interface ToolUseContent {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, any>;
}

export interface ToolResultContent {
  type: "tool_result";
  toolResultId: string;
  toolResultContent: string | LlmMessageContent[];
  isError?: boolean;
}

/**
 * 文档类型（用于 PDF、TXT 等通用文件）
 */
export interface DocumentContent {
  type: "document";
  source: MediaSource;
}

/**
 * LLM 请求的消息内容 - 统一的、结构化的多模态内容格式
 */
export type LlmMessageContent =
  | TextContent
  | ImageContent
  | AudioContent
  | VideoContent
  | DocumentContent
  | ToolUseContent
  | ToolResultContent;

/**
 * LLM 消息结构
 */
export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmMessageContent[];
  /**
   * 是否作为续写前缀 (DeepSeek / Claude Prefill)
   * 如果为 true，该消息必须是列表中的最后一条，且 role 通常为 assistant
   */
  prefix?: boolean;
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
 * 模型能力定义
 */
export interface ModelCapabilities {
  /** 是否支持视觉 (多模态图片) */
  vision?: boolean;

  /** 视觉 Token 计费规则（仅当 vision 为 true 时有效） */
  visionTokenCost?: VisionTokenCost;

  /** 是否支持工具调用 (Function Calling) */
  toolUse?: boolean;

  /** 是否支持 JSON 模式输出 */
  jsonOutput?: boolean;

  /** 是否支持思考模式 (Reasoning/Thinking) */
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

  /** 是否支持代码执行 (Code Execution) */
  codeExecution?: boolean;

  /** 是否支持联网搜索 (Web Search) */
  webSearch?: boolean;

  /** 是否支持文件搜索 (RAG/Retrieval) */
  fileSearch?: boolean;

  /** 是否支持计算机使用 (Computer Use) */
  computerUse?: boolean;

  /** 是否支持文档处理 (PDF/Doc) */
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

  /** 是否支持图像生成 (Text-to-Image) */
  imageGeneration?: boolean;

  /** 是否支持视频输入 */
  video?: boolean;

  /** 是否支持视频生成 (Text-to-Video) */
  videoGeneration?: boolean;

  /** 是否支持音频输入或输出 */
  audio?: boolean;

  /** 是否支持音乐生成 (Text-to-Audio) */
  musicGeneration?: boolean;

  /** 是否支持嵌入 (Embedding) */
  embedding?: boolean;

  /** 是否支持重排 (Rerank) */
  rerank?: boolean;

  /** 是否支持 FIM (Fill-in-the-middle) 补全 */
  fim?: boolean;

  /** 是否支持前缀续写 (Prefix Completion) */
  prefixCompletion?: boolean;

  /** 任意其他能力标签 */
  [key: string]: any;
}

/**
 * 模型信息
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
   * 模型专属的自定义参数（可选）
   * 用于支持非标准的 API 参数，例如模型路由配置等
   * 会在请求时与标准参数合并
   */
  customParameters?: Record<string, any>;

  /** 是否启用 */
  enabled?: boolean;

  /** 通用的扩展属性，用于特定工具的规则 */
  extra?: Record<string, any>;

  /** 任意其他元数据 */
  [key: string]: unknown;
}

/**
 * LLM 请求参数
 */
export interface LlmRequestOptions {
  profileId?: string;
  modelId: string;
  /** 完整的消息列表（包括 role 和 content），现已支持 system 角色 */
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 流式响应回调 */
  onStream?: (chunk: string) => void;
  /** 流式推理内容回调（DeepSeek reasoning 等） */
  onReasoningStream?: (chunk: string) => void;
  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** 用于中止请求的 AbortSignal */
  signal?: AbortSignal;

  // OpenAI 兼容的高级参数
  /** Top-p 采样参数，介于 0 和 1 之间 */
  topP?: number;
  /** Top-k 采样参数（某些模型支持） */
  topK?: number;
  /** 频率惩罚，介于 -2.0 和 2.0 之间 */
  frequencyPenalty?: number;
  /** 存在惩罚，介于 -2.0 和 2.0 之间 */
  presencePenalty?: number;
  /** 停止序列，最多 4 个 */
  stop?: string | string[];
  /** 生成的响应数量 */
  n?: number;
  /** 随机种子，用于确定性采样 */
  seed?: number;
  /** 是否返回 logprobs */
  logprobs?: boolean;
  /** 返回的 top logprobs 数量（0-20） */
  topLogprobs?: number;
  /** 响应格式配置 */
  responseFormat?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: {
      name: string;
      schema: Record<string, any>;
      strict?: boolean;
    };
  };
  /** 工具列表（函数调用） */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
      strict?: boolean;
    };
  }>;
  /** 工具选择策略 */
  toolChoice?:
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };
  /** 是否启用并行工具调用 */
  parallelToolCalls?: boolean;
  /** 流式选项 */
  streamOptions?: {
    includeUsage?: boolean;
  };
  /** 用户标识符 */
  user?: string;
  /** 标记偏差配置 */
  logitBias?: Record<string, number>;
  /** 补全中可生成的最大标记数（替代 maxTokens） */
  maxCompletionTokens?: number;
  /** 是否存储输出用于模型蒸馏 */
  store?: boolean;
  /** o系列模型的推理工作约束 */
  reasoningEffort?: string;
  /** 是否启用思考模式 */
  thinkingEnabled?: boolean;
  /** 是否包含思考内容（Gemini 特有） */
  includeThoughts?: boolean;
  /** 思考预算 Token 数 */
  thinkingBudget?: number;
  /** 元数据键值对 */
  metadata?: Record<string, string>;
  /** 输出模态类型 */
  modalities?: Array<"text" | "audio">;
  /** 预测输出配置 */
  prediction?: {
    type: "content";
    content:
    | string
    | Array<{
      type: "text";
      text: string;
    }>;
  };
  /** 音频输出参数 */
  audio?: {
    voice:
    | "alloy"
    | "ash"
    | "ballad"
    | "coral"
    | "echo"
    | "fable"
    | "nova"
    | "onyx"
    | "sage"
    | "shimmer";
    format: "wav" | "mp3" | "flac" | "opus" | "pcm16";
  };
  /** 服务层级 */
  serviceTier?: "auto" | "default" | "flex";
  /** 网络搜索选项 */
  webSearchOptions?: {
    searchContextSize?: "low" | "medium" | "high";
    userLocation?: {
      approximate: {
        city?: string;
        country?: string;
        region?: string;
        timezone?: string;
        type: "approximate";
      };
    };
  };

  // ===== Claude 特有参数 =====
  /** Claude: 停止序列 */
  stopSequences?: string[];
  /** Claude: 元数据（用户ID等） */
  claudeMetadata?: {
    user_id?: string;
  };

  // 扩展参数
  [key: string]: any;
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * URL 引用注释（网络搜索工具）
 */
export interface UrlCitation {
  type: "url_citation";
  urlCitation: {
    startIndex: number;
    endIndex: number;
    url: string;
    title: string;
  };
}

/**
 * 文件引用注释（文件搜索工具）
 */
export interface FileCitation {
  type: "file_citation";
  fileCitation: {
    startIndex: number;
    endIndex: number;
    fileId: string;
    quote?: string;
  };
}

/**
 * 注释类型联合
 */
export type Annotation = UrlCitation | FileCitation;

/**
 * LLM 响应结果
 */
export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** 提示token详细信息 */
    promptTokensDetails?: {
      cachedTokens?: number;
      audioTokens?: number;
    };
    /** 完成token详细信息 */
    completionTokensDetails?: {
      reasoningTokens?: number;
      audioTokens?: number;
      acceptedPredictionTokens?: number;
      rejectedPredictionTokens?: number;
    };
  };
  /** 是否为流式响应 */
  isStream?: boolean;
  /** 模型的拒绝消息（如果模型拒绝响应） */
  refusal?: string | null;
  /** 停止原因 */
  finishReason?:
  | "stop"
  | "length"
  | "content_filter"
  | "tool_calls"
  | "function_call"
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | null;
  /** 停止序列（Claude） */
  stopSequence?: string | null;
  /** 工具调用结果（函数调用） */
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** Logprobs 信息 */
  logprobs?: {
    content: Array<{
      token: string;
      logprob: number;
      bytes: number[] | null;
      topLogprobs: Array<{
        token: string;
        logprob: number;
        bytes: number[] | null;
      }>;
    }> | null;
    /** 拒绝的logprobs信息 */
    refusal?: Array<{
      token: string;
      logprob: number;
      bytes: number[] | null;
      topLogprobs: Array<{
        token: string;
        logprob: number;
        bytes: number[] | null;
      }>;
    }> | null;
  };
  /** 推理内容（DeepSeek reasoning 模式） */
  reasoningContent?: string;
  /** 消息注释（如网络搜索的URL引用、文件搜索的文件引用） */
  annotations?: Annotation[];
  /** 音频响应数据 */
  audio?: {
    id: string;
    data: string;
    transcript: string;
    expiresAt: number;
  };
  /** 系统指纹 */
  systemFingerprint?: string;
  /** 使用的服务层级 */
  serviceTier?: string;
}
