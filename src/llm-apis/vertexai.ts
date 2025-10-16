import type { LlmProfile } from "../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "./common";
import { fetchWithRetry } from "./common";
import { buildLlmApiUrl } from "@utils/llm-api-url";
import { parseMessageContents, extractCommonParameters, inferImageMimeType } from "./request-builder";

/**
 * 调用 Vertex AI API
 */
export const callVertexAiApi = async (
  profile: LlmProfile,
  options: LlmRequestOptions
): Promise<LlmResponse> => {
  // Vertex AI 需要项目信息，这里假设在 baseUrl 中已经包含
  // 或者从 profile 的自定义配置中获取
  const url = buildLlmApiUrl(
    profile.baseUrl,
    "vertexai",
    `models/${options.modelId}:generateContent`
  );

  // 获取第一个可用的 API Key (Access Token)
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  // 使用共享函数解析消息内容
  const parsed = parseMessageContents(options.messages);

  // 构建 parts（格式类似 Gemini）
  const parts: any[] = [];
  
  for (const textPart of parsed.textParts) {
    parts.push({ text: textPart.text });
  }

  for (const imagePart of parsed.imageParts) {
    parts.push({
      inline_data: {
        mime_type: inferImageMimeType(imagePart.base64),
        data: imagePart.base64,
      },
    });
  }

  // 使用共享函数提取通用参数
  const commonParams = extractCommonParameters(options);

  const body: any = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      maxOutputTokens: commonParams.maxTokens || 4000,
      temperature: commonParams.temperature ?? 0.5,
    },
  };

  // Vertex AI 使用 systemInstruction
  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

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

  const data = await response.json();

  // 验证响应格式
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(`Vertex AI 响应格式异常: ${JSON.stringify(data)}`);
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