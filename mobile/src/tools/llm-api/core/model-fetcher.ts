import {
  executeModelListRequest,
  modelListAdapter,
  type ProviderModelInfo,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { getProviderTypeInfo } from "../config/llm-providers";
import { getMatchedModelProperties } from "../config/model-metadata";
import type { LlmModelInfo, LlmProfile } from "../types";
import { mobileLlmTransport } from "./transports/mobile";

const logger = createModuleLogger("ModelFetcher");
const errorHandler = createModuleErrorHandler("ModelFetcher");

export async function fetchModelsFromApi(
  profile: LlmProfile
): Promise<LlmModelInfo[]> {
  const providerInfo = getProviderTypeInfo(profile.type);
  if (!providerInfo?.supportsModelList || !providerInfo.modelListEndpoint) {
    throw new Error(`提供商 ${providerInfo?.name} 不支持自动获取模型列表`);
  }
  logger.info("开始获取模型列表", {
    profileName: profile.name,
    providerType: profile.type,
    endpoint: providerInfo.modelListEndpoint,
  });

  try {
    const providerProfile: ProviderProfile = {
      provider: profile.type,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKeys?.[0],
      endpoints: profile.customEndpoints?.models
        ? { models: profile.customEndpoints.models }
        : undefined,
    };
    const result = await executeModelListRequest({
      adapter: modelListAdapter,
      profile: providerProfile,
      request: {
        provider: profile.type,
        endpoint: providerInfo.modelListEndpoint,
        includeAllOutputModalities:
          profile.type === "openrouter" ||
          profile.baseUrl.includes("openrouter.ai"),
      },
      transport: mobileLlmTransport,
      transportOptions: {
        requestId: `models-${profile.id}-${Date.now()}`,
        timeoutMs: 60_000,
        network: {
          relaxInvalidCerts: profile.relaxIdCerts,
          http1Only: profile.http1Only,
        },
      },
    });
    const models = result.models.map(toMobileModelInfo);
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

function toMobileModelInfo(model: ProviderModelInfo): LlmModelInfo {
  const metadata = getMatchedModelProperties(model.id, model.provider);
  const pricing = model.pricing
    ? Object.fromEntries(
        Object.entries(model.pricing).map(([key, value]) => [
          key,
          String(value),
        ])
      )
    : undefined;
  return {
    id: model.id,
    name: model.name,
    group: metadata?.group || model.group || "Other",
    provider: model.provider,
    description: model.description,
    capabilities: {
      ...(metadata?.capabilities || {}),
      ...(model.inputModalities
        ? { vision: model.inputModalities.includes("image") }
        : {}),
      ...(model.supportedParameters
        ? {
            thinking:
              model.supportedParameters.includes("reasoning") ||
              model.supportedParameters.includes("include_reasoning"),
          }
        : {}),
    },
    tokenLimits:
      model.contextLength !== undefined || model.maxOutputTokens !== undefined
        ? {
            contextLength: model.contextLength,
            output: model.maxOutputTokens,
          }
        : undefined,
    architecture:
      model.inputModalities || model.outputModalities
        ? {
            inputModalities: model.inputModalities,
            outputModalities: model.outputModalities,
          }
        : undefined,
    supportedFeatures:
      model.supportedParameters || model.supportedGenerationMethods
        ? {
            parameters: model.supportedParameters,
            generationMethods: model.supportedGenerationMethods,
          }
        : undefined,
    pricing: pricing as LlmModelInfo["pricing"],
  };
}
