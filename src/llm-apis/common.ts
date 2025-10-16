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
  messages: LlmMessageContent[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 流式响应回调 */
  onStream?: (chunk: string) => void;
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
  
  // ===== Claude 特有参数 =====
  /** Claude: Thinking 模式配置 */
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  /** Claude: 停止序列 */
  stopSequences?: string[];
  /** Claude: 元数据 */
  metadata?: {
    user_id?: string;
  };
  /** Claude: 消息历史（用于多轮对话） */
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string | LlmMessageContent[];
  }>;
}

/**
 * LLM 响应结果
 */
export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
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
  };
  /** 推理内容（DeepSeek reasoning 模式） */
  reasoningContent?: string;
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