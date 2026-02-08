import { invoke } from "@tauri-apps/api/core";
import { SearchResult } from "../types/search";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { vectorCacheManager } from "../utils/vectorCache";
import { getPureModelId } from "../utils/kbUtils";
import { performIndexEntry } from "./kbIndexer";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
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

export interface ExternalSearchOptions {
  /** 查询文本 */
  query: string;
  /** 外部预生成的查询向量（如 Chat 的上下文感知向量） */
  vector?: number[];
  /** 目标知识库 ID 列表，为空则检索所有库 */
  kbIds?: string[];
  /** 预处理提取的标签 */
  tags?: string[];
  /** 结果数量限制 */
  limit?: number;
  /** 最低相关度分数 */
  minScore?: number;
  /** 检索引擎 ID */
  engineId?: string;
  /** 纯模型 ID（已经过 getPureModelId 处理） */
  modelId?: string;
}

export class KnowledgeSearchManager {
  /**
   * 执行统一检索流程 (面向知识库模块内部)
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
   * 面向外部消费者的检索方法 (如 Chat 模块)
   * 统一环境准备步骤、向量检索路径和后端接口调用
   */
  async searchWithVector(options: ExternalSearchOptions): Promise<SearchResult[]> {
    const {
      query,
      vector,
      kbIds,
      tags,
      limit = 20,
      minScore,
      engineId = "vector",
      modelId,
    } = options;

    if (!query.trim()) return [];

    // 1. 确保后端已初始化
    try {
      await invoke("kb_initialize");
    } catch (e) {
      logger.warn("初始化知识库后端失败", e);
    }

    // 2. 确定目标知识库
    const targetKbIds = kbIds?.length ? kbIds : this.getAllKbIds();
    if (targetKbIds.length === 0) return [];

    // 3. 向量引擎的环境准备
    const isVectorEngine = ["vector", "lens", "hybrid"].includes(engineId);
    if (isVectorEngine && modelId) {
      // 加载向量到后端内存
      for (const kbId of targetKbIds) {
        await invoke("kb_load_model_vectors", { kbId, modelId });
      }
      // 重建标签池索引
      await invoke("kb_rebuild_tag_pool_index", { modelId });
    }

    // 4. 执行后端检索
    const results = await invoke<SearchResult[]>("kb_search", {
      query,
      filters: {
        kbIds: targetKbIds,
        tags,
        limit,
        minScore,
        enabledOnly: true,
        engineId,
      },
      engineId,
      vectorPayload: vector,
      model: modelId,
    });

    return results;
  }

  /** 获取所有知识库 ID */
  private getAllKbIds(): string[] {
    const store = useKnowledgeBaseStore();
    return store.bases.map((b) => b.id);
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
