/**
 * 知识库对外 Service 门面
 *
 * 这是知识库模块给外部消费方（如 llm-chat）的唯一访问入口。
 * 对外屏蔽：
 *  - Tauri `kb_*` 后端命令
 *  - `SearchOrchestrator` / `vectorCacheManager` 等内部组件
 *  - 缓存 key 拼接、向量融合等内部策略
 *
 * 消费方禁止直接 invoke `kb_*` 或导入知识库内部 utils/orchestrator/store。
 */

import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getProfileId, getPureModelId } from "@/utils/modelIdUtils";
import { SearchOrchestrator } from "../logic/orchestrator";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { vectorCacheManager } from "../utils/vectorCache";
import { preprocessQuery } from "../utils/queryPreProcessor";
import type { SearchResult } from "../types/search";
import type { Caiu } from "../types/caiu";
import type { KnowledgeBaseMeta } from "../types/knowledge-base";

const logger = createModuleLogger("knowledge-base/api");
const errorHandler = createModuleErrorHandler("knowledge-base/api");

// SearchOrchestrator 内部无状态，模块级单例即可
const searchOrchestrator = new SearchOrchestrator();

// ────────────────────────────────────────────────────────────────────────────
// 类型定义
// ────────────────────────────────────────────────────────────────────────────

/**
 * 基础检索参数
 */
export interface SearchParams {
  /** 查询文本 */
  query: string;
  /** 限定的知识库 ID 列表，留空表示全库 */
  kbIds?: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 召回上限 */
  limit?: number;
  /** 最低分数阈值 */
  minScore?: number;
  /** 检索引擎 ID，不传则使用知识库默认引擎 */
  engineId?: string;
  /** 外部已有的查询向量（绕过 embedding 调用） */
  vector?: number[];
  /** Embedding 模型 ID（pureModelId），不传则使用知识库默认模型 */
  modelId?: string;
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
  /** 限定的知识库 ID 列表 */
  kbIds: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 召回上限 */
  limit?: number;
  /** 最低分数阈值 */
  minScore?: number;
  /** 检索引擎 ID，不传则使用知识库默认引擎 */
  engineId?: string;
  /** 是否启用缓存（默认 false） */
  enableCache?: boolean;
}

/**
 * 检索结果（带可选的查询向量，用于上层做额外处理）
 */
export interface SearchWithCacheResult {
  results: SearchResult[];
  /** 实际用于检索的融合向量（缓存命中时也会一并返回） */
  vector: number[] | null;
}

interface CachedRetrievalEntry {
  results: SearchResult[];
  vector: number[] | null;
}

interface RetrievalCacheKeyInput {
  query: string;
  kbIds: string[];
  tags: string[];
  limit: number;
  minScore: number;
  engineId: string;
  modelId: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 内部辅助
// ────────────────────────────────────────────────────────────────────────────

/**
 * 解析最终使用的引擎 ID（fallback 链：参数 > 知识库默认 > "vector"）
 */
function resolveEngineId(engineId?: string): string {
  if (engineId) return engineId;
  const store = useKnowledgeBaseStore();
  return store.config?.defaultEngineId || "vector";
}

/**
 * 解析最终使用的 Embedding 模型 ID（pure model id）
 */
function resolveModelId(modelId?: string): string {
  if (modelId) return modelId;
  const store = useKnowledgeBaseStore();
  return getPureModelId(store.config?.defaultEmbeddingModel || "") || "";
}

/**
 * 获取检索结果缓存容量上限
 */
function getRetrievalCacheMaxItems(): number {
  const store = useKnowledgeBaseStore();
  const max = store.config?.cache?.retrievalCacheMaxItems;
  return typeof max === "number" && max > 0 ? max : 200;
}

/**
 * 向量空间加权平均
 */
function weightedAverageVector(
  vectors: number[][],
  weights: number[]
): number[] {
  const dim = vectors[0].length;
  const result = new Array<number>(dim).fill(0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  for (let vi = 0; vi < vectors.length; vi++) {
    const w = weights[vi] / totalWeight;
    const vec = vectors[vi];
    for (let d = 0; d < dim; d++) {
      result[d] += vec[d] * w;
    }
  }
  return result;
}

/**
 * 根据主/次查询文本构建融合查询向量
 *
 * @returns 融合向量；如果两侧都无可用文本或模型未配置则返回 null
 */
async function buildFusedQueryVector(
  primaryQuery: string,
  secondaryQuery: string,
  weights: [number, number],
  modelId: string
): Promise<number[] | null> {
  if (!modelId) {
    logger.warn("未配置 Embedding 模型，无法生成检索向量");
    return null;
  }

  const { profiles } = useLlmProfiles();
  // pureModelId 是不带渠道前缀的，需要从知识库配置取完整 comboId 反查 profile
  const store = useKnowledgeBaseStore();
  const comboId = store.config?.defaultEmbeddingModel || "";
  const profileId = getProfileId(comboId);
  const profile = profiles.value.find((p) => p.id === profileId);
  if (!profile) {
    logger.warn("未找到 Embedding 模型对应的 LLM Profile", { profileId });
    return null;
  }

  try {
    const primaryVec = primaryQuery
      ? await vectorCacheManager.getVector(primaryQuery, profile, modelId)
      : null;
    const secondaryVec = secondaryQuery
      ? await vectorCacheManager.getVector(secondaryQuery, profile, modelId)
      : null;

    if (primaryVec && secondaryVec) {
      return weightedAverageVector([primaryVec, secondaryVec], weights);
    }
    return primaryVec || secondaryVec;
  } catch (err) {
    logger.warn("生成融合查询向量失败", err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 对外 API
// ────────────────────────────────────────────────────────────────────────────

/**
 * 执行知识库检索（不带缓存）
 *
 * 适用于一次性查询、外部工具集成。如需 chat 风格的双查询融合 + 缓存，使用 `searchWithCache`。
 */
export async function search(params: SearchParams): Promise<SearchResult[]> {
  return (
    (await errorHandler.wrapAsync(
      async () => {
        const engineId = resolveEngineId(params.engineId);
        const modelId = params.modelId || resolveModelId();

        logger.debug("执行知识库检索", {
          query: params.query,
          kbIds: params.kbIds,
          tags: params.tags,
          engineId,
        });

        const results = await searchOrchestrator.search({
          query: params.query,
          kbIds: params.kbIds || [],
          engineId,
          modelId: modelId || undefined,
          extraFilters: {
            requiredTags: params.tags,
            minScore: params.minScore,
          },
          limit: params.limit,
          vector_payload: params.vector,
          skipPrep: true, // 外部调用跳过环境准备（由调用方或 store 自身保证）
        });

        logger.debug("知识库检索完成", { count: results.length });
        return results;
      },
      {
        userMessage: "检索知识库失败",
        context: params,
      }
    )) || []
  );
}

/**
 * 执行带缓存的双查询融合检索
 *
 * 内部流程：
 *  1. 拼接缓存 key（基于 `primary|||secondary` 与其他过滤条件）
 *  2. 优先查后端 LRU 缓存
 *  3. 未命中则分别 embed 主/次查询，向量空间加权融合
 *  4. 调用 search orchestrator 执行检索
 *  5. 写回缓存
 */
export async function searchWithCache(
  params: SearchWithCacheParams
): Promise<SearchWithCacheResult> {
  const rawPrimary = params.primaryQuery || "";
  const secondary = params.secondaryQuery || "";
  const weights = params.fusionWeights || [0.7, 0.3];
  const explicitTags = params.tags || [];
  const limit = params.limit ?? 5;
  const minScore = params.minScore ?? 0.3;
  const engineId = resolveEngineId(params.engineId);
  const modelId = resolveModelId();
  const enableCache = params.enableCache ?? false;

  // 主查询执行预处理（清洗 + Tag 池匹配）；次查询不参与 Tag 匹配，避免 AI 回复中的噪音词误触发
  const store = useKnowledgeBaseStore();
  const { cleanedQuery, matchedTags } = preprocessQuery(rawPrimary, {
    tagPool: store.globalStats?.allDiscoveredTags || [],
  });
  const primary = cleanedQuery;
  const mergedTags = Array.from(new Set([...explicitTags, ...matchedTags]));

  const cacheInput: RetrievalCacheKeyInput = {
    // 拼接策略保持稳定：与历史实现 (`userText|||aiText`) 兼容
    query: `${primary}|||${secondary}`,
    kbIds: params.kbIds,
    tags: mergedTags,
    limit,
    minScore,
    engineId,
    modelId,
  };

  // 1. 查缓存
  if (enableCache) {
    try {
      const cached = await invoke<CachedRetrievalEntry | null>(
        "kb_retrieval_cache_get",
        { input: cacheInput }
      );
      if (cached) {
        logger.debug("命中后端 RAG 检索缓存", {
          query: cacheInput.query.slice(0, 80),
          kbIds: params.kbIds,
          engineId,
          modelId,
        });
        return { results: cached.results, vector: cached.vector };
      }
    } catch (err) {
      logger.warn("读取后端检索缓存失败", { err });
    }
  }

  // 2. 决定是否需要向量
  const isVectorEngine =
    engineId === "vector" || engineId === "hybrid" || engineId === "lens";
  let vector: number[] | null = null;
  if (isVectorEngine) {
    vector = await buildFusedQueryVector(primary, secondary, weights, modelId);
  }

  // 3. 执行检索
  const results = await search({
    query: primary, // 走文本检索时仍以主查询为准
    kbIds: params.kbIds,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    limit,
    minScore,
    engineId,
    vector: vector || undefined,
    modelId: modelId || undefined,
  });

  // 4. 写回缓存
  if (enableCache) {
    try {
      await invoke("kb_retrieval_cache_set", {
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
 * 批量获取知识库条目
 */
export async function getEntries(ids: string[]): Promise<Caiu[]> {
  if (!ids || ids.length === 0) return [];
  return (
    (await errorHandler.wrapAsync(
      async () => {
        return await invoke<Caiu[]>("kb_get_entries", { ids });
      },
      {
        userMessage: "获取知识库条目失败",
        context: { count: ids.length },
      }
    )) || []
  );
}

/**
 * 加载指定知识库的元数据
 *
 * @param kbId 知识库 ID
 * @param modelId 可选的 Embedding 模型 ID（pureModelId），用于带模型匹配的条目向量状态
 */
export async function loadBaseMeta(
  kbId: string,
  modelId?: string
): Promise<KnowledgeBaseMeta | null> {
  return await errorHandler.wrapAsync(
    async () => {
      const payload: Record<string, unknown> = { kbId };
      if (modelId) payload.modelId = modelId;
      return await invoke<KnowledgeBaseMeta | null>(
        "kb_load_base_meta",
        payload
      );
    },
    {
      userMessage: "加载知识库元数据失败",
      context: { kbId, modelId },
    }
  );
}

/**
 * 清空全局检索结果缓存
 */
export async function clearRetrievalCache(): Promise<void> {
  try {
    await invoke("kb_retrieval_cache_clear");
    logger.debug("已清空后端知识库检索缓存");
  } catch (err) {
    logger.warn("清空后端检索缓存失败", { err });
  }
}

/**
 * 获取检索缓存条目数
 */
export async function getRetrievalCacheStats(): Promise<number> {
  try {
    return await invoke<number>("kb_retrieval_cache_stats");
  } catch (err) {
    logger.warn("读取后端检索缓存统计失败", { err });
    return 0;
  }
}
