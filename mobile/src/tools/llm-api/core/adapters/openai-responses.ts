import {
  executeProviderRequest,
  openAiResponsesAdapter,
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

export const openAiResponsesUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost =
      host.includes("/v1") ||
      host.includes("/v2") ||
      host.includes("/v3") ||
      host.includes("/api/v")
        ? host
        : `${host}v1/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}responses`;
  },
  getHint: (): string => {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.Adapters.OpenAIResponses提示");
  },
};

export const callOpenAiResponsesApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = toOpenAiCompatibleCoreRequest(options);
  request.stream = Boolean(
    options.stream &&
    (options.onStream || options.onReasoningStream || options.onPartialImage)
  );
  request.store = options.responsesStore ?? options.store;

  const response = await executeProviderRequest({
    adapter: openAiResponsesAdapter,
    profile: toOpenAiCompatibleProviderProfile(profile),
    request,
    transport: mobileLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? createRequestId(),
      timeoutMs: options.timeout,
      signal: options.signal,
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
      if (event.type === "partial-image") {
        const data = toPartialImageDataUrl(event.asset);
        if (data) {
          if (options.onPartialImage) {
            options.onPartialImage(data, event.index);
          } else {
            options.onStream?.(`__PARTIAL_IMAGE__:${data}`);
          }
        }
      }
    },
  });

  return toMobileResponse(response, request.stream === true);
};

function toPartialImageDataUrl(
  asset: Extract<LlmStreamEvent, { type: "partial-image" }>["asset"]
): string | undefined {
  if (asset.kind === "inline-base64") {
    return `data:${asset.contentType};base64,${asset.data}`;
  }
  if (asset.kind === "remote-url") return asset.url;
  return undefined;
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}`;
}
