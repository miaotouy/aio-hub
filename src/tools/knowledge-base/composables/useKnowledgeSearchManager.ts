import { ref } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { type SearchResult } from "../types/search";
import { debounce } from "lodash-es";
import { getPureModelId, getProfileId } from "@/utils/modelIdUtils";
import { SearchOrchestrator, IndexingOrchestrator, VectorSyncManager, type CoverageData } from "../logic/orchestrator";

export function useKnowledgeSearchManager() {
  const kbStore = useKnowledgeBaseStore();
  const { profiles } = useLlmProfiles();

  // 初始化编排器链
  const indexOrchestrator = new IndexingOrchestrator({
    requestSettings: kbStore.config.embeddingRequestSettings,
  });
  const syncManager = new VectorSyncManager(indexOrchestrator);
  const searchOrchestrator = new SearchOrchestrator(
    {
      requestSettings: kbStore.config.embeddingRequestSettings,
    },
    syncManager
  );

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
    onCoverageRequired?: (data: CoverageData) => Promise<"cancel" | "fill" | "ignore">;
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
    } = params;

    if (!query.trim()) {
      results.value = [];
      return [];
    }

    loading.value = true;
    lastQuery.value = query;

    try {
      const modelId = getPureModelId(embeddingModel);
      const profileId = getProfileId(embeddingModel);
      const profile = profiles.value.find((p) => p.id === profileId);

      // 组装动态参数
      const finalExtraFilters = {
        texture: kbStore.config.vectorIndex?.texture,
        refractionIndex: kbStore.config.vectorIndex?.refractionIndex,
        k1: kbStore.config.vectorIndex?.k1,
        b: kbStore.config.vectorIndex?.b,
        ...(extraFilters || {}),
      };

      const searchResults = await searchOrchestrator.search({
        query,
        engineId,
        kbIds,
        modelId,
        profile,
        extraFilters: finalExtraFilters,
        skipPrep: skipCoverageCheck,
        onCoverageRequired,
      });

      results.value = searchResults;
      return searchResults;
    } catch (error) {
      console.error("搜索失败", error);
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
