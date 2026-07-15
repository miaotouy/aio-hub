import {
  executeEmbeddingRequest,
  type EmbeddingProviderAdapter,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type JsonValue,
} from "@aiohub/llm-core";
import type { LlmProfile } from "../types";
import { mobileLlmTransport } from "./transports/mobile";

export interface MobileEmbeddingRequestOptions
  extends Omit<EmbeddingRequest, "model"> {
  modelId: string;
  timeout?: number;
  signal?: AbortSignal;
  forceProxy?: boolean;
  relaxIdCerts?: boolean;
  http1Only?: boolean;
}

export function callMobileEmbeddingApi(
  adapter: EmbeddingProviderAdapter,
  profile: LlmProfile,
  options: MobileEmbeddingRequestOptions,
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
    extensions: options.extensions,
  };
  return executeEmbeddingRequest({
    adapter,
    profile: {
      provider: profile.type,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKeys?.[0],
      headers: profile.customHeaders,
      endpoints: profile.customEndpoints,
      options: providerOptions,
    },
    request,
    transport: mobileLlmTransport,
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
  return globalThis.crypto?.randomUUID?.() ?? `embedding-${Date.now()}`;
}
