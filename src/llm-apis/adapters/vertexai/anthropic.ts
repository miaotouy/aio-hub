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
  vertexAnthropicAdapter,
  type JsonValue,
  type LlmStreamEvent,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { toGeminiCoreRequest, toGeminiProviderProfile } from "../gemini/chat";

export async function callVertexAiClaude(
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> {
  const request = toGeminiCoreRequest(options);
  request.stop = options.stopSequences ?? options.stop;
  request.metadata = toJsonObject(options.claudeMetadata ?? options.metadata);
  const profileOptions: Record<string, JsonValue> = {
    ...(typeof profile.options?.projectId === "string"
      ? { projectId: profile.options.projectId }
      : {}),
    ...(typeof profile.options?.location === "string"
      ? { location: profile.options.location }
      : {}),
  };
  const response = await executeProviderRequest({
    adapter: vertexAnthropicAdapter,
    profile: toGeminiProviderProfile(profile, profileOptions),
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
  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    stopSequence: response.stopSequence,
    usage: response.usage,
    toolCalls: response.toolCalls,
    ...(request.stream ? { isStream: true } : {}),
  };
}

function toJsonObject(value: unknown): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      result[key] = item;
    }
  }
  return result;
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
