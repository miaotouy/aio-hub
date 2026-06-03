import { createModuleLogger } from "@/utils/logger";
import type { SearchResult } from "../types/search";
import type {
  KbRetrievalRequest,
  KbRetrievalResponse,
} from "../types/retrieval";
import {
  shouldActivate,
  resolveRetrievalParams,
  applyCharLimit,
  formatResults,
} from "../core/retrievalPolicy";
import { searchWithCache, getEntries, loadBaseMeta } from "../services/api";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";

const logger = createModuleLogger("knowledge-base/placeholder-retrieval");

/**
 * 知识库占位符检索编排器
 * 串联纯函数策略与实际 IO
 */
export async function resolvePlaceholderRetrieval(
  req: KbRetrievalRequest
): Promise<KbRetrievalResponse> {
  // 1. 检查激活模式
  if (!shouldActivate(req)) {
    return {
      activated: false,
      content: "",
      resultCount: 0,
    };
  }

  let results: SearchResult[] = [];

  try {
    // 2. 处理检索逻辑
    if (req.mode === "static") {
      results = await handleStaticMode(req);
    } else {
      // 向量检索流程
      const params = resolveRetrievalParams(req);

      // 如果没有可检索的库，直接返回
      if (params.kbIds.length === 0) {
        return {
          activated: true,
          content: req.settings.emptyText || "（未检索到相关知识）",
          resultCount: 0,
        };
      }

      const { results: searchResults } = await searchWithCache({
        primaryQuery: req.userText,
        secondaryQuery: req.aiText,
        kbIds: params.kbIds,
        limit: params.limit,
        minScore: params.minScore,
        engineId: params.engineId,
        enableCache: req.settings.enableCache,
      });

      results = searchResults;

      // 3. 后置过滤 (如果占位符指定了 kbName)
      if (req.kbName) {
        results = results.filter((r) => r.kbName === req.kbName);
      }

      // 4. 字数限制
      results = applyCharLimit(results, req.settings.maxRecallChars || 0);
    }

    // 5. 格式化
    const formatted = formatResults(results, req.settings);

    return {
      activated: true,
      content: formatted,
      resultCount: results.length,
    };
  } catch (error) {
    logger.error("执行知识库占位符检索失败", error);
    return {
      activated: true,
      content: req.settings.emptyText || "（检索出错）",
      resultCount: 0,
    };
  }
}

/**
 * 处理静态加载模式
 */
async function handleStaticMode(
  req: KbRetrievalRequest
): Promise<SearchResult[]> {
  const entryIds = req.modeParams || [];
  if (entryIds.length === 0) return [];

  const isAll = entryIds.length === 1 && entryIds[0].toLowerCase() === "all";

  if (isAll) {
    return await handleStaticAll(req);
  }

  try {
    const entries = await getEntries(entryIds);
    return entries.map((e: any) => ({
      score: 1.0,
      kbName: e.kb_name || e.kbName || "未知知识库",
      kbId: e.kb_id || e.kbId || "",
      matchType: "key",
      highlight: null,
      caiu: {
        id: e.id,
        key: e.key,
        content: e.content,
        tags: e.tags || [],
        assets: [],
        priority: 100,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    })) as SearchResult[];
  } catch (err) {
    logger.warn("静态加载知识库条目失败", { entryIds, err });
    return [];
  }
}

/**
 * 处理 static::all 模式
 */
async function handleStaticAll(
  req: KbRetrievalRequest
): Promise<SearchResult[]> {
  const kbStore = useKnowledgeBaseStore();
  const results: SearchResult[] = [];

  // 确定要加载的知识库列表
  let targetBases = kbStore.bases;
  if (req.kbName) {
    targetBases = kbStore.bases.filter((b) => b.name === req.kbName);
    if (targetBases.length === 0) {
      logger.warn("static::all 未找到指定知识库", { kbName: req.kbName });
      return [];
    }
  }

  for (const base of targetBases) {
    try {
      const meta = await loadBaseMeta(base.id);
      if (!meta?.entries) continue;

      const enabledIds = meta.entries
        .filter((e: any) => e.vectorStatus !== "error")
        .map((e: any) => e.id);

      if (enabledIds.length === 0) continue;

      const entries = await getEntries(enabledIds);
      for (const e of entries as any[]) {
        results.push({
          score: 1.0,
          kbName: base.name || "未知知识库",
          kbId: base.id,
          matchType: "key",
          highlight: null,
          caiu: {
            id: e.id,
            key: e.key,
            content: e.content,
            tags: e.tags || [],
            assets: [],
            priority: e.priority ?? 100,
            enabled: true,
            createdAt: e.created_at || e.createdAt || Date.now(),
            updatedAt: e.updated_at || e.updatedAt || Date.now(),
          },
        } as SearchResult);
      }
    } catch (err) {
      logger.warn("static::all 加载知识库条目失败", { kbId: base.id, err });
    }
  }

  return results;
}
