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
  cohereChatAdapter,
  executeProviderRequest,
  type JsonValue,
  type LlmMessage as CoreLlmMessage,
  type LlmMessageContent as CoreLlmMessageContent,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
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

export const callCohereChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = buildCoreRequest(options);
  const response = await executeProviderRequest({
    adapter: cohereChatAdapter,
    profile: buildProviderProfile(profile),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: request.requestId ?? createRequestId(),
      timeoutMs: options.timeout,
      signal: options.signal,
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

  return mapCoreResponse(response, request.stream === true);
};

function buildProviderProfile(profile: LlmProfile): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl || "https://api.cohere.com",
    apiKey: profile.apiKeys[0],
    headers: resolveCustomHeaders(profile.customHeaders),
  };
}

function buildCoreRequest(options: LlmRequestOptions): CoreLlmRequest {
  const extensions: Record<string, JsonValue> = {};
  applyCustomParameters(extensions, options);
  cleanPayload(extensions);
  delete extensions.requestId;

  return {
    model: options.modelId,
    messages: (options.messages ?? []).map(toCoreMessage),
    stream: Boolean(
      options.stream && (options.onStream || options.onReasoningStream)
    ),
    requestId: options.requestId,
    maxTokens: options.maxTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    frequencyPenalty: options.frequencyPenalty,
    presencePenalty: options.presencePenalty,
    seed: options.seed,
    stop: options.stop,
    thinkingEnabled: options.thinkingEnabled,
    thinkingBudget: options.thinkingBudget,
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
    extraBody: toJsonObject(options.extraBody),
    extensions,
  };
}

function toCoreMessage(message: LlmMessage): CoreLlmMessage {
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map(toCoreContent),
    reasoningContent: message.reasoningContent,
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

function mapCoreResponse(
  response: CoreLlmResponse,
  isStream: boolean
): LlmResponse {
  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    usage: response.usage,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    toolCalls: response.toolCalls,
    ...(isStream ? { isStream: true } : {}),
  };
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
