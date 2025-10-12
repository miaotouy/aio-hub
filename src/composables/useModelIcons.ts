/**
 * 模型图标管理 Composable
 */

import { ref, computed } from 'vue';
import type { ModelIconConfig, ModelIconConfigStore, PresetIconInfo } from '../types/model-icons';
import type { LlmModelInfo } from '../types/llm-profiles';
import { DEFAULT_ICON_CONFIGS, PRESET_ICONS, PRESET_ICONS_DIR, getModelIconPath, isValidIconPath } from '../config/model-icons';
import { convertFileSrc } from '@tauri-apps/api/core';
import { createConfigManager } from '@utils/configManager';
import { logger } from '@utils/logger';

const STORAGE_KEY = 'model-icon-configs'; // 用于 localStorage 数据迁移
const CONFIG_VERSION = '1.0.0';

// 配置文件管理器
const configManager = createConfigManager<ModelIconConfigStore>({
  moduleName: 'model-icons',
  fileName: 'configs.json',
  version: CONFIG_VERSION,
  createDefault: () => ({
    version: CONFIG_VERSION,
    configs: [...DEFAULT_ICON_CONFIGS],
    updatedAt: new Date().toISOString(),
  }),
});

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
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  async function loadConfigs() {
    try {
      // 尝试从文件系统加载
      const data = await configManager.load();
      
      // 如果文件系统中没有自定义配置，尝试从 localStorage 迁移
      if (data.configs.length === DEFAULT_ICON_CONFIGS.length) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          logger.info('useModelIcons', '检测到 localStorage 数据，开始迁移到文件系统', {
            storageKey: STORAGE_KEY,
          });
          const oldData: ModelIconConfigStore = JSON.parse(stored);
          if (oldData.configs && Array.isArray(oldData.configs)) {
            data.configs = oldData.configs;
            data.updatedAt = new Date().toISOString();
            
            // 保存到文件系统
            await configManager.save(data);
            
            // 清除 localStorage 数据
            localStorage.removeItem(STORAGE_KEY);
            logger.info('useModelIcons', '数据迁移完成', {
              configCount: data.configs.length,
            });
          }
        }
      }
      
      configs.value = data.configs;
      isLoaded.value = true;
    } catch (error) {
      logger.error('useModelIcons', '加载模型图标配置失败', error);
      // 加载失败时使用默认配置
      configs.value = [...DEFAULT_ICON_CONFIGS];
      isLoaded.value = true;
    }
  }

  /**
   * 保存配置到文件系统
   */
  async function saveConfigs() {
    try {
      const data: ModelIconConfigStore = {
        version: CONFIG_VERSION,
        configs: configs.value,
        updatedAt: new Date().toISOString(),
      };
      await configManager.save(data);
      return true;
    } catch (error) {
      logger.error('useModelIcons', '保存模型图标配置失败', error, {
        configCount: configs.value.length,
      });
      return false;
    }
  }

  /**
   * 添加新配置
   */
  async function addConfig(config: Omit<ModelIconConfig, 'id'>): Promise<boolean> {
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
      await saveConfigs();
      return true;
    } catch (error) {
      logger.error('useModelIcons', '添加配置失败', error, {
        matchType: config.matchType,
        matchValue: config.matchValue,
      });
      return false;
    }
  }

  /**
   * 更新配置
   */
  async function updateConfig(id: string, updates: Partial<ModelIconConfig>): Promise<boolean> {
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
      
      await saveConfigs();
      return true;
    } catch (error) {
      logger.error('useModelIcons', '更新配置失败', error, {
        configId: id,
        updates,
      });
      return false;
    }
  }

  /**
   * 删除配置
   */
  async function deleteConfig(id: string): Promise<boolean> {
    try {
      const index = configs.value.findIndex(c => c.id === id);
      if (index === -1) {
        throw new Error('配置不存在');
      }
      
      configs.value.splice(index, 1);
      await saveConfigs();
      return true;
    } catch (error) {
      logger.error('useModelIcons', '删除配置失败', error, {
        configId: id,
      });
      return false;
    }
  }

  /**
   * 切换配置启用状态
   */
  async function toggleConfig(id: string): Promise<boolean> {
    const config = configs.value.find(c => c.id === id);
    if (!config) return false;
    
    config.enabled = !config.enabled;
    await saveConfigs();
    return true;
  }

  /**
   * 重置为默认配置
   */
  async function resetToDefaults(): Promise<boolean> {
    try {
      configs.value = [...DEFAULT_ICON_CONFIGS];
      await saveConfigs();
      return true;
    } catch (error) {
      logger.error('useModelIcons', '重置配置失败', error);
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
   * 获取用于显示的图标路径
   * 如果是绝对路径（本地文件），则转换为 Tauri asset URL
   */
  function getDisplayIconPath(iconPath: string): string {
    if (!iconPath) return '';

    // 检查是否为绝对路径
    // Windows: C:\, D:\, E:\ 等
    const isWindowsAbsolutePath = /^[A-Za-z]:[\\/]/.test(iconPath);
    // Unix/Linux 绝对路径，但排除 /model-icons/ 这种项目内的相对路径
    const isUnixAbsolutePath = iconPath.startsWith('/') && !iconPath.startsWith('/model-icons');

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
   *
   * @param model 模型信息对象
   * @returns 可直接用于 img src 的图标 URL，或 null
   */
  function getModelIcon(model: LlmModelInfo): string | null {
    // 第一优先级：模型自定义图标
    if (model.icon) {
      return getDisplayIconPath(model.icon);
    }

    // 第二优先级：全局匹配规则
    const matchedIcon = getModelIconPath(model.id, model.provider, configs.value);
    if (matchedIcon) {
      return getDisplayIconPath(matchedIcon);
    }

    // 第三优先级：返回 null，由调用方显示占位符
    return null;
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
  async function importConfigs(jsonStr: string): Promise<boolean> {
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
      await saveConfigs();
      return true;
    } catch (error) {
      logger.error('useModelIcons', '导入配置失败', error);
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
    getDisplayIconPath,
    getModelIcon,
  };
}