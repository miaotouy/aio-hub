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

/**
 * 知识库检索核心逻辑 (纯函数集合)
 * 职责: 查询向量准备、搜索预处理
 */

import type { LlmProfile } from "@/types/llm-profiles";
import type { KnowledgeRequestSettings } from "../types";
import { generateVectors } from "./embedding";

// ============================================================================
// 类型定义
// ============================================================================

export interface SearchVectorPrepperParams {
  query: string;
  modelId: string;
  profile: LlmProfile;
  vector_payload?: number[]; // 外部预生成向量
  requestSettings?: KnowledgeRequestSettings;
}

// ============================================================================
// 搜索向量准备
// ============================================================================

/**
 * 准备搜索向量（优先使用缓存，否则生成新向量）
 */
export async function prepareSearchVector(
  params: SearchVectorPrepperParams
): Promise<number[]> {
  const { query, modelId, profile, vector_payload, requestSettings } = params;

  // 1. 优先使用外部传入向量
  if (vector_payload && vector_payload.length > 0) {
    return vector_payload;
  }

  // 2. 生成新向量
  const response = await generateVectors({
    input: query,
    modelId,
    profile,
    requestSettings: {
      timeout: 30000,
      maxRetries: 1,
      retryInterval: 2000,
      retryMode: "fixed",
      maxConcurrent: 1,
      ...requestSettings,
    },
    label: "获取查询向量",
  });

  const vector = response.data?.[0]?.embedding;
  if (!vector) {
    throw new Error("模型未返回有效的查询向量");
  }

  return vector;
}
