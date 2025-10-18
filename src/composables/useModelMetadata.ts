/**
 * 模型元数据管理 Composable
 *
 * 这是一个通用的模型元数据管理系统，支持为模型预设任意属性。
 * 同时保持向后兼容原有的 useModelIcons API。
 */

import { ref, computed } from "vue";
import type {
  ModelMetadataRule,
  ModelMetadataStore,
  ModelMetadataProperties,
  PresetIconInfo,
} from "../types/model-metadata";
import type { LlmModelInfo } from "../types/llm-profiles";
import {
  DEFAULT_METADATA_RULES,
  getMatchedModelProperties,
  getModelIconPath,
  isValidIconPath,
  testRuleMatch,
} from "../config/model-metadata";
import { PRESET_ICONS, PRESET_ICONS_DIR } from "../config/preset-icons";
import { convertFileSrc } from "@tauri-apps/api/core";
import { createConfigManager } from "@utils/configManager";
import { logger } from "@utils/logger";

const STORAGE_KEY = "model-icon-configs"; // 用于 localStorage 数据迁移（向后兼容）
const CONFIG_VERSION = "2.0.0"; // 版本号升级到 2.0.0

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
   * 从文件系统加载规则（支持旧版本数据迁移）
   */
  async function loadRules() {
    try {
      // 尝试从新版本文件系统加载
      const data = await configManager.load();

      // 如果新版本文件系统中没有自定义配置，尝试从旧版本迁移
      if (data.rules.length === DEFAULT_METADATA_RULES.length) {
        // 尝试从 localStorage 迁移（兼容最旧的版本）
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          logger.info("useModelMetadata", "检测到 localStorage 中的旧版数据，开始迁移", {
            storageKey: STORAGE_KEY,
          });

          try {
            // 旧版本使用 ModelIconConfig 格式
            const oldData: { configs: any[] } = JSON.parse(stored);
            if (oldData.configs && Array.isArray(oldData.configs)) {
              // 转换旧格式到新格式
              data.rules = oldData.configs.map((config) => ({
                id: config.id,
                matchType: config.matchType,
                matchValue: config.matchValue,
                properties: {
                  icon: config.iconPath,
                  group: config.groupName,
                },
                priority: config.priority,
                enabled: config.enabled,
                useRegex: config.useRegex,
                description: config.description,
              }));
              data.updatedAt = new Date().toISOString();

              // 保存到新文件系统
              await configManager.save(data);

              // 清除 localStorage 数据
              localStorage.removeItem(STORAGE_KEY);
              logger.info("useModelMetadata", "localStorage 数据迁移完成", {
                ruleCount: data.rules.length,
              });
            }
          } catch (e) {
            logger.error("useModelMetadata", "localStorage 数据迁移失败", e);
          }
        }
      }

      rules.value = data.rules;
      isLoaded.value = true;
    } catch (error) {
      logger.error("useModelMetadata", "加载模型元数据规则失败", error);
      // 加载失败时使用默认配置
      rules.value = [...DEFAULT_METADATA_RULES];
      isLoaded.value = true;
    }
  }

  /**
   * 保存规则到文件系统
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
      logger.error("useModelMetadata", "保存模型元数据规则失败", error, {
        ruleCount: rules.value.length,
      });
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
      };

      // 验证图标路径（如果有）
      if (newRule.properties.icon && !isValidIconPath(newRule.properties.icon)) {
        throw new Error("无效的图标路径");
      }

      rules.value.push(newRule);
      await saveRules();
      return true;
    } catch (error) {
      logger.error("useModelMetadata", "添加规则失败", error, {
        matchType: rule.matchType,
        matchValue: rule.matchValue,
      });
      return false;
    }
  }

  /**
   * 更新规则
   */
  async function updateRule(id: string, updates: Partial<ModelMetadataRule>): Promise<boolean> {
    try {
      const index = rules.value.findIndex((r) => r.id === id);
      if (index === -1) {
        throw new Error("规则不存在");
      }

      // 验证图标路径（如果更新了图标）
      if (updates.properties?.icon && !isValidIconPath(updates.properties.icon)) {
        throw new Error("无效的图标路径");
      }

      // 合并更新（注意 properties 需要深度合并）
      rules.value[index] = {
        ...rules.value[index],
        ...updates,
        properties: {
          ...rules.value[index].properties,
          ...(updates.properties || {}),
        },
      };

      await saveRules();
      return true;
    } catch (error) {
      logger.error("useModelMetadata", "更新规则失败", error, {
        ruleId: id,
        updates,
      });
      return false;
    }
  }

  /**
   * 删除规则
   */
  async function deleteRule(id: string): Promise<boolean> {
    try {
      const index = rules.value.findIndex((r) => r.id === id);
      if (index === -1) {
        throw new Error("规则不存在");
      }

      rules.value.splice(index, 1);
      await saveRules();
      return true;
    } catch (error) {
      logger.error("useModelMetadata", "删除规则失败", error, {
        ruleId: id,
      });
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
      rules.value = [...DEFAULT_METADATA_RULES];
      await saveRules();
      return true;
    } catch (error) {
      logger.error("useModelMetadata", "重置规则失败", error);
      return false;
    }
  }

  /**
   * 获取匹配模型的元数据规则
   * @param modelId 模型 ID
   * @param provider 提供商
   * @returns 匹配的规则对象或 undefined
   */
  function getMatchedRule(modelId: string, provider?: string): ModelMetadataRule | undefined {
    // 过滤启用的规则并按优先级排序
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
   * @param modelId 模型 ID
   * @param provider 提供商
   * @returns 匹配的元数据属性对象或 undefined
   */
  function getMatchedProperties(
    modelId: string,
    provider?: string
  ): ModelMetadataProperties | undefined {
    return getMatchedModelProperties(modelId, provider, rules.value);
  }

  /**
   * 获取模型的特定元数据属性
   * 优先级：模型自定义属性 > 规则匹配属性 > 默认值
   */
  function getModelProperty<K extends keyof ModelMetadataProperties>(
    model: LlmModelInfo,
    propertyKey: K,
    defaultValue?: ModelMetadataProperties[K]
  ): ModelMetadataProperties[K] | undefined {
    // 第一优先级：模型自身的属性（如果模型对象支持该属性）
    const modelValue = (model as any)[propertyKey];
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
   * 优先级：模型手动配置 > 规则匹配 > 默认分组
   */
  function getModelGroup(model: LlmModelInfo): string {
    // 第一优先级：模型自身的 group 属性（用户手动配置）
    if (model.group) {
      return model.group;
    }

    // 第二优先级：规则匹配中的 group
    const matchedProps = getMatchedProperties(model.id, model.provider);
    if (matchedProps?.group) {
      return matchedProps.group;
    }

    // 第三优先级：默认分组
    return "未分组";
  }

  /**
   * 获取用于显示的图标路径
   * 如果是绝对路径（本地文件），则转换为 Tauri asset URL
   */
  function getDisplayIconPath(iconPath: string): string {
    if (!iconPath) return "";

    // 检查是否为绝对路径
    const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
    const isUnixAbsolutePath = iconPath.startsWith("/") && !iconPath.startsWith("/model-icons");

    if (isWindowsAbsolutePath || isUnixAbsolutePath) {
      // 只对真正的本地文件系统绝对路径转换为 Tauri asset URL
      return convertFileSrc(iconPath);
    }

    // 相对路径（包括 /model-icons/ 开头的预设图标）直接返回
    return iconPath;
  }

  /**
   * 获取模型图标（三级优先级逻辑 + 路径转换）
   * 1. 优先使用模型自定义图标
   * 2. 其次使用全局匹配规则
   * 3. 最后返回 null（由调用方显示占位符）
   */
  function getModelIcon(model: LlmModelInfo): string | null {
    // 第一优先级：模型自定义图标
    if (model.icon) {
      return getDisplayIconPath(model.icon);
    }

    // 第二优先级：全局匹配规则
    const matchedIcon = getModelIconPath(model.id, model.provider, rules.value);
    if (matchedIcon) {
      return getDisplayIconPath(matchedIcon);
    }

    // 第三优先级：返回 null，由调用方显示占位符
    return null;
  }

  /**
   * 获取预设图标完整路径
   */
  function getPresetIconPath(presetPath: string): string {
    return `${PRESET_ICONS_DIR}/${presetPath}`;
  }

  /**
   * 验证图标路径
   */
  function validateIconPath(path: string): boolean {
    return isValidIconPath(path);
  }

  /**
   * 导出规则配置
   */
  function exportRules(): string {
    const data: ModelMetadataStore = {
      version: CONFIG_VERSION,
      rules: rules.value,
      updatedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入规则配置
   */
  async function importRules(jsonStr: string): Promise<boolean> {
    try {
      const data: ModelMetadataStore = JSON.parse(jsonStr);

      if (!data.rules || !Array.isArray(data.rules)) {
        throw new Error("无效的配置格式");
      }

      // 验证每个规则项
      for (const rule of data.rules) {
        if (!rule.id || !rule.matchType || !rule.matchValue || !rule.properties) {
          throw new Error("规则缺少必需字段");
        }
        if (rule.properties.icon && !isValidIconPath(rule.properties.icon)) {
          throw new Error(`无效的图标路径: ${rule.properties.icon}`);
        }
      }

      rules.value = data.rules;
      await saveRules();
      return true;
    } catch (error) {
      logger.error("useModelMetadata", "导入规则失败", error);
      return false;
    }
  }

  /**
   * 按优先级排序规则
   */
  function sortByPriority() {
    rules.value.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 获取匹配特定条件的规则
   */
  function getRulesByType(matchType: ModelMetadataRule["matchType"]) {
    return rules.value.filter((r) => r.matchType === matchType);
  }

  /**
   * 获取图标路径（简化版本，仅用于内部）
   */
  function getIconPath(modelId: string, provider?: string): string | undefined {
    return getModelIconPath(modelId, provider, rules.value);
  }

  // 自动加载配置
  if (!isLoaded.value) {
    loadRules();
  }

  return {
    // 状态
    rules,
    isLoaded,
    presetIcons,
    enabledCount,

    // 规则管理
    loadRules,
    saveRules,
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    resetToDefaults,
    exportRules,
    importRules,
    sortByPriority,
    getRulesByType,

    // 匹配与查询
    getMatchedRule,
    getMatchedProperties,
    getModelProperty,
    getModelGroup,
    getModelIcon,
    getIconPath,

    // 工具函数
    getPresetIconPath,
    getDisplayIconPath,
    validateIconPath,
  };
}
