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
import { openAiUrlHandler, buildOpenAiHeaders } from "./utils";

/**
 * 调用 OpenAI 兼容的 Embedding API
 */
export const callOpenAiEmbeddingApi = async (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> => {
  const url = openAiUrlHandler.buildUrl(profile.baseUrl, "embeddings", profile);
  const headers = buildOpenAiHeaders(profile, options.requestId);

  const body: any = {
    model: options.modelId,
    input: options.input,
  };

  if (options.dimensions !== undefined) {
    body.dimensions = options.dimensions;
  }

  if (options.user !== undefined) {
    body.user = options.user;
  }

  if (options.encodingFormat !== undefined) {
    body.encoding_format = options.encodingFormat;
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

  return {
    object: "list",
    data: data.data.map((item: any) => ({
      object: "embedding",
      index: item.index,
      embedding: item.embedding,
    })),
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      totalTokens: data.usage.total_tokens,
    },
  };
};
