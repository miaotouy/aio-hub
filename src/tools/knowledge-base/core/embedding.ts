/**
 * 知识库向量化核心逻辑 (纯函数集合)
 * 职责: 向量生成、标签向量化、维度探测
 */

import { callEmbeddingApi } from "@/llm-apis/embedding";
import type { LlmProfile } from "@/types/llm-profiles";
import type { KnowledgeRequestSettings } from "../types";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-embedding-core");

// ============================================================================
// 类型定义
// ============================================================================

export interface VectorGenerationParams {
  input: string | string[];
  modelId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  label?: string;
  onRetry?: (attempt: number, delay: number) => void;
}

export interface TagVectorizationParams {
  tags: string[];
  modelId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  onProgress?: (processed: number) => void;
  shouldStop?: () => boolean;
}

// ============================================================================
// 通用重试执行器
// ============================================================================

async function executeWithRetry<T>(
  task: () => Promise<T>,
  options: {
    requestSettings?: KnowledgeRequestSettings;
    label?: string;
    onRetry?: (attempt: number, delay: number) => void;
  } = {}
): Promise<T> {
  const { requestSettings, label = "Task", onRetry } = options;
  const maxRetries = requestSettings?.maxRetries ?? 2;
  const retryInterval = requestSettings?.retryInterval ?? 3000;
  const timeout = requestSettings?.timeout ?? 60000;
  const retryMode = requestSettings?.retryMode ?? "fixed";

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = retryMode === "exponential" ? retryInterval * Math.pow(2, attempt - 1) : retryInterval;
        onRetry?.(attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      return await Promise.race([
        task(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} 请求超时`)), timeout)),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
    }
  }

  throw lastError || new Error(`${label} 失败`);
}

// ============================================================================
// 核心向量生成函数
// ============================================================================

/**
 * 生成文本向量（支持单条或批量）
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
 * 探测模型维度
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

// ============================================================================
// 标签批量向量化
// ============================================================================

/**
 * 批量向量化标签（带并发控制和降级容错）
 */
export async function vectorizeTags(params: TagVectorizationParams): Promise<Map<string, number[]>> {
  const { tags, modelId, profile, requestSettings, onProgress, shouldStop } = params;
  if (tags.length === 0) return new Map();

  const batchSize = requestSettings?.batchSize ?? 20;
  const maxConcurrent = requestSettings?.maxConcurrent ?? 3;
  const tagVectorMap = new Map<string, number[]>();

  // 分批
  const batches: string[][] = [];
  for (let i = 0; i < tags.length; i += batchSize) {
    batches.push(tags.slice(i, i + batchSize));
  }

  // 并发队列
  const queue = [...batches];
  const workers = Array(Math.min(maxConcurrent, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        if (shouldStop?.()) break;
        const batch = queue.shift();
        if (!batch) break;

        try {
          // 尝试批量调用
          const response = await generateVectors({
            input: batch,
            modelId,
            profile,
            requestSettings,
            label: "标签批量向量化",
          });

          if (response.data) {
            response.data.forEach((item, index) => {
              tagVectorMap.set(batch[index], item.embedding);
            });
            onProgress?.(batch.length);
          }
        } catch (error: any) {
          // 容错降级：如果批量失败且是 400 错误，降级为单条处理
          const errorMsg = error?.message || "";
          if (batch.length > 1 && (errorMsg.includes("400") || errorMsg.includes("input"))) {
            logger.warn("端点可能不支持批量 Embedding，降级为单条处理", { modelId, error: errorMsg });

            for (const text of batch) {
              if (shouldStop?.()) break;
              try {
                const res = await generateVectors({
                  input: text,
                  modelId,
                  profile,
                  requestSettings,
                  label: `标签向量化-${text}`,
                });
                if (res.data?.[0]) {
                  tagVectorMap.set(text, res.data[0].embedding);
                  onProgress?.(1);
                }
              } catch (singleError) {
                logger.error(`单条标签向量化失败: ${text}`, singleError);
              }
            }
          } else {
            throw error;
          }
        }
      }
    });

  await Promise.all(workers);
  return tagVectorMap;
}