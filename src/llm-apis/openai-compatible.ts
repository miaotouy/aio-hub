import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

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

  // 构建消息内容
  const messageContent: any[] = [];
  for (const msg of options.messages) {
    if (msg.type === "text" && msg.text) {
      messageContent.push({ type: "text", text: msg.text });
    } else if (msg.type === "image" && msg.imageBase64) {
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${msg.imageBase64}`,
        },
      });
    }
  }

  const messages: any[] = [];

  // 添加系统提示（如果有）
  if (options.systemPrompt) {
    messages.push({
      role: "system",
      content: options.systemPrompt,
    });
  }

  // 添加用户消息
  messages.push({
    role: "user",
    content: messageContent,
  });

  const body: any = {
    model: options.modelId,
    messages,
    max_tokens: options.maxTokens || 4000,
    temperature: options.temperature ?? 0.5,
  };

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
      options.timeout
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

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "openai");
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
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`OpenAI API 响应格式异常: ${JSON.stringify(data)}`);
  }

  return {
    content: data.choices[0].message.content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
};