import type { LlmProfile } from "@/types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
  applyCustomParameters,
  cleanPayload,
} from "@/llm-apis/request-builder";
import { asyncJsonStringify } from "@/utils/serialization";
// import { createModuleLogger } from "@/utils/logger";
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

// const logger = createModuleLogger("openai-chat");

/**
 * 调用 OpenAI 兼容格式的 Chat API
 */
export const callOpenAiChatApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = openAiUrlHandler.buildUrl(profile.baseUrl, "chat/completions", profile);
  const headers = buildOpenAiHeaders(profile);

  const messages: any[] = [];

  // 直接转换所有消息（包括 system 角色）
  for (const msg of options.messages || []) {
    // 如果消息内容是字符串，直接使用
    if (typeof msg.content === "string") {
      const messageObj: any = {
        role: msg.role,
        content: msg.content,
      };
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
              format: audioPart.source.media_type === "audio/wav" ? "wav" : "mp3",
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
              url: buildBase64DataUrl(videoPart.source.data, videoPart.source.media_type),
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
      if (msg.prefix) {
        messageObj.prefix = true;
      }
      messages.push(messageObj);
    }
  }

  const commonParams = extractCommonParameters(options);

  const body: any = {
    model: options.modelId,
    messages,
    temperature: commonParams.temperature ?? 0.5,
  };

  if (options.maxCompletionTokens !== undefined) {
    body.max_completion_tokens = options.maxCompletionTokens;
  } else if (commonParams.maxTokens !== undefined) {
    body.max_tokens = commonParams.maxTokens;
  }

  if (commonParams.topP !== undefined) body.top_p = commonParams.topP;
  if (commonParams.frequencyPenalty !== undefined) body.frequency_penalty = commonParams.frequencyPenalty;
  if (commonParams.presencePenalty !== undefined) body.presence_penalty = commonParams.presencePenalty;
  if (commonParams.stop !== undefined) body.stop = commonParams.stop;
  if (commonParams.seed !== undefined) body.seed = commonParams.seed;

  if (options.n !== undefined) body.n = options.n;
  if (options.logprobs !== undefined) body.logprobs = options.logprobs;
  if (options.topLogprobs !== undefined) body.top_logprobs = options.topLogprobs;
  if (options.responseFormat !== undefined) body.response_format = options.responseFormat;
  if (options.tools !== undefined) body.tools = options.tools;
  if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  if (options.parallelToolCalls !== undefined) body.parallel_tool_calls = options.parallelToolCalls;
  if (options.user !== undefined) body.user = options.user;
  if (options.logitBias !== undefined) body.logit_bias = options.logitBias;
  if (options.store !== undefined) body.store = options.store;
  if (options.reasoningEffort !== undefined) body.reasoning_effort = options.reasoningEffort;
  if (options.metadata !== undefined) body.metadata = options.metadata;
  if (options.modalities !== undefined) body.modalities = options.modalities;
  if (options.prediction !== undefined) body.prediction = options.prediction;
  if (options.audio !== undefined) body.audio = options.audio;
  if (options.serviceTier !== undefined) body.service_tier = options.serviceTier;
  if (options.webSearchOptions !== undefined) body.web_search_options = options.webSearchOptions;
  if (options.streamOptions !== undefined) body.stream_options = options.streamOptions;

  const extendedOptions = options as any;
  if (extendedOptions.safetySettings) {
    body.safety_settings = extendedOptions.safetySettings;
  }

  applyCustomParameters(body, options);
  cleanPayload(body);

  if (options.stream && options.onStream) {
    body.stream = true;

    const stringifyStart = performance.now();
    const serializedBody = await asyncJsonStringify(body);
    const stringifyEnd = performance.now();
    console.log(`[OpenAI-Stream] 序列化总耗时: ${(stringifyEnd - stringifyStart).toFixed(2)}ms, 类型: ${typeof serializedBody === 'string' ? 'string' : 'Uint8Array'}`);

    const fetchStart = performance.now();
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: serializedBody,
      },
      options.timeout,
      options.signal
    );
    const fetchEnd = performance.now();
    console.log(`[OpenAI-Stream] fetch 调用耗时: ${(fetchEnd - fetchStart).toFixed(2)}ms`);

    await ensureResponseOk(response);

    if (!response.body) throw new Error("响应体为空");

    const reader = response.body.getReader();
    let fullContent = "";
    let fullReasoningContent = "";
    let usage: LlmResponse["usage"] | undefined;

    await parseSSEStream(
      reader,
      (data) => {
        const text = extractTextFromSSE(data, "openai");
        if (text) {
          fullContent += text;
          options.onStream!(text);
        }

        const reasoningText = extractReasoningFromSSE(data, "openai");
        if (reasoningText) {
          fullReasoningContent += reasoningText;
          if (options.onReasoningStream) options.onReasoningStream(reasoningText);
        }

        try {
          const json = JSON.parse(data);
          if (json.usage) {
            usage = {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens,
              promptTokensDetails: json.usage.prompt_tokens_details
                ? {
                  cachedTokens: json.usage.prompt_tokens_details.cached_tokens,
                  audioTokens: json.usage.prompt_tokens_details.audio_tokens,
                }
                : undefined,
              completionTokensDetails: json.usage.completion_tokens_details
                ? {
                  reasoningTokens: json.usage.completion_tokens_details.reasoning_tokens,
                  audioTokens: json.usage.completion_tokens_details.audio_tokens,
                  acceptedPredictionTokens: json.usage.completion_tokens_details.accepted_prediction_tokens,
                  rejectedPredictionTokens: json.usage.completion_tokens_details.rejected_prediction_tokens,
                }
                : undefined,
            };
          }
        } catch { /* ignore */ }
      },
      undefined,
      options.signal
    );

    return {
      content: fullContent,
      reasoningContent: fullReasoningContent || undefined,
      usage,
      isStream: true,
    };
  }

  const stringifyStart = performance.now();
  const serializedBody = await asyncJsonStringify(body);
  const stringifyEnd = performance.now();
  console.log(`[OpenAI] 序列化总耗时: ${(stringifyEnd - stringifyStart).toFixed(2)}ms, 类型: ${typeof serializedBody === 'string' ? 'string' : 'Uint8Array'}`);

  const fetchStart = performance.now();
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: serializedBody,
    },
    options.timeout,
    options.signal
  );
  const fetchEnd = performance.now();
  console.log(`[OpenAI] fetch 调用耗时: ${(fetchEnd - fetchStart).toFixed(2)}ms`);

  await ensureResponseOk(response);
  const data = await response.json();

  const choice = data.choices?.[0];
  if (!choice) throw new Error(`OpenAI API 响应格式异常: ${JSON.stringify(data)}`);

  const message = choice.message;
  const annotations = message?.annotations?.map((ann: any) => ({
    type: "url_citation" as const,
    urlCitation: {
      startIndex: ann.url_citation?.start_index,
      endIndex: ann.url_citation?.end_index,
      url: ann.url_citation?.url,
      title: ann.url_citation?.title,
    },
  }));

  const audio = message?.audio ? {
    id: message.audio.id,
    data: message.audio.data,
    transcript: message.audio.transcript,
    expiresAt: message.audio.expires_at,
  } : undefined;

  const usage = data.usage ? {
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    totalTokens: data.usage.total_tokens,
    promptTokensDetails: data.usage.prompt_tokens_details ? {
      cachedTokens: data.usage.prompt_tokens_details.cached_tokens,
      audioTokens: data.usage.prompt_tokens_details.audio_tokens,
    } : undefined,
    completionTokensDetails: data.usage.completion_tokens_details ? {
      reasoningTokens: data.usage.completion_tokens_details.reasoning_tokens,
      audioTokens: data.usage.completion_tokens_details.audio_tokens,
      acceptedPredictionTokens: data.usage.completion_tokens_details.accepted_prediction_tokens,
      rejectedPredictionTokens: data.usage.completion_tokens_details.rejected_prediction_tokens,
    } : undefined,
  } : undefined;

  if (message?.refusal) {
    return {
      content: "",
      refusal: message.refusal,
      finishReason: choice.finish_reason,
      systemFingerprint: data.system_fingerprint,
      serviceTier: data.service_tier,
      usage,
    };
  }

  return {
    content: message?.content || "",
    reasoningContent: message?.reasoning_content || message?.reasoning || message?.thinking || message?.thought || undefined,
    refusal: message?.refusal || null,
    finishReason: choice.finish_reason,
    toolCalls: message?.tool_calls,
    logprobs: choice.logprobs ? { content: choice.logprobs.content, refusal: choice.logprobs.refusal } : undefined,
    annotations,
    audio,
    systemFingerprint: data.system_fingerprint,
    serviceTier: data.service_tier,
    usage,
  };
};
