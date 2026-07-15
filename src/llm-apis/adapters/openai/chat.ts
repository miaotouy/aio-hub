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
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream } from "@utils/sse-parser";
import {
  OpenAiCompatibleStreamDecoder,
  buildOpenAiCompatibleBody,
  parseOpenAiCompatibleResponseValue,
  type JsonValue,
  type LlmRequest as CoreLlmRequest,
  type LlmResponse as CoreLlmResponse,
  type LlmStreamEvent,
  type WireJsonValue,
} from "@aiohub/llm-core";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
  applyCustomParameters,
  cleanPayload,
  isOpenAIModel,
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
// import { createModuleLogger } from "@/utils/logger";
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

function collectImagesFromUnknown(value: any): Array<{
  url?: string;
  b64_json?: string;
  revisedPrompt?: string;
}> {
  const images: Array<{
    url?: string;
    b64_json?: string;
    revisedPrompt?: string;
  }> = [];

  const pushImage = (rawUrl?: string, b64?: string, revisedPrompt?: string) => {
    if (b64) {
      images.push({
        b64_json: b64.startsWith("data:") ? b64.split(",")[1] : b64,
        revisedPrompt,
      });
      return;
    }
    if (rawUrl) {
      images.push({ url: rawUrl, revisedPrompt });
    }
  };

  const visit = (item: any) => {
    if (!item) return;

    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        visit(parsed);
      } catch {
        // Plain text content can still contain markdown/data-url image links.
      }

      for (const match of trimmed.matchAll(
        /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/g
      )) {
        pushImage(undefined, match[0]);
      }

      for (const match of trimmed.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
        pushImage(match[1]);
      }

      for (const match of trimmed.matchAll(
        /https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?/gi
      )) {
        pushImage(match[0]);
      }
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }

    if (typeof item !== "object") return;

    if (
      typeof item.function?.name === "string" &&
      item.function.name.toLowerCase().includes("image") &&
      typeof item.function.arguments === "string"
    ) {
      try {
        const parsedArgs = JSON.parse(item.function.arguments);
        if (typeof parsedArgs.result === "string") {
          pushImage(
            undefined,
            parsedArgs.result,
            parsedArgs.revised_prompt || parsedArgs.revisedPrompt
          );
        }
        visit(parsedArgs);
      } catch {
        visit(item.function.arguments);
      }
    }

    const imageUrl =
      typeof item.image_url === "string" ? item.image_url : item.image_url?.url;
    const url =
      imageUrl ||
      item.url ||
      item.imageUrl ||
      item.output_url ||
      item.outputUrl;
    const b64 =
      item.b64_json ||
      item.b64 ||
      item.base64 ||
      item.image_base64 ||
      item.imageBase64 ||
      item.result;

    if (
      item.type?.includes?.("image") ||
      imageUrl ||
      item.b64_json ||
      item.image_base64 ||
      item.imageBase64
    ) {
      pushImage(url, b64, item.revised_prompt || item.revisedPrompt);
    }

    for (const key of [
      "content",
      "data",
      "images",
      "image",
      "output",
      "result",
      "results",
    ]) {
      visit(item[key]);
    }
  };

  visit(value);

  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.b64_json || image.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  if (options.stream && options.onStream) {
    body.stream = true;

    const stringifyStart = performance.now();
    const serializedBody = await asyncJsonStringify(body);
    const stringifyEnd = performance.now();
    console.log(
      `[OpenAI-Stream] 序列化总耗时: ${(stringifyEnd - stringifyStart).toFixed(2)}ms, 类型: ${typeof serializedBody === "string" ? "string" : "Uint8Array"}`
    );

    const fetchStart = performance.now();
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: serializedBody as any,
        hasLocalFile: options.hasLocalFile,
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
        isStreaming: true,
      },
      options.timeout,
      options.signal
    );
    const fetchEnd = performance.now();
    console.log(
      `[OpenAI-Stream] fetch 调用耗时: ${(fetchEnd - fetchStart).toFixed(2)}ms`
    );

    await ensureResponseOk(response);

    if (!response.body) throw new Error("响应体为空");

    const reader = response.body.getReader();
    const streamDecoder = new OpenAiCompatibleStreamDecoder();
    const encoder = new TextEncoder();
    let completedResponse: CoreLlmResponse | undefined;

    const handleEvents = (events: LlmStreamEvent[]) => {
      for (const event of events) {
        if (event.type === "text-delta") {
          options.onStream!(event.delta);
        } else if (event.type === "reasoning-delta") {
          options.onReasoningStream?.(event.delta);
        } else if (event.type === "completed") {
          completedResponse = event.response;
        }
      }
    };

    await parseSSEStream(
      reader,
      (data) => {
        handleEvents(streamDecoder.push(encoder.encode(`data: ${data}\n`)));
      },
      undefined,
      options.signal
    );
    handleEvents(streamDecoder.finish());

    const result = completedResponse ?? { content: "" };

    return {
      content: result.content,
      reasoningContent: result.reasoningContent,
      reasoningArtifacts: isDeepSeekModel(options.modelId)
        ? extractDeepSeekReasoningArtifacts(
            result.reasoningContent ?? "",
            !!result.toolCalls?.length
          )
        : undefined,
      usage: result.usage,
      finishReason: result.finishReason as LlmResponse["finishReason"],
      toolCalls: result.toolCalls,
      isStream: true,
    };
  }

  const stringifyStart = performance.now();
  const serializedBody = await asyncJsonStringify(body);
  const stringifyEnd = performance.now();
  console.log(
    `[OpenAI] 序列化总耗时: ${(stringifyEnd - stringifyStart).toFixed(2)}ms, 类型: ${typeof serializedBody === "string" ? "string" : "Uint8Array"}`
  );

  const fetchStart = performance.now();
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: serializedBody as any,
      hasLocalFile: options.hasLocalFile,
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
    },
    options.timeout,
    options.signal
  );
  const fetchEnd = performance.now();
  console.log(
    `[OpenAI] fetch 调用耗时: ${(fetchEnd - fetchStart).toFixed(2)}ms`
  );

  await ensureResponseOk(response);
  const data = await response.json();
  const sharedResponse = parseOpenAiCompatibleResponseValue(data);
  const choice = data.choices[0];

  const message = choice.message;
  const images = [
    ...collectImagesFromUnknown(data.images),
    ...collectImagesFromUnknown(data.data),
    ...collectImagesFromUnknown(data.output),
    ...collectImagesFromUnknown(message?.images),
    ...collectImagesFromUnknown(message?.content),
    ...collectImagesFromUnknown(message?.tool_calls),
  ];
  const annotations = message?.annotations?.map((ann: any) => ({
    type: "url_citation" as const,
    urlCitation: {
      startIndex: ann.url_citation?.start_index,
      endIndex: ann.url_citation?.end_index,
      url: ann.url_citation?.url,
      title: ann.url_citation?.title,
    },
  }));

  const audio = message?.audio
    ? {
        id: message.audio.id,
        data: message.audio.data,
        transcript: message.audio.transcript,
        expiresAt: message.audio.expires_at,
      }
    : undefined;

  if (sharedResponse.refusal) {
    return {
      content: "",
      refusal: sharedResponse.refusal,
      finishReason: sharedResponse.finishReason as LlmResponse["finishReason"],
      systemFingerprint: data.system_fingerprint,
      serviceTier: data.service_tier,
      usage: sharedResponse.usage,
    };
  }

  const responseReasoningContent = sharedResponse.reasoningContent;

  return {
    content: sharedResponse.content,
    reasoningContent: responseReasoningContent,
    reasoningArtifacts: isDeepSeekModel(options.modelId)
      ? extractDeepSeekReasoningArtifacts(
          responseReasoningContent,
          !!message?.tool_calls?.length
        )
      : undefined,
    refusal: sharedResponse.refusal,
    finishReason: sharedResponse.finishReason as LlmResponse["finishReason"],
    toolCalls: sharedResponse.toolCalls,
    images: images.length > 0 ? images : undefined,
    revisedPrompt: images[0]?.revisedPrompt,
    logprobs: choice.logprobs
      ? { content: choice.logprobs.content, refusal: choice.logprobs.refusal }
      : undefined,
    annotations,
    audio,
    systemFingerprint: data.system_fingerprint,
    serviceTier: data.service_tier,
    usage: sharedResponse.usage,
  };
};
