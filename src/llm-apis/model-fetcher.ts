// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  executeModelListRequest,
  materializeModelIdentity,
  modelListAdapter,
  suggestModelIdentityFromProvider,
  type ProviderModelInfo,
  type ProviderProfile,
  type TransportObserver,
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

  const requestId = options.requestId ?? `models-${profile.id}-${Date.now()}`;
  const diagnostics = createModelListFetchDiagnostics(options.observer);

  logger.info("开始获取模型列表", {
    profileName: profile.name,
    providerType: profile.type,
    endpoint: providerInfo.modelListEndpoint,
    requestId,
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
        requestId,
        timeoutMs: options.timeoutMs ?? 60_000,
        signal: options.signal,
        observer: diagnostics.observer,
        network: {
          strategy: "proxy",
          relaxInvalidCerts: profile.relaxIdCerts,
          http1Only: profile.http1Only,
        },
      },
    });
    const models = result.models.map((model) =>
      toDesktopModelInfo(model, profile.type)
    );
    logger.info("模型列表获取成功", {
      profileName: profile.name,
      modelCount: models.length,
      modelIds: models.map((model) => model.id),
      requestId,
      ...diagnostics.toLogContext(),
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

function createModelListFetchDiagnostics(
  observer: ModelFetchOptions["observer"]
) {
  const startedAt = Date.now();
  let requestUrl: string | undefined;
  let status: number | undefined;
  let statusText: string | undefined;
  let responseHeaders: Record<string, string> | undefined;

  const diagnosticObserver: TransportObserver = {
    onRequest(event) {
      requestUrl = sanitizeModelListUrl(event.request.url);
      observer?.onRequest?.(event);
    },
    onResponseStart(event) {
      status = event.status;
      statusText = event.statusText;
      responseHeaders = event.headers;
      observer?.onResponseStart?.(event);
    },
    onResponseChunk(event) {
      observer?.onResponseChunk?.(event);
    },
    onError(event) {
      observer?.onError?.(event);
    },
  };

  return {
    observer: diagnosticObserver,
    toLogContext() {
      const headers = responseHeaders ?? {};
      return {
        durationMs: Date.now() - startedAt,
        requestUrl,
        responseStatus: status,
        ...(statusText ? { responseStatusText: statusText } : {}),
        responseHeaders: pickModelListDiagnosticHeaders(headers),
      };
    },
  };
}

function sanitizeModelListUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split(/[?#]/, 1)[0];
  }
}

function pickModelListDiagnosticHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const allowedNames = [
    "age",
    "cache-control",
    "cf-cache-status",
    "cf-ray",
    "date",
    "etag",
    "server",
    "vary",
    "via",
    "x-cache",
    "x-request-id",
  ];
  return Object.fromEntries(
    allowedNames.flatMap((name) =>
      headers[name] === undefined ? [] : [[name, headers[name]]]
    )
  );
}

export function toDesktopModelInfo(
  model: ProviderModelInfo,
  providerType?: string
): LlmModelInfo {
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

  // audio.cpp /v1/models 在 OpenAI 风格条目上带 task/family 扩展字段，
  // 据此推导 TTS/ASR/音乐生成等能力，让模型选择器能正确过滤。
  if (providerType === "audiocpp") {
    const audioCppCapabilities = audiocppTaskCapabilities(model.raw);
    if (audioCppCapabilities) {
      Object.assign(apiCapabilities, audioCppCapabilities);
    }
  }

  return materializeModelIdentity(
    {
      id: model.id,
      name: model.name,
      group:
        providerType === "audiocpp"
          ? (audiocppFamily(model.raw) ?? model.group)
          : model.group,
      provider: model.provider,
      description: model.description,
      // API 明确返回的能力会在用户确认添加模型时与已物化的规则快照合并。
      capabilities: apiCapabilities,
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

/**
 * audio.cpp /v1/models 条目的 task 字段 → 模型能力推导。
 * task 值来自 engine::runtime::to_string(VoiceTaskKind)：
 * asr/tts/clon/vdes/vc/svc/s2s/gen/sep/vad/diar/align/spk/midi。
 */
function audiocppTaskCapabilities(
  raw: unknown
): LlmModelInfo["capabilities"] | undefined {
  const task = readRawString(raw, "task");
  if (task === undefined) return undefined;
  switch (task) {
    case "asr":
      return { audio: true, asr: true };
    case "tts":
    case "clon":
    case "vdes":
      return { audioGeneration: true };
    case "gen":
      return { musicGeneration: true };
    case "vc":
    case "svc":
    case "s2s":
    case "sep":
    case "vad":
    case "diar":
    case "align":
    case "spk":
    case "midi":
      return { audio: true };
    default:
      return undefined;
  }
}

function audiocppFamily(raw: unknown): string | undefined {
  return readRawString(raw, "family");
}

function readRawString(raw: unknown, key: string): string | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
