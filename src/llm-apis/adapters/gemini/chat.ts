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
  googleGenerateContentAdapter,
  parseGoogleGenerateContentResponseValue,
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
  inferImageMimeType,
} from "@/llm-apis/request-builder";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import {
  extractGeminiReasoningArtifacts,
  getGeminiReplayParts,
} from "./reasoning-artifacts";

type GeminiRequestOptions = LlmRequestOptions & {
  cachedContent?: string;
  enableCodeExecution?: boolean;
  enableEnhancedCivicAnswers?: boolean;
  mediaResolution?: string;
  responseModalities?: string[];
  safetySettings?: unknown;
  speechConfig?: unknown;
  thinkingLevel?: string;
};

export function parseGeminiResponse(data: unknown): LlmResponse {
  return toDesktopGeminiResponse(
    parseGoogleGenerateContentResponseValue(data),
    false
  );
}

export const callGeminiChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = toGeminiCoreRequest(options as GeminiRequestOptions);
  const response = await executeProviderRequest({
    adapter: googleGenerateContentAdapter,
    profile: toGeminiProviderProfile(profile),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: request.requestId ?? createRequestId(),
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

  return toDesktopGeminiResponse(response, request.stream === true);
};

export function toGeminiProviderProfile(
  profile: LlmProfile,
  options?: Record<string, JsonValue>
): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKeys?.[0],
    headers: resolveCustomHeaders(profile.customHeaders),
    endpoints: profile.customEndpoints,
    options,
  };
}

export function toGeminiCoreRequest(
  options: GeminiRequestOptions
): CoreLlmRequest {
  const extensions: Record<string, JsonValue> = {};
  applyCustomParameters(extensions, options);
  cleanPayload(extensions);

  return {
    model: options.modelId,
    messages: (options.messages ?? []).map(toCoreMessage),
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
    stop: options.stop,
    seed: options.seed,
    logprobs: options.logprobs,
    topLogprobs: options.topLogprobs,
    reasoningEffort: options.reasoningEffort,
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
    responseFormat: toJsonValue(options.responseFormat),
    requestId: options.requestId,
    webSearchEnabled: options.webSearchEnabled === true,
    thinkingEnabled: options.thinkingEnabled,
    thinkingBudget: options.thinkingBudget,
    thinkingLevel: options.thinkingLevel,
    includeThoughts: options.includeThoughts,
    safetySettings: toJsonValue(options.safetySettings),
    enableCodeExecution: options.enableCodeExecution,
    speechConfig: toJsonValue(options.speechConfig),
    responseModalities: options.responseModalities,
    mediaResolution: options.mediaResolution,
    enableEnhancedCivicAnswers: options.enableEnhancedCivicAnswers,
    cachedContent: options.cachedContent,
    extraBody: toJsonObject(options.extraBody),
    extensions,
  };
}

function toCoreMessage(message: LlmMessage): CoreLlmMessage {
  const replayParts =
    message.role === "assistant" ? getGeminiReplayParts(message) : undefined;
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map(toCoreContent),
    prefix: message.prefix,
    ...(replayParts
      ? { metadata: { geminiReplayParts: toJsonValue(replayParts) ?? [] } }
      : {}),
  };
}

function toCoreContent(content: LlmMessageContent): CoreLlmMessageContent {
  switch (content.type) {
    case "text":
      return { type: "text", text: content.text };
    case "image": {
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
    case "audio":
      return { type: "audio", source: toJsonValue(content.source) ?? {} };
    case "video":
      return {
        type: "video",
        source: toJsonValue(content.source) ?? {},
        metadata: toJsonValue(content.videoMetadata),
      };
    case "document":
      return { type: "document", source: toJsonValue(content.source) ?? {} };
    case "tool_use":
      return {
        type: "tool_use",
        id: content.toolUseId,
        name: content.toolName,
        input: toJsonValue(content.toolInput) ?? {},
      };
    case "tool_result":
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
}

export function toDesktopGeminiResponse(
  response: CoreLlmResponse,
  isStream: boolean
): LlmResponse {
  const metadata = asRecord(response.metadata);
  const geminiParts = metadata?.geminiParts;
  const reasoningArtifacts = extractGeminiReasoningArtifacts(geminiParts);
  const images = response.images?.map(mapCoreImage);
  const audios = response.audios?.map(mapCoreAudio);

  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    reasoningArtifacts,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    usage: response.usage,
    toolCalls: response.toolCalls,
    annotations: response.annotations?.map((annotation) => {
      const citation = asRecord(
        annotation.url_citation ?? annotation.urlCitation
      );
      return {
        type: "url_citation" as const,
        urlCitation: {
          startIndex: readNumber(citation?.start_index) ?? 0,
          endIndex: readNumber(citation?.end_index) ?? 0,
          url: readString(citation?.url) ?? "",
          title: readString(citation?.title) ?? "",
        },
      };
    }),
    logprobs: metadata?.logprobs as LlmResponse["logprobs"],
    images,
    revisedPrompt: images?.[0]?.revisedPrompt,
    audios,
    ...(isStream ? { isStream: true } : {}),
  };
}

function mapCoreImage(image: MediaAssetRef) {
  if (image.kind === "inline-base64") {
    return { b64_json: image.data, revisedPrompt: image.revisedPrompt };
  }
  return {
    url: image.kind === "remote-url" ? image.url : image.id,
    revisedPrompt: image.revisedPrompt,
  };
}

function mapCoreAudio(audio: MediaAssetRef) {
  if (audio.kind === "inline-base64") {
    return {
      b64_json: audio.data,
      format: audio.contentType.split("/")[1],
    };
  }
  return { url: audio.kind === "remote-url" ? audio.url : audio.id };
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
  if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
    return toBase64(value);
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

function asRecord(value: unknown): Record<string, any> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
