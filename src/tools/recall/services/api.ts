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
 * 思绪集对外 Service 门面
 *
 * 这是思绪集模块给外部消费方（如 llm-chat）的唯一访问入口。
 * 对外屏蔽：
 *  - Tauri `recall_*` 后端命令
 *  - `SearchOrchestrator` / `vectorCacheManager` 等内部组件
 *  - 缓存 key 拼接、向量融合等内部策略
 *
 * 消费方禁止直接 invoke `recall_*` 或导入思绪集内部 utils/orchestrator/store。
 */

import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { preprocessQuery } from "../utils/queryPreProcessor";
import { profileDefaults } from "../core/engineCapabilities";
import { resolvePlaceholderRetrieval as resolvePlaceholderRetrievalInternal } from "../logic/placeholderRetrieval";
import {
  compileRetrievalPipeline,
  executeRetrievalPipeline,
  type RecallPresetId,
} from "./retrievalPipeline";
import type { RecallProfile, RecallResult } from "../types/search";
import type { RecallEntry } from "../types/recall-entry";
import type { RecallCollectionMeta } from "../types/recall-collection";
import type {
  RecallRetrievalRequest,
  RecallRetrievalResponse,
} from "../types/retrieval";

const logger = createModuleLogger("recall/api");
const errorHandler = createModuleErrorHandler("recall/api");

// ────────────────────────────────────────────────────────────────────────────
// 类型定义
// ────────────────────────────────────────────────────────────────────────────

/**
 * 基础检索参数
 */
export interface SearchParams {
  /** 查询文本 */
  query: string;
  /** 限定的思绪集 ID 列表，留空表示全库 */
  recallIds?: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 召回上限 */
  limit?: number;
  /** 最低分数阈值 */
  minScore?: number;
  /** 检索引擎 ID，不传则使用思绪集默认引擎 */
  engineId?: string;
  /** 产品召回 profile；显式 engineId 仅供 Playground / 调试覆盖。 */
  profile?: RecallProfile;
  /** 产品检索预设；旧 engine/profile 只用于兼容输入。 */
  presetId?: RecallPresetId;
}

/**
 * 带缓存的检索参数（双查询语义融合 + 后端 LRU 缓存）
 *
 * 使用场景：chat 的 RAG 检索——用户文本和 AI 历史文本通常具有不同的语义权重。
 */
export interface SearchWithCacheParams {
  /** 主查询文本（如 user 文本，权重高） */
  primaryQuery: string;
  /** 次查询文本（如 AI 历史文本，权重低）；为空时退化为单查询 */
  secondaryQuery?: string;
  /** 融合权重 [primary, secondary]，默认 [0.7, 0.3] */
  fusionWeights?: [number, number];
  /** 限定的思绪集 ID 列表 */
  recallIds: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 召回上限 */
  limit?: number;
  /** 最低分数阈值 */
  minScore?: number;
  /** 检索引擎 ID，不传则使用思绪集默认引擎 */
  engineId?: string;
  /** 产品召回 profile。 */
  profile?: RecallProfile;
  /** 产品检索预设。 */
  presetId?: RecallPresetId;
  /** 是否启用缓存（默认 false） */
  enableCache?: boolean;
}

/**
 * 检索结果。查询向量只在 Runner 内部使用，不向调用方暴露。
 */
export interface SearchWithCacheResult {
  results: RecallResult[];
  /** 迁移期兼容字段；检索管线不向调用方返回查询向量。 */
  vector: number[] | null;
}

export interface RecallEntryLookup extends RecallEntry {
  recallId: string;
  recallName: string;
}

interface CachedRetrievalEntry {
  results: RecallResult[];
  vector: number[] | null;
}

interface RetrievalCacheKeyInput {
  query: string;
  recallIds: string[];
  tags: string[];
  fusionWeights: [number, number];
  limit: number;
  minScore: number;
  presetId: RecallPresetId;
  configHash: string;
  embeddingIdentity: string;
  algorithmVersion: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 内部辅助
// ────────────────────────────────────────────────────────────────────────────

function resolvePresetId(
  presetId?: RecallPresetId,
  engineId?: string,
  profile?: RecallProfile
): RecallPresetId {
  if (presetId) return presetId;
  if (engineId === "keyword") return "algorithmic";
  if (profile === "semantic" || profile === "associative") {
    return "comprehensive";
  }
  return "comprehensive";
}

/**
 * 获取检索结果缓存容量上限
 */
function getRetrievalCacheMaxItems(): number {
  const store = useRecallCollectionStore();
  const max = store.config?.cache?.retrievalCacheMaxItems;
  return typeof max === "number" && max > 0 ? max : 200;
}

function normalizeFusionWeights(
  weights: [number, number] | undefined
): [number, number] {
  const selected = weights ?? [0.7, 0.3];
  const total = selected[0] + selected[1];
  if (
    !selected.every((weight) => Number.isFinite(weight) && weight >= 0) ||
    total <= 0
  ) {
    return [0.7, 0.3];
  }
  return [selected[0] / total, selected[1] / total];
}

// ────────────────────────────────────────────────────────────────────────────
// 对外 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 执行思绪集检索（不带缓存）
 *
 * 适用于一次性查询、外部工具集成。如需 chat 风格的双查询融合 + 缓存，使用 `searchWithCache`。
 */
export async function search(params: SearchParams): Promise<RecallResult[]> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        const presetId = resolvePresetId(
          params.presetId,
          params.engineId,
          params.profile
        );

        logger.debug("执行思绪集检索", {
          query: params.query,
          recallIds: params.recallIds,
          tags: params.tags,
          presetId,
        });

        const { results } = await executeRetrievalPipeline({
          query: params.query,
          recallIds: params.recallIds || [],
          tags: params.tags,
          limit: params.limit,
          minScore: params.minScore,
          presetId,
        });

        logger.debug("思绪集检索完成", { count: results.length });
        return results;
      },
      {
        showToUser: false,
        userMessage: "检索思绪集失败",
        context: params,
      }
    )) || []
  );
}

/**
 * 执行带缓存的双查询融合检索
 *
 * 内部流程：
 *  1. 编译预设并以其配置哈希构造缓存 key
 *  2. 优先查后端 LRU 缓存
 *  3. 未命中则由 Runner 准备并复用查询向量
 *  4. 运行编译后的检索管线
 *  5. 写回缓存
 */
export async function searchWithCache(
  params: SearchWithCacheParams
): Promise<SearchWithCacheResult> {
  const rawPrimary = params.primaryQuery || "";
  const secondary = params.secondaryQuery || "";
  const weights = normalizeFusionWeights(params.fusionWeights);
  const explicitTags = params.tags || [];
  const profile = params.profile;
  const defaults = profileDefaults(profile);
  const limit = params.limit ?? defaults.limit;
  const minScore = params.minScore ?? defaults.minScore;
  const presetId = resolvePresetId(params.presetId, params.engineId, profile);
  const enableCache = params.enableCache ?? false;

  // 主查询执行预处理（清洗 + Tag 池匹配）；次查询不参与 Tag 匹配，避免 AI 回复中的噪音词误触发
  const store = useRecallCollectionStore();
  const { cleanedQuery, matchedTags } = preprocessQuery(rawPrimary, {
    tagPool: store.globalStats?.allDiscoveredTags || [],
  });
  const primary = cleanedQuery;
  const mergedTags = Array.from(new Set([...explicitTags, ...matchedTags]));
  const compiled = await compileRetrievalPipeline(presetId, limit);
  const needsEmbedding = compiled.result.externalRequirements.some(
    (requirement) => requirement.kind === "query-embedding"
  );
  const embeddingIdentity = needsEmbedding
    ? store.config?.defaultEmbeddingModel || ""
    : "";

  const cacheInput: RetrievalCacheKeyInput = {
    query: `${primary}|||${secondary}`,
    recallIds: params.recallIds,
    tags: mergedTags,
    fusionWeights: weights,
    limit,
    minScore,
    presetId,
    configHash: compiled.result.configHash,
    embeddingIdentity,
    algorithmVersion: compiled.result.algorithmVersion,
  };

  // 1. 查缓存
  if (enableCache) {
    try {
      const cached = await invoke<CachedRetrievalEntry | null>(
        "recall_retrieval_cache_get",
        { input: cacheInput }
      );
      if (cached) {
        logger.debug("命中后端 RAG 检索缓存", {
          query: cacheInput.query.slice(0, 80),
          recallIds: params.recallIds,
          presetId,
          configHash: compiled.result.configHash,
        });
        return { results: cached.results, vector: cached.vector };
      }
    } catch (err) {
      logger.warn("读取后端检索缓存失败", { err });
    }
  }

  // 2. 执行已编译的检索管线，向量预处理由 Runner 根据外部需求完成。
  const { results } = await executeRetrievalPipeline(
    {
      query: primary,
      secondaryQuery: secondary,
      fusionWeights: weights,
      recallIds: params.recallIds,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      limit,
      minScore,
      presetId,
    },
    compiled
  );
  const vector = null;

  // 3. 写回缓存
  if (enableCache) {
    try {
      await invoke("recall_retrieval_cache_set", {
        input: cacheInput,
        entry: { results, vector },
        maxItems: getRetrievalCacheMaxItems(),
      });
    } catch (err) {
      logger.warn("写入后端检索缓存失败", { err });
    }
  }

  return { results, vector };
}

/**
 * 批量获取思绪集条目
 */
export async function getEntries(ids: string[]): Promise<RecallEntryLookup[]> {
  if (!ids || ids.length === 0) return [];
  return (
    (await errorHandler.wrapAsync(
      async () => {
        return await invoke<RecallEntryLookup[]>("recall_get_entries", { ids });
      },
      {
        userMessage: "获取思绪集条目失败",
        context: { count: ids.length },
      }
    )) || []
  );
}

/**
 * 加载指定思绪集的元数据
 *
 * @param recallId 思绪集 ID
 * @param modelId 可选的 Embedding 模型 ID（pureModelId），用于带模型匹配的条目向量状态
 */
export async function loadBaseMeta(
  recallId: string,
  modelId?: string
): Promise<RecallCollectionMeta | null> {
  return await errorHandler.wrapAsync(
    async () => {
      const payload: Record<string, unknown> = { recallId };
      if (modelId) payload.modelId = modelId;
      return await invoke<RecallCollectionMeta | null>(
        "recall_load_base_meta",
        payload
      );
    },
    {
      userMessage: "加载思绪集元数据失败",
      context: { recallId, modelId },
    }
  );
}

/**
 * 清空全局检索结果缓存
 */
export async function clearRetrievalCache(): Promise<void> {
  try {
    await invoke("recall_retrieval_cache_clear");
    logger.debug("已清空后端思绪集检索缓存");
  } catch (err) {
    logger.warn("清空后端检索缓存失败", { err });
  }
}

/**
 /**
  * 获取检索缓存条目数
  */
export async function getRetrievalCacheStats(): Promise<number> {
  try {
    return await invoke<number>("recall_retrieval_cache_stats");
  } catch (err) {
    logger.warn("读取后端检索缓存统计失败", { err });
    return 0;
  }
}

/**
 * 门面：执行思绪集占位符检索（供 llm-chat 调用）
 */
export async function resolvePlaceholderRetrieval(
  req: RecallRetrievalRequest
): Promise<RecallRetrievalResponse> {
  return await resolvePlaceholderRetrievalInternal(req);
}
