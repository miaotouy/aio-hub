import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "../types/search";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { vectorCacheManager } from "../utils/vectorCache";
import { getPureModelId } from "../utils/kbUtils";
import { performIndexEntry } from "./kbIndexer";
import type { LlmProfile } from "@/types/llm-profiles";

const logger = createModuleLogger("knowledge-base/search-manager");
const errorHandler = createModuleErrorHandler("knowledge-base/search-manager");

export interface SearchOptions {
  engineId: string;
  kbIds: string[];
  limit?: number;
  // 向量相关
  embeddingModel?: string;
  enabledProfiles: LlmProfile[];
  // 动态引擎参数
  extraFilters?: Record<string, any>;
  // 流程控制
  skipCoverageCheck?: boolean;
  onCoverageRequired?: (data: {
    missingEntries: number;
    missingMap: [string, string][];
    modelId: string;
  }) => Promise<"cancel" | "fill" | "ignore">;
  onProgress?: (current: number, total: number) => void;
}

export class KnowledgeSearchManager {
  /**
   * 执行统一检索流程
   */
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    if (options.kbIds.length === 0) throw new Error("请先选择知识库");

    const startTime = Date.now();
    logger.info(`执行检索: "${query}" (${options.engineId})`, { kbIds: options.kbIds });

    try {
      const isVectorEngine = ["vector", "lens"].includes(options.engineId);
      let vector: number[] | undefined;
      let modelId: string | undefined;

      if (isVectorEngine) {
        if (!options.embeddingModel) throw new Error("请先选择 Embedding 模型");

        const profileId = options.embeddingModel.split(":")[0];
        modelId = getPureModelId(options.embeddingModel);
        const profile = options.enabledProfiles.find((p) => p.id === profileId);
        if (!profile) throw new Error("未找到模型配置");

        // 1. 覆盖率检查
        if (!options.skipCoverageCheck && options.onCoverageRequired) {
          const coverage = await invoke<any>("kb_check_vector_coverage", {
            kbIds: options.kbIds,
            modelId: modelId,
          });

          if (coverage.missingEntries > 0) {
            const action = await options.onCoverageRequired({
              missingEntries: coverage.missingEntries,
              missingMap: coverage.missingMap,
              modelId: modelId,
            });

            if (action === "cancel") return [];
            if (action === "fill") {
              await this.performBatchVectorization(
                coverage.missingMap,
                profile,
                options.embeddingModel,
                options.onProgress
              );
            }
          }
        }

        // 2. 环境准备：加载向量到内存
        for (const kbId of options.kbIds) {
          await invoke("kb_load_model_vectors", { kbId, modelId });
        }

        // 3. 确保标签池索引已准备好 (除了纯关键字检索外，通常都需要)
        await invoke("kb_rebuild_tag_pool_index", { modelId });

        // 4. 生成查询向量
        vector = await vectorCacheManager.getVector(query, profile, modelId);
      }

      // 5. 执行后端检索
      const searchResults = await invoke<SearchResult[]>("kb_search", {
        query: query,
        filters: {
          kbIds: options.kbIds,
          limit: options.limit || 20,
          engineId: options.engineId,
          ...(options.extraFilters || {}),
        },
        engineId: options.engineId,
        vectorPayload: vector,
        model: modelId,
      });

      logger.info(`检索完成, 耗时: ${Date.now() - startTime}ms`, { count: searchResults.length });
      return searchResults;
    } catch (error) {
      errorHandler.error(error, "知识库检索失败");
      throw error;
    }
  }

  /**
   * 批量向量化处理 (复用 kbIndexer 的核心逻辑)
   */
  private async performBatchVectorization(
    missingMap: [string, string][],
    profile: LlmProfile,
    comboId: string,
    onProgress?: (current: number, total: number) => void
  ) {
    for (let i = 0; i < missingMap.length; i++) {
      const [kbId, caiuId] = missingMap[i];

      const entry = await invoke<any>("kb_load_entry", { kbId, entryId: caiuId });
      if (!entry) continue;

      await performIndexEntry({
        kbId,
        entry,
        comboId,
        profile,
      });

      onProgress?.(i + 1, missingMap.length);
    }
  }
}

export const knowledgeSearchManager = new KnowledgeSearchManager();
