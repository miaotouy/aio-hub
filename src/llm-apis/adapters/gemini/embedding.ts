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

import {
  formatGeminiEmbedding2Input,
  geminiEmbeddingAdapter,
  isGeminiEmbedding2,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
  EmbeddingTaskType,
} from "@/llm-apis/embedding-types";
import { callSharedEmbeddingApi } from "@/llm-apis/embedding-core";

export { isGeminiEmbedding2 };

export function formatForGemini2(
  text: string,
  taskType: EmbeddingTaskType,
  title?: string
): string {
  return formatGeminiEmbedding2Input(text, taskType, title);
}

export const callGeminiEmbeddingApi = (
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> =>
  callSharedEmbeddingApi(geminiEmbeddingAdapter, profile, options);
