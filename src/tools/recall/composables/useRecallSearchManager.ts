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
import { useRecallCollectionStore } from "../stores/recallCollectionStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { type RecallResult } from "../types/search";
import { debounce } from "lodash-es";
import { getPureModelId, getProfileId } from "@/utils/modelIdUtils";
import {
  SearchOrchestrator,
  IndexingOrchestrator,
  VectorSyncManager,
  type CoverageData,
} from "../logic/orchestrator";

export function useRecallSearchManager() {
  const recallStore = useRecallCollectionStore();
  const { profiles } = useLlmProfiles();

  // 初始化编排器链
  const indexOrchestrator = new IndexingOrchestrator({
    requestSettings: recallStore.config.embeddingRequestSettings,
  });
  const syncManager = new VectorSyncManager(indexOrchestrator);
  const searchOrchestrator = new SearchOrchestrator(
    {
      requestSettings: recallStore.config.embeddingRequestSettings,
    },
    syncManager
  );

  const results = ref<RecallResult[]>([]);
  const loading = ref(false);
  const lastQuery = ref("");

  /**
   * 执行检索
   */
  const search = async (params: {
    query: string;
    engineId?: string;
    recallIds?: string[];
    embeddingModel?: string;
    extraFilters?: Record<string, any>;
    skipCoverageCheck?: boolean;
    // UI 交互回调
    onCoverageRequired?: (
      data: CoverageData
    ) => Promise<"cancel" | "fill" | "ignore">;
    onProgress?: (current: number, total: number) => void;
  }) => {
    const {
      query,
      engineId = "keyword",
      recallIds = params.recallIds ||
        (recallStore.activeBaseId ? [recallStore.activeBaseId] : []),
      embeddingModel = recallStore.config.defaultEmbeddingModel,
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
        texture: recallStore.config.vectorIndex?.texture,
        refractionIndex: recallStore.config.vectorIndex?.refractionIndex,
        k1: recallStore.config.vectorIndex?.k1,
        b: recallStore.config.vectorIndex?.b,
        ...(extraFilters || {}),
      };

      const searchResults = await searchOrchestrator.search({
        query,
        engineId,
        recallIds,
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
