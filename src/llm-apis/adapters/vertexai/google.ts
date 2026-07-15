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
  vertexEmbeddingAdapter,
  type JsonValue,
  type LlmStreamEvent,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "@/llm-apis/embedding-types";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { callSharedEmbeddingApi } from "@/llm-apis/embedding-core";
import {
  toDesktopGeminiResponse,
  toGeminiCoreRequest,
  toGeminiProviderProfile,
} from "../gemini/chat";

export async function callVertexAiGemini(
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> {
  const request = toGeminiCoreRequest(options);
  const profileOptions: Record<string, JsonValue> = {
    apiStyle: "vertex",
    ...(typeof profile.options?.projectId === "string"
      ? { projectId: profile.options.projectId }
      : {}),
    ...(typeof profile.options?.location === "string"
      ? { location: profile.options.location }
      : {}),
  };
  const response = await executeProviderRequest({
    adapter: googleGenerateContentAdapter,
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
  return toDesktopGeminiResponse(response, request.stream === true);
}

export async function callVertexAiEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  return callSharedEmbeddingApi(vertexEmbeddingAdapter, profile, options, {
    ...(typeof profile.options?.projectId === "string"
      ? { projectId: profile.options.projectId }
      : {}),
    ...(typeof profile.options?.location === "string"
      ? { location: profile.options.location }
      : {}),
  });
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
