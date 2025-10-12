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
  type: "text" | "image";
  text?: string;
  imageBase64?: string;
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
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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