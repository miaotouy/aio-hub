/**
 * 知识库业务编排层 (统一编排器)
 * 职责: 协调 Core 层纯函数与 Tauri 后端，执行完整业务流程
 * 
 * 包含三大核心能力:
 * 1. IndexingOrchestrator - 索引编排（条目向量化、标签同步）
 * 2. SearchOrchestrator - 检索编排（环境准备、向量搜索）
 * 3. VectorSyncManager - 向量同步（覆盖率检查、自动补全）
 */

import { invoke } from "@tauri-apps/api/core";
import type { LlmProfile } from "@/types/llm-profiles";
import type { Caiu, KnowledgeRequestSettings } from "../types";
import type { SearchResult } from "../types/search";
import { generateVectors, vectorizeTags } from "../core/embedding";
import { prepareSearchVector } from "../core/search";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-orchestrator");

// ============================================================================
// 类型定义
// ============================================================================

export interface OrchestratorConfig {
  requestSettings?: KnowledgeRequestSettings;
}

export interface SyncProgress {
  total: number;
  current: number;
}

export interface CoverageData {
  missingEntries: number;
  missingMap: [string, string][];
  modelId: string;
}

// ============================================================================
// 索引编排器 (Indexing Orchestrator)
// ============================================================================

export class IndexingOrchestrator {
  constructor(private config: OrchestratorConfig = {}) {}

  /**
   * 同步一组标签到全局池
   */
  async syncTags(params: {
    tags: string[];
    modelId: string;
    profile: LlmProfile;
    shouldStop?: () => boolean;
    onProgress?: (count: number) => void;
  }) {
    const { tags, modelId, profile, shouldStop, onProgress } = params;
    if (tags.length === 0) return;

    // 1. 获取缺失标签
    const missingTags = await invoke<string[]>("kb_get_missing_tags", { modelId, tags });
    if (!missingTags || missingTags.length === 0) return;

    // 2. 调用核心层进行向量化
    const tagVectorMap = await vectorizeTags({
      tags: missingTags,
      modelId,
      profile,
      requestSettings: this.config.requestSettings,
      shouldStop,
      onProgress,
    });

    // 3. 持久化回后端
    if (tagVectorMap.size > 0) {
      await invoke("kb_sync_tag_vectors", { modelId, data: Array.from(tagVectorMap.entries()) });
      await invoke("kb_rebuild_tag_pool_index", { modelId });
      logger.info(`同步全局标签池完成，新增 ${tagVectorMap.size} 个标签`, { modelId });
    }
  }

  /**
   * 索引单个条目
   */
  async indexEntry(params: { kbId: string; entry: Caiu; modelId: string; profile: LlmProfile }) {
    const { kbId, entry, modelId, profile } = params;

    // 1. 同步条目关联的标签
    const entryTags = (entry.tags || []).map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean) as string[];
    await this.syncTags({ tags: entryTags, modelId, profile });

    // 2. 生成内容向量
    const response = await generateVectors({
      input: entry.content,
      modelId,
      profile,
      requestSettings: this.config.requestSettings,
      label: `条目[${entry.id}]向量化`,
    });

    const vector = response.data?.[0]?.embedding;
    if (!vector) throw new Error("向量生成失败");

    // 3. 持久化
    const tokens = response.usage?.promptTokens;
    await invoke("kb_update_entry_vector", {
      kbId,
      caiuId: entry.id,
      vector,
      model: modelId,
      tokens: tokens ?? undefined,
    });

    return { vectorStatus: "ready" as const };
  }

  /**
   * 批量索引条目
   */
  async indexEntries(params: {
    kbId: string;
    entryIds: string[];
    modelId: string;
    profile: LlmProfile;
    onProgress?: (processed: number, failed?: { id: string; reason: string }[]) => void;
    shouldStop?: () => boolean;
  }) {
    const { kbId, entryIds, modelId, profile, onProgress, shouldStop } = params;
    if (entryIds.length === 0) return;

    const requestSettings = this.config.requestSettings;
    const batchSize = requestSettings?.batchSize ?? 16;
    const maxConcurrent = requestSettings?.maxConcurrent ?? 5;

    // 1. 分批处理
    const batches: string[][] = [];
    for (let i = 0; i < entryIds.length; i += batchSize) {
      batches.push(entryIds.slice(i, i + batchSize));
    }

    const queue = [...batches];
    const workers = Array(Math.min(maxConcurrent, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          if (shouldStop?.()) break;
          const batchIds = queue.shift();
          if (!batchIds) break;

          try {
            // 加载当前批次的完整条目
            const entries: Caiu[] = [];
            for (const id of batchIds) {
              const entry = await invoke<Caiu | null>("kb_load_entry", { kbId, entryId: id });
              if (entry) entries.push(entry);
            }

            if (entries.length === 0) {
              onProgress?.(batchIds.length);
              continue;
            }

            // 同步标签
            const batchTags = new Set<string>();
            entries.forEach((e) => {
              (e.tags || []).forEach((t) => {
                const name = typeof t === "string" ? t : t.name;
                if (name) batchTags.add(name);
              });
            });
            if (batchTags.size > 0) {
              await this.syncTags({ tags: Array.from(batchTags), modelId, profile, shouldStop });
            }

            // 批量生成向量
            const response = await generateVectors({
              input: entries.map((e) => e.content),
              modelId,
              profile,
              requestSettings,
              label: "批量内容向量化",
            });

            if (response.data) {
              const totalTokens = response.usage?.promptTokens ?? 0;
              const perEntryTokens = Math.floor(totalTokens / response.data.length);

              const syncTasks = response.data.map(async (item, index) => {
                const entry = entries[index];
                await invoke("kb_update_entry_vector", {
                  kbId,
                  caiuId: entry.id,
                  vector: item.embedding,
                  model: modelId,
                  tokens: perEntryTokens > 0 ? perEntryTokens : undefined,
                });
              });
              await Promise.all(syncTasks);
              onProgress?.(batchIds.length);
            }
          } catch (error: any) {
            onProgress?.(
              0,
              batchIds.map((id) => ({ id, reason: error.message || "批量处理失败" }))
            );
          }
        }
      });

    await Promise.all(workers);
  }
}

// ============================================================================
// 向量同步管理器 (Vector Sync Manager)
// ============================================================================

export class VectorSyncManager {
  constructor(private indexingOrchestrator: IndexingOrchestrator) {}

  /**
   * 检查指定知识库在特定模型下的向量覆盖率
   */
  async checkCoverage(params: { kbIds: string[]; modelId: string }) {
    const { kbIds, modelId } = params;
    const report = await invoke<any>("kb_check_vector_coverage", { kbIds, modelId });

    return {
      missingEntries: report.missingEntries as number,
      missingMap: report.missingMap as [string, string][], // [kbId, caiuId][]
    };
  }

  /**
   * 执行自动补全同步
   */
  async syncMissingVectors(params: {
    missingMap: [string, string][];
    modelId: string;
    profile: LlmProfile;
    onProgress?: (progress: SyncProgress) => void;
    shouldStop?: () => boolean;
  }) {
    const { missingMap, modelId, profile, onProgress, shouldStop } = params;
    const total = missingMap.length;
    let current = 0;

    logger.info(`开始全自动补全向量，共 ${total} 项`, { modelId });

    for (let i = 0; i < total; i++) {
      if (shouldStop?.()) break;

      const [kbId, caiuId] = missingMap[i];
      try {
        // 加载条目内容
        const entry = await invoke<Caiu | null>("kb_load_entry", { kbId, entryId: caiuId });
        if (entry) {
          // 调用索引编排器的单条索引逻辑
          await this.indexingOrchestrator.indexEntry({
            kbId,
            entry,
            modelId,
            profile,
          });
        }
      } catch (error) {
        logger.error(`条目[${caiuId}]自动同步失败`, error);
      } finally {
        current++;
        onProgress?.({ total, current });
      }
    }

    logger.info(`向量自动补全任务结束`, { modelId, completed: current });
  }
}

// ============================================================================
// 检索编排器 (Search Orchestrator)
// ============================================================================

export class SearchOrchestrator {
  constructor(
    private config: OrchestratorConfig = {},
    private syncManager?: VectorSyncManager
  ) {}

  /**
   * 执行统一检索流程
   */
  async search(params: {
    query: string;
    engineId: string;
    kbIds: string[];
    modelId?: string;
    profile?: LlmProfile;
    limit?: number;
    extraFilters?: Record<string, any>;
    vector_payload?: number[];
    skipPrep?: boolean;
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
        if (onCoverageRequired && this.syncManager) {
          const coverage = await this.syncManager.checkCoverage({ kbIds, modelId });
          if (coverage.missingEntries > 0) {
            const action = await onCoverageRequired({
              ...coverage,
              modelId,
            });

            if (action === "cancel") return [];
            if (action === "fill") {
              await this.syncManager.syncMissingVectors({
                missingMap: coverage.missingMap,
                modelId,
                profile,
              });
            }
          }
        }

        // B. 环境准备：加载向量到内存
        for (const kbId of kbIds) {
          await invoke("kb_load_model_vectors", { kbId, modelId });
        }
        // 确保标签池索引就绪
        await invoke("kb_rebuild_tag_pool_index", { modelId });
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

    // 2. 调用后端检索
    const results = await invoke<SearchResult[]>("kb_search", {
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
      kbIds: params.kbIds || [],
    });
  }
}