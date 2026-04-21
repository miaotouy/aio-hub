import { defineStore } from "pinia";
import type { FetchResult, ApiInfo, SiteRecipe, ActionStep } from "../types";
import { createConfigManager } from "@/utils/configManager";

interface WebDistilleryConfig {
  lastUrl: string;
  extractionRules: {
    include: string[];
    exclude: string[];
  };
  defaultFormat: "markdown" | "text" | "html" | "json";
}

interface WebDistilleryState {
  url: string;
  result: FetchResult | null;
  isLoading: boolean;
  activeTab: string; // 当前活跃的标签页
  currentRecipe: Partial<SiteRecipe> | null; // 当前编辑中的配方

  // 交互模式专属状态
  pickerMode: "idle" | "include" | "exclude" | "action";
  pickerActionIndex: number | null;
  hoveredElement: {
    selector: string;
    tagName: string;
    textPreview: string;
  } | null;
  recipeDraft: Partial<SiteRecipe> | null;
  isDraftDirty: boolean;
  livePreviewContent: string | null;
  livePreviewQuality: number;
  livePreviewLoading: boolean;
  cachedDomSnapshot: string | null;
  activeToolTab: "rules" | "actions" | "preview";

  error: string | null;
  cookieProfiles: string[];
  discoveredApis: ApiInfo[];
  extractionRules: {
    include: string[];
    exclude: string[];
  };
  isWebviewCreated: boolean;
}

const configManager = createConfigManager<WebDistilleryConfig>({
  moduleName: "web-distillery",
  fileName: "settings.json",
  createDefault: () => ({
    lastUrl: "",
    extractionRules: {
      include: [],
      exclude: [],
    },
    defaultFormat: "markdown",
  }),
});

export const useWebDistilleryStore = defineStore("web-distillery", {
  state: (): WebDistilleryState => ({
    url: "",
    result: null,
    isLoading: false,
    activeTab: "workbench",
    currentRecipe: null,

    // 交互模式初始状态
    pickerMode: "idle",
    pickerActionIndex: null,
    hoveredElement: null,
    recipeDraft: null,
    isDraftDirty: false,
    livePreviewContent: null,
    livePreviewQuality: 0,
    livePreviewLoading: false,
    cachedDomSnapshot: null,
    activeToolTab: "rules",

    error: null,
    cookieProfiles: [],
    discoveredApis: [],
    extractionRules: {
      include: [],
      exclude: [],
    },
    isWebviewCreated: false,
  }),

  actions: {
    async init() {
      const config = await configManager.load();
      this.url = config.lastUrl;
      this.extractionRules = config.extractionRules;
    },

    async saveConfig() {
      await configManager.save({
        lastUrl: this.url,
        extractionRules: this.extractionRules,
        defaultFormat: (this.result?.format as any) || "markdown",
      });
    },

    /** 切换到交互模式 */
    switchToInteractive() {
      this.activeTab = "interactive";
      if (!this.recipeDraft) {
        this.initRecipeDraft();
      }
    },

    initRecipeDraft() {
      const domain = this.url ? new URL(this.url).hostname : "";
      this.recipeDraft = {
        name: domain || "未命名配方",
        domain: domain,
        pathPattern: "*",
        extractSelectors: [],
        excludeSelectors: [],
        actions: [],
      };
      this.isDraftDirty = false;
    },

    setCurrentRecipe(recipe: Partial<SiteRecipe> | null) {
      this.currentRecipe = recipe;
    },

    setPickerMode(mode: "idle" | "include" | "exclude" | "action", actionIndex: number | null = null) {
      this.pickerMode = mode;
      this.pickerActionIndex = actionIndex;
    },

    setHoveredElement(element: { selector: string; tagName: string; textPreview: string } | null) {
      this.hoveredElement = element;
    },

    updateRecipeDraft(updates: Partial<SiteRecipe>) {
      if (this.recipeDraft) {
        this.recipeDraft = { ...this.recipeDraft, ...updates };
        this.isDraftDirty = true;
      }
    },

    setUrl(url: string) {
      this.url = url;
      this.saveConfig();
    },

    setLoading(loading: boolean) {
      this.isLoading = loading;
    },

    setResult(result: FetchResult) {
      this.result = result;
      this.error = null;
      this.saveConfig();
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

    setWebviewCreated(created: boolean) {
      this.isWebviewCreated = created;
    },

    // =========== 动作序列管理 ===========

    /** 添加一个动作步骤 */
    addAction(step: ActionStep) {
      if (!this.recipeDraft) return;
      const draft = { ...this.recipeDraft };
      draft.actions = [...(draft.actions || []), step];
      this.recipeDraft = draft;
      this.isDraftDirty = true;
    },

    /** 删除一个动作步骤 */
    removeAction(index: number) {
      if (!this.recipeDraft?.actions) return;
      const draft = { ...this.recipeDraft };
      draft.actions = draft.actions!.filter((_, i) => i !== index);
      this.recipeDraft = draft;
      this.isDraftDirty = true;
    },

    /** 更新一个动作步骤 */
    updateAction(index: number, step: ActionStep) {
      if (!this.recipeDraft?.actions) return;
      const draft = { ...this.recipeDraft };
      draft.actions = [...draft.actions!];
      draft.actions[index] = step;
      this.recipeDraft = draft;
      this.isDraftDirty = true;
    },

    /** 重排动作序列 */
    reorderActions(fromIndex: number, toIndex: number) {
      if (!this.recipeDraft?.actions) return;
      const draft = { ...this.recipeDraft };
      const actions = [...draft.actions!];
      const [moved] = actions.splice(fromIndex, 1);
      actions.splice(toIndex, 0, moved);
      draft.actions = actions;
      this.recipeDraft = draft;
      this.isDraftDirty = true;
    },

    // =========== 实时预览 ===========

    /** 设置预览内容 */
    setLivePreview(content: string, quality: number) {
      this.livePreviewContent = content;
      this.livePreviewQuality = quality;
      this.livePreviewLoading = false;
    },

    /** 设置预览加载状态 */
    setLivePreviewLoading(loading: boolean) {
      this.livePreviewLoading = loading;
    },

    /** 缓存 DOM 快照 */
    setCachedDomSnapshot(html: string) {
      this.cachedDomSnapshot = html;
    },
  },
});
