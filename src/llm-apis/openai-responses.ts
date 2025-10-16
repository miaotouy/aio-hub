import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

/**
 * 调用 OpenAI Responses API
 */
export const callOpenAiResponsesApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  const url = buildLlmApiUrl(profile.baseUrl, "openai-responses", "responses");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 使用第一个可用的 API Key
  if (profile.apiKeys && profile.apiKeys.length > 0) {
    headers["Authorization"] = `Bearer ${profile.apiKeys[0]}`;
  }

  // 构建输入内容 - Responses API 使用不同的格式
  const inputContent: any[] = [];
  
  for (const msg of options.messages) {
    if (msg.type === "text" && msg.text) {
      inputContent.push({ type: "input_text", text: msg.text });
    } else if (msg.type === "image" && msg.imageBase64) {
      inputContent.push({
        type: "input_image",
        image_url: `data:image/png;base64,${msg.imageBase64}`,
      });
    }
  }

  // 如果只有一个文本输入，可以直接使用字符串
  const input = inputContent.length === 1 && inputContent[0].type === "input_text"
    ? inputContent[0].text
    : [{ role: "user", content: inputContent }];

  const body: any = {
    model: options.modelId,
    input,
    max_output_tokens: options.maxTokens || 4000,
    temperature: options.temperature ?? 0.5,
  };

  // 添加系统指令（如果有）
  if (options.systemPrompt) {
    body.instructions = options.systemPrompt;
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

    await parseSSEStream(reader, (data) => {
      const text = extractTextFromSSE(data, "openai-responses");
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

  // Responses API 的响应格式：output 是一个数组，包含 message 对象
  let content = "";
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message" && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text") {
            content += contentItem.text;
          }
        }
      }
    }
  }

  return {
    content,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
};