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

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { RecallResult, RecallSearchFilters } from "../types/search";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { debounce } from "lodash-es";
import { preprocessQuery } from "../utils/queryPreProcessor";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";

const logger = createModuleLogger("recall/search");
const errorHandler = createModuleErrorHandler("recall/search");

export function useRecallSearch() {
  const query = ref("");
  const results = ref<RecallResult[]>([]);
  const loading = ref(false);
  const filters = ref<RecallSearchFilters>({
    limit: 20,
    enabledOnly: true,
  });

  const search = async () => {
    if (!query.value.trim()) {
      results.value = [];
      return;
    }

    loading.value = true;
    try {
      // 查询预处理：清洗、分词、停用词过滤、Tag 匹配
      const recallStore = useRecallCollectionStore();
      const { cleanedQuery, matchedTags } = preprocessQuery(query.value, {
        tagPool: recallStore.globalStats.allDiscoveredTags,
      });

      // 合并预处理提取的标签到过滤器
      const mergedFilters: RecallSearchFilters = {
        ...filters.value,
        tags:
          matchedTags.length > 0
            ? [...new Set([...(filters.value.tags || []), ...matchedTags])]
            : filters.value.tags,
      };

      const searchResults = await invoke<RecallResult[]>("recall_search", {
        query: cleanedQuery,
        filters: mergedFilters,
        engineId: filters.value.engineId,
      });
      results.value = searchResults;
      logger.info("搜索完成", {
        originalQuery: query.value,
        cleanedQuery,
        matchedTags,
        count: results.value.length,
      });
      return searchResults;
    } catch (error) {
      errorHandler.error(error, "思绪集检索失败");
    } finally {
      loading.value = false;
    }
  };

  const vectorSearch = async (
    vector: number[],
    recallId: string,
    model: string
  ) => {
    loading.value = true;
    try {
      const searchResults = await invoke<RecallResult[]>(
        "recall_search_by_vector",
        {
          recallId,
          vector,
          model,
          topK: filters.value.limit || 10,
        }
      );
      results.value = searchResults;
      logger.info("向量检索完成", { count: results.value.length });
      return searchResults;
    } catch (error) {
      errorHandler.error(error, "向量检索失败");
    } finally {
      loading.value = false;
    }
  };

  const debouncedSearch = debounce(search, 300);

  return {
    query,
    results,
    loading,
    filters,
    search,
    vectorSearch,
    debouncedSearch,
  };
}
