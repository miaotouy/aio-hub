/**
 * LLM 模型列表获取工具
 */
import type { LlmProfile, LlmModelInfo, ProviderType } from "../types";
import { getProviderTypeInfo } from "../config/llm-providers";
import { openAiUrlHandler } from "./adapters/openai-compatible";
import { httpClient } from "@/utils/http-client";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getMatchedModelProperties } from "../config/model-metadata";

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

  // 构建 URL
  let url = "";
  if (profile.type === "openai" || profile.type === "openai-responses") {
    url = openAiUrlHandler.buildUrl(profile.baseUrl, providerInfo.modelListEndpoint, profile);
  } else {
    url = profile.baseUrl;
    if (!url.endsWith("/")) url += "/";
    url += providerInfo.modelListEndpoint.startsWith("/")
      ? providerInfo.modelListEndpoint.slice(1)
      : providerInfo.modelListEndpoint;
  }

  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const headers = buildRequestHeaders(profile.type, apiKey);

  try {
    const response = await httpClient(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    const models = parseModelsResponse(data, profile.type);

    logger.info("模型列表获取成功", {
      profileName: profile.name,
      modelCount: models.length,
    });

    return models;
  } catch (error) {
    errorHandler.error(error, "获取模型列表失败", {
      profileName: profile.name,
      providerType: profile.type,
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
      if (apiKey) {
        headers["x-goog-api-key"] = apiKey;
      }
      headers["x-goog-api-client"] = "google-genai-sdk/1.0.1 gl-node/web";
      break;

    case "cohere":
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      break;
  }

  return headers;
}

/**
 * 解析不同提供商的模型列表响应
 */
function parseModelsResponse(data: any, providerType: ProviderType): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  switch (providerType) {
    case "openai":
    case "openai-responses":
      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          const modelId = model.id;
          const provider = model.owned_by || "openai";
          
          // 获取匹配的元数据
          const metadata = getMatchedModelProperties(modelId, provider);

          models.push({
            id: modelId,
            name: model.name || modelId,
            group: metadata?.group || "Other",
            provider: provider,
            description: model.description,
            capabilities: {
              ...(metadata?.capabilities || {}),
              // OpenRouter 等增强格式可能会返回更多信息，这里可以扩展
            },
          });
        }
      }
      break;

    case "claude":
      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          if (model.type === "model") {
            const metadata = getMatchedModelProperties(model.id, "anthropic");
            models.push({
              id: model.id,
              name: model.display_name || model.id,
              group: metadata?.group || "Claude",
              provider: "anthropic",
              description: model.description,
              capabilities: metadata?.capabilities || { vision: true },
            });
          }
        }
      }
      break;

    case "gemini":
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          const modelId = model.name.replace("models/", "");
          const metadata = getMatchedModelProperties(modelId, "gemini");
          
          models.push({
            id: modelId,
            name: model.displayName || modelId,
            group: metadata?.group || "Gemini",
            provider: "gemini",
            description: model.description,
            capabilities: metadata?.capabilities || { vision: true },
          });
        }
      }
      break;

    case "cohere":
      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          const modelId = model.model_id || model.name;
          const metadata = getMatchedModelProperties(modelId, "cohere");

          models.push({
            id: modelId,
            name: modelId,
            group: metadata?.group || "Cohere",
            provider: "cohere",
            description: model.description,
            capabilities: metadata?.capabilities || { vision: false },
          });
        }
      }
      break;
  }

  return models;
}