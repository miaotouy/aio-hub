import {
  executeEmbeddingRequest,
  type EmbeddingProviderAdapter,
  type EmbeddingRequest,
  type JsonValue,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "./embedding-types";
import { desktopLlmTransport } from "./transports/desktop";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";

export async function callSharedEmbeddingApi(
  adapter: EmbeddingProviderAdapter,
  profile: LlmProfile,
  options: EmbeddingRequestOptions,
  providerOptions?: Record<string, JsonValue>
): Promise<EmbeddingResponse> {
  const request: EmbeddingRequest = {
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
      headers: resolveCustomHeaders(profile.customHeaders),
      endpoints: profile.customEndpoints,
      options: providerOptions,
    },
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: request.requestId ?? createRequestId(),
      timeoutMs: options.timeout,
      signal: options.signal,
      network: {
        strategy: options.forceProxy ? "proxy" : profile.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
  });
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `embedding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
