import {
  executeProviderRequest,
  googleGenerateContentAdapter,
  vertexEmbeddingAdapter,
  vertexAnthropicAdapter,
  type JsonValue,
  type LlmStreamEvent,
} from "@aiohub/llm-core";
import { useI18n } from "@/i18n";
import type { LlmProfile } from "../../types";
import type { LlmRequestOptions, LlmResponse } from "../common";
import { mobileLlmTransport } from "../transports/mobile";
import {
  callMobileEmbeddingApi,
  type MobileEmbeddingRequestOptions,
} from "../embedding";
import {
  toMobileGeminiCoreRequest,
  toMobileGeminiProviderProfile,
  toMobileGeminiResponse,
} from "./gemini";
import { toMobileResponse } from "./openai-compatible";

export const vertexAiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = /\/v1\/?$/.test(host) ? host : `${host}v1/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`;
  },
  getHint: (): string => {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.Adapters.VertexAI提示");
  },
};

export function detectPublisher(modelId: string): "google" | "anthropic" {
  return modelId.toLowerCase().includes("claude") ? "anthropic" : "google";
}

export const callVertexAiApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const publisher = detectPublisher(options.modelId);
  const request = toMobileGeminiCoreRequest(options);
  if (publisher === "anthropic") {
    request.stop = options.stopSequences ?? options.stop;
    request.metadata = toJsonObject(options.claudeMetadata ?? options.metadata);
  }
  const profileOptions: Record<string, JsonValue> = {
    ...(publisher === "google" ? { apiStyle: "vertex" } : {}),
    ...(typeof profile.options?.projectId === "string"
      ? { projectId: profile.options.projectId }
      : {}),
    ...(typeof profile.options?.location === "string"
      ? { location: profile.options.location }
      : {}),
  };
  const response = await executeProviderRequest({
    adapter:
      publisher === "google"
        ? googleGenerateContentAdapter
        : vertexAnthropicAdapter,
    profile: toMobileGeminiProviderProfile(profile, profileOptions),
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

  return publisher === "google"
    ? toMobileGeminiResponse(response, request.stream === true)
    : toMobileResponse(response, request.stream === true);
};

export const callVertexAiEmbeddingApi = (
  profile: LlmProfile,
  options: MobileEmbeddingRequestOptions
) =>
  callMobileEmbeddingApi(vertexEmbeddingAdapter, profile, options, {
    ...(typeof profile.options?.projectId === "string"
      ? { projectId: profile.options.projectId }
      : {}),
    ...(typeof profile.options?.location === "string"
      ? { location: profile.options.location }
      : {}),
  });

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
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}`;
}
