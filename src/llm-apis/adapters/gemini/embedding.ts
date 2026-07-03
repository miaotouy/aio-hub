// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { LlmProfile } from "@/types/llm-profiles";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "@/llm-apis/embedding-types";
import type { EmbeddingTaskType } from "@/llm-apis/embedding-types";
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";
import { geminiUrlHandler, buildGeminiHeaders } from "./utils";

// ============================================================================
// Gemini Embedding 2 任务指令格式化
// Gemini 2 不支持 taskType 字段，必须将任务指令格式化到输入文本中
// ============================================================================

/**
 * 判断是否为 Gemini Embedding 2 模型
 */
export function isGeminiEmbedding2(modelId: string): boolean {
  return modelId.includes("gemini-embedding-2");
}

/**
 * 根据任务类型格式化输入文本（Gemini 2 专用）
 * - RETRIEVAL_QUERY -> `task: search result | query: {text}`
 * - RETRIEVAL_DOCUMENT -> `title: {title || "none"} | text: {text}`
 * - CLASSIFICATION -> `task: classification | query: {text}`
 * - CLUSTERING -> `task: clustering | query: {text}`
 * - SEMANTIC_SIMILARITY -> `task: sentence similarity | query: {text}`
 */
export function formatForGemini2(
  text: string,
  taskType: EmbeddingTaskType,
  title?: string
): string {
  switch (taskType) {
    case "RETRIEVAL_QUERY":
      return `task: search result | query: ${text}`;
    case "RETRIEVAL_DOCUMENT":
      return `title: ${title || "none"} | text: ${text}`;
    case "CLASSIFICATION":
      return `task: classification | query: ${text}`;
    case "CLUSTERING":
      return `task: clustering | query: ${text}`;
    case "SEMANTIC_SIMILARITY":
      return `task: sentence similarity | query: ${text}`;
    default:
      return `task: search result | query: ${text}`;
  }
}

// ============================================================================
// API 调用
// ============================================================================

/**
 * 调用 Google Gemini Embedding API
 */
export const callGeminiEmbeddingApi = async (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> => {
  const apiKey =
    profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";
  const isBatch = Array.isArray(options.input);
  const isGemini2 = isGeminiEmbedding2(options.modelId);
  const endpoint = isBatch
    ? `models/${options.modelId}:batchEmbedContents`
    : `models/${options.modelId}:embedContent`;

  const baseUrl = geminiUrlHandler.buildUrl(profile.baseUrl, endpoint);
  const url = `${baseUrl}?key=${apiKey}`;

  const headers = buildGeminiHeaders(profile, options.requestId);

  const taskType = options.taskType;

  let body: any;
  if (isBatch) {
    body = {
      requests: (options.input as string[]).map((text) => {
        if (isGemini2) {
          // Gemini 2：有 taskType 时格式化前缀，否则直接传原文
          return {
            model: `models/${options.modelId}`,
            content: {
              parts: [
                {
                  text: taskType
                    ? formatForGemini2(text, taskType, options.title)
                    : text,
                },
              ],
            },
            ...(options.dimensions
              ? { outputDimensionality: options.dimensions }
              : {}),
          };
        }
        // Gemini 1：有 taskType 时才传
        return {
          model: `models/${options.modelId}`,
          content: { parts: [{ text }] },
          ...(taskType ? { taskType } : {}),
          ...(options.title && taskType === "RETRIEVAL_DOCUMENT"
            ? { title: options.title }
            : {}),
        };
      }),
    };
  } else {
    const inputText =
      isGemini2 && taskType
        ? formatForGemini2(options.input as string, taskType, options.title)
        : (options.input as string);

    body = {
      model: `models/${options.modelId}`,
      content: { parts: [{ text: inputText }] },
      // Gemini 1：有 taskType 时才传
      ...(!isGemini2 && taskType
        ? {
            taskType,
            ...(options.title && taskType === "RETRIEVAL_DOCUMENT"
              ? { title: options.title }
              : {}),
          }
        : {}),
      // Gemini 2：支持 outputDimensionality
      ...(isGemini2 && options.dimensions
        ? { outputDimensionality: options.dimensions }
        : {}),
    };
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: await asyncJsonStringify(body),
      forceProxy: options.forceProxy,
      relaxIdCerts: options.relaxIdCerts,
      http1Only: options.http1Only,
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
