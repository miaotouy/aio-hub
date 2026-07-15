import {
  buildOpenAiCompatibleRequest as buildSharedOpenAiCompatibleRequest,
  executeProviderRequest,
  openAiCompatibleAdapter,
  parseOpenAiCompatibleResponseValue,
  type JsonValue,
  type LlmMessage as CoreLlmMessage,
  type LlmMessageContent as CoreLlmMessageContent,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmTransport,
  type ProviderProfile,
  type WireJsonValue,
} from "@aiohub/llm-core";
import { useI18n } from "@/i18n";
import { createModuleLogger } from "@/utils/logger";
import type { LlmProfile } from "../../types";
import type {
  Annotation,
  LlmMessageContent,
  LlmRequestOptions,
  LlmResponse,
} from "../common";
import {
  inferImageMimeType,
  KNOWN_NON_MODEL_OPTIONS_KEYS,
} from "../request-builder";
import { mobileLlmTransport } from "../transports/mobile";

const logger = createModuleLogger("openai-compatible");

const CANONICAL_EXTENSION_KEYS = new Set([
  ...KNOWN_NON_MODEL_OPTIONS_KEYS,
  "repetitionPenalty",
  "extraBody",
  "extensions",
]);

export interface OpenAiCompatibleAdapterDependencies {
  transport: LlmTransport;
  logger: {
    warn(message: string, context?: Record<string, unknown>): void;
  };
}

export interface OpenAiCompatibleWireRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, WireJsonValue>;
}

export const openAiUrlHandler = {
  buildUrl: (
    baseUrl: string,
    endpoint?: string,
    profile?: LlmProfile,
    pathParams?: Record<string, string>
  ): string => {
    const endpointMapping: Record<
      string,
      keyof NonNullable<LlmProfile["customEndpoints"]>
    > = {
      "chat/completions": "chatCompletions",
      completions: "completions",
      models: "models",
      embeddings: "embeddings",
      rerank: "rerank",
      "images/generations": "imagesGenerations",
      "images/edits": "imagesEdits",
      "images/variations": "imagesVariations",
      "audio/speech": "audioSpeech",
      "audio/transcriptions": "audioTranscriptions",
      "audio/translations": "audioTranslations",
      moderations: "moderations",
      videos: "videos",
      videoStatus: "videoStatus",
    };
    const customKey = endpoint
      ? endpointMapping[endpoint]
      : "chatCompletions";
    let customEndpoint = customKey
      ? profile?.customEndpoints?.[customKey]
      : undefined;

    if (customEndpoint) {
      for (const [key, value] of Object.entries(pathParams ?? {})) {
        customEndpoint = customEndpoint.replace(`{${key}}`, value);
      }
      if (customEndpoint.startsWith("http")) return customEndpoint;
      const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      return `${host}${customEndpoint.replace(/^\//, "")}`;
    }

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
      : `${versionedHost}chat/completions`;
  },
  getHint: (): string => {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.Adapters.OpenAI提示");
  },
};

export function toOpenAiCompatibleProviderProfile(
  profile: LlmProfile
): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKeys[0],
    headers: profile.customHeaders,
    endpoints: profile.customEndpoints,
  };
}

export function toOpenAiCompatibleCoreRequest(
  options: LlmRequestOptions
): CoreLlmRequest {
  const extraBody = asJsonObject(options.extraBody);
  const explicitExtensions = asJsonObject(options.extensions);
  const safetySettings = toJsonValue(options.safetySettings);

  return {
    model: options.modelId,
    messages: options.messages.map(toCoreMessage),
    stream: options.stream,
    maxTokens: options.maxTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    frequencyPenalty: options.frequencyPenalty,
    presencePenalty: options.presencePenalty,
    repetitionPenalty: readFiniteNumber(options.repetitionPenalty),
    stop: options.stop,
    seed: options.seed,
    n: options.n,
    logprobs: options.logprobs,
    topLogprobs: options.topLogprobs,
    reasoningEffort: options.reasoningEffort,
    tools: options.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: toJsonValue(tool.function.parameters) ?? {},
        strict: tool.function.strict,
      },
    })),
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
    responseFormat: toJsonValue(options.responseFormat),
    user: options.user,
    logitBias: options.logitBias,
    store: options.store,
    include: options.include,
    metadata: options.metadata,
    modalities: options.modalities,
    prediction: toJsonValue(options.prediction),
    audio: toJsonValue(options.audio),
    serviceTier: options.serviceTier,
    webSearchOptions: toJsonValue(options.webSearchOptions),
    streamOptions: toJsonValue(options.streamOptions),
    requestId:
      typeof options.requestId === "string" ? options.requestId : undefined,
    webSearchEnabled: options.webSearchEnabled === true,
    thinkingEnabled: options.thinkingEnabled,
    thinkingBudget: options.thinkingBudget,
    extraBody,
    extensions: {
      ...explicitExtensions,
      ...collectUnknownExtensions(options),
      ...(safetySettings === undefined
        ? {}
        : { safety_settings: safetySettings }),
    },
  };
}

export const buildOpenAiCompatibleRequest = (
  profile: LlmProfile,
  options: LlmRequestOptions
): OpenAiCompatibleWireRequest => {
  const request = buildSharedOpenAiCompatibleRequest(
    toOpenAiCompatibleProviderProfile(profile),
    toOpenAiCompatibleCoreRequest(options)
  );
  if (
    request.body?.kind !== "json" ||
    Array.isArray(request.body.value) ||
    request.body.value === null ||
    typeof request.body.value !== "object"
  ) {
    throw new Error("OpenAI-compatible adapter produced a non-object JSON body");
  }
  return {
    url: request.url,
    headers: request.headers,
    body: request.body.value as Record<string, WireJsonValue>,
  };
};

export function parseOpenAiCompatibleResponse(data: unknown): LlmResponse {
  return toMobileResponse(parseOpenAiCompatibleResponseValue(data), false);
}

export const createOpenAiCompatibleApi =
  (dependencies: OpenAiCompatibleAdapterDependencies) =>
  async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    if (isNonEmptyRecord(options.custom)) {
      dependencies.logger.warn(
        "检测到 'custom' 参数容器，但它未被上游逻辑解包。这可能是一个错误。",
        { customParams: options.custom }
      );
    }

    const request = toOpenAiCompatibleCoreRequest(options);
    const response = await executeProviderRequest({
      adapter: openAiCompatibleAdapter,
      profile: toOpenAiCompatibleProviderProfile(profile),
      request,
      transport: dependencies.transport,
      transportOptions: {
        requestId: readRequestId(options),
        timeoutMs: options.timeout,
        signal: options.signal,
        network: {
          strategy: profile.networkStrategy,
          relaxInvalidCerts: options.relaxIdCerts,
          http1Only: options.http1Only,
        },
      },
      onEvent(event) {
        if (event.type === "text-delta") options.onStream?.(event.delta);
        if (event.type === "reasoning-delta") {
          options.onReasoningStream?.(event.delta);
        }
      },
    });

    return toMobileResponse(response, request.stream === true);
  };

export const callOpenAiCompatibleApi = createOpenAiCompatibleApi({
  transport: mobileLlmTransport,
  logger,
});

function toCoreMessage(message: {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmMessageContent[];
  prefix?: boolean;
}): CoreLlmMessage {
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : message.content.map(toCoreContent),
    prefix: message.prefix,
  };
}

function toCoreContent(content: LlmMessageContent): CoreLlmMessageContent {
  switch (content.type) {
    case "text":
      return {
        type: "text",
        text: content.text,
        cacheControl: toJsonValue(content.cacheControl),
      };
    case "image":
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: content.mimeType ?? inferImageMimeType(content.imageBase64),
          data: content.imageBase64,
        },
        cacheControl: toJsonValue(content.cacheControl),
      };
    case "audio":
      return { type: "audio", source: content.source };
    case "video":
      return {
        type: "video",
        source: content.source,
        metadata: toJsonValue(content.videoMetadata),
      };
    case "document":
      return { type: "document", source: content.source };
    case "tool_use":
      return {
        type: "tool_use",
        id: content.toolUseId,
        name: content.toolName,
        input: toJsonValue(content.toolInput) ?? {},
      };
    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: content.toolResultId,
        content:
          typeof content.toolResultContent === "string"
            ? content.toolResultContent
            : (toJsonValue(content.toolResultContent) ?? []),
        isError: content.isError,
      };
  }
}

export function toMobileResponse(
  response: CoreLlmResponse,
  isStream: boolean
): LlmResponse {
  const metadata = asRecord(response.metadata);
  const audio = asRecord(metadata?.audio);
  const images = response.images?.map((image) => {
    if (image.kind === "inline-base64") {
      return { b64_json: image.data, revisedPrompt: image.revisedPrompt };
    }
    return {
      url: image.kind === "remote-url" ? image.url : image.id,
      revisedPrompt: image.revisedPrompt,
    };
  });

  return {
    content: response.content,
    usage: response.usage,
    ...(isStream ? { isStream: true } : {}),
    refusal: response.refusal,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    stopSequence: response.stopSequence,
    toolCalls: response.toolCalls,
    reasoningContent: response.reasoningContent,
    annotations: mapAnnotations(response.annotations),
    logprobs: metadata?.logprobs as LlmResponse["logprobs"],
    audio: audio
      ? {
          id: readString(audio.id) ?? "",
          data: readString(audio.data) ?? "",
          transcript: readString(audio.transcript) ?? "",
          expiresAt:
            readFiniteNumber(audio.expires_at) ??
            readFiniteNumber(audio.expiresAt) ??
            0,
        }
      : undefined,
    systemFingerprint: readString(metadata?.systemFingerprint),
    serviceTier: readString(metadata?.serviceTier),
    images,
    revisedPrompt: images?.[0]?.revisedPrompt,
  };
}

function mapAnnotations(
  annotations: CoreLlmResponse["annotations"]
): Annotation[] | undefined {
  if (!annotations?.length) return undefined;

  return annotations.map((annotation) => {
    if (annotation.type === "file_citation") {
      const citation = asRecord(
        annotation.file_citation ?? annotation.fileCitation
      );
      return {
        type: "file_citation" as const,
        fileCitation: {
          startIndex: readFiniteNumber(citation?.start_index) ?? 0,
          endIndex: readFiniteNumber(citation?.end_index) ?? 0,
          fileId:
            readString(citation?.file_id) ?? readString(citation?.fileId) ?? "",
          quote: readString(citation?.quote),
        },
      };
    }

    const citation = asRecord(
      annotation.url_citation ?? annotation.urlCitation
    );
    return {
      type: "url_citation" as const,
      urlCitation: {
        startIndex: readFiniteNumber(citation?.start_index) ?? 0,
        endIndex: readFiniteNumber(citation?.end_index) ?? 0,
        url: readString(citation?.url) ?? "",
        title: readString(citation?.title) ?? "",
      },
    };
  });
}

function collectUnknownExtensions(
  options: LlmRequestOptions
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(options)) {
    if (CANONICAL_EXTENSION_KEYS.has(key)) continue;
    const jsonValue = toJsonValue(value);
    if (jsonValue !== undefined) result[key] = jsonValue;
  }
  return result;
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
    const result: JsonValue[] = [];
    for (const item of value) {
      const jsonValue = toJsonValue(item);
      if (jsonValue !== undefined) result.push(jsonValue);
    }
    return result;
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const jsonValue = toJsonValue(item);
      if (jsonValue !== undefined) result[key] = jsonValue;
    }
    return result;
  }
  return undefined;
}

function asJsonObject(value: unknown): Record<string, JsonValue> | undefined {
  const jsonValue = toJsonValue(value);
  return jsonValue && !Array.isArray(jsonValue) && typeof jsonValue === "object"
    ? jsonValue
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(asRecord(value) && Object.keys(value as object).length > 0);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readRequestId(options: LlmRequestOptions): string {
  if (typeof options.requestId === "string" && options.requestId) {
    return options.requestId;
  }
  return globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}`;
}
