import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

/**
 * 调用 Anthropic Claude API
 */
export const callClaudeApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = buildLlmApiUrl(profile.baseUrl, "claude", "messages");

  // 构建消息内容
  const content: any[] = [];
  for (const msg of options.messages) {
    if (msg.type === "text" && msg.text) {
      content.push({
        type: "text",
        text: msg.text,
      });
    } else if (msg.type === "image" && msg.imageBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: msg.imageBase64,
        },
      });
    }
  }

  const body: any = {
    model: options.modelId,
    max_tokens: options.maxTokens || 4000,
    temperature: options.temperature ?? 0.5,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  };

  // Claude 使用 system 参数
  if (options.systemPrompt) {
    body.system = options.systemPrompt;
  }

  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 如果启用流式响应
  if (options.stream && options.onStream) {
    body.stream = true;
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
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

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    let fullContent = "";

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "claude");
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
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
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
  if (!data.content?.[0]?.text) {
    throw new Error(`Claude API 响应格式异常: ${JSON.stringify(data)}`);
  }

  return {
    content: data.content[0].text,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
  };
};