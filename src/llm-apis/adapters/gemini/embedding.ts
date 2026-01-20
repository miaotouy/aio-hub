import type { LlmProfile } from "@/types/llm-profiles";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "@/llm-apis/embedding-types";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";
import { geminiUrlHandler } from "./utils";

/**
 * 调用 Google Gemini Embedding API
 */
export const callGeminiEmbeddingApi = async (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> => {
  const apiKey = profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const isBatch = Array.isArray(options.input);
  const endpoint = isBatch ? `models/${options.modelId}:batchEmbedContents` : `models/${options.modelId}:embedContent`;

  const baseUrl = geminiUrlHandler.buildUrl(profile.baseUrl, endpoint);
  const url = `${baseUrl}?key=${apiKey}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (profile.customHeaders) {
    Object.assign(headers, profile.customHeaders);
  }

  // 映射 TaskType
  const taskType = options.taskType || 'RETRIEVAL_QUERY';

  let body: any;
  if (isBatch) {
    body = {
      requests: (options.input as string[]).map(text => ({
        model: `models/${options.modelId}`,
        content: { parts: [{ text }] },
        taskType,
        ...(options.title && taskType === 'RETRIEVAL_DOCUMENT' ? { title: options.title } : {})
      }))
    };
  } else {
    body = {
      model: `models/${options.modelId}`,
      content: { parts: [{ text: options.input as string }] },
      taskType,
      ...(options.title && taskType === 'RETRIEVAL_DOCUMENT' ? { title: options.title } : {})
    };
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
    },
    options.timeout,
    options.signal
  );

  await ensureResponseOk(response);

  const data = await response.json();

  if (isBatch) {
    return {
      object: "list",
      data: data.embeddings.map((item: any, index: number) => ({
        object: "embedding",
        index,
        embedding: item.values,
      })),
      model: options.modelId,
      usage: {
        promptTokens: 0,
        totalTokens: 0,
      },
    };
  } else {
    return {
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: data.embedding.values,
        },
      ],
      model: options.modelId,
      usage: {
        promptTokens: 0,
        totalTokens: 0,
      },
    };
  }
};
