import {
  cohereChatAdapter,
  executeProviderRequest,
  type LlmStreamEvent,
} from "@aiohub/llm-core";
import type { LlmProfile } from "../../types";
import type { LlmRequestOptions, LlmResponse } from "../common";
import { mobileLlmTransport } from "../transports/mobile";
import {
  toMobileResponse,
  toOpenAiCompatibleCoreRequest,
  toOpenAiCompatibleProviderProfile,
} from "./openai-compatible";

export const cohereUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const normalizedBase = baseUrl.replace(/\/v1\/?$/, "");
    const host = normalizedBase.endsWith("/")
      ? normalizedBase
      : `${normalizedBase}/`;
    const versionedHost = host.includes("/v2") ? host : `${host}v2/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat`;
  },
  getHint: (): string => "将自动添加 /v2/chat",
};

export const callCohereApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = toOpenAiCompatibleCoreRequest(options);
  request.stream = Boolean(
    options.stream && (options.onStream || options.onReasoningStream)
  );
  delete request.extensions?.requestId;

  const response = await executeProviderRequest({
    adapter: cohereChatAdapter,
    profile: toOpenAiCompatibleProviderProfile(profile),
    request,
    transport: mobileLlmTransport,
    transportOptions: {
      requestId: request.requestId ?? createRequestId(),
      timeoutMs: options.timeout,
      signal: options.signal,
      observer: options.transportObserver,
      network: {
        strategy: profile.networkStrategy,
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

  return toMobileResponse(response, request.stream === true);
};

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}`;
}
