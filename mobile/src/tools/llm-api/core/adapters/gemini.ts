import {
  executeProviderRequest,
  geminiEmbeddingAdapter,
  googleGenerateContentAdapter,
  type JsonValue,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
  type ProviderProfile,
} from "@aiohub/llm-core";
import { useI18n } from "@/i18n";
import type { LlmProfile } from "../../types";
import type {
  LlmMessage,
  LlmReasoningArtifact,
  LlmRequestOptions,
  LlmResponse,
} from "../common";
import { mobileLlmTransport } from "../transports/mobile";
import {
  callMobileEmbeddingApi,
  type MobileEmbeddingRequestOptions,
} from "../embedding";
import {
  toMobileResponse,
  toOpenAiCompatibleCoreRequest,
  toOpenAiCompatibleProviderProfile,
} from "./openai-compatible";

type GeminiRequestOptions = LlmRequestOptions & {
  cachedContent?: string;
  enableCodeExecution?: boolean;
  enableEnhancedCivicAnswers?: boolean;
  mediaResolution?: string;
  responseModalities?: string[];
  safetySettings?: unknown;
  speechConfig?: unknown;
  thinkingLevel?: string;
};

export const geminiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = /\/v1(?:beta)?\/?$/.test(host)
      ? host
      : `${host}v1beta/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}models/{model}:generateContent`;
  },
  getHint: (): string => {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.Adapters.Gemini提示");
  },
};

export const callGeminiApi = async (
  profile: LlmProfile,
  rawOptions: LlmRequestOptions
): Promise<LlmResponse> => {
  const options = rawOptions as GeminiRequestOptions;
  const request = toMobileGeminiCoreRequest(options);
  const response = await executeProviderRequest({
    adapter: googleGenerateContentAdapter,
    profile: toMobileGeminiProviderProfile(profile),
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

  return toMobileGeminiResponse(response, request.stream === true);
};

export const callGeminiEmbeddingApi = (
  profile: LlmProfile,
  options: MobileEmbeddingRequestOptions
) => callMobileEmbeddingApi(geminiEmbeddingAdapter, profile, options);

export function toMobileGeminiCoreRequest(
  options: GeminiRequestOptions
): CoreLlmRequest {
  const request = toOpenAiCompatibleCoreRequest(options);
  request.stream = Boolean(
    options.stream && (options.onStream || options.onReasoningStream)
  );
  request.messages = request.messages.map((message, index) => {
    const source = options.messages[index];
    const replayParts = getGeminiReplayParts(source);
    return replayParts
      ? {
          ...message,
          metadata: {
            ...message.metadata,
            geminiReplayParts: toJsonValue(replayParts) ?? [],
          },
        }
      : message;
  });
  request.thinkingLevel = options.thinkingLevel;
  request.includeThoughts = options.includeThoughts;
  request.safetySettings = toJsonValue(options.safetySettings);
  request.enableCodeExecution = options.enableCodeExecution;
  request.speechConfig = toJsonValue(options.speechConfig);
  request.responseModalities = options.responseModalities;
  request.mediaResolution = options.mediaResolution;
  request.enableEnhancedCivicAnswers = options.enableEnhancedCivicAnswers;
  request.cachedContent = options.cachedContent;
  return request;
}

export function toMobileGeminiProviderProfile(
  profile: LlmProfile,
  options?: Record<string, JsonValue>
): ProviderProfile {
  return {
    ...toOpenAiCompatibleProviderProfile(profile),
    options,
  };
}

export function toMobileGeminiResponse(
  response: CoreLlmResponse,
  isStream: boolean
): LlmResponse {
  const result = toMobileResponse(response, isStream);
  const parts = asRecord(response.metadata)?.geminiParts;
  result.reasoningArtifacts = extractGeminiReasoningArtifacts(parts);
  return result;
}

function getGeminiReplayParts(
  message: LlmMessage | undefined
): unknown[] | undefined {
  const artifact = message?.reasoningArtifacts?.find(
    (item) =>
      item.provider === "gemini" &&
      item.kind === "model.parts" &&
      item.replayPolicy === "always"
  );
  const parts = asRecord(artifact?.payload)?.parts;
  return Array.isArray(parts) && parts.length ? parts : undefined;
}

function extractGeminiReasoningArtifacts(
  value: unknown
): LlmReasoningArtifact[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const hasState = value.some((rawPart) => {
    const part = asRecord(rawPart);
    return Boolean(
      part &&
      (part.thought === true ||
        part.thoughtSignature ||
        part.thought_signature ||
        part.signature)
    );
  });
  if (!hasState) return undefined;
  const visibleText = value
    .map(asRecord)
    .filter((part) => part?.thought === true && typeof part.text === "string")
    .map((part) => String(part?.text))
    .join("");
  return [
    {
      provider: "gemini",
      kind: "model.parts",
      replayPolicy: "always",
      payload: { parts: value },
      ...(visibleText ? { visibleText } : {}),
    },
  ];
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map(toJsonValue)
      .filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const json = toJsonValue(item);
      if (json !== undefined) result[key] = json;
    }
    return result;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}`;
}
