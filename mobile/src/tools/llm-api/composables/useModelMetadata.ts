/**
 * 模型元数据管理 Composable (移动端)
 */

import { ref, computed } from "vue";
import type {
  ModelMetadataRule,
  ModelMetadataStore,
  ModelMetadataProperties,
  PresetIconInfo,
} from "../types/model-metadata";
import type { LlmModelInfo } from "../types/common";
import {
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
  getModelIconPath,
  isValidIconPath,
  normalizeIconPath,
  testRuleMatch,
} from "../config/model-metadata";
import { PRESET_ICONS } from "../config/preset-icons";
import { createConfigManager } from "../../../utils/configManager";
import { createModuleLogger } from "../../../utils/logger";
import { createModuleErrorHandler } from "../../../utils/errorHandler";

const logger = createModuleLogger("ModelMetadata");
const errorHandler = createModuleErrorHandler("ModelMetadata");

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
 * 模型元数据配置管理
 */
export function useModelMetadata() {
  // 规则列表
  const rules = ref<ModelMetadataRule[]>([...DEFAULT_METADATA_RULES]);

  // 是否已加载
  const isLoaded = ref(false);

  /**
   * 预设图标列表
   */
  const presetIcons = computed<PresetIconInfo[]>(() => PRESET_ICONS);

  /**
   * 启用的规则数量
   */
  const enabledCount = computed(() => rules.value.filter((r) => r.enabled !== false).length);

  /**
   * 加载规则
   */
  async function loadRules() {
    try {
      const data = await configManager.load();
      
      // 规范化所有规则中的图标路径
      rules.value = data.rules.map((rule: ModelMetadataRule) => ({
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
      errorHandler.error(error, "保存模型元数据规则失败");
      return false;
    }
  }

  /**
   * 添加新规则
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
   * 切换规则启用状态
   */
  async function toggleRule(id: string): Promise<boolean> {
    const rule = rules.value.find((r) => r.id === id);
    if (!rule) return false;

    rule.enabled = !rule.enabled;
    await saveRules();
    return true;
  }

  /**
   * 重置为默认规则
   */
  async function resetToDefaults(): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      rules.value = DEFAULT_METADATA_RULES.map((rule) => ({
        ...rule,
        createdAt: now,
      }));
      await saveRules();
      return true;
    } catch (error) {
      errorHandler.error(error, "重置规则失败");
      return false;
    }
  }

  /**
   * 合并最新的内置配置
   */
  async function mergeWithDefaults(): Promise<{ added: number; updated: number }> {
    try {
      const now = new Date().toISOString();
      const currentRules = [...rules.value];
      const currentRuleIds = new Set(currentRules.map((r) => r.id));

      let addedCount = 0;
      for (const defaultRule of DEFAULT_METADATA_RULES) {
        if (!currentRuleIds.has(defaultRule.id)) {
          currentRules.push({
            ...defaultRule,
            createdAt: now,
          });
          addedCount++;
        }
      }

      rules.value = currentRules;
      await saveRules();
      
      logger.info("合并内置配置完成", { added: addedCount });
      return { added: addedCount, updated: 0 };
    } catch (error) {
      errorHandler.error(error, "合并内置配置失败");
      throw error;
    }
  }

  /**
   * 获取匹配模型的元数据规则
   */
  function getMatchedRule(modelId: string, provider?: string): ModelMetadataRule | undefined {
    const enabledRules = rules.value
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of enabledRules) {
      if (testRuleMatch(rule, modelId, provider)) {
        return rule;
      }
    }

    return undefined;
  }

  /**
   * 获取匹配模型的元数据属性
   */
  function getMatchedProperties(
    modelId: string,
    provider?: string
  ): ModelMetadataProperties | undefined {
    return getMatchedModelProperties(modelId, provider, rules.value);
  }

  /**
   * 获取模型的特定元数据属性
   */
  function getModelProperty<K extends keyof ModelMetadataProperties>(
    model: LlmModelInfo,
    propertyKey: K,
    defaultValue?: ModelMetadataProperties[K]
  ): ModelMetadataProperties[K] | undefined {
    const modelValue = (model as Record<string, any>)[propertyKey as string];
    if (modelValue !== undefined) return modelValue;

    const matchedProps = getMatchedProperties(model.id, model.provider);
    if (matchedProps?.[propertyKey] !== undefined) return matchedProps[propertyKey];

    return defaultValue;
  }

  /**
   * 获取模型分组名称
   */
  function getModelGroup(model: LlmModelInfo): string {
    if (model.group) return model.group;

    const matchedProps = getMatchedProperties(model.id, model.provider);
    if (matchedProps?.group) return matchedProps.group;

    return "未分组";
  }

  /**
   * 获取用于显示的图标路径
   */
  function getDisplayIconPath(iconPath: string): string {
    if (!iconPath) return "";
    
    if (!iconPath.includes("/") && !iconPath.includes("\\") && isValidIconPath(iconPath)) {
      return `/model-icons/${iconPath}`;
    }

    return iconPath;
  }

  /**
   * 获取模型图标
   */
  function getModelIcon(model: LlmModelInfo): string | null {
    if (model.icon) return getDisplayIconPath(model.icon);

    const matchedIcon = getModelIconPath(model.id, model.provider, rules.value);
    if (matchedIcon) return getDisplayIconPath(matchedIcon);

    return null;
  }

  // 自动加载配置
  if (!isLoaded.value) {
    loadRules();
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
    getMatchedProperties,
    getModelProperty,
    getModelGroup,
    getModelIcon,
    getDisplayIconPath,
  };
}