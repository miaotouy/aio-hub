// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeModelListRequest,
  modelListAdapter,
  type ProviderModelInfo,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { getProviderTypeInfo } from "@/config/llm-providers";
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
          profile.type === "openrouter" || profile.baseUrl.includes("openrouter.ai"),
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

function toDesktopModelInfo(model: ProviderModelInfo): LlmModelInfo {
  const pricing = model.pricing
    ? Object.fromEntries(
        Object.entries(model.pricing).map(([key, value]) => [key, String(value)])
      )
    : undefined;
  return {
    id: model.id,
    name: model.name,
    group: model.group,
    provider: model.provider,
    description: model.description,
    capabilities: {
      vision: model.inputModalities?.includes("image") ?? false,
      thinking:
        model.supportedParameters?.includes("reasoning") ||
        model.supportedParameters?.includes("include_reasoning"),
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
