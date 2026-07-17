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

import { createModuleLogger } from "@/utils/logger";
import type { RecallResult } from "../types/search";
import type {
  RecallRetrievalRequest,
  RecallRetrievalResponse,
} from "../types/retrieval";
import {
  shouldActivate,
  resolveRetrievalParams,
  applyCharLimit,
  formatResults,
} from "../core/retrievalPolicy";
import { searchWithCache, getEntries, loadBaseMeta } from "../services/api";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";

const logger = createModuleLogger("recall/placeholder-retrieval");

/**
 * 思绪集占位符检索编排器
 * 串联纯函数策略与实际 IO
 */
export async function resolvePlaceholderRetrieval(
  req: RecallRetrievalRequest
): Promise<RecallRetrievalResponse> {
  // 1. 检查激活模式
  if (!shouldActivate(req)) {
    return {
      activated: false,
      content: "",
      resultCount: 0,
    };
  }

  let results: RecallResult[] = [];

  try {
    // 2. 处理检索逻辑
    if (req.mode === "static") {
      results = await handleStaticMode(req);
    } else {
      // 向量检索流程
      const params = resolveRetrievalParams(req);

      // 如果没有可检索的库，直接返回
      if (params.recallIds.length === 0) {
        return {
          activated: true,
          content: req.settings.emptyText || "（未检索到相关知识）",
          resultCount: 0,
        };
      }

      const { results: searchResults } = await searchWithCache({
        primaryQuery: req.userText,
        secondaryQuery: req.aiText,
        recallIds: params.recallIds,
        limit: params.limit,
        minScore: params.minScore,
        engineId: params.engineId,
        enableCache: req.settings.enableCache,
      });

      results = searchResults;

      // 3. 后置过滤 (如果占位符指定了 recallName)
      if (req.recallName) {
        results = results.filter((r) => r.recallName === req.recallName);
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
    logger.error("执行思绪集占位符检索失败", error);
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
  req: RecallRetrievalRequest
): Promise<RecallResult[]> {
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
      recallName: e.recall_name || e.recallName || "未知思绪集",
      recallId: e.recall_id || e.recallId || "",
      matchType: "key",
      highlight: null,
      entry: {
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
    })) as RecallResult[];
  } catch (err) {
    logger.warn("静态加载思绪集条目失败", { entryIds, err });
    return [];
  }
}

/**
 * 处理 static::all 模式
 */
async function handleStaticAll(
  req: RecallRetrievalRequest
): Promise<RecallResult[]> {
  const recallStore = useRecallCollectionStore();
  const results: RecallResult[] = [];

  // 确定要加载的思绪集列表
  let targetBases = recallStore.bases;
  if (req.recallName) {
    targetBases = recallStore.bases.filter((b) => b.name === req.recallName);
    if (targetBases.length === 0) {
      logger.warn("static::all 未找到指定思绪集", { recallName: req.recallName });
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
          recallName: base.name || "未知思绪集",
          recallId: base.id,
          matchType: "key",
          highlight: null,
          entry: {
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
        } as RecallResult);
      }
    } catch (err) {
      logger.warn("static::all 加载思绪集条目失败", { recallId: base.id, err });
    }
  }

  return results;
}
