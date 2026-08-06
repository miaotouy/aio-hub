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
} from "./embedding-types";
import { adapters } from "./adapters";
import { resolveModelExecution } from "@aiohub/llm-core";

/**
 * 统一的 Embedding API 调用入口
 * 通过共享模型执行解析器选择 Embedding 适配器。
 */
export async function callEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  const model = profile.models.find((item) => item.id === options.modelId) ?? {
    id: options.modelId,
  };
  const execution = resolveModelExecution({
    profile,
    model,
    operation: "embedding",
  });
  const adapter = adapters[execution.effectiveProfile.type];

  if (!adapter) {
    throw new Error(`未知的 Provider 类型: ${execution.effectiveProfile.type}`);
  }

  if (!adapter.embedding) {
    throw new Error(
      `Provider "${execution.effectiveProfile.type}" 不支持 Embedding API`
    );
  }

  return adapter.embedding(execution.effectiveProfile, options);
}

// 导出类型
export type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
  EmbeddingTaskType,
} from "./embedding-types";
