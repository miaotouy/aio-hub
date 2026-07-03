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

import { ref } from "vue";
import { callEmbeddingApi } from "@/llm-apis/embedding";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "@/llm-apis/embedding-types";
import type { LlmProfile } from "@/types/llm-profiles";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const errorHandler = createModuleErrorHandler(
  "embedding-playground/useEmbeddingRunner"
);
const logger = createModuleLogger("embedding-playground/useEmbeddingRunner");

export function useEmbeddingRunner() {
  const isLoading = ref(false);
  const lastResponse = ref<EmbeddingResponse | null>(null);
  const executionTime = ref(0);

  /**
   * 执行 Embedding 请求
   */
  const runEmbedding = async (
    profile: LlmProfile,
    options: EmbeddingRequestOptions
  ): Promise<EmbeddingResponse | null> => {
    isLoading.value = true;
    const startTime = Date.now();

    try {
      logger.info("Starting embedding request", {
        modelId: options.modelId,
        inputType: typeof options.input,
      });

      const response = await callEmbeddingApi(profile, options);

      executionTime.value = Date.now() - startTime;
      lastResponse.value = response;

      logger.info("Embedding request successful", {
        time: executionTime.value,
        dim: response.data[0]?.embedding.length,
      });

      return response;
    } catch (error) {
      errorHandler.error(error, "Embedding 请求失败");
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    isLoading,
    lastResponse,
    executionTime,
    runEmbedding,
  };
}
