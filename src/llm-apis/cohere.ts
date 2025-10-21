import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";
import {
  parseMessageContents,
  extractCommonParameters,
  buildBase64DataUrl,
} from "./request-builder";

/**
 * 调用 Cohere API
 */
export const callCohereApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = buildLlmApiUrl(profile.baseUrl, "cohere", "chat");

  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 使用共享函数解析消息内容
  const parsed = parseMessageContents(options.messages);

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  // 构建用户消息内容
  // 如果有图像，使用多模态格式（content 为数组）
  // 如果只有文本，使用简单格式（content 为字符串）
  let userContent: string | any[];

  if (parsed.imageParts.length > 0) {
    // 多模态：content 是一个数组，包含文本和图像
    userContent = [];

    // 添加文本部分
    if (parsed.textParts.length > 0) {
      const textContent = parsed.textParts.map((part) => part.text).join("\n");
      userContent.push({
        type: "text",
        text: textContent,
      });
    }

    // 添加图像部分
    for (const img of parsed.imageParts) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: buildBase64DataUrl(img.base64, img.mimeType),
        },
      });
    }
  } else {
    // 纯文本：content 是字符串
    userContent = parsed.textParts.map((part) => part.text).join("\n");
  }

  // 构建 messages 数组（V2 API 格式）
  const messages = [];

  // 添加系统提示
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }

  // 添加用户消息
  messages.push({ role: "user", content: userContent });

  const body: any = {
    model: options.modelId,
    messages: messages,
    max_tokens: commonParams.maxTokens || 4000,
    temperature: commonParams.temperature ?? 0.5,
  };

  // 如果启用流式响应
  if (options.stream && options.onStream) {
    body.stream = true;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
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

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    let fullContent = "";

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "cohere");
      if (text) {
        fullContent += text;
        options.onStream!(text);
      }
    }, undefined, options.signal);

    return {
      content: fullContent,
      isStream: true,
    };
  }

  // 非流式响应
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
  if (!data.text) {
    throw new Error(`Cohere API 响应格式异常: ${JSON.stringify(data)}`);
  }

  return {
    content: data.text,
    usage: data.meta?.tokens
      ? {
          promptTokens: data.meta.tokens.input_tokens,
          completionTokens: data.meta.tokens.output_tokens,
          totalTokens: data.meta.tokens.input_tokens + data.meta.tokens.output_tokens,
        }
      : undefined,
  };
};
