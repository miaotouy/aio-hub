import type { LlmProfile } from "@/types/llm-profiles";
import type { KnowledgeRequestSettings } from "../../types";
import type { SearchResult } from "../../types/search";
import { prepareSearchVector } from "../../core/search/vector-search-prepper";
import type { BackendAdapter } from "../adapters/BackendAdapter";
import type { VectorSyncManager } from "./VectorSyncManager";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-search-orchestrator");

export interface SearchConfig {
  requestSettings?: KnowledgeRequestSettings;
  syncManager?: VectorSyncManager; // 可选，用于覆盖率补全
}

export interface CoverageData {
  missingEntries: number;
  missingMap: [string, string][];
  modelId: string;
}

/**
 * 检索编排器 (Logic 层)
 * 职责: 协调环境准备、查询向量生成与后端检索执行
 */
export class SearchOrchestrator {
  constructor(
    private adapter: BackendAdapter,
    private config: SearchConfig = {}
  ) {}

  /**
   * 执行统一检索流程 (核心业务逻辑)
   */
  async search(params: {
    query: string;
    engineId: string;
    kbIds: string[];
    modelId?: string; // 纯模型 ID
    profile?: LlmProfile;
    limit?: number;
    extraFilters?: Record<string, any>;
    vector_payload?: number[]; // 可选预生成向量
    skipPrep?: boolean; // 是否跳过环境准备
    onCoverageRequired?: (data: CoverageData) => Promise<"cancel" | "fill" | "ignore">;
  }): Promise<SearchResult[]> {
    const {
      query,
      engineId,
      kbIds,
      modelId,
      profile,
      limit = 20,
      extraFilters,
      vector_payload,
      skipPrep = false,
      onCoverageRequired,
    } = params;

    if (!query.trim()) return [];
    if (kbIds.length === 0) throw new Error("请先选择知识库");

    const isVectorEngine = ["vector", "lens", "hybrid"].includes(engineId);
    let vector: number[] | undefined;

    // 1. 如果是向量引擎，执行环境准备和向量获取
    if (isVectorEngine) {
      if (!modelId || !profile) throw new Error("执行向量搜索需要配置模型信息");

      if (!skipPrep) {
        // A. 覆盖率检查与补全 (由外部 UI 控制)
        if (onCoverageRequired && this.config.syncManager) {
          const coverage = await this.config.syncManager.checkCoverage({ kbIds, modelId });
          if (coverage.missingEntries > 0) {
            const action = await onCoverageRequired({
              ...coverage,
              modelId,
            });

            if (action === "cancel") return [];
            if (action === "fill") {
              await this.config.syncManager.syncMissingVectors({
                missingMap: coverage.missingMap,
                modelId,
                profile,
              });
            }
          }
        }

        // B. 环境准备：加载向量到内存
        for (const kbId of kbIds) {
          await this.adapter.loadModelVectors(kbId, modelId);
        }
        // 确保标签池索引就绪
        await this.adapter.rebuildTagPoolIndex(modelId);
      }

      // 获取查询向量 (Core 层纯函数)
      vector = await prepareSearchVector({
        query,
        modelId,
        profile,
        vector_payload,
        requestSettings: this.config.requestSettings,
      });
    }

    // 2. 调用聚合检索后端适配器
    const results = await this.adapter.search({
      query,
      filters: {
        kbIds,
        limit,
        engineId,
        ...(extraFilters || {}),
      },
      engineId,
      vectorPayload: vector,
      model: modelId,
    });

    logger.info(`检索执行完成 [${engineId}]`, { count: results.length });
    return results;
  }

  /**
   * 极简外部检索接口
   */
  async searchExternally(params: {
    query: string;
    modelId: string;
    profile: LlmProfile;
    kbIds?: string[];
    engineId?: string;
  }): Promise<SearchResult[]> {
    return this.search({
      ...params,
      engineId: params.engineId || "vector",
      kbIds: params.kbIds || [], // 外部调用通常需要外层指定库，或者从外部 Store 获取
    });
  }
}
