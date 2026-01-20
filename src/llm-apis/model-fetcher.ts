/**
 * LLM 模型列表获取工具
 * 支持从不同提供商 API 获取可用模型列表
 */

import type { LlmProfile, LlmModelInfo, ProviderType } from "../types/llm-profiles";
import { getProviderTypeInfo } from "../config/llm-providers";
import { buildLlmApiUrl } from "@/utils/llm-api-url";
import { fetchWithTimeout, ensureResponseOk } from "./common";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { parseOpenAiModelsResponse } from "./adapters/openai/utils";
import { parseGeminiModelsResponse } from "./adapters/gemini/utils";
import { parseAnthropicModelsResponse } from "./adapters/anthropic/utils";
import { parseVertexAiModelsResponse } from "./adapters/vertexai/utils";
import { parseCohereModelsResponse } from "./adapters/cohere/utils";

const logger = createModuleLogger("ModelFetcher");
const errorHandler = createModuleErrorHandler("ModelFetcher");

/**
 * 从 API 获取模型列表
 */
export async function fetchModelsFromApi(profile: LlmProfile): Promise<LlmModelInfo[]> {
  const providerInfo = getProviderTypeInfo(profile.type);

  if (!providerInfo?.supportsModelList || !providerInfo.modelListEndpoint) {
    throw new Error(`提供商 ${providerInfo?.name} 不支持自动获取模型列表`);
  }

  logger.info("开始获取模型列表", {
    profileName: profile.name,
    providerType: profile.type,
    endpoint: providerInfo.modelListEndpoint,
  });

  const url = buildLlmApiUrl(profile.baseUrl, profile.type, providerInfo.modelListEndpoint, profile);
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 根据不同提供商构建请求头
  const headers = buildRequestHeaders(profile.type, apiKey);

  try {
    // 模型列表获取通常不需要很长的超时，默认 60s 足够
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers,
    });

    await ensureResponseOk(response);

    const data = await response.json();
    const models = parseModelsResponse(data, profile.type);

    logger.info("模型列表获取成功", {
      profileName: profile.name,
      modelCount: models.length,
    });

    return models;
  } catch (error) {
    errorHandler.error(error, "获取模型列表失败", {
      context: {
        profileName: profile.name,
        providerType: profile.type,
      },
    });
    throw error;
  }
}

/**
 * 根据提供商类型构建请求头
 */
function buildRequestHeaders(providerType: ProviderType, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  switch (providerType) {
    case "openai":
    case "openai-responses":
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      break;

    case "claude":
      if (apiKey) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }
      break;

    case "gemini":
      // 模型列表获取使用 header 传递 API Key
      if (apiKey) {
        headers["x-goog-api-key"] = apiKey;
      }
      // 添加 x-goog-api-client header 模拟官方 SDK
      headers["x-goog-api-client"] = "google-genai-sdk/1.0.1 gl-node/web";
      break;

    case "cohere":
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      break;

    case "vertexai":
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      break;
  }

  return headers;
}

function parseModelsResponse(data: any, providerType: ProviderType): LlmModelInfo[] {
  switch (providerType) {
    case "openai":
    case "openai-responses":
      return parseOpenAiModelsResponse(data);
    case "claude":
      return parseAnthropicModelsResponse(data);
    case "gemini":
      return parseGeminiModelsResponse(data);
    case "vertexai":
      return parseVertexAiModelsResponse(data);
    case "cohere":
      return parseCohereModelsResponse(data);
    default:
      return [];
  }
}
