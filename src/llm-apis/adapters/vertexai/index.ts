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
import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "@/llm-apis/embedding-types";
import { createModuleLogger } from "@utils/logger";
import type { LlmAdapter } from "../index";
import { detectPublisher } from "./utils";
import { callVertexAiGemini, callVertexAiEmbeddingApi } from "./google";
import { callVertexAiClaude } from "./anthropic";

const logger = createModuleLogger("VertexAiAdapter");

/**
 * Vertex AI 适配器
 * 自动检测模型发布者类型（Google/Anthropic）并分发请求
 */
export const vertexAiAdapter: LlmAdapter = {
  chat: async (
    profile: LlmProfile,
    options: LlmRequestOptions
  ): Promise<LlmResponse> => {
    const publisher = detectPublisher(options.modelId);

    logger.info("分发 Vertex AI 请求", {
      publisher,
      model: options.modelId,
      stream: !!options.stream,
    });

    if (publisher === "google") {
      return callVertexAiGemini(profile, options);
    } else {
      return callVertexAiClaude(profile, options);
    }
  },

  embedding: async (
    profile: LlmProfile,
    options: EmbeddingRequestOptions
  ): Promise<EmbeddingResponse> => {
    return callVertexAiEmbeddingApi(profile, options);
  },
};
