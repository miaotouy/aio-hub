import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("LlmApiCommon");

/**
 * 默认配置
 */
export const DEFAULT_TIMEOUT = 60000; // 60秒
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY = 1000; // 1秒

/**
 * LLM 请求的消息内容
 */
export interface LlmMessageContent {
  type: "text" | "image" | "tool_use" | "tool_result" | "document";
  text?: string;
  imageBase64?: string;
  // 工具使用
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  // 工具结果
  toolResultId?: string;
  toolResultContent?: string | LlmMessageContent[];
  isError?: boolean;
  // 文档
  documentSource?: Record<string, any>;
}

/**
  * LLM 请求参数
  */
export interface LlmRequestOptions {
  profileId: string;
  modelId: string;
  /** 完整的消息列表（包括 role 和 content），现已支持 system 角色 */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | LlmMessageContent[];
  }>;
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
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
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
  toolChoice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
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
  reasoningEffort?: "low" | "medium" | "high";
  /** 元数据键值对 */
  metadata?: Record<string, string>;
  /** 输出模态类型 */
  modalities?: Array<"text" | "audio">;
  /** 预测输出配置 */
  prediction?: {
    type: "content";
    content: string | Array<{
      type: "text";
      text: string;
    }>;
  };
  /** 音频输出参数 */
  audio?: {
    voice: "alloy" | "ash" | "ballad" | "coral" | "echo" | "fable" | "nova" | "onyx" | "sage" | "shimmer";
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
  /** Claude: Thinking 模式配置 */
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  /** Claude: 停止序列 */
  stopSequences?: string[];
  /** Claude: 元数据（用户ID等） */
  claudeMetadata?: {
    user_id?: string;
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
  finishReason?: "stop" | "length" | "content_filter" | "tool_calls" | "function_call" | "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
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

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 带重试的请求包装器
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  maxRetries: number = DEFAULT_MAX_RETRIES,
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 如果外部信号已经中止，立即抛出错误
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // 监听外部中止信号
      const externalAbortHandler = () => controller.abort();
      externalSignal?.addEventListener('abort', externalAbortHandler);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', externalAbortHandler);

      // 如果是 4xx 错误，不重试
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // 如果是 5xx 错误，重试
      if (response.status >= 500 && attempt < maxRetries) {
        logger.warn(`请求失败 (${response.status})，第 ${attempt + 1}/${maxRetries} 次重试`, {
          url,
          status: response.status,
        });
        await delay(DEFAULT_RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;

      // 如果是超时或网络错误，重试
      if (attempt < maxRetries && (error.name === "AbortError" || error instanceof TypeError)) {
        logger.warn(`请求失败，第 ${attempt + 1}/${maxRetries} 次重试`, {
          url,
          error: error.message,
        });
        await delay(DEFAULT_RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("请求失败");
};