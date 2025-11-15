/**
 * 富文本渲染器测试工具的状态管理
 */

import { defineStore } from "pinia";
import { ref, reactive, watch } from "vue";
import type { TesterConfig, RendererVersionMeta, LlmThinkRule } from "./types";
import { RendererVersion } from "./types";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("rich-text-renderer/store");

/**
 * 可用的渲染器版本列表
 */
export const availableVersions: RendererVersionMeta[] = [
  {
    version: RendererVersion.V1_MARKDOWN_IT,
    name: "V1 - Markdown-it",
    description: "基于 markdown-it 的增量解析器，支持稳定区/待定区分离",
    enabled: true,
    tags: ["稳定", "增量"],
  },
  {
    version: RendererVersion.V2_CUSTOM_PARSER,
    name: "V2 - Custom Parser",
    description: "基于 CustomParser 的混合解析器，支持复杂 HTML 嵌套",
    enabled: true,
    tags: ["实验性", "HTML"],
  },
  {
    version: RendererVersion.PURE_MARKDOWN_IT,
    name: "Pure Markdown-it",
    description: "纯 markdown-it 渲染，无增量优化（规划中）",
    enabled: false,
    tags: ["规划中"],
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
    selectedPreset: "",
    streamEnabled: true,
    streamSpeed: 100,
    initialDelay: 500,
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
    llmThinkRules: defaultLlmThinkRules,
  }),
});

export const useRichTextRendererStore = defineStore("richTextRenderer", () => {
  // ===== State =====
  const isInputCollapsed = ref(false);
  const selectedPreset = ref("");
  const inputContent = ref("");
  const streamEnabled = ref(true);
  const streamSpeed = ref(100);
  const initialDelay = ref(500);
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
  const llmThinkRules = ref<LlmThinkRule[]>([...defaultLlmThinkRules]);

  // 是否已加载配置
  const isConfigLoaded = ref(false);

  // ===== Actions =====

  /**
   * 从文件加载配置
   */
  async function loadConfig(): Promise<void> {
    try {
      logger.info("开始加载配置");
      const config = await configManager.load();

      // 应用配置到状态
      isInputCollapsed.value = config.isInputCollapsed;
      selectedPreset.value = config.selectedPreset;
      inputContent.value = config.inputContent;
      streamEnabled.value = config.streamEnabled;
      streamSpeed.value = config.streamSpeed;
      initialDelay.value = config.initialDelay;
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
      llmThinkRules.value = config.llmThinkRules || [...defaultLlmThinkRules];

      isConfigLoaded.value = true;
      logger.info("配置加载成功");
    } catch (error) {
      logger.error("加载配置失败", error);
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
        selectedPreset: selectedPreset.value,
        inputContent: inputContent.value,
        streamEnabled: streamEnabled.value,
        streamSpeed: streamSpeed.value,
        initialDelay: initialDelay.value,
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
        llmThinkRules: llmThinkRules.value,
      };

      await configManager.save(config);
      logger.debug("配置保存成功");
    } catch (error) {
      logger.error("保存配置失败", error);
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
      selectedPreset: selectedPreset.value,
      inputContent: inputContent.value,
      streamEnabled: streamEnabled.value,
      streamSpeed: streamSpeed.value,
      initialDelay: initialDelay.value,
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
      llmThinkRules: llmThinkRules.value,
    };

    debouncedSave(config);
  }

  /**
   * 重置为默认配置
   */
  function resetConfig(): void {
    isInputCollapsed.value = false;
    selectedPreset.value = "";
    inputContent.value = "";
    streamEnabled.value = true;
    streamSpeed.value = 100;
    initialDelay.value = 500;
    fluctuationEnabled.value = false;
    delayFluctuation.min = 50;
    delayFluctuation.max = 200;
    charsFluctuation.min = 1;
    charsFluctuation.max = 10;
    autoScroll.value = true;
    visualizeBlockStatus.value = false;
    rendererVersion.value = RendererVersion.V1_MARKDOWN_IT;
    llmThinkRules.value = [...defaultLlmThinkRules];

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
      selectedPreset,
      inputContent,
      streamEnabled,
      streamSpeed,
      initialDelay,
      fluctuationEnabled,
      () => delayFluctuation.min,
      () => delayFluctuation.max,
      () => charsFluctuation.min,
      () => charsFluctuation.max,
      autoScroll,
      visualizeBlockStatus,
      rendererVersion,
      llmThinkRules,
    ],
    () => {
      autoSaveConfig();
    },
    { deep: true }
  );

  return {
    // State
    isInputCollapsed,
    selectedPreset,
    inputContent,
    streamEnabled,
    streamSpeed,
    initialDelay,
    fluctuationEnabled,
    delayFluctuation,
    charsFluctuation,
    autoScroll,
    visualizeBlockStatus,
    rendererVersion,
    llmThinkRules,
    isConfigLoaded,

    // Actions
    loadConfig,
    saveConfig,
    resetConfig,
    addLlmThinkRule,
    updateLlmThinkRule,
    removeLlmThinkRule,
    resetLlmThinkRules,
  };
});
