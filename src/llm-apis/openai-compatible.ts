import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE, extractReasoningFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
} from "./request-builder";

import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("openai-compatible");

// 定义所有已知的、非模型参数的顶层选项键
// 用于从 options 中分离出需要透传的自定义模型参数
const KNOWN_NON_MODEL_OPTIONS_KEYS = [
  "messages",
  "modelId",
  "stream",
  "onStream",
  "onReasoningStream",
  "signal",
  "maxRetries",
  "timeout",
  // LlmParameters 中定义的键也会被 options 继承，这里把它们都列出来
  "temperature", "maxTokens", "topP", "topK", "frequencyPenalty", "presencePenalty", "seed", "stop",
  "n", "logprobs", "topLogprobs", "maxCompletionTokens", "reasoningEffort", "logitBias", "store",
  "user", "serviceTier", "responseFormat", "tools", "toolChoice", "parallelToolCalls",
  "modalities", "audio", "prediction", "webSearchOptions", "streamOptions", "metadata",
  "thinking", "stopSequences", "claudeMetadata", "safetySettings", "contextManagement",
  "contextPostProcessing", "enabledParameters",
  // custom 字段是参数容器，不应被透传
  "custom",
];


/**
 * 调用 OpenAI 兼容格式的 API
 */
export const callOpenAiCompatibleApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = buildLlmApiUrl(profile.baseUrl, "openai", "chat/completions");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 使用第一个可用的 API Key
  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  // 应用自定义请求头
  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  const messages: any[] = [];

  // 直接转换所有消息（包括 system 角色）
  for (const msg of options.messages) {
    // 如果消息内容是字符串，直接使用
    if (typeof msg.content === "string") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
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

      messages.push({
        role: msg.role,
        content: contentArray,
      });
    }
  }

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  const body: any = {
    model: options.modelId,
    messages,
    temperature: commonParams.temperature ?? 0.5,
  };

  // max_tokens 和 max_completion_tokens（优先使用新参数）
  if (options.maxCompletionTokens !== undefined) {
    body.max_completion_tokens = options.maxCompletionTokens;
  } else if (commonParams.maxTokens !== undefined) {
    body.max_tokens = commonParams.maxTokens;
  } else {
    body.max_tokens = 4000;
  }

  // 添加通用参数
  if (commonParams.topP !== undefined) {
    body.top_p = commonParams.topP;
  }
  if (commonParams.frequencyPenalty !== undefined) {
    body.frequency_penalty = commonParams.frequencyPenalty;
  }
  if (commonParams.presencePenalty !== undefined) {
    body.presence_penalty = commonParams.presencePenalty;
  }
  if (commonParams.stop !== undefined) {
    body.stop = commonParams.stop;
  }
  if (commonParams.seed !== undefined) {
    body.seed = commonParams.seed;
  }

  // 添加 OpenAI 特有的参数
  if (options.n !== undefined) {
    body.n = options.n;
  }
  if (options.logprobs !== undefined) {
    body.logprobs = options.logprobs;
  }
  if (options.topLogprobs !== undefined) {
    body.top_logprobs = options.topLogprobs;
  }
  if (options.responseFormat !== undefined) {
    body.response_format = options.responseFormat;
  }
  if (options.tools !== undefined) {
    body.tools = options.tools;
  }
  if (options.toolChoice !== undefined) {
    body.tool_choice = options.toolChoice;
  }
  if (options.parallelToolCalls !== undefined) {
    body.parallel_tool_calls = options.parallelToolCalls;
  }
  if (options.user !== undefined) {
    body.user = options.user;
  }
  if (options.logitBias !== undefined) {
    body.logit_bias = options.logitBias;
  }
  if (options.store !== undefined) {
    body.store = options.store;
  }
  if (options.reasoningEffort !== undefined) {
    body.reasoning_effort = options.reasoningEffort;
  }
  if (options.metadata !== undefined) {
    body.metadata = options.metadata;
  }
  if (options.modalities !== undefined) {
    body.modalities = options.modalities;
  }
  if (options.prediction !== undefined) {
    body.prediction = options.prediction;
  }
  if (options.audio !== undefined) {
    body.audio = options.audio;
  }
  if (options.serviceTier !== undefined) {
    body.service_tier = options.serviceTier;
  }
  if (options.webSearchOptions !== undefined) {
    body.web_search_options = options.webSearchOptions;
  }
  if (options.streamOptions !== undefined) {
    body.stream_options = options.streamOptions;
  }

  // 透传 Gemini 安全设置 (如果存在)
  // 许多聚合网关（如 One API）支持通过 safety_settings 字段透传 Gemini 安全配置
  const extendedOptions = options as any;
  if (extendedOptions.safetySettings) {
    body.safety_settings = extendedOptions.safetySettings;
  }

  // 警告：如果 custom 字段仍然存在，说明上游逻辑可能存在问题
  if (extendedOptions.custom && typeof extendedOptions.custom === "object" && Object.keys(extendedOptions.custom).length > 0) {
    logger.warn(
      "检测到 'custom' 参数容器，但它未被上游逻辑解包。这可能是一个错误。",
      { customParams: extendedOptions.custom }
    );
  }

  // 动态透传所有未知的自定义参数
  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      // @ts-expect-error - key is a string
      if (!KNOWN_NON_MODEL_OPTIONS_KEYS.includes(key) && options[key] !== undefined) {
        // 直接使用原始 key，不强制转换 snake_case
        // 既然是自定义参数，用户在 JSON 中输入什么 key，就应该原样发送什么 key
        // 这样可以兼容那些可能使用驼峰命名的非标准参数
        const rawKey = key;
        // @ts-expect-error - key is a string
        const value = options[key];

        // 检查是否需要合并对象
        if (
          body[rawKey] &&
          typeof body[rawKey] === "object" &&
          !Array.isArray(body[rawKey]) &&
          body[rawKey] !== null &&
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          value !== null
        ) {
          // 执行浅合并，对于 LLM 参数的单层嵌套（如 metadata）足够了
          body[rawKey] = { ...body[rawKey], ...value };
        } else {
          body[rawKey] = value;
        }
      }
    }
  }

  // 如果启用流式响应
  if (options.stream && options.onStream) {
    body.stream = true;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      options.maxRetries,
      options.timeout,
      options.signal
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
    }

    // 处理流式响应
    if (!response.body) {
      throw new Error("响应体为空");
    }

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

        // 提取推理内容（DeepSeek reasoning）
        const reasoningText = extractReasoningFromSSE(data, "openai");
        if (reasoningText) {
          fullReasoningContent += reasoningText;
          // 实时回调推理内容
          if (options.onReasoningStream) {
            options.onReasoningStream(reasoningText);
          }
        }

        // 尝试从流数据中提取 usage 信息（OpenAI 在流结束时会发送 usage）
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
                  acceptedPredictionTokens:
                    json.usage.completion_tokens_details.accepted_prediction_tokens,
                  rejectedPredictionTokens:
                    json.usage.completion_tokens_details.rejected_prediction_tokens,
                }
                : undefined,
            };
          }
        } catch {
          // 忽略非 JSON 数据
        }
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

  // 非流式响应
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    options.maxRetries,
    options.timeout
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // 验证响应格式
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error(`OpenAI API 响应格式异常: ${JSON.stringify(data)}`);
  }

  const message = choice.message;

  // 提取注释信息（如网络搜索的URL引用）
  const annotations = message?.annotations?.map((ann: any) => ({
    type: "url_citation" as const,
    urlCitation: {
      startIndex: ann.url_citation?.start_index,
      endIndex: ann.url_citation?.end_index,
      url: ann.url_citation?.url,
      title: ann.url_citation?.title,
    },
  }));

  // 提取音频信息
  const audio = message?.audio
    ? {
      id: message.audio.id,
      data: message.audio.data,
      transcript: message.audio.transcript,
      expiresAt: message.audio.expires_at,
    }
    : undefined;

  // 处理 logprobs（包括 refusal）
  const logprobs = choice.logprobs
    ? {
      content: choice.logprobs.content,
      refusal: choice.logprobs.refusal,
    }
    : undefined;

  // 构建 usage 信息
  const usage = data.usage
    ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
      promptTokensDetails: data.usage.prompt_tokens_details
        ? {
          cachedTokens: data.usage.prompt_tokens_details.cached_tokens,
          audioTokens: data.usage.prompt_tokens_details.audio_tokens,
        }
        : undefined,
      completionTokensDetails: data.usage.completion_tokens_details
        ? {
          reasoningTokens: data.usage.completion_tokens_details.reasoning_tokens,
          audioTokens: data.usage.completion_tokens_details.audio_tokens,
          acceptedPredictionTokens:
            data.usage.completion_tokens_details.accepted_prediction_tokens,
          rejectedPredictionTokens:
            data.usage.completion_tokens_details.rejected_prediction_tokens,
        }
        : undefined,
    }
    : undefined;

  // 如果有拒绝消息，优先返回拒绝消息
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
    reasoningContent: message?.reasoning_content || undefined,
    refusal: message?.refusal || null,
    finishReason: choice.finish_reason,
    toolCalls: message?.tool_calls,
    logprobs,
    annotations,
    audio,
    systemFingerprint: data.system_fingerprint,
    serviceTier: data.service_tier,
    usage,
  };
};
