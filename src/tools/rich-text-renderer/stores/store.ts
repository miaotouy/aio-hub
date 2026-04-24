/**
 * 富文本渲染器测试工具的状态管理
 *
 * 使用单一 reactive 状态对象 + toRefs 导出，消除属性重复定义。
 * 每个属性只在 createDefaultState() 中定义一次。
 */

import { defineStore } from "pinia";
import { ref, reactive, watch, toRefs, toRaw } from "vue";
import type {
  TesterConfig,
  RendererVersionMeta,
  LlmThinkRule,
  RichTextRendererStyleOptions,
  CopyOptions,
} from "../types";
import type { ChatRegexConfig, ChatRegexRule } from "@/tools/llm-chat/types/chatRegex";
import { createDefaultChatRegexConfig } from "@/tools/llm-chat/types/chatRegex";
import { RendererVersion } from "../types";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { cloneDeep } from "lodash-es";

const logger = createModuleLogger("rich-text-renderer/store");
const errorHandler = createModuleErrorHandler("rich-text-renderer/store");

/**
 * 可用的渲染器版本列表
 */
export const availableVersions: RendererVersionMeta[] = [
  {
    version: RendererVersion.V1_MARKDOWN_IT,
    name: "V1 - Markdown-it",
    description: "【已过时】基于 markdown-it 的旧版解析器。功能受限，不支持思考块与工具调用，仅作参考",
    enabled: true,
    tags: ["基础", "过时", "不推荐"],
  },
  {
    version: RendererVersion.V2_CUSTOM_PARSER,
    name: "V2 - Custom Parser",
    description: "自研AST解析器，支持复杂 HTML 嵌套和 LLM 思考块，工具调用相关，以及更多高级功能",
    enabled: true,
    tags: ["高级", "HTML", "推荐"],
  },
  {
    version: RendererVersion.PURE_MARKDOWN_IT,
    name: "Pure Markdown-it",
    description: "纯 markdown-it 渲染，无增量优化，用作基准测试",
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

// ===== 唯一的默认值定义源 =====

/**
 * 创建默认的 store 状态（不含 version 字段）
 * 这是所有属性默认值的 **唯一定义源**，
 * loadConfig / saveConfig / resetConfig / watch 全部基于此推导。
 */
function createDefaultState() {
  return {
    isInputCollapsed: false,
    isConfigCollapsed: false,
    layoutMode: "split" as "split" | "input-only" | "preview-only",
    selectedPreset: "",
    streamEnabled: true,
    syncInputProgress: false,
    streamSpeed: 100,
    initialDelay: 500,
    throttleMs: 80,
    safetyGuardEnabled: true,
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
    smoothingEnabled: true,
    throttleEnabled: true,
    verboseLogging: false,
    autoScroll: true,
    visualizeBlockStatus: false,
    rendererVersion: RendererVersion.V1_MARKDOWN_IT as RendererVersion,
    defaultRenderHtml: false,
    defaultCodeBlockExpanded: false,
    defaultToolCallCollapsed: false,
    allowDangerousHtml: false,
    seamlessMode: false,
    enableCdnLocalizer: true,
    enableEnterAnimation: true,
    simulateMeta: false,
    selectedTokenizer: "gpt4o",
    profileType: "agent" as "agent" | "user",
    selectedProfileId: "",
    codeEditorEngine: "codemirror" as "monaco" | "codemirror",
    llmThinkRules: [...defaultLlmThinkRules] as LlmThinkRule[],
    richTextStyleOptions: {} as RichTextRendererStyleOptions,
    regexConfig: createDefaultChatRegexConfig() as ChatRegexConfig,
    copyOptions: {
      includeConfig: true,
      includeOriginal: true,
      includeHtml: true,
      includeNormalizedOriginal: true,
      includeNormalizedRendered: true,
      includeComparison: true,
      includeStyleConfig: true,
      includeBlockInfo: false,
    } as CopyOptions,
  };
}

/** Store 状态类型（由 createDefaultState 推导） */
type StoreState = ReturnType<typeof createDefaultState>;

/**
 * 创建完整的 TesterConfig（含 version）
 * 用于 configManager 的 createDefault
 */
function createDefaultConfig(): TesterConfig {
  return {
    version: "1.0.0",
    ...createDefaultState(),
  };
}

// 创建配置管理器
const configManager = createConfigManager<TesterConfig>({
  moduleName: "rich-text-renderer",
  fileName: "tester-config.json",
  version: "1.0.0",
  debounceDelay: 1000,
  createDefault: createDefaultConfig,
});

export const useRichTextRendererStore = defineStore("richTextRenderer", () => {
  // ===== 单一状态对象 =====
  const state = reactive(createDefaultState());

  // 是否已加载配置
  const isConfigLoaded = ref(false);

  // ===== 内部工具函数 =====

  /**
   * 将加载的配置应用到 state，缺失字段用默认值回退
   */
  function applyConfig(config: TesterConfig): void {
    const defaults = createDefaultState();

    // 逐键合并，optional 字段用 ?? 回退到默认值
    for (const key of Object.keys(defaults) as (keyof StoreState)[]) {
      const configValue = (config as unknown as Record<string, unknown>)[key];
      const defaultValue = defaults[key];

      if (key === "delayFluctuation" || key === "charsFluctuation" || key === "copyOptions") {
        // 嵌套对象: 逐属性合并
        const target = state[key] as Record<string, unknown>;
        const source = (configValue ?? defaultValue) as Record<string, unknown>;
        const fallback = defaultValue as Record<string, unknown>;
        for (const subKey of Object.keys(fallback)) {
          target[subKey] = source[subKey] ?? fallback[subKey];
        }
      } else {
        // 简单值: 直接赋值
        (state as Record<string, unknown>)[key] = configValue ?? defaultValue;
      }
    }

    // 特殊校验: charsFluctuation 范围限制（token模式：1-20）
    state.charsFluctuation.min = Math.max(1, Math.min(state.charsFluctuation.min, 20));
    state.charsFluctuation.max = Math.max(1, Math.min(state.charsFluctuation.max, 20));
    if (state.charsFluctuation.min > state.charsFluctuation.max) {
      state.charsFluctuation.min = 1;
      state.charsFluctuation.max = 10;
    }
  }

  /**
   * 将当前 state 序列化为 TesterConfig 快照
   */
  function toSnapshot(): TesterConfig {
    return {
      version: "1.0.0",
      ...cloneDeep(toRaw(state)),
    };
  }

  // ===== 操作 =====

  /**
   * 从文件加载配置
   * @param force 是否强制重新加载
   */
  async function loadConfig(force = false): Promise<void> {
    if (isConfigLoaded.value && !force) {
      return;
    }

    try {
      logger.info("开始加载配置");
      const config = await configManager.load();
      applyConfig(config);
      isConfigLoaded.value = true;
      logger.info("配置加载成功");
    } catch (error) {
      errorHandler.handle(error, { userMessage: "加载配置失败", showToUser: false });
      // 加载失败时使用默认值（已在 reactive 初始化时设置）
      isConfigLoaded.value = true;
    }
  }

  /**
   * 保存配置到文件
   */
  async function saveConfig(): Promise<void> {
    try {
      await configManager.save(toSnapshot());
      logger.debug("配置保存成功");
    } catch (error) {
      errorHandler.handle(error, { userMessage: "保存配置失败", showToUser: false });
    }
  }

  /**
   * 自动保存配置（防抖）
   */
  function autoSaveConfig(): void {
    if (!isConfigLoaded.value) return;
    configManager.saveDebounced(toSnapshot());
  }

  /**
   * 重置为默认配置
   */
  function resetConfig(): void {
    const defaults = createDefaultState();
    // 简单值直接赋值
    for (const key of Object.keys(defaults) as (keyof StoreState)[]) {
      if (key === "delayFluctuation" || key === "charsFluctuation" || key === "copyOptions") {
        // 嵌套对象: 逐属性赋值保持 reactive 引用
        const target = state[key] as Record<string, unknown>;
        const source = defaults[key] as Record<string, unknown>;
        for (const subKey of Object.keys(source)) {
          target[subKey] = source[subKey];
        }
      } else {
        (state as Record<string, unknown>)[key] = (defaults as Record<string, unknown>)[key];
      }
    }
    saveConfig();
  }

  /**
   * 添加新的思考规则
   */
  function addLlmThinkRule(rule: LlmThinkRule): void {
    state.llmThinkRules.push(rule);
  }

  /**
   * 更新思考规则
   */
  function updateLlmThinkRule(ruleId: string, updates: Partial<LlmThinkRule>): void {
    const index = state.llmThinkRules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      state.llmThinkRules[index] = { ...state.llmThinkRules[index], ...updates };
    }
  }

  /**
   * 删除思考规则
   */
  function removeLlmThinkRule(ruleId: string): void {
    state.llmThinkRules = state.llmThinkRules.filter((r) => r.id !== ruleId);
  }

  /**
   * 重置思考规则为默认值
   */
  function resetLlmThinkRules(): void {
    state.llmThinkRules = [...defaultLlmThinkRules];
  }

  /**
   * 获取当前生效的正则规则列表（扁平化）
   * 仅包含已启用预设中的已启用规则，且按顺序排列
   */
  function getActiveRegexRules(): ChatRegexRule[] {
    if (!state.regexConfig?.presets) return [];

    return state.regexConfig.presets
      .filter((preset) => preset.enabled)
      .flatMap((preset) => preset.rules)
      .filter((rule) => rule.enabled);
  }

  // ===== 监听状态变化自动保存 =====
  // 只需 deep watch 一个对象，而非逐个列出
  watch(
    () => state,
    () => {
      autoSaveConfig();
    },
    { deep: true },
  );

  // ===== 导出 =====
  // 使用 toRefs 保持对外 API 完全兼容（store.xxx 的访问方式不变）
  return {
    // 状态（toRefs 解构，保持响应式）
    ...toRefs(state),
    isConfigLoaded,

    // 操作
    loadConfig,
    saveConfig,
    resetConfig,
    addLlmThinkRule,
    updateLlmThinkRule,
    removeLlmThinkRule,
    resetLlmThinkRules,
    getActiveRegexRules,
  };
});
