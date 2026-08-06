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

import type {
  LlmAdapterId,
  LlmExecutionModel,
  LlmExecutionProfile,
  LlmOperation,
  ModelRouteBinding,
  ProviderExecutionDefault,
  ResolvedModelExecution,
} from "./types/routing";

/**
 * Phase 0 compatibility map from existing channel identity to protocol
 * identity. The resolver leaves the original channel type in place whenever
 * this default path is used, preserving old adapter-specific behavior.
 */
export const PROVIDER_EXECUTION_DEFAULTS: Readonly<
  Record<string, ProviderExecutionDefault>
> = {
  openai: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: {
      embedding: "openai-embeddings",
      image: "openai-image-generation",
    },
  },
  "openai-compatible": {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: {
      embedding: "openai-embeddings",
      rerank: "jina-rerank",
      image: "openai-image-generation",
    },
  },
  azure: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: { embedding: "openai-embeddings" },
  },
  deepseek: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: { embedding: "openai-embeddings" },
  },
  siliconflow: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: {
      embedding: "openai-embeddings",
      image: "openai-image-generation",
    },
  },
  groq: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  // Legacy aliases still present in the desktop adapter registry.
  mistral: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  perplexity: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  together: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  lmstudio: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  vllm: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  volcengine: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  dashscope: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  zhipu: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  moonshot: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
  },
  ollama: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: { embedding: "openai-embeddings" },
  },
  openrouter: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: { embedding: "openai-embeddings" },
  },
  "openai-responses": {
    defaultAdapterId: "openai-responses",
    defaultOperation: "chat",
    operationAdapters: {
      embedding: "openai-embeddings",
      image: "openai-responses",
    },
  },
  claude: {
    defaultAdapterId: "anthropic-messages",
    defaultOperation: "chat",
  },
  gemini: {
    defaultAdapterId: "gemini-generate-content",
    defaultOperation: "chat",
    operationAdapters: {
      embedding: "gemini-generate-content",
      image: "gemini-generate-content",
      audio: "gemini-generate-content",
      video: "gemini-generate-content",
    },
  },
  cohere: {
    defaultAdapterId: "cohere-chat",
    defaultOperation: "chat",
    operationAdapters: { embedding: "cohere-chat" },
  },
  vertexai: {
    defaultAdapterId: "vertex-google",
    defaultOperation: "chat",
    operationAdapters: { embedding: "vertex-google" },
  },
  xai: {
    defaultAdapterId: "openai-chat-completions",
    defaultOperation: "chat",
    operationAdapters: { image: "openai-image-generation" },
  },
  "suno-newapi": {
    defaultAdapterId: "suno-newapi",
    defaultOperation: "music",
  },
  "minimax-music": {
    defaultAdapterId: "minimax-music",
    defaultOperation: "music",
  },
};

/** Maps a protocol adapter to the legacy profile type that implements it. */
export const ADAPTER_PROFILE_TYPES: Readonly<Record<LlmAdapterId, string>> = {
  "openai-chat-completions": "openai-compatible",
  "openai-responses": "openai-responses",
  "anthropic-messages": "claude",
  "gemini-generate-content": "gemini",
  "cohere-chat": "cohere",
  "vertex-google": "vertexai",
  "vertex-anthropic": "vertexai",
  "openai-embeddings": "openai-compatible",
  "jina-rerank": "openai-compatible",
  "openai-image-generation": "openai-compatible",
  "suno-newapi": "suno-newapi",
  "minimax-music": "minimax-music",
};

const ADAPTER_ENDPOINT_KEYS: Readonly<Partial<Record<LlmAdapterId, string>>> = {
  "openai-chat-completions": "chatCompletions",
  "openai-responses": "responses",
  "anthropic-messages": "anthropicMessages",
  "gemini-generate-content": "geminiGenerateContent",
  "openai-embeddings": "embeddings",
  "jina-rerank": "rerank",
  "openai-image-generation": "imagesGenerations",
};

const ENDPOINT_TYPE_ADAPTERS: Readonly<Record<string, LlmAdapterId>> = {
  openai: "openai-chat-completions",
  "openai-chat": "openai-chat-completions",
  "openai-chat-completions": "openai-chat-completions",
  "openai-response": "openai-responses",
  "openai-responses": "openai-responses",
  anthropic: "anthropic-messages",
  "anthropic-messages": "anthropic-messages",
  gemini: "gemini-generate-content",
  "gemini-generate-content": "gemini-generate-content",
  embeddings: "openai-embeddings",
  "openai-embeddings": "openai-embeddings",
  rerank: "jina-rerank",
  "jina-rerank": "jina-rerank",
  "image-generation": "openai-image-generation",
  "openai-image-generation": "openai-image-generation",
};

const ADAPTER_OPERATIONS: Readonly<
  Record<LlmAdapterId, readonly LlmOperation[]>
> = {
  "openai-chat-completions": ["chat"],
  "openai-responses": ["chat", "image"],
  "anthropic-messages": ["chat"],
  "gemini-generate-content": ["chat", "embedding", "image", "audio", "video"],
  "cohere-chat": ["chat", "embedding"],
  "vertex-google": ["chat", "embedding"],
  "vertex-anthropic": ["chat"],
  "openai-embeddings": ["embedding"],
  "jina-rerank": ["rerank"],
  "openai-image-generation": ["image"],
  "suno-newapi": ["music"],
  "minimax-music": ["music"],
};

export interface ResolveModelExecutionOptions<
  TProfile extends LlmExecutionProfile,
  TModel extends LlmExecutionModel,
> {
  profile: TProfile;
  model: TModel;
  operation: LlmOperation;
  providerDefaults?: Readonly<Record<string, ProviderExecutionDefault>>;
}

/**
 * Resolves the protocol adapter and compatibility profile used for one model
 * operation. The order is binding, uniquely-recognized discovery, then legacy
 * provider default. Ambiguous discoveries intentionally fall back to the
 * profile default instead of guessing from model identifiers.
 */
export function resolveModelExecution<
  TProfile extends LlmExecutionProfile,
  TModel extends LlmExecutionModel,
>(
  options: ResolveModelExecutionOptions<TProfile, TModel>
): ResolvedModelExecution<TProfile> {
  const { profile, model, operation } = options;
  const binding = model.routing?.bindings?.[operation];
  if (binding) {
    return resolveBoundExecution(profile, operation, binding);
  }

  const discoveredAdapter = resolveUniqueDiscoveredAdapter(
    model.routing?.supportedEndpointTypes,
    operation
  );
  if (discoveredAdapter) {
    return resolveBoundExecution(profile, operation, {
      adapterId: discoveredAdapter,
      source: "discovered",
    });
  }

  const defaults = options.providerDefaults ?? PROVIDER_EXECUTION_DEFAULTS;
  const providerDefault = defaults[profile.type];
  if (!providerDefault) {
    throw new Error(
      `No default execution adapter is registered for provider type: ${profile.type}`
    );
  }

  return {
    adapterId:
      providerDefault.operationAdapters?.[operation] ??
      providerDefault.defaultAdapterId,
    operation,
    routeSource: "profile-default",
    effectiveProfile: profile,
  };
}

function resolveBoundExecution<TProfile extends LlmExecutionProfile>(
  profile: TProfile,
  operation: LlmOperation,
  binding: ModelRouteBinding
): ResolvedModelExecution<TProfile> {
  const endpointKey = ADAPTER_ENDPOINT_KEYS[binding.adapterId];
  const customEndpoints =
    endpointKey && binding.endpoint
      ? {
          ...((profile.customEndpoints as
            Record<string, string | undefined> | undefined) ?? {}),
          [endpointKey]: binding.endpoint,
        }
      : profile.customEndpoints;
  const effectiveProfile = {
    ...profile,
    type: ADAPTER_PROFILE_TYPES[binding.adapterId],
    ...(customEndpoints ? { customEndpoints } : {}),
  } as TProfile;

  return {
    adapterId: binding.adapterId,
    operation,
    endpoint: binding.endpoint,
    routeSource: binding.source ?? "manual",
    effectiveProfile,
  };
}

function resolveUniqueDiscoveredAdapter(
  endpointTypes: readonly string[] | undefined,
  operation: LlmOperation
): LlmAdapterId | undefined {
  if (!endpointTypes?.length) return undefined;

  const candidates = new Set<LlmAdapterId>();
  for (const endpointType of endpointTypes) {
    const adapterId = ENDPOINT_TYPE_ADAPTERS[endpointType.toLowerCase()];
    if (adapterId && ADAPTER_OPERATIONS[adapterId].includes(operation)) {
      candidates.add(adapterId);
    }
  }

  return candidates.size === 1 ? [...candidates][0] : undefined;
}
