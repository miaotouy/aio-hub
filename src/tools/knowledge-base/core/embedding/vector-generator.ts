import { callEmbeddingApi } from "@/llm-apis/embedding";
import type { LlmProfile } from "@/types/llm-profiles";
import type { KnowledgeRequestSettings } from "../../types";
import { executeWithRetry } from "../utils/retry";

export interface VectorGenerationParams {
  input: string | string[];
  modelId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  label?: string;
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * 核心向量生成函数 (纯逻辑)
 */
export async function generateVectors(params: VectorGenerationParams) {
  const { input, modelId, profile, requestSettings, label = "向量化", onRetry } = params;

  const response = await executeWithRetry(
    () =>
      callEmbeddingApi(profile, {
        modelId,
        input,
      }),
    {
      requestSettings,
      label,
      onRetry,
    }
  );

  return {
    data: response.data, // [{ embedding: number[] }]
    usage: response.usage, // { promptTokens: number }
  };
}

/**
 * 探测模型维度 (辅助函数)
 */
export async function detectDimension(params: { profile: LlmProfile; modelId: string }) {
  const { profile, modelId } = params;
  const response = await callEmbeddingApi(profile, {
    modelId,
    input: "dimension_test",
  });

  if (response.data?.[0]?.embedding) {
    return response.data[0].embedding.length;
  }
  throw new Error("模型返回数据异常，无法获取维度");
}
