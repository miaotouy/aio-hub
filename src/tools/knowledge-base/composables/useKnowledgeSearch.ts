import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult, SearchFilters } from "../types/search";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { debounce } from "lodash-es";
import { preprocessQuery } from "../utils/queryPreProcessor";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";

const logger = createModuleLogger("knowledge-base/search");
const errorHandler = createModuleErrorHandler("knowledge-base/search");

export function useKnowledgeSearch() {
  const query = ref("");
  const results = ref<SearchResult[]>([]);
  const loading = ref(false);
  const filters = ref<SearchFilters>({
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
      const kbStore = useKnowledgeBaseStore();
      const { cleanedQuery, matchedTags } = preprocessQuery(query.value, {
        tagPool: kbStore.globalStats.allDiscoveredTags,
      });

      // 合并预处理提取的标签到过滤器
      const mergedFilters: SearchFilters = {
        ...filters.value,
        tags: matchedTags.length > 0
          ? [...new Set([...(filters.value.tags || []), ...matchedTags])]
          : filters.value.tags,
      };

      const searchResults = await invoke<SearchResult[]>("kb_search", {
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
      errorHandler.error(error, "知识库检索失败");
    } finally {
      loading.value = false;
    }
  };

  const vectorSearch = async (vector: number[], kbId: string, model: string) => {
    loading.value = true;
    try {
      const searchResults = await invoke<SearchResult[]>("kb_search_by_vector", {
        kbId,
        vector,
        model,
        topK: filters.value.limit || 10,
      });
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