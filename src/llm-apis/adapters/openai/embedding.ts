import type { LlmProfile } from "@/types/llm-profiles";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "@/llm-apis/embedding-types";
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
  const headers = buildOpenAiHeaders(profile);

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
