import type { LlmProfile } from "../../../types/llm-profiles";
import type { LlmRequestOptions, LlmResponse } from "../../common";
import type { EmbeddingRequestOptions, EmbeddingResponse } from "../../embedding-types";
import { createModuleLogger } from "@utils/logger";
import type { LlmAdapter } from "../index";
import { vertexAiUrlHandler, detectPublisher } from "./utils";
import { callVertexAiGemini, callVertexAiEmbeddingApi } from "./google";
import { callVertexAiClaude } from "./anthropic";

const logger = createModuleLogger("VertexAiAdapter");

/**
 * Vertex AI 适配器
 * 自动检测模型发布者类型（Google/Anthropic）并分发请求
 */
export const vertexAiAdapter: LlmAdapter = {
  chat: async (profile: LlmProfile, options: LlmRequestOptions): Promise<LlmResponse> => {
    const apiKey = profile.apiKeys?.[0] || "";
    const publisher = detectPublisher(options.modelId);

    // 构建端点 URL
    let endpoint: string;
    if (publisher === "google") {
      endpoint =
        options.stream && options.onStream
          ? `publishers/google/models/${options.modelId}:streamGenerateContent`
          : `publishers/google/models/${options.modelId}:generateContent`;
    } else {
      endpoint =
        options.stream && options.onStream
          ? `publishers/anthropic/models/${options.modelId}:streamRawPredict`
          : `publishers/anthropic/models/${options.modelId}:rawPredict`;
    }

    const url = vertexAiUrlHandler.buildUrl(profile.baseUrl, endpoint);

    logger.info("分发 Vertex AI 请求", {
      publisher,
      model: options.modelId,
      stream: !!options.stream,
    });

    if (publisher === "google") {
      return callVertexAiGemini(profile, options, url, apiKey);
    } else {
      return callVertexAiClaude(profile, options, url, apiKey);
    }
  },

  embedding: async (profile: LlmProfile, options: EmbeddingRequestOptions): Promise<EmbeddingResponse> => {
    const apiKey = profile.apiKeys?.[0] || "";
    // 目前 Vertex AI 仅支持 Google 模型的向量化
    const endpoint = `publishers/google/models/${options.modelId}:predict`;
    const url = vertexAiUrlHandler.buildUrl(profile.baseUrl, endpoint);

    return callVertexAiEmbeddingApi(profile, options, url, apiKey);
  }
};