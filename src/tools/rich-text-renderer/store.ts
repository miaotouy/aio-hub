/**
 * 富文本渲染器测试工具的状态管理
 */

import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";
import type {
  TesterConfig,
  RendererVersionMeta,
  LlmThinkRule,
  RichTextRendererStyleOptions,
  CopyOptions,
} from "./types";
import { RendererVersion } from "./types";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("rich-text-renderer/store");
const errorHandler = createModuleErrorHandler("rich-text-renderer/store");

/**
 * 可用的渲染器版本列表
 */
export const availableVersions: RendererVersionMeta[] = [
  {
    version: RendererVersion.V1_MARKDOWN_IT,
    name: "V1 - Markdown-it",
    description: "基于 markdown-it 的增量解析器，支持稳定区/待定区分离（不支持 LLM 思考块）",
    enabled: true,
    tags: ["基础", "增量"],
  },
  {
    version: RendererVersion.V2_CUSTOM_PARSER,
    name: "V2 - Custom Parser",
    description: "自研AST解析器，支持复杂 HTML 嵌套和 LLM 思考块，以及更多高级功能",
    enabled: true,
    tags: ["高级", "HTML", "思考块"],
  },
  {
    version: RendererVersion.PURE_MARKDOWN_IT,
    name: "Pure Markdown-it",
    description: "纯 markdown-it 渲染，无增量优化",
    enabled: true,
    tags: ["Markdown-it"],
  },
  {
    version: RendererVersion.HYBRID_V3,
    name: "Hybrid V3",
    description: "混合策略 V3 版本（规划中）",
    enabled: false,
    tags: ["规划中"],
  },
];

/**
 * 默认的 LLM 思考规则配置
 */
export const defaultLlmThinkRules: LlmThinkRule[] = [
  {
    id: "standard-think",
    kind: "xml_tag",
    tagName: "think",
    displayName: "思考过程",
    collapsedByDefault: true,
  },
  {
    id: "gugu-think",
    kind: "xml_tag",
    tagName: "guguthink",
    displayName: "咕咕的思考",
    collapsedByDefault: false,
  },
];

// 创建配置管理器
const configManager = createConfigManager<TesterConfig>({
  moduleName: "rich-text-renderer",
  fileName: "tester-config.json",
  version: "1.0.0",
  debounceDelay: 1000,
  createDefault: () => ({
    version: "1.0.0",
    isInputCollapsed: false,
    isConfigCollapsed: false,
    layoutMode: "split",
    selectedPreset: "",
    streamEnabled: true,
    syncInputProgress: false,
    streamSpeed: 100,
    initialDelay: 500,
    throttleMs: 80,
    fluctuationEnabled: false,
    delayFluctuation: {
      min: 50,
      max: 200,
    },
    charsFluctuation: {
      min: 1,
      max: 10,
    },
    inputContent: "",
    autoScroll: true,
    visualizeBlockStatus: false,
    rendererVersion: RendererVersion.V1_MARKDOWN_IT,
    defaultRenderHtml: false,
    simulateMeta: false,
    selectedTokenizer: "gpt4o",
    llmThinkRules: defaultLlmThinkRules,
    richTextStyleOptions: {},
    copyOptions: {
      includeConfig: true,
      includeOriginal: true,
      includeHtml: true,
      includeNormalizedOriginal: true,
      includeNormalizedRendered: true,
      includeComparison: true,
      includeStyleConfig: true,
    },
  }),
});

export const useRichTextRendererStore = defineStore("richTextRenderer", () => {
  // ===== 状态 =====
  const isInputCollapsed = ref(false);
  const isConfigCollapsed = ref(false);
  const layoutMode = ref<"split" | "input-only" | "preview-only">("split");
  const selectedPreset = ref("");
  const inputContent = ref("");
  const streamEnabled = ref(true);
  const syncInputProgress = ref(false);
  const streamSpeed = ref(100);
  const initialDelay = ref(500);
  const throttleMs = ref(80);
  const fluctuationEnabled = ref(false);
  const delayFluctuation = reactive({
    min: 50,
    max: 200,
  });
  const charsFluctuation = reactive({
    min: 1,
    max: 10,
  });
  const autoScroll = ref(true);
  const visualizeBlockStatus = ref(false);
  const rendererVersion = ref<RendererVersion>(RendererVersion.V1_MARKDOWN_IT);
  const defaultRenderHtml = ref(false);
  const simulateMeta = ref(false);
  const selectedTokenizer = ref("gpt4o");
  const llmThinkRules = ref<LlmThinkRule[]>([...defaultLlmThinkRules]);
  const richTextStyleOptions = ref<RichTextRendererStyleOptions>({});
  const copyOptions = reactive<CopyOptions>({
    includeConfig: true,
    includeOriginal: true,
    includeHtml: true,
    includeNormalizedOriginal: true,
    includeNormalizedRendered: true,
    includeComparison: true,
    includeStyleConfig: true,
  });

  // 是否已加载配置
  const isConfigLoaded = ref(false);

  // ===== 操作 =====

  /**
   * 从文件加载配置
   * @param force 是否强制重新加载
   */
  async function loadConfig(force = false): Promise<void> {
    // 如果已经加载过且不是强制加载，直接返回
    if (isConfigLoaded.value && !force) {
      return;
    }

    try {
      logger.info("开始加载配置");
      const config = await configManager.load();

      // 应用配置到状态
      isInputCollapsed.value = config.isInputCollapsed;
      isConfigCollapsed.value = config.isConfigCollapsed ?? false;
      layoutMode.value = config.layoutMode ?? "split";
      selectedPreset.value = config.selectedPreset;
      inputContent.value = config.inputContent;
      streamEnabled.value = config.streamEnabled;
      syncInputProgress.value = config.syncInputProgress ?? false;
      streamSpeed.value = config.streamSpeed;
      initialDelay.value = config.initialDelay;
      throttleMs.value = config.throttleMs ?? 80;
      fluctuationEnabled.value = config.fluctuationEnabled;
      delayFluctuation.min = config.delayFluctuation.min;
      delayFluctuation.max = config.delayFluctuation.max;

      // 修正 charsFluctuation 的值，确保在有效范围内（token模式：1-20）
      charsFluctuation.min = Math.max(1, Math.min(config.charsFluctuation.min, 20));
      charsFluctuation.max = Math.max(1, Math.min(config.charsFluctuation.max, 20));

      // 确保 min <= max
      if (charsFluctuation.min > charsFluctuation.max) {
        charsFluctuation.min = 1;
        charsFluctuation.max = 10;
      }

      autoScroll.value = config.autoScroll;
      visualizeBlockStatus.value = config.visualizeBlockStatus;
      rendererVersion.value = config.rendererVersion;
      defaultRenderHtml.value = config.defaultRenderHtml ?? false;
      simulateMeta.value = config.simulateMeta ?? false;
      selectedTokenizer.value = config.selectedTokenizer ?? "gpt4o";
      llmThinkRules.value = config.llmThinkRules || [...defaultLlmThinkRules];
      richTextStyleOptions.value = config.richTextStyleOptions || {};
      if (config.copyOptions) {
        copyOptions.includeConfig = config.copyOptions.includeConfig;
        copyOptions.includeOriginal = config.copyOptions.includeOriginal;
        copyOptions.includeHtml = config.copyOptions.includeHtml;
        copyOptions.includeNormalizedOriginal = config.copyOptions.includeNormalizedOriginal;
        copyOptions.includeNormalizedRendered = config.copyOptions.includeNormalizedRendered;
        copyOptions.includeComparison = config.copyOptions.includeComparison;
        copyOptions.includeStyleConfig = config.copyOptions.includeStyleConfig ?? true; // 默认为 true
      }

      isConfigLoaded.value = true;
      logger.info("配置加载成功");
    } catch (error) {
      errorHandler.error(error, "加载配置失败", { showToUser: false });
      // 加载失败时使用默认值（已在 ref 初始化时设置）
      isConfigLoaded.value = true;
    }
  }

  /**
   * 保存配置到文件
   */
  async function saveConfig(): Promise<void> {
    try {
      const config: TesterConfig = {
        version: "1.0.0",
        isInputCollapsed: isInputCollapsed.value,
        isConfigCollapsed: isConfigCollapsed.value,
        layoutMode: layoutMode.value,
        selectedPreset: selectedPreset.value,
        inputContent: inputContent.value,
        streamEnabled: streamEnabled.value,
        syncInputProgress: syncInputProgress.value,
        streamSpeed: streamSpeed.value,
        initialDelay: initialDelay.value,
        throttleMs: throttleMs.value,
        fluctuationEnabled: fluctuationEnabled.value,
        delayFluctuation: {
          min: delayFluctuation.min,
          max: delayFluctuation.max,
        },
        charsFluctuation: {
          min: charsFluctuation.min,
          max: charsFluctuation.max,
        },
        autoScroll: autoScroll.value,
        visualizeBlockStatus: visualizeBlockStatus.value,
        rendererVersion: rendererVersion.value,
        defaultRenderHtml: defaultRenderHtml.value,
        simulateMeta: simulateMeta.value,
        selectedTokenizer: selectedTokenizer.value,
        llmThinkRules: llmThinkRules.value,
        richTextStyleOptions: richTextStyleOptions.value,
        copyOptions: { ...copyOptions },
      };

      await configManager.save(config);
      logger.debug("配置保存成功");
    } catch (error) {
      errorHandler.error(error, "保存配置失败", { showToUser: false });
    }
  }

  /**
   * 创建防抖保存函数
   */
  const debouncedSave = configManager.saveDebounced;

  /**
   * 自动保存配置（防抖）
   */
  function autoSaveConfig(): void {
    if (!isConfigLoaded.value) return;

    const config: TesterConfig = {
      version: "1.0.0",
      isInputCollapsed: isInputCollapsed.value,
      isConfigCollapsed: isConfigCollapsed.value,
      layoutMode: layoutMode.value,
      selectedPreset: selectedPreset.value,
      inputContent: inputContent.value,
      streamEnabled: streamEnabled.value,
      syncInputProgress: syncInputProgress.value,
      streamSpeed: streamSpeed.value,
      initialDelay: initialDelay.value,
      throttleMs: throttleMs.value,
      fluctuationEnabled: fluctuationEnabled.value,
      delayFluctuation: {
        min: delayFluctuation.min,
        max: delayFluctuation.max,
      },
      charsFluctuation: {
        min: charsFluctuation.min,
        max: charsFluctuation.max,
      },
      autoScroll: autoScroll.value,
      visualizeBlockStatus: visualizeBlockStatus.value,
      rendererVersion: rendererVersion.value,
      defaultRenderHtml: defaultRenderHtml.value,
      simulateMeta: simulateMeta.value,
      selectedTokenizer: selectedTokenizer.value,
      llmThinkRules: llmThinkRules.value,
      richTextStyleOptions: richTextStyleOptions.value,
      copyOptions: { ...copyOptions },
    };

    debouncedSave(config);
  }

  /**
   * 重置为默认配置
   */
  function resetConfig(): void {
    isInputCollapsed.value = false;
    isConfigCollapsed.value = false;
    layoutMode.value = "split";
    selectedPreset.value = "";
    inputContent.value = "";
    streamEnabled.value = true;
    syncInputProgress.value = false;
    streamSpeed.value = 100;
    initialDelay.value = 500;
    throttleMs.value = 80;
    fluctuationEnabled.value = false;
    delayFluctuation.min = 50;
    delayFluctuation.max = 200;
    charsFluctuation.min = 1;
    charsFluctuation.max = 10;
    autoScroll.value = true;
    visualizeBlockStatus.value = false;
    rendererVersion.value = RendererVersion.V1_MARKDOWN_IT;
    defaultRenderHtml.value = false;
    simulateMeta.value = false;
    selectedTokenizer.value = "gpt4o";
    llmThinkRules.value = [...defaultLlmThinkRules];
    richTextStyleOptions.value = {};
    copyOptions.includeConfig = true;
    copyOptions.includeOriginal = true;
    copyOptions.includeHtml = true;
    copyOptions.includeNormalizedOriginal = true;
    copyOptions.includeNormalizedRendered = true;
    copyOptions.includeComparison = true;
    copyOptions.includeStyleConfig = true;

    saveConfig();
  }

  /**
   * 添加新的思考规则
   */
  function addLlmThinkRule(rule: LlmThinkRule): void {
    llmThinkRules.value.push(rule);
  }

  /**
   * 更新思考规则
   */
  function updateLlmThinkRule(ruleId: string, updates: Partial<LlmThinkRule>): void {
    const index = llmThinkRules.value.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      llmThinkRules.value[index] = { ...llmThinkRules.value[index], ...updates };
    }
  }

  /**
   * 删除思考规则
   */
  function removeLlmThinkRule(ruleId: string): void {
    llmThinkRules.value = llmThinkRules.value.filter((r) => r.id !== ruleId);
  }

  /**
   * 重置思考规则为默认值
   */
  function resetLlmThinkRules(): void {
    llmThinkRules.value = [...defaultLlmThinkRules];
  }

  // ===== 监听状态变化自动保存 =====

  // 在配置加载完成后，监听所有状态变化并自动保存
  watch(
    [
      isInputCollapsed,
      isConfigCollapsed,
      layoutMode,
      selectedPreset,
      inputContent,
      streamEnabled,
      syncInputProgress,
      streamSpeed,
      initialDelay,
      throttleMs,
      fluctuationEnabled,
      () => delayFluctuation.min,
      () => delayFluctuation.max,
      () => charsFluctuation.min,
      () => charsFluctuation.max,
      autoScroll,
      visualizeBlockStatus,
      rendererVersion,
      defaultRenderHtml,
      simulateMeta,
      selectedTokenizer,
      llmThinkRules,
      richTextStyleOptions,
      () => copyOptions.includeConfig,
      () => copyOptions.includeOriginal,
      () => copyOptions.includeHtml,
      () => copyOptions.includeNormalizedOriginal,
      () => copyOptions.includeNormalizedRendered,
      () => copyOptions.includeComparison,
      () => copyOptions.includeStyleConfig,
    ],
    () => {
      autoSaveConfig();
    },
    { deep: true }
  );

  return {
    // 状态
    isInputCollapsed,
    isConfigCollapsed,
    layoutMode,
    selectedPreset,
    inputContent,
    streamEnabled,
    syncInputProgress,
    streamSpeed,
    initialDelay,
    throttleMs,
    fluctuationEnabled,
    delayFluctuation,
    charsFluctuation,
    autoScroll,
    visualizeBlockStatus,
    rendererVersion,
    defaultRenderHtml,
    simulateMeta,
    selectedTokenizer,
    llmThinkRules,
    richTextStyleOptions,
    copyOptions,
    isConfigLoaded,

    // 操作
    loadConfig,
    saveConfig,
    resetConfig,
    addLlmThinkRule,
    updateLlmThinkRule,
    removeLlmThinkRule,
    resetLlmThinkRules,
  };
});
