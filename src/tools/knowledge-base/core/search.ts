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
export async function prepareSearchVector(params: SearchVectorPrepperParams): Promise<number[]> {
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