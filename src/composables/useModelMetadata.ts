/**
 * 模型元数据管理 Composable
 *
 * 这是一个通用的模型元数据管理系统，支持为模型预设任意属性。
 * 同时保持向后兼容原有的 useModelIcons API。
 */

import { computed } from "vue";
import type { ModelMetadataRule, ModelMetadataProperties } from "../types/model-metadata";
import type { LlmModelInfo } from "../types/llm-profiles";
import { getMatchedModelProperties, getModelIconPath, isValidIconPath } from "../config/model-metadata";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useModelMetadataStore } from "../stores/modelMetadataStore";

/**
 * 模型元数据配置管理 (Composable 封装)
 * 现已重构为 useModelMetadataStore 的薄包装
 */
export function useModelMetadata() {
  const store = useModelMetadataStore();

  /**
   * 获取匹配模型的元数据属性
   */
  function getMatchedProperties(modelId: string, provider?: string): ModelMetadataProperties | undefined {
    return getMatchedModelProperties(store.rules, modelId, provider);
  }

  /**
   * 获取模型的特定元数据属性
   * 优先级：模型自定义属性 > 规则匹配属性 > 默认值
   */
  function getModelProperty<K extends keyof ModelMetadataProperties>(
    model: LlmModelInfo,
    propertyKey: K,
    defaultValue?: ModelMetadataProperties[K],
  ): ModelMetadataProperties[K] | undefined {
    // 第一优先级：模型自身的属性
    const modelValue = (model as Record<string, any>)[propertyKey as string];
    if (modelValue !== undefined) {
      return modelValue;
    }

    // 第二优先级：规则匹配的属性
    const matchedProps = getMatchedProperties(model.id, model.provider);
    if (matchedProps?.[propertyKey] !== undefined) {
      return matchedProps[propertyKey];
    }

    // 第三优先级：返回默认值
    return defaultValue;
  }

  /**
   * 获取模型分组名称
   */
  function getModelGroup(model: LlmModelInfo): string {
    if (model.group) return model.group;
    const matchedProps = getMatchedProperties(model.id, model.provider);
    return matchedProps?.group || "未分组";
  }

  /**
   * 获取用于显示的图标路径
   */
  function getDisplayIconPath(iconPath: string): string {
    if (!iconPath) return "";
    const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
    const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/model-icons");

    if (isWindowsAbsolutePath || isUnixAbsolutePath) {
      return convertFileSrc(iconPath);
    }
    return iconPath;
  }

  /**
   * 获取模型图标
   */
  function getModelIcon(model: LlmModelInfo): string | null {
    if (model.icon) return getDisplayIconPath(model.icon);
    const matchedIcon = getModelIconPath(store.rules, model.id, model.provider);
    return matchedIcon ? getDisplayIconPath(matchedIcon) : null;
  }

  /**
   * 导出规则配置
   */
  function exportRules(): string {
    return JSON.stringify(
      {
        version: "2.0.0",
        rules: store.rules,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * 导入规则配置
   */
  async function importRules(jsonStr: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.rules || !Array.isArray(data.rules)) throw new Error("无效的配置格式");
      store.rules = data.rules;
      await store.saveRules();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 按优先级排序规则
   */
  function sortByPriority() {
    store.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 获取图标路径（简化版本）
   */
  function getIconPath(modelId: string, provider?: string): string | undefined {
    return getModelIconPath(store.rules, modelId, provider);
  }

  return {
    // 状态
    rules: computed(() => store.rules),
    isLoaded: computed(() => store.isLoaded),
    presetIcons: computed(() => store.presetIcons),
    enabledCount: computed(() => store.enabledCount),

    // 规则管理
    loadRules: store.loadRules,
    saveRules: store.saveRules,
    addRule: store.addRule,
    updateRule: store.updateRule,
    deleteRule: store.deleteRule,
    toggleRule: store.toggleRule,
    resetToDefaults: store.resetToDefaults,
    mergeWithDefaults: store.mergeWithDefaults,
    exportRules,
    importRules,
    sortByPriority,
    getRulesByType: (matchType: ModelMetadataRule["matchType"]) => store.rules.filter((r) => r.matchType === matchType),

    // 匹配与查询
    getMatchedRule: store.getMatchedRule,
    getMatchedProperties,
    getModelProperty,
    getModelGroup,
    getModelIcon,
    getIconPath,

    // 工具函数
    getPresetIconPath: (path: string) => path,
    getDisplayIconPath,
    validateIconPath: (path: string) => isValidIconPath(path),
  };
}
