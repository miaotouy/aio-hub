/**
 * 模型图标管理 Composable
 */

import { ref, computed } from 'vue';
import type { ModelIconConfig, ModelIconConfigStore, PresetIconInfo } from '../types/model-icons';
import { DEFAULT_ICON_CONFIGS, PRESET_ICONS, PRESET_ICONS_DIR, getModelIconPath, isValidIconPath } from '../config/model-icons';

const STORAGE_KEY = 'model-icon-configs';
const CONFIG_VERSION = '1.0.0';

/**
 * 模型图标配置管理
 */
export function useModelIcons() {
  // 配置列表
  const configs = ref<ModelIconConfig[]>([...DEFAULT_ICON_CONFIGS]);
  
  // 是否已加载
  const isLoaded = ref(false);

  /**
   * 预设图标列表
   */
  const presetIcons = computed<PresetIconInfo[]>(() => PRESET_ICONS);

  /**
   * 启用的配置数量
   */
  const enabledCount = computed(() => 
    configs.value.filter(c => c.enabled !== false).length
  );

  /**
   * 从本地存储加载配置
   */
  function loadConfigs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: ModelIconConfigStore = JSON.parse(stored);
        if (data.configs && Array.isArray(data.configs)) {
          configs.value = data.configs;
        }
      }
      isLoaded.value = true;
    } catch (error) {
      console.error('加载模型图标配置失败:', error);
      // 加载失败时使用默认配置
      configs.value = [...DEFAULT_ICON_CONFIGS];
      isLoaded.value = true;
    }
  }

  /**
   * 保存配置到本地存储
   */
  function saveConfigs() {
    try {
      const data: ModelIconConfigStore = {
        version: CONFIG_VERSION,
        configs: configs.value,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('保存模型图标配置失败:', error);
      return false;
    }
  }

  /**
   * 添加新配置
   */
  function addConfig(config: Omit<ModelIconConfig, 'id'>): boolean {
    try {
      const newConfig: ModelIconConfig = {
        ...config,
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        enabled: config.enabled !== false,
      };
      
      if (!isValidIconPath(newConfig.iconPath)) {
        throw new Error('无效的图标路径');
      }
      
      configs.value.push(newConfig);
      saveConfigs();
      return true;
    } catch (error) {
      console.error('添加配置失败:', error);
      return false;
    }
  }

  /**
   * 更新配置
   */
  function updateConfig(id: string, updates: Partial<ModelIconConfig>): boolean {
    try {
      const index = configs.value.findIndex(c => c.id === id);
      if (index === -1) {
        throw new Error('配置不存在');
      }
      
      if (updates.iconPath && !isValidIconPath(updates.iconPath)) {
        throw new Error('无效的图标路径');
      }
      
      configs.value[index] = {
        ...configs.value[index],
        ...updates,
      };
      
      saveConfigs();
      return true;
    } catch (error) {
      console.error('更新配置失败:', error);
      return false;
    }
  }

  /**
   * 删除配置
   */
  function deleteConfig(id: string): boolean {
    try {
      const index = configs.value.findIndex(c => c.id === id);
      if (index === -1) {
        throw new Error('配置不存在');
      }
      
      configs.value.splice(index, 1);
      saveConfigs();
      return true;
    } catch (error) {
      console.error('删除配置失败:', error);
      return false;
    }
  }

  /**
   * 切换配置启用状态
   */
  function toggleConfig(id: string): boolean {
    const config = configs.value.find(c => c.id === id);
    if (!config) return false;
    
    config.enabled = !config.enabled;
    saveConfigs();
    return true;
  }

  /**
   * 重置为默认配置
   */
  function resetToDefaults(): boolean {
    try {
      configs.value = [...DEFAULT_ICON_CONFIGS];
      saveConfigs();
      return true;
    } catch (error) {
      console.error('重置配置失败:', error);
      return false;
    }
  }

  /**
   * 获取模型图标路径
   */
  function getIconPath(modelId: string, provider?: string): string | undefined {
    return getModelIconPath(modelId, provider, configs.value);
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
   * 导出配置
   */
  function exportConfigs(): string {
    const data: ModelIconConfigStore = {
      version: CONFIG_VERSION,
      configs: configs.value,
      updatedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入配置
   */
  function importConfigs(jsonStr: string): boolean {
    try {
      const data: ModelIconConfigStore = JSON.parse(jsonStr);
      
      if (!data.configs || !Array.isArray(data.configs)) {
        throw new Error('无效的配置格式');
      }
      
      // 验证每个配置项
      for (const config of data.configs) {
        if (!config.id || !config.matchType || !config.matchValue || !config.iconPath) {
          throw new Error('配置项缺少必需字段');
        }
        if (!isValidIconPath(config.iconPath)) {
          throw new Error(`无效的图标路径: ${config.iconPath}`);
        }
      }
      
      configs.value = data.configs;
      saveConfigs();
      return true;
    } catch (error) {
      console.error('导入配置失败:', error);
      return false;
    }
  }

  /**
   * 按优先级排序配置
   */
  function sortByPriority() {
    configs.value.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 获取匹配特定条件的配置
   */
  function getConfigsByType(matchType: ModelIconConfig['matchType']) {
    return configs.value.filter(c => c.matchType === matchType);
  }

  // 自动加载配置
  if (!isLoaded.value) {
    loadConfigs();
  }

  return {
    // 状态
    configs,
    isLoaded,
    presetIcons,
    enabledCount,
    
    // 方法
    loadConfigs,
    saveConfigs,
    addConfig,
    updateConfig,
    deleteConfig,
    toggleConfig,
    resetToDefaults,
    getIconPath,
    getPresetIconPath,
    validateIconPath,
    exportConfigs,
    importConfigs,
    sortByPriority,
    getConfigsByType,
  };
}