import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { SearchResult, SearchFilters } from "../types/search";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { debounce } from "lodash-es";

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
      const searchResults = await invoke<SearchResult[]>("kb_search", {
        query: query.value,
        filters: filters.value,
        engineId: filters.value.engineId,
      });
      results.value = searchResults;
      logger.info("搜索完成", { query: query.value, count: results.value.length });
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