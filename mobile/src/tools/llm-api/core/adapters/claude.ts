import {
  anthropicMessagesAdapter,
  executeProviderRequest,
  type LlmStreamEvent,
} from "@aiohub/llm-core";
import { useI18n } from "@/i18n";
import type { LlmProfile } from "../../types";
import type { LlmRequestOptions, LlmResponse } from "../common";
import { mobileLlmTransport } from "../transports/mobile";
import {
  toMobileResponse,
  toOpenAiCompatibleCoreRequest,
  toOpenAiCompatibleProviderProfile,
} from "./openai-compatible";

export const claudeUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes("/v1") ? host : `${host}v1/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}messages`;
  },
  getHint: (): string => {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.Adapters.Claude提示");
  },
};

export const callClaudeApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = toOpenAiCompatibleCoreRequest(options);
  request.stream = Boolean(
    options.stream && (options.onStream || options.onReasoningStream)
  );
  request.stop = options.stopSequences ?? options.stop;
  request.metadata = options.claudeMetadata ?? options.metadata;
  request.webSearchEnabled = options.webSearchEnabled === true;

  const response = await executeProviderRequest({
    adapter: anthropicMessagesAdapter,
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
