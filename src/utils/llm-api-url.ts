/**
 * LLM API URL 处理工具函数
 * 用于格式化LLM服务的API地址和生成端点预览
 */

import type { ProviderType, LlmProfile } from "../types/llm-profiles";
import { openAiUrlHandler, openAiResponsesUrlHandler } from "@/llm-apis/adapters/openai/utils";
import { claudeUrlHandler } from "@/llm-apis/adapters/anthropic/utils";
import { geminiUrlHandler } from "@/llm-apis/adapters/gemini/utils";
import { cohereUrlHandler } from "@/llm-apis/adapters/cohere/utils";
import { vertexAiUrlHandler } from "@/llm-apis/adapters/vertexai/utils";
import { sunoNewApiUrlHandler } from "@/llm-apis/adapters/suno-newapi/utils";

/**
 * 适配器 URL 处理接口
 */
interface AdapterUrlHandler {
  buildUrl: (baseUrl: string, endpoint?: string, profile?: LlmProfile) => string;
  getHint: () => string;
}

/**
 * 适配器 URL 处理映射
 * 注册各个适配器的 URL 处理逻辑
 */
const ollamaUrlHandler: AdapterUrlHandler = {
  buildUrl: (baseUrl, endpoint) => {
    const host = formatLlmApiHost(baseUrl);
    return endpoint ? `${host}${endpoint}` : `${host}api/chat`;
  },
  getHint: () => "将自动补全端点(如 /api/chat)",
};

/**
 * 适配器 URL 处理映射
 * 注册各个适配器的 URL 处理逻辑
 */
/**
 * Azure OpenAI URL 处理逻辑
 * 格式: {baseUrl}/chat/completions?api-version={apiVersion}
 * baseUrl 通常为 https://{resource}.openai.azure.com/openai/deployments/{deployment-id}
 */
const azureUrlHandler: AdapterUrlHandler = {
  buildUrl: (baseUrl, endpoint, profile) => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const apiVersion = profile?.options?.apiVersion || "2024-12-01-preview";
    const ep = endpoint || "chat/completions";
    return `${host}${ep}?api-version=${apiVersion}`;
  },
  getHint: () => "Azure OpenAI 格式，需填写到 /openai/deployments/{deployment-id} 一级",
};

const adapterUrlHandlers: Record<ProviderType, AdapterUrlHandler> = {
  openai: openAiUrlHandler,
  "openai-compatible": openAiUrlHandler,
  azure: azureUrlHandler,
  deepseek: openAiUrlHandler,
  siliconflow: openAiUrlHandler,
  groq: openAiUrlHandler,
  xai: openAiUrlHandler,
  openrouter: openAiUrlHandler,
  "openai-responses": openAiResponsesUrlHandler,
  claude: claudeUrlHandler,
  gemini: geminiUrlHandler,
  cohere: cohereUrlHandler,
  vertexai: vertexAiUrlHandler,
  ollama: ollamaUrlHandler,
  "suno-newapi": sunoNewApiUrlHandler,
};

/**
 * 格式化 LLM API Host 地址
 * 基础格式化逻辑：确保以斜杠结尾，并处理特殊标记
 *
 * @param host - 原始API地址
 * @returns 格式化后的API地址
 */
export function formatLlmApiHost(host: string): string {
  if (!host) return "";

  // 如果以#结尾，表示禁用自动补全，去掉#并返回
  if (host.endsWith("#")) {
    return host.slice(0, -1);
  }

  // 确保以斜杠结尾
  let formattedHost = host.endsWith("/") ? host : `${host}/`;

  return formattedHost;
}

/**
 * 判断 URL 是否已经包含 API 版本路径
 * 识别模式如 /v1/, /v2/, /v3/, /api/v3/, /api/v4/ 等
 */
export function hasApiVersionPath(url: string): boolean {
  // 匹配 /vN/ 或 /api/vN/ 格式，其中 N 是数字
  const versionRegex = /\/(api\/)?v\d+\/?$/i;
  // 同时也匹配路径中间包含版本的情况，如 /v1/chat
  const midVersionRegex = /\/(api\/)?v\d+\//i;

  return versionRegex.test(url) || midVersionRegex.test(url);
}

/**
 * 生成完整的 LLM API 端点 URL
 * 根据provider类型自动添加正确的端点路径
 *
 * @param baseUrl - API基础地址
 * @param providerType - 服务提供商类型
 * @param endpoint - 具体端点（可选，用于实际请求）
 * @returns 完整的端点URL
 */
export function buildLlmApiUrl(
  baseUrl: string,
  providerType: ProviderType,
  endpoint?: string,
  profile?: LlmProfile
): string {
  if (!baseUrl) {
    return "";
  }

  // 如果禁用自动补全（以#结尾）
  if (isLlmUrlAutoCompletionDisabled(baseUrl)) {
    const cleanUrl = formatLlmApiHost(baseUrl);
    // 即使禁用了自动补全，如果用户没写具体的 chat/completions 等，
    // 我们在实际请求时（endpoint 有值时）还是应该拼接
    return endpoint ? `${cleanUrl}${endpoint}` : cleanUrl;
  }

  // 优先从适配器获取 URL 处理逻辑
  const handler = adapterUrlHandlers[providerType];
  if (handler) {
    return handler.buildUrl(baseUrl, endpoint, profile);
  }

  // 回退到基础拼接逻辑
  const formattedHost = formatLlmApiHost(baseUrl);
  return endpoint ? `${formattedHost}${endpoint}` : formattedHost;
}

/**
 * 生成 LLM API 端点预览URL（用于UI显示）
 *
 * @param baseUrl - API基础地址
 * @param providerType - 服务提供商类型
 * @returns 完整的端点URL预览
 */
export function generateLlmApiEndpointPreview(baseUrl: string, providerType: ProviderType): string {
  return buildLlmApiUrl(baseUrl, providerType);
}

/**
 * 检查URL是否禁用了自动补全
 *
 * @param url - 要检查的URL
 * @returns 是否禁用自动补全（以#结尾）
 */
export function isLlmUrlAutoCompletionDisabled(url: string): boolean {
  return url.endsWith("#");
}

/**
 * 获取 LLM API 端点路径提示文本
 *
 * @param providerType - 服务提供商类型
 * @returns 提示文本
 */
export function getLlmEndpointHint(providerType: ProviderType): string {
  const handler = adapterUrlHandlers[providerType];
  if (handler) {
    return handler.getHint();
  }
  return "";
}
