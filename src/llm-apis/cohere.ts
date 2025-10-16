import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

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

  // 构建消息内容
  // 注意：Cohere 聊天 API 目前不支持多模态输入（图像），只处理文本
  const message = options.messages
    .filter((msg) => msg.type === "text" && msg.text)
    .map((msg) => msg.text)
    .join("\n");

  const body: any = {
    model: options.modelId,
    message,
    max_tokens: options.maxTokens || 4000,
    temperature: options.temperature ?? 0.5,
  };

  // Cohere 使用 preamble 作为系统提示
  if (options.systemPrompt) {
    body.preamble = options.systemPrompt;
  }

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
    });

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