// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  executeProviderRequest,
  openAiCompatibleAdapter,
  type JsonValue,
  type LlmMessage as CoreLlmMessage,
  type LlmMessageContent as CoreLlmMessageContent,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
  type MediaAssetRef,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type {
  LlmMessage,
  LlmMessageContent,
  LlmRequestOptions,
  LlmResponse,
} from "@/llm-apis/common";
import type { LlmProfile } from "@/types/llm-profiles";
import {
  applyCustomParameters,
  cleanPayload,
  getModelFamily,
  inferImageMimeType,
  isOpenAIModel,
} from "@/llm-apis/request-builder";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { buildOpenAiHeaders } from "./utils";
import {
  extractDeepSeekReasoningArtifacts,
  getDeepSeekReplayReasoningContent,
  isDeepSeekModel,
} from "../deepseek/reasoning-artifacts";

function shouldSendOpenAiReasoningEffort(
  profile: LlmProfile,
  modelId: string
): boolean {
  const id = modelId.toLowerCase();
  return (
    (profile.type === "openai" || profile.type === "openai-compatible") &&
    (isOpenAIModel(modelId) ||
      id.includes("doubao") ||
      id.includes("seed") ||
      id.includes("glm") ||
      id.includes("deepseek"))
  );
}

export const callOpenAiChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = buildCoreRequest(profile, options);
  const result = await executeProviderRequest({
    adapter: openAiCompatibleAdapter,
    profile: buildProviderProfile(profile, options.requestId),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? createRequestId(),
      signal: options.signal,
      timeoutMs: options.timeout,
      observer: options.transportObserver,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
    onEvent: (event: LlmStreamEvent) => {
      if (event.type === "text-delta") options.onStream?.(event.delta);
      if (event.type === "reasoning-delta") {
        options.onReasoningStream?.(event.delta);
      }
    },
  });

  return mapCoreOpenAiResponse(
    result,
    options.modelId,
    request.stream === true
  );
};

function buildProviderProfile(
  profile: LlmProfile,
  requestId?: string
): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl,
    headers: buildOpenAiHeaders(profile, requestId),
    endpoints: profile.customEndpoints,
  };
}

function buildCoreRequest(
  profile: LlmProfile,
  options: LlmRequestOptions
): CoreLlmRequest {
  const extensions: Record<string, JsonValue> = {};
  applyCustomParameters(extensions, options);
  cleanPayload(extensions);
  if (options.requestId) extensions.requestId = options.requestId;
  if (
    (options as LlmRequestOptions & { safetySettings?: unknown }).safetySettings
  ) {
    const safetySettings = (
      options as LlmRequestOptions & { safetySettings?: unknown }
    ).safetySettings;
    const value = toJsonValue(safetySettings);
    if (value !== undefined) extensions.safety_settings = value;
  }

  const customExtraBody = toJsonObject(extensions.extra_body);
  const explicitExtraBody = mergeJsonObjects(
    customExtraBody,
    toJsonObject(options.extraBody)
  );
  const isGeminiModel =
    getModelFamily(options.modelId, profile.type) === "gemini";
  const geminiExtraBody = isGeminiModel
    ? buildGeminiExtraBody(options, explicitExtraBody)
    : undefined;
  const isDeepSeekThinking =
    options.modelId.toLowerCase().includes("deepseek") &&
    options.thinkingEnabled !== undefined;
  if (geminiExtraBody) {
    extensions.extra_body = geminiExtraBody;
  } else if (isDeepSeekThinking) {
    extensions.extra_body = {
      thinking: { type: options.thinkingEnabled ? "enabled" : "disabled" },
      ...(explicitExtraBody ?? {}),
    };
  } else if (explicitExtraBody) {
    extensions.extra_body = explicitExtraBody;
  }

  return {
    model: options.modelId,
    messages: (options.messages ?? []).map((message) =>
      toCoreMessage(message, options.modelId)
    ),
    stream: Boolean(
      options.stream && (options.onStream || options.onReasoningStream)
    ),
    maxTokens: options.maxTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    frequencyPenalty: options.frequencyPenalty,
    presencePenalty: options.presencePenalty,
    repetitionPenalty: options.repetitionPenalty,
    stop: options.stop,
    seed: options.seed,
    n: options.n,
    logprobs: options.logprobs,
    topLogprobs: options.topLogprobs,
    reasoningEffort:
      !isGeminiModel &&
      shouldSendOpenAiReasoningEffort(profile, options.modelId)
        ? options.reasoningEffort
        : undefined,
    responseFormat: toJsonValue(options.responseFormat),
    tools: options.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: toJsonValue(tool.function.parameters) ?? {},
        strict: tool.function.strict,
      },
    })),
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
    user: options.user,
    logitBias: options.logitBias,
    store: options.store,
    metadata: toJsonObject(options.metadata),
    modalities: options.modalities,
    prediction: toJsonValue(options.prediction),
    audio: toJsonValue(options.audio),
    serviceTier: options.serviceTier,
    webSearchOptions:
      toJsonValue(options.webSearchOptions) ??
      (options.webSearchEnabled
        ? { search_context_size: "medium" }
        : undefined),
    streamOptions: toJsonValue(options.streamOptions),
    thinkingEnabled:
      isDeepSeekThinking || isGeminiModel ? undefined : options.thinkingEnabled,
    thinkingBudget: isGeminiModel ? undefined : options.thinkingBudget,
    extensions,
  };
}

function buildGeminiExtraBody(
  options: LlmRequestOptions,
  explicitExtraBody?: Record<string, JsonValue>
): Record<string, JsonValue> | undefined {
  const thinkingConfig: Record<string, JsonValue> = {};
  const reasoningEffort = options.reasoningEffort?.trim().toLowerCase();

  if (options.modelId.toLowerCase().includes("gemini-3") && reasoningEffort) {
    thinkingConfig.thinking_level = reasoningEffort;
  } else if (options.thinkingBudget !== undefined) {
    thinkingConfig.thinking_budget = options.thinkingBudget;
  }
  if (options.includeThoughts === true) {
    thinkingConfig.include_thoughts = true;
  }

  if (Object.keys(thinkingConfig).length === 0) {
    return explicitExtraBody;
  }

  const explicitGoogle = toJsonObject(explicitExtraBody?.google);
  const explicitThinkingConfig = explicitGoogle?.thinking_config;
  const mergedThinkingConfig = toJsonObject(explicitThinkingConfig)
    ? {
        ...thinkingConfig,
        ...toJsonObject(explicitThinkingConfig),
      }
    : explicitThinkingConfig !== undefined
      ? explicitThinkingConfig
      : thinkingConfig;

  return {
    ...(explicitExtraBody ?? {}),
    google: {
      ...(explicitGoogle ?? {}),
      thinking_config: mergedThinkingConfig,
    },
  };
}

function mergeJsonObjects(
  base?: Record<string, JsonValue>,
  override?: Record<string, JsonValue>
): Record<string, JsonValue> | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

function toCoreMessage(message: LlmMessage, modelId: string): CoreLlmMessage {
  const reasoningContent = isDeepSeekModel(modelId)
    ? getDeepSeekReplayReasoningContent(message)
    : undefined;
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map(toCoreContent),
    reasoningContent,
    prefix: message.prefix,
  };
}

function toCoreContent(content: LlmMessageContent): CoreLlmMessageContent {
  if (content.type === "text") {
    return { type: "text", text: content.text };
  }
  if (content.type === "image") {
    const data = toBase64(content.imageBase64);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: inferImageMimeType(data),
        data,
      },
    };
  }
  if (content.type === "document") {
    return { type: "document", source: toJsonValue(content.source) ?? {} };
  }
  if (content.type === "audio") {
    return { type: "audio", source: toJsonValue(content.source) ?? {} };
  }
  if (content.type === "video") {
    return {
      type: "video",
      source: toJsonValue(content.source) ?? {},
      metadata: toJsonValue(content.videoMetadata),
    };
  }
  if (content.type === "tool_use") {
    return {
      type: "tool_use",
      id: content.toolUseId,
      name: content.toolName,
      input: toJsonValue(content.toolInput) ?? {},
    };
  }
  return {
    type: "tool_result",
    toolUseId: content.toolResultId,
    content:
      typeof content.toolResultContent === "string"
        ? content.toolResultContent
        : (toJsonValue(content.toolResultContent.map(toCoreContent)) ?? []),
    isError: content.isError,
  };
}

function mapCoreOpenAiResponse(
  response: CoreLlmResponse,
  modelId: string,
  isStream: boolean
): LlmResponse {
  const metadata = response.metadata as Record<string, any> | undefined;
  const images = response.images?.map(mapCoreImage);
  const audio = metadata?.audio;

  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    reasoningArtifacts: isDeepSeekModel(modelId)
      ? extractDeepSeekReasoningArtifacts(
          response.reasoningContent ?? "",
          !!response.toolCalls?.length
        )
      : undefined,
    refusal: response.refusal,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    toolCalls: response.toolCalls,
    images,
    revisedPrompt: images?.[0]?.revisedPrompt,
    logprobs: metadata?.logprobs as LlmResponse["logprobs"],
    annotations: response.annotations?.map((annotation: any) => ({
      type: annotation.type ?? "url_citation",
      urlCitation: annotation.url_citation
        ? {
            startIndex: annotation.url_citation.start_index,
            endIndex: annotation.url_citation.end_index,
            url: annotation.url_citation.url,
            title: annotation.url_citation.title,
          }
        : annotation.urlCitation,
    })),
    audio: audio
      ? {
          id: audio.id,
          data: audio.data,
          transcript: audio.transcript,
          expiresAt: audio.expires_at ?? audio.expiresAt,
        }
      : undefined,
    systemFingerprint: metadata?.systemFingerprint,
    serviceTier: metadata?.serviceTier,
    usage: response.usage,
    ...(isStream ? { isStream: true } : {}),
  };
}

function mapCoreImage(image: MediaAssetRef) {
  if (image.kind === "remote-url") {
    return { url: image.url, revisedPrompt: image.revisedPrompt };
  }
  if (image.kind === "inline-base64") {
    return { b64_json: image.data, revisedPrompt: image.revisedPrompt };
  }
  return { url: image.id, revisedPrompt: image.revisedPrompt };
}

function toBase64(value: string | ArrayBuffer | Uint8Array): string {
  if (typeof value === "string") return value;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toJsonObject(value: unknown): Record<string, JsonValue> | undefined {
  const result = toJsonValue(value);
  return result && typeof result === "object" && !Array.isArray(result)
    ? result
    : undefined;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(toJsonValue)
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const json = toJsonValue(item);
      if (json !== undefined) result[key] = json;
    }
    return result;
  }
  return undefined;
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
