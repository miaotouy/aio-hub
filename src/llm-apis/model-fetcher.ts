// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeModelListRequest,
  materializeModelIdentity,
  modelListAdapter,
  suggestModelIdentityFromProvider,
  type ProviderModelInfo,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { getProviderTypeInfo } from "@/config/llm-providers";
import { getActiveModelProperties } from "@/config/model-metadata";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";

const logger = createModuleLogger("ModelFetcher");
const errorHandler = createModuleErrorHandler("ModelFetcher");

export interface ModelFetchResult {
  models: LlmModelInfo[];
  rawResponse: unknown;
}

export interface ModelFetchOptions {
  apiKey?: string;
  requestId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  observer?: import("@aiohub/llm-core").TransportObserver;
  silent?: boolean;
}

export async function fetchModelsFromApi(
  profile: LlmProfile,
  options: ModelFetchOptions = {}
): Promise<ModelFetchResult> {
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
      apiKey: options.apiKey ?? profile.apiKeys?.[0],
      headers: resolveCustomHeaders(profile.customHeaders),
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
      transport: desktopLlmTransport,
      transportOptions: {
        requestId: options.requestId ?? `models-${profile.id}-${Date.now()}`,
        timeoutMs: options.timeoutMs ?? 60_000,
        signal: options.signal,
        observer: options.observer,
        network: {
          strategy: "proxy",
          relaxInvalidCerts: profile.relaxIdCerts,
          http1Only: profile.http1Only,
        },
      },
    });
    const models = result.models.map(toDesktopModelInfo);
    logger.info("模型列表获取成功", {
      profileName: profile.name,
      modelCount: models.length,
    });
    return { models, rawResponse: result.raw };
  } catch (error) {
    if (!options.silent) {
      errorHandler.error(error, "获取模型列表失败", {
        context: { profileName: profile.name, providerType: profile.type },
      });
    }
    throw error;
  }
}

export function toDesktopModelInfo(model: ProviderModelInfo): LlmModelInfo {
  const pricing = model.pricing
    ? Object.fromEntries(
        Object.entries(model.pricing).map(([key, value]) => [
          key,
          String(value),
        ])
      )
    : undefined;
  const suggestion = suggestModelIdentityFromProvider(
    model.id,
    model.declaredOwner
  );
  const matchedCapabilities = getActiveModelProperties(
    model.id,
    model.provider
  )?.capabilities;
  const apiCapabilities: LlmModelInfo["capabilities"] = {};

  // 模型列表 API 经常不提供 architecture.input_modalities。
  // 此时视觉能力是“未知”，不能把它降级成 false 覆盖内置模型元数据。
  if (model.inputModalities !== undefined) {
    apiCapabilities.vision = model.inputModalities.includes("image");
  }
  if (model.supportedParameters !== undefined) {
    apiCapabilities.thinking =
      model.supportedParameters.includes("reasoning") ||
      model.supportedParameters.includes("include_reasoning");
  }

  return materializeModelIdentity(
    {
      id: model.id,
      name: model.name,
      group: model.group,
      provider: model.provider,
      description: model.description,
      // 先附加当前激活的模型元数据，再用 API 明确返回的能力覆盖。
      // API 未返回某项能力时，不应写入 false。
      capabilities: {
        ...(matchedCapabilities || {}),
        ...apiCapabilities,
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
      routing:
        model.supportedEndpointTypes !== undefined
          ? {
              supportedEndpointTypes: [...model.supportedEndpointTypes],
              discoveredAt: new Date().toISOString(),
            }
          : undefined,
      pricing: pricing as LlmModelInfo["pricing"],
      ...(suggestion ? { modelIdentitySuggestion: suggestion } : {}),
    },
    { declaredOwner: model.declaredOwner }
  );
}
