import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseSSEStream, extractTextFromSSE } from "@utils/sse-parser";

/**
 * 调用 Google Gemini API
 */
export const callGeminiApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  // 获取第一个可用的 API Key
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 流式响应使用不同的端点
  const endpoint =
    options.stream && options.onStream
      ? `models/${options.modelId}:streamGenerateContent`
      : `models/${options.modelId}:generateContent`;

  const baseUrl = buildLlmApiUrl(profile.baseUrl, "gemini", endpoint);
  const url = `${baseUrl}?key=${apiKey}${options.stream ? "&alt=sse" : ""}`;

  // 构建 parts
  const parts: any[] = [];
  for (const msg of options.messages) {
    if (msg.type === "text" && msg.text) {
      parts.push({ text: msg.text });
    } else if (msg.type === "image" && msg.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: "image/png",
          data: msg.imageBase64,
        },
      });
    }
  }

  const body: any = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      maxOutputTokens: options.maxTokens || 4000,
      temperature: options.temperature ?? 0.5,
    },
  };

  // Gemini 使用 systemInstruction 而不是 system message
  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  // 如果启用流式响应
  if (options.stream && options.onStream) {
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      const text = extractTextFromSSE(data, "gemini");
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
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(`Gemini API 响应格式异常: ${JSON.stringify(data)}`);
  }

  return {
    content: data.candidates[0].content.parts[0].text,
    usage: data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined,
  };
};