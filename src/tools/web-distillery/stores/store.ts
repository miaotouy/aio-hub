import { defineStore } from "pinia";
import type { FetchResult, ApiInfo, SiteRecipe } from "../types";

interface WebDistilleryState {
  url: string;
  result: FetchResult | null;
  isLoading: boolean;
  isInteractiveMode: boolean; // 是否处于 Level 2 交互模式
  currentRecipe: Partial<SiteRecipe> | null; // 当前编辑中的配方
  error: string | null;
  cookieProfiles: string[];
  discoveredApis: ApiInfo[];
  extractionRules: {
    include: string[];
    exclude: string[];
  };
}

export const useWebDistilleryStore = defineStore("web-distillery", {
  state: (): WebDistilleryState => ({
    url: "",
    result: null,
    isLoading: false,
    isInteractiveMode: false,
    currentRecipe: null,
    error: null,
    cookieProfiles: [],
    discoveredApis: [],
    extractionRules: {
      include: [],
      exclude: [],
    },
  }),

  actions: {
    setInteractiveMode(active: boolean) {
      this.isInteractiveMode = active;
    },

    setCurrentRecipe(recipe: Partial<SiteRecipe> | null) {
      this.currentRecipe = recipe;
    },
    setUrl(url: string) {
      this.url = url;
    },

    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    setResult(result: FetchResult) {
      this.result = result;
      this.error = null;
    },

    setError(error: string) {
      this.error = error;
      this.result = null;
    },

    addDiscoveredApi(api: ApiInfo) {
      if (!this.discoveredApis.find((a) => a.url === api.url)) {
        this.discoveredApis.push(api);
      }
    },

    clearDiscoveredApis() {
      this.discoveredApis = [];
    },
  },
});
