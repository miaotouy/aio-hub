import { ref } from "vue";
import { knowledgeSearchManager } from "../core/KnowledgeSearchManager";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { SearchResult } from "../types/search";
import { debounce } from "lodash-es";

export function useKnowledgeSearchManager() {
  const kbStore = useKnowledgeBaseStore();
  const { enabledProfiles } = useLlmProfiles();

  const results = ref<SearchResult[]>([]);
  const loading = ref(false);
  const lastQuery = ref("");

  /**
   * 执行检索
   */
  const search = async (params: {
    query: string;
    engineId?: string;
    kbIds?: string[];
    embeddingModel?: string;
    extraFilters?: Record<string, any>;
    skipCoverageCheck?: boolean;
    // UI 交互回调
    onCoverageRequired?: (data: any) => Promise<"cancel" | "fill" | "ignore">;
    onProgress?: (current: number, total: number) => void;
  }) => {
    const {
      query,
      engineId = "keyword",
      kbIds = params.kbIds || (kbStore.activeBaseId ? [kbStore.activeBaseId] : []),
      embeddingModel = kbStore.config.defaultEmbeddingModel,
      extraFilters,
      skipCoverageCheck = false,
      onCoverageRequired,
      onProgress,
    } = params;

    if (!query.trim()) {
      results.value = [];
      return [];
    }

    loading.value = true;
    lastQuery.value = query;

    try {
      // 这里的 extraFilters 优先级：外部传入的参数 > 全局配置
      const finalExtraFilters = {
        texture: kbStore.config.vectorIndex?.texture,
        refractionIndex: kbStore.config.vectorIndex?.refractionIndex,
        k1: kbStore.config.vectorIndex?.k1,
        b: kbStore.config.vectorIndex?.b,
        ...(extraFilters || {}),
      };

      const searchResults = await knowledgeSearchManager.search(query, {
        engineId,
        kbIds,
        embeddingModel,
        enabledProfiles: enabledProfiles.value,
        extraFilters: finalExtraFilters,
        skipCoverageCheck,
        onCoverageRequired,
        onProgress,
      });

      results.value = searchResults;
      return searchResults;
    } catch (error) {
      // 核心错误已由 KnowledgeSearchManager 处理，这里可以做 UI 层的额外处理
      throw error;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 防抖检索
   */
  const debouncedSearch = debounce(search, 300);

  /**
   * 清除结果
   */
  const clearResults = () => {
    results.value = [];
    lastQuery.value = "";
  };

  return {
    results,
    loading,
    lastQuery,
    search,
    debouncedSearch,
    clearResults,
  };
}
