import type { LlmProfile } from "@/types/llm-profiles";
import type { KnowledgeRequestSettings } from "../../types";
import { generateVectors } from "./vector-generator";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-tag-vectorizer-core");

export interface TagVectorizationParams {
  tags: string[];
  modelId: string;
  profile: LlmProfile;
  requestSettings?: KnowledgeRequestSettings;
  onProgress?: (processed: number) => void;
  shouldStop?: () => boolean;
}

/**
 * 核心标签向量化逻辑 (纯逻辑)
 * 负责并发控制、分批处理及降级容错
 */
export async function vectorizeTags(params: TagVectorizationParams): Promise<Map<string, number[]>> {
  const { tags, modelId, profile, requestSettings, onProgress, shouldStop } = params;
  if (tags.length === 0) return new Map();

  const batchSize = requestSettings?.batchSize ?? 20;
  const maxConcurrent = requestSettings?.maxConcurrent ?? 3;
  const tagVectorMap = new Map<string, number[]>();

  const batches: string[][] = [];
  for (let i = 0; i < tags.length; i += batchSize) {
    batches.push(tags.slice(i, i + batchSize));
  }

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
          // 容错降级逻辑
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
