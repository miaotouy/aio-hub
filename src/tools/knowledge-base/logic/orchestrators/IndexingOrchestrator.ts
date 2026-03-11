import type { LlmProfile } from "@/types/llm-profiles";
import type { Caiu, KnowledgeRequestSettings } from "../../types";
import { generateVectors } from "../../core/embedding/vector-generator";
import { vectorizeTags } from "../../core/embedding/tag-vectorizer";
import type { BackendAdapter } from "../adapters/BackendAdapter";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("kb-indexing-orchestrator");

export interface IndexingOrchestratorConfig {
  requestSettings?: KnowledgeRequestSettings;
}

/**
 * 索引编排器 (Logic 层)
 * 职责: 协调 Core 层纯函数与 BackendAdapter，执行具体的业务逻辑
 */
export class IndexingOrchestrator {
  constructor(
    private adapter: BackendAdapter,
    private config: IndexingOrchestratorConfig = {}
  ) {}

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
    const missingTags = await this.adapter.getMissingTags(modelId, tags);
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
      await this.adapter.syncTagVectors(modelId, Array.from(tagVectorMap.entries()));
      await this.adapter.rebuildTagPoolIndex(modelId);
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
    await this.adapter.updateEntryVector({
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
              const entry = await this.adapter.loadEntry(kbId, id);
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
                await this.adapter.updateEntryVector({
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
