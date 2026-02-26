import { defineStore } from "pinia";
import type { FetchResult, ApiInfo } from "../types";

interface WebDistilleryState {
  url: string;
  result: FetchResult | null;
  isLoading: boolean;
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
    error: null,
    cookieProfiles: [],
    discoveredApis: [],
    extractionRules: {
      include: [],
      exclude: [],
    },
  }),

  actions: {
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
