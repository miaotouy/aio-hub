import {
  cohereEmbeddingAdapter,
  geminiEmbeddingAdapter,
  openAiEmbeddingAdapter,
  vertexEmbeddingAdapter,
  executeEmbeddingRequest,
  type JsonValue,
  type LlmTransport,
  type EmbeddingProviderAdapter,
} from "@aiohub/llm-core";
import type { LlmProfile } from "../../types/llm-profiles";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "../embedding-types";
import { prepareAzureOpenAiProfile } from "../adapters/azure/utils";

export interface EmbeddingAdapterPorts {
  transport: LlmTransport;
  resolveCustomHeaders?(
    headers: LlmProfile["customHeaders"]
  ): Record<string, string>;
}

export function createEmbeddingAdapters(ports: EmbeddingAdapterPorts) {
  const call = (
    adapter: EmbeddingProviderAdapter,
    profile: LlmProfile,
    options: EmbeddingRequestOptions,
    providerOptions?: Record<string, JsonValue>
  ) => {
    const request = {
      model: options.modelId,
      input: options.input,
      dimensions: options.dimensions,
      user: options.user,
      taskType: options.taskType,
      title: options.title,
      encodingFormat: options.encodingFormat,
      requestId: options.requestId,
    };
    return executeEmbeddingRequest({
      adapter,
      profile: {
        provider: profile.type,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKeys?.[0],
        headers: ports.resolveCustomHeaders?.(profile.customHeaders) ?? {},
        endpoints: profile.customEndpoints,
        options: providerOptions,
      },
      request,
      transport: ports.transport,
      transportOptions: {
        requestId: request.requestId ?? crypto.randomUUID(),
        timeoutMs: options.timeout,
        signal: options.signal,
        network: {
          strategy: options.forceProxy ? "proxy" : profile.networkStrategy,
          relaxInvalidCerts: options.relaxIdCerts,
          http1Only: options.http1Only,
        },
      },
    });
  };
  const openai = (profile: LlmProfile, options: EmbeddingRequestOptions) =>
    call(openAiEmbeddingAdapter, profile, options);

  return {
    openai,
    "openai-compatible": openai,
    deepseek: openai,
    azure: (profile: LlmProfile, options: EmbeddingRequestOptions) =>
      call(
        openAiEmbeddingAdapter,
        prepareAzureOpenAiProfile(profile, "embedding"),
        options
      ),
    gemini: (profile: LlmProfile, options: EmbeddingRequestOptions) =>
      call(geminiEmbeddingAdapter, profile, options),
    cohere: (profile: LlmProfile, options: EmbeddingRequestOptions) =>
      call(cohereEmbeddingAdapter, profile, options),
    vertexai: (profile: LlmProfile, options: EmbeddingRequestOptions) =>
      call(vertexEmbeddingAdapter, profile, options, {
        ...(typeof profile.options?.projectId === "string"
          ? { projectId: profile.options.projectId }
          : {}),
        ...(typeof profile.options?.location === "string"
          ? { location: profile.options.location }
          : {}),
      }),
  } satisfies Record<
    string,
    (
      profile: LlmProfile,
      options: EmbeddingRequestOptions
    ) => Promise<EmbeddingResponse>
  >;
}
