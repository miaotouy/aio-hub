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

import {
  executeProviderRequest,
  OPENAI_RESPONSES_ID_METADATA_KEY,
  OPENAI_RESPONSES_OUTPUT_METADATA_KEY,
  OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY,
  openAiResponsesAdapter,
  type JsonValue,
  type LlmMessage as CoreLlmMessage,
  type LlmMessageContent as CoreLlmMessageContent,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
  type MediaAssetRef,
  type ProviderProfile,
} from "@aiohub/llm-core";
import type { LlmMessage, LlmMessageContent } from "@/llm-apis/common";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import type { LlmProfile } from "@/types/llm-profiles";
import {
  applyCustomParameters,
  buildBase64DataUrl,
  cleanPayload,
  isOpenAIModel,
  parseMessageContents,
} from "@/llm-apis/request-builder";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import {
  extractOpenAiResponsesReasoningArtifacts,
  getOpenAiResponsesReplayItems,
  mergeReasoningEncryptedContentInclude,
} from "./reasoning-artifacts";

export const callOpenAiResponsesApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const request = buildCoreRequest(options);
  const response = await executeProviderRequest({
    adapter: openAiResponsesAdapter,
    profile: buildProviderProfile(profile),
    request,
    transport: desktopLlmTransport,
    transportOptions: {
      requestId: options.requestId ?? createRequestId(),
      signal: options.signal,
      timeoutMs: options.timeout,
      network: {
        strategy: options.forceProxy ? "proxy" : options.networkStrategy,
        relaxInvalidCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
      },
    },
    onEvent: (event: LlmStreamEvent) => mapStreamEvent(event, options),
  });

  return mapCoreResponse(response, request.stream === true);
};

function buildProviderProfile(profile: LlmProfile): ProviderProfile {
  return {
    provider: profile.type,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKeys[0],
    headers: resolveCustomHeaders(profile.customHeaders),
    endpoints: profile.customEndpoints,
  };
}

function buildCoreRequest(options: LlmRequestOptions): CoreLlmRequest {
  const mediaOptions = options as LlmRequestOptions & {
    prompt?: string;
    inputAttachments?: Array<{ type: string; b64?: string; url?: string }>;
    quality?: JsonValue;
    size?: JsonValue;
    style?: JsonValue;
    background?: JsonValue;
    moderation?: JsonValue;
    outputFormat?: JsonValue;
    outputCompression?: JsonValue;
  };
  const messages = (options.messages ?? []).map(toCoreMessage);

  if (mediaOptions.prompt && messages.length === 0) {
    const content: CoreLlmMessageContent[] = [
      { type: "text", text: mediaOptions.prompt },
    ];
    for (const attachment of mediaOptions.inputAttachments ?? []) {
      if (attachment.type !== "image") continue;
      const url = attachment.b64 ?? attachment.url;
      if (url) content.push({ type: "image", source: url });
    }
    messages.push({
      role: "user",
      content: content.length === 1 ? mediaOptions.prompt : content,
    });
  }

  const extensions: Record<string, JsonValue> = {};
  applyCustomParameters(extensions, options);
  cleanPayload(extensions);

  if (
    !options.tools &&
    (options.modelId.includes("image") || mediaOptions.prompt)
  ) {
    extensions.tools = [buildImageGenerationTool(options, mediaOptions)];
  }

  const compatibleReasoningModel =
    isOpenAIModel(options.modelId) ||
    ["doubao", "seed", "glm", "deepseek"].some((name) =>
      options.modelId.toLowerCase().includes(name)
    );
  const store = options.responsesStore ?? options.store;
  const include =
    store === false
      ? mergeReasoningEncryptedContentInclude(options.include)
      : options.include;

  return {
    model: options.modelId,
    messages,
    stream: Boolean(options.stream && options.onStream),
    maxTokens: options.maxTokens,
    maxCompletionTokens: options.maxCompletionTokens,
    temperature: options.temperature,
    topP: options.topP,
    stop: options.stop,
    tools: options.tools?.map((tool) => ({
      type: "function",
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
    reasoningEffort: compatibleReasoningModel
      ? options.reasoningEffort
      : undefined,
    thinkingEnabled: options.thinkingEnabled,
    thinkingBudget: options.thinkingBudget,
    modalities: options.modalities,
    audio: toJsonValue(options.audio),
    store,
    include,
    metadata: toJsonObject(options.metadata),
    extraBody: toJsonObject(options.extraBody),
    extensions,
  };
}

function toCoreMessage(message: LlmMessage): CoreLlmMessage {
  const replayItems =
    message.role === "assistant" ? getOpenAiResponsesReplayItems(message) : [];
  return {
    role: message.role,
    content:
      typeof message.content === "string"
        ? message.content
        : toCoreContents(message.content),
    reasoningContent: message.reasoningContent,
    prefix: message.prefix,
    ...(replayItems.length
      ? {
          metadata: {
            [OPENAI_RESPONSES_REPLAY_ITEMS_METADATA_KEY]:
              toJsonValue(replayItems) ?? [],
          },
        }
      : {}),
  };
}

function toCoreContents(
  contents: LlmMessageContent[]
): CoreLlmMessageContent[] {
  const parsed = parseMessageContents(contents);
  return [
    ...parsed.textParts.map((part) => ({
      type: "text" as const,
      text: part.text,
    })),
    ...parsed.imageParts.map((part) => ({
      type: "image" as const,
      source: buildBase64DataUrl(toBase64(part.base64), part.mimeType),
    })),
    ...parsed.documentParts.map((part) => ({
      type: "document" as const,
      source: toJsonValue(part.source) ?? {},
    })),
    ...parsed.audioParts.map((part) => ({
      type: "audio" as const,
      source: toJsonValue(part.source) ?? {},
    })),
    ...parsed.videoParts.map((part) => ({
      type: "video" as const,
      source: toJsonValue(part.source) ?? {},
      metadata: toJsonValue(part.videoMetadata),
    })),
    ...parsed.toolUseParts.map((part) => ({
      type: "tool_use" as const,
      id: part.id,
      name: part.name,
      input: toJsonValue(part.input) ?? {},
    })),
    ...parsed.toolResultParts.map((part) => ({
      type: "tool_result" as const,
      toolUseId: part.id,
      content:
        typeof part.content === "string"
          ? part.content
          : (toJsonValue(part.content) ?? []),
      isError: part.isError,
    })),
  ];
}

function buildImageGenerationTool(
  options: LlmRequestOptions,
  mediaOptions: {
    quality?: unknown;
    size?: unknown;
    style?: unknown;
    background?: unknown;
    moderation?: unknown;
    outputFormat?: unknown;
    outputCompression?: unknown;
  }
): JsonValue {
  const tool: Record<string, JsonValue> = { type: "image_generation" };
  assignJson(tool, "quality", mediaOptions.quality);
  assignJson(tool, "size", mediaOptions.size);
  assignJson(tool, "style", mediaOptions.style);
  assignJson(tool, "background", mediaOptions.background);
  assignJson(tool, "moderation", mediaOptions.moderation);
  const responseFormat =
    typeof options.responseFormat === "string"
      ? options.responseFormat
      : mediaOptions.outputFormat;
  assignJson(tool, "output_format", responseFormat);
  assignJson(tool, "output_compression", mediaOptions.outputCompression);
  assignJson(tool, "partial_images", options.partialImages);
  assignJson(tool, "input_fidelity", options.inputFidelity);
  return tool;
}

function mapStreamEvent(
  event: LlmStreamEvent,
  options: LlmRequestOptions
): void {
  if (event.type === "text-delta") options.onStream?.(event.delta);
  if (event.type === "reasoning-delta") {
    options.onReasoningStream?.(event.delta);
  }
  if (event.type === "partial-image") {
    const data = toPartialImageDataUrl(event.asset);
    if (!data) return;
    if (options.onPartialImage) {
      options.onPartialImage(data, event.index);
    } else {
      options.onStream?.(`__PARTIAL_IMAGE__:${data}`);
    }
  }
}

function mapCoreResponse(
  response: CoreLlmResponse,
  isStream: boolean
): LlmResponse {
  const metadata = response.metadata as Record<string, JsonValue> | undefined;
  const output = metadata?.[OPENAI_RESPONSES_OUTPUT_METADATA_KEY];
  const responseId = metadata?.[OPENAI_RESPONSES_ID_METADATA_KEY];
  const images = response.images?.map(mapImage);
  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    reasoningArtifacts: extractOpenAiResponsesReasoningArtifacts(
      output,
      typeof responseId === "string" ? responseId : undefined
    ),
    refusal: response.refusal,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    toolCalls: response.toolCalls,
    annotations: response.annotations?.map(mapAnnotation),
    images,
    revisedPrompt: images?.[0]?.revisedPrompt,
    usage: response.usage,
    ...(isStream ? { isStream: true } : {}),
  };
}

function mapAnnotation(annotation: Record<string, JsonValue>) {
  if (annotation.type === "file_citation") {
    return {
      type: "file_citation" as const,
      fileCitation: {
        startIndex: readNumber(annotation.start_index) ?? 0,
        endIndex: readNumber(annotation.end_index) ?? 0,
        fileId: readString(annotation.file_id) ?? "",
        quote: readString(annotation.quote),
      },
    };
  }
  return {
    type: "url_citation" as const,
    urlCitation: {
      startIndex: readNumber(annotation.start_index) ?? 0,
      endIndex: readNumber(annotation.end_index) ?? 0,
      url: readString(annotation.url) ?? "",
      title: readString(annotation.title) ?? "",
    },
  };
}

function mapImage(image: MediaAssetRef) {
  if (image.kind === "inline-base64") {
    return { b64_json: image.data, revisedPrompt: image.revisedPrompt };
  }
  return {
    url: image.kind === "remote-url" ? image.url : image.id,
    revisedPrompt: image.revisedPrompt,
  };
}

function toPartialImageDataUrl(asset: MediaAssetRef): string | undefined {
  if (asset.kind === "inline-base64") {
    return `data:${asset.contentType};base64,${asset.data}`;
  }
  return asset.kind === "remote-url" ? asset.url : undefined;
}

function toBase64(value: string | ArrayBuffer | Uint8Array): string {
  if (typeof value === "string") return value;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toJsonObject(value: unknown): Record<string, JsonValue> | undefined {
  const result = toJsonValue(value);
  return result && typeof result === "object" && !Array.isArray(result)
    ? result
    : undefined;
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

function assignJson(
  target: Record<string, JsonValue>,
  key: string,
  value: unknown
): void {
  const json = toJsonValue(value);
  if (json !== undefined) target[key] = json;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
