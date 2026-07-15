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

import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import {
  buildOpenAiCompatibleBody,
  executeProviderWireRequest,
  openAiCompatibleAdapter,
  type JsonValue,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
  type MediaAssetRef,
  type WireJsonValue,
  type WireRequest,
} from "@aiohub/llm-core";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
  applyCustomParameters,
  cleanPayload,
  isOpenAIModel,
} from "@/llm-apis/request-builder";
// import { createModuleLogger } from "@/utils/logger";
import { desktopLlmTransport } from "@/llm-apis/transports/desktop";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";
import {
  extractDeepSeekReasoningArtifacts,
  getDeepSeekReplayReasoningContent,
  isDeepSeekModel,
} from "../deepseek/reasoning-artifacts";

// const logger = createModuleLogger("openai-chat");

function shouldSendOpenAiReasoningEffort(
  profile: LlmProfile,
  modelId: string
): boolean {
  const id = modelId.toLowerCase();
  return (
    (profile.type === "openai" || profile.type === "openai-compatible") &&
    (isOpenAIModel(modelId) ||
      id.includes("doubao") ||
      id.includes("seed") ||
      id.includes("glm") ||
      id.includes("deepseek"))
  );
}

/**
 * 调用 OpenAI 兼容格式的 Chat API
 */
export const callOpenAiChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = openAiUrlHandler.buildUrl(
    profile.baseUrl,
    "chat/completions",
    profile
  );
  const headers = buildOpenAiHeaders(profile, options.requestId);

  const messages: any[] = [];

  // 直接转换所有消息（包括 system 角色）
  for (const msg of options.messages || []) {
    // 如果消息内容是字符串，直接使用
    if (typeof msg.content === "string") {
      const messageObj: any = {
        role: msg.role,
        content: msg.content,
      };
      // 支持回传推理内容（DeepSeek 等模型多轮对话需要）
      // ⚠️ 只有 DeepSeek 模型才支持 reasoning_content 回传，非 DS 模型传此字段可能会报错
      const deepSeekReplayReasoning = getDeepSeekReplayReasoningContent(msg);
      if (isDeepSeekModel(options.modelId) && deepSeekReplayReasoning) {
        messageObj.reasoning_content = deepSeekReplayReasoning;
      }
      // 支持 DeepSeek prefix 模式
      if (msg.prefix) {
        messageObj.prefix = true;
      }
      messages.push(messageObj);
    } else {
      // 如果是复杂内容，需要转换格式
      const parsed = parseMessageContents(msg.content);
      const contentArray: any[] = [];

      for (const textPart of parsed.textParts) {
        contentArray.push({ type: "text", text: textPart.text });
      }

      for (const imagePart of parsed.imageParts) {
        contentArray.push({
          type: "image_url",
          image_url: {
            url: buildBase64DataUrl(imagePart.base64, imagePart.mimeType),
          },
        });
      }

      // 分别处理不同类型的媒体
      // 处理文档
      for (const docPart of parsed.documentParts) {
        if (docPart.source.type === "base64") {
          const mediaType = docPart.source.media_type;
          const isPdf = mediaType === "application/pdf";

          if (mediaType.startsWith("image/")) {
            contentArray.push({
              type: "image_url",
              image_url: {
                url: buildBase64DataUrl(docPart.source.data, mediaType),
              },
            });
          } else if (isPdf) {
            contentArray.push({
              type: "file",
              file: {
                filename: "document.pdf",
                file_data: buildBase64DataUrl(docPart.source.data, mediaType),
              },
            });
          } else {
            contentArray.push({
              type: "document",
              source: docPart.source,
            });
          }
        }
      }

      // 处理音频
      for (const audioPart of parsed.audioParts) {
        if (audioPart.source.type === "base64") {
          contentArray.push({
            type: "input_audio",
            input_audio: {
              data: audioPart.source.data as any,
              format:
                audioPart.source.media_type === "audio/wav" ? "wav" : "mp3",
            },
          });
        }
      }

      // 处理视频
      for (const videoPart of parsed.videoParts) {
        if (videoPart.source.type === "base64") {
          const part: any = {
            type: "image_url",
            image_url: {
              url: buildBase64DataUrl(
                videoPart.source.data,
                videoPart.source.media_type
              ),
            },
          };
          if (videoPart.videoMetadata) {
            part.video_metadata = videoPart.videoMetadata;
          }
          contentArray.push(part);
        }
      }

      const messageObj: any = {
        role: msg.role,
        content: contentArray,
      };
      // 支持回传推理内容
      const deepSeekReplayReasoning = getDeepSeekReplayReasoningContent(msg);
      if (isDeepSeekModel(options.modelId) && deepSeekReplayReasoning) {
        messageObj.reasoning_content = deepSeekReplayReasoning;
      }
      if (msg.prefix) {
        messageObj.prefix = true;
      }
      messages.push(messageObj);
    }
  }

  const commonParams = extractCommonParameters(options);
  const extendedOptions = options as any;
  const extensions: Record<string, JsonValue> = {};
  if (options.requestId) extensions.requestId = options.requestId;
  if (extendedOptions.safetySettings) {
    extensions.safety_settings = extendedOptions.safetySettings;
  }

  const isDeepSeekThinking =
    options.modelId.toLowerCase().includes("deepseek") &&
    options.thinkingEnabled !== undefined;
  if (isDeepSeekThinking) {
    extensions.extra_body = {
      thinking: { type: options.thinkingEnabled ? "enabled" : "disabled" },
      ...(options.extraBody || {}),
    };
  } else if (options.extraBody) {
    extensions.extra_body = options.extraBody;
  }

  const coreRequest: CoreLlmRequest = {
    model: options.modelId,
    messages: [],
    stream: !!(options.stream && options.onStream),
    maxTokens: commonParams.maxTokens,
    temperature: commonParams.temperature,
    topP: commonParams.topP,
    frequencyPenalty: commonParams.frequencyPenalty,
    presencePenalty: commonParams.presencePenalty,
    repetitionPenalty: commonParams.repetitionPenalty,
    stop: commonParams.stop,
    seed: commonParams.seed,
    n: options.n,
    logprobs: options.logprobs,
    topLogprobs: options.topLogprobs,
    reasoningEffort: shouldSendOpenAiReasoningEffort(profile, options.modelId)
      ? options.reasoningEffort
      : undefined,
    responseFormat: options.responseFormat as JsonValue | undefined,
    tools: options.tools as CoreLlmRequest["tools"],
    toolChoice: options.toolChoice as CoreLlmRequest["toolChoice"],
    parallelToolCalls: options.parallelToolCalls,
    user: options.user,
    logitBias: options.logitBias,
    store: options.store,
    metadata: options.metadata,
    modalities: options.modalities,
    prediction: options.prediction as JsonValue | undefined,
    audio: options.audio as JsonValue | undefined,
    serviceTier: options.serviceTier,
    webSearchOptions: (options.webSearchOptions ??
      (extendedOptions.webSearchEnabled
        ? { search_context_size: "medium" }
        : undefined)) as JsonValue | undefined,
    streamOptions: options.streamOptions as JsonValue | undefined,
    thinkingEnabled: isDeepSeekThinking ? undefined : options.thinkingEnabled,
    thinkingBudget: options.thinkingBudget,
    extensions,
  };
  const body = buildOpenAiCompatibleBody(
    coreRequest,
    messages as WireJsonValue[]
  );

  applyCustomParameters(body, options);
  cleanPayload(body);

  const wireRequest: WireRequest = {
    method: "POST",
    url,
    headers,
    body: { kind: "json", value: body },
    streaming: coreRequest.stream === true,
  };
  const result = await executeProviderWireRequest({
    adapter: openAiCompatibleAdapter,
    request: coreRequest,
    wireRequest,
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
    onEvent: (event: LlmStreamEvent) => {
      if (event.type === "text-delta") options.onStream?.(event.delta);
      if (event.type === "reasoning-delta") {
        options.onReasoningStream?.(event.delta);
      }
    },
  });

  return mapCoreOpenAiResponse(result, options.modelId, wireRequest.streaming);
};

function mapCoreOpenAiResponse(
  response: CoreLlmResponse,
  modelId: string,
  isStream: boolean
): LlmResponse {
  const metadata = response.metadata as Record<string, any> | undefined;
  const images = response.images?.map(mapCoreImage);
  const audio = metadata?.audio;

  return {
    content: response.content,
    reasoningContent: response.reasoningContent,
    reasoningArtifacts: isDeepSeekModel(modelId)
      ? extractDeepSeekReasoningArtifacts(
          response.reasoningContent ?? "",
          !!response.toolCalls?.length
        )
      : undefined,
    refusal: response.refusal,
    finishReason: response.finishReason as LlmResponse["finishReason"],
    toolCalls: response.toolCalls,
    images,
    revisedPrompt: images?.[0]?.revisedPrompt,
    logprobs: metadata?.logprobs as LlmResponse["logprobs"],
    annotations: response.annotations?.map((annotation: any) => ({
      type: annotation.type ?? "url_citation",
      urlCitation: annotation.url_citation
        ? {
            startIndex: annotation.url_citation.start_index,
            endIndex: annotation.url_citation.end_index,
            url: annotation.url_citation.url,
            title: annotation.url_citation.title,
          }
        : annotation.urlCitation,
    })),
    audio: audio
      ? {
          id: audio.id,
          data: audio.data,
          transcript: audio.transcript,
          expiresAt: audio.expires_at ?? audio.expiresAt,
        }
      : undefined,
    systemFingerprint: metadata?.systemFingerprint,
    serviceTier: metadata?.serviceTier,
    usage: response.usage,
    ...(isStream ? { isStream: true } : {}),
  };
}

function mapCoreImage(image: MediaAssetRef) {
  if (image.kind === "remote-url") {
    return { url: image.url, revisedPrompt: image.revisedPrompt };
  }
  if (image.kind === "inline-base64") {
    return { b64_json: image.data, revisedPrompt: image.revisedPrompt };
  }
  return { url: image.id, revisedPrompt: image.revisedPrompt };
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
