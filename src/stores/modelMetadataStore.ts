import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ModelMetadataRule, ModelMetadataStore, PresetIconInfo } from "../types/model-metadata";
import { DEFAULT_METADATA_RULES, isValidIconPath, normalizeIconPath, testRuleMatch } from "../config/model-metadata";
import { PRESET_ICONS } from "../config/preset-icons";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("stores/modelMetadataStore");
const errorHandler = createModuleErrorHandler("stores/modelMetadataStore");

const STORAGE_KEY = "model-icon-configs";
const CONFIG_VERSION = "2.0.0";

// 配置文件管理器
const configManager = createConfigManager<ModelMetadataStore>({
  moduleName: "model-metadata",
  fileName: "metadata-rules.json",
  version: CONFIG_VERSION,
  createDefault: () => ({
    version: CONFIG_VERSION,
    rules: [...DEFAULT_METADATA_RULES],
    updatedAt: new Date().toISOString(),
  }),
});

/**
 * 模型元数据全局状态 Store
 */
export const useModelMetadataStore = defineStore("modelMetadata", () => {
  // --- 状态 ---
  const rules = ref<ModelMetadataRule[]>([...DEFAULT_METADATA_RULES]);
  const isLoaded = ref(false);

  // --- 计算属性 ---
  const presetIcons = computed<PresetIconInfo[]>(() => PRESET_ICONS);
  const enabledCount = computed(() => rules.value.filter((r) => r.enabled !== false).length);

  // --- 核心操作 ---

  /**
   * 加载规则（含旧版数据迁移）
   */
  async function loadRules() {
    try {
      const data = await configManager.load();

      // 迁移逻辑保持不变
      if (data.rules.length === DEFAULT_METADATA_RULES.length) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          logger.info("检测到 localStorage 中的旧版数据，开始迁移", { storageKey: STORAGE_KEY });
          try {
            const oldData: { configs: any[] } = JSON.parse(stored);
            if (oldData.configs && Array.isArray(oldData.configs)) {
              data.rules = oldData.configs.map((config) => ({
                id: config.id,
                matchType: config.matchType,
                matchValue: config.matchValue,
                properties: {
                  icon: normalizeIconPath(config.iconPath),
                  group: config.groupName,
                },
                priority: config.priority,
                enabled: config.enabled,
                useRegex: config.useRegex,
                description: config.description,
              }));
              data.updatedAt = new Date().toISOString();
              await configManager.save(data);
              localStorage.removeItem(STORAGE_KEY);
              logger.info("localStorage 数据迁移完成", { ruleCount: data.rules.length });
            }
          } catch (e) {
            errorHandler.handle(e, { userMessage: "localStorage 数据迁移失败", showToUser: false });
          }
        }
      }

      // 规范化路径
      rules.value = data.rules.map((rule) => ({
        ...rule,
        properties: {
          ...rule.properties,
          icon: rule.properties.icon ? normalizeIconPath(rule.properties.icon) : undefined,
        },
      }));
      isLoaded.value = true;
    } catch (error) {
      errorHandler.error(error, "加载模型元数据规则失败");
      rules.value = [...DEFAULT_METADATA_RULES];
      isLoaded.value = true;
    }
  }

  /**
   * 保存规则
   */
  async function saveRules() {
    try {
      const data: ModelMetadataStore = {
        version: CONFIG_VERSION,
        rules: rules.value,
        updatedAt: new Date().toISOString(),
      };
      await configManager.save(data);
      return true;
    } catch (error) {
      errorHandler.error(error, "保存模型元数据规则失败", {
        context: { ruleCount: rules.value.length },
      });
      return false;
    }
  }

  /**
   * 添加规则
   */
  async function addRule(rule: Omit<ModelMetadataRule, "id">): Promise<boolean> {
    try {
      const newRule: ModelMetadataRule = {
        ...rule,
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        enabled: rule.enabled !== false,
        createdAt: new Date().toISOString(),
        properties: {
          ...rule.properties,
          icon: rule.properties.icon ? normalizeIconPath(rule.properties.icon) : undefined,
        },
      };

      if (newRule.properties.icon && !isValidIconPath(newRule.properties.icon)) {
        throw new Error("无效的图标路径");
      }
      rules.value.push(newRule);
      await saveRules();
      return true;
    } catch (error) {
      errorHandler.error(error, "添加规则失败");
      return false;
    }
  }

  /**
   * 更新规则
   */
  async function updateRule(id: string, updates: Partial<ModelMetadataRule>): Promise<boolean> {
    try {
      const index = rules.value.findIndex((r) => r.id === id);
      if (index === -1) throw new Error("规则不存在");

      const processedUpdates = { ...updates };
      if (processedUpdates.properties?.icon) {
        processedUpdates.properties.icon = normalizeIconPath(processedUpdates.properties.icon);
      }

      if (processedUpdates.properties?.icon && !isValidIconPath(processedUpdates.properties.icon)) {
        throw new Error("无效的图标路径");
      }

      rules.value[index] = {
        ...rules.value[index],
        ...processedUpdates,
        properties: {
          ...rules.value[index].properties,
          ...(processedUpdates.properties || {}),
        },
      };

      await saveRules();
      return true;
    } catch (error) {
      errorHandler.error(error, "更新规则失败");
      return false;
    }
  }

  /**
   * 删除规则
   */
  async function deleteRule(id: string): Promise<boolean> {
    try {
      const index = rules.value.findIndex((r) => r.id === id);
      if (index === -1) throw new Error("规则不存在");
      rules.value.splice(index, 1);
      await saveRules();
      return true;
    } catch (error) {
      errorHandler.error(error, "删除规则失败");
      return false;
    }
  }

  /**
   * 切换状态
   */
  async function toggleRule(id: string): Promise<boolean> {
    const rule = rules.value.find((r) => r.id === id);
    if (!rule) return false;
    rule.enabled = !rule.enabled;
    await saveRules();
    return true;
  }

  /**
   * 重置默认
   */
  async function resetToDefaults(): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      rules.value = DEFAULT_METADATA_RULES.map((rule) => ({ ...rule, createdAt: now }));
      await saveRules();
      return true;
    } catch (error) {
      errorHandler.error(error, "重置规则失败");
      return false;
    }
  }

  /**
   * 合并内置
   */
  async function mergeWithDefaults(): Promise<{ added: number; updated: number }> {
    try {
      const now = new Date().toISOString();
      const currentRules = [...rules.value];
      const currentRuleIds = new Set(currentRules.map((r) => r.id));

      let addedCount = 0;
      for (const defaultRule of DEFAULT_METADATA_RULES) {
        if (!currentRuleIds.has(defaultRule.id)) {
          currentRules.push({ ...defaultRule, createdAt: now });
          addedCount++;
        }
      }

      rules.value = currentRules;
      await saveRules();
      return { added: addedCount, updated: 0 };
    } catch (error) {
      errorHandler.error(error, "合并内置配置失败");
      throw error;
    }
  }

  /**
   * 获取匹配规则
   */
  function getMatchedRule(modelId: string, provider?: string): ModelMetadataRule | undefined {
    const enabledRules = rules.value
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of enabledRules) {
      if (testRuleMatch(rule, modelId, provider)) return rule;
    }
    return undefined;
  }

  return {
    rules,
    isLoaded,
    presetIcons,
    enabledCount,
    loadRules,
    saveRules,
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    resetToDefaults,
    mergeWithDefaults,
    getMatchedRule,
  };
});

/**
 * 模块级访问器（非 Vue 代码使用）
 * 允许在非组件环境下安全获取当前规则列表
 */
export function getActiveRules(): ModelMetadataRule[] {
  try {
    const store = useModelMetadataStore();
    return store.rules;
  } catch (e) {
    // 如果在 Pinia 还没初始化的环境下调用，降级到默认规则
    return [...DEFAULT_METADATA_RULES];
  }
}
