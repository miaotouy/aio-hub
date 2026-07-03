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
import { fetchWithTimeout, ensureResponseOk } from "@/llm-apis/common";
import { asyncJsonStringify } from "@/utils/serialization";
import { resolveCustomHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";

/**
 * 调用 Cohere Embedding API (V2)
 */
export const callCohereEmbeddingApi = async (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> => {
  let baseUrl = profile.baseUrl || "https://api.cohere.com";
  if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
  if (baseUrl.endsWith("/v1")) baseUrl = baseUrl.slice(0, -3);

  const url = `${baseUrl}/v2/embed`;
  const apiKey =
    profile.apiKeys && profile.apiKeys.length > 0 ? profile.apiKeys[0] : "";

  const taskTypeMap: Record<string, string> = {
    RETRIEVAL_QUERY: "search_query",
    RETRIEVAL_DOCUMENT: "search_document",
    SEMANTIC_SIMILARITY: "search_query",
    CLASSIFICATION: "classification",
    CLUSTERING: "clustering",
  };

  const body: any = {
    model: options.modelId,
    texts: Array.isArray(options.input) ? options.input : [options.input],
    input_type: taskTypeMap[options.taskType || "RETRIEVAL_QUERY"],
    embedding_types: [options.encodingFormat || "float"],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (options.requestId) {
    headers["X-Request-ID"] = options.requestId;
  }

  Object.assign(headers, resolveCustomHeaders(profile.customHeaders));

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
  const format = options.encodingFormat || "float";
  const embeddings = data.embeddings[format];

  return {
    object: "list",
    data: embeddings.map((embedding: number[], index: number) => ({
      object: "embedding",
      index,
      embedding,
    })),
    model: options.modelId,
    usage: {
      promptTokens: data.meta?.billed_units?.input_tokens || 0,
      totalTokens: data.meta?.billed_units?.input_tokens || 0,
    },
  };
};
