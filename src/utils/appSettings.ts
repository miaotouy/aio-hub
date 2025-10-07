/**
 * 应用全局设置管理
 * 使用 Tauri 文件系统存储配置
 */

import { createConfigManager } from './configManager';

export interface AppSettings {
  sidebarCollapsed: boolean;
  theme?: 'light' | 'dark' | 'auto';
  
  // 通用设置
  trayEnabled?: boolean;
  themeColor?: string; // 主题色 hex 值
  
  // 工具模块设置
  toolsVisible?: Record<string, boolean>;
  toolsOrder?: string[];
  
  // 关于信息
  version?: string;
}

// 默认设置
export const defaultAppSettings: AppSettings = {
  sidebarCollapsed: false,
  theme: 'auto',
  trayEnabled: false,
  themeColor: '#409eff', // 默认蓝色
  toolsVisible: {
    regexApply: true,
    mediaInfoReader: true,
    textDiff: true,
    jsonFormatter: true,
    codeFormatter: true,
    symlinkMover: true,
    directoryTree: true,
    apiTester: true,
    llmProxy: true,
    gitAnalyzer: true,
  },
  toolsOrder: [],
  version: '1.0.0'
};

// 创建应用设置管理器实例
const appSettingsManager = createConfigManager<AppSettings>({
  moduleName: 'app-settings',
  fileName: 'settings.json',
  version: '1.0.0',
  createDefault: () => defaultAppSettings,
  mergeConfig: (defaultConfig, loadedConfig) => {
    // 深度合并 toolsVisible 对象
    const mergedToolsVisible = {
      ...defaultConfig.toolsVisible,
      ...loadedConfig.toolsVisible
    };
    
    return {
      ...defaultConfig,
      ...loadedConfig,
      toolsVisible: mergedToolsVisible
    };
  }
});

// 缓存当前设置，避免频繁的异步读取
let cachedSettings: AppSettings | null = null;

/**
 * 加载应用设置（异步版本）
 */
export const loadAppSettingsAsync = async (): Promise<AppSettings> => {
  try {
    const settings = await appSettingsManager.load();
    cachedSettings = settings;
    return settings;
  } catch (error) {
    console.error('加载应用设置失败:', error);
    return defaultAppSettings;
  }
};

/**
 * 保存应用设置（异步版本）
 */
export const saveAppSettingsAsync = async (settings: AppSettings): Promise<void> => {
  try {
    await appSettingsManager.save(settings);
    cachedSettings = settings;
  } catch (error) {
    console.error('保存应用设置失败:', error);
    throw error;
  }
};

/**
 * 更新部分设置（异步版本）
 */
export const updateAppSettingsAsync = async (updates: Partial<AppSettings>): Promise<AppSettings> => {
  try {
    const updatedSettings = await appSettingsManager.update(updates);
    cachedSettings = updatedSettings;
    return updatedSettings;
  } catch (error) {
    console.error('更新应用设置失败:', error);
    throw error;
  }
};

/**
 * 重置应用设置（异步版本）
 */
export const resetAppSettingsAsync = async (): Promise<AppSettings> => {
  try {
    await appSettingsManager.save(defaultAppSettings);
    cachedSettings = defaultAppSettings;
    return defaultAppSettings;
  } catch (error) {
    console.error('重置应用设置失败:', error);
    throw error;
  }
};

// 创建防抖保存函数（500ms 延迟）
const debouncedSave = appSettingsManager.createDebouncedSave(500);

/**
 * 防抖保存设置
 */
export const saveAppSettingsDebounced = (settings: AppSettings): void => {
  cachedSettings = settings;
  debouncedSave(settings);
};

// 为了向后兼容，提供同步版本的 API（使用缓存）
// 注意：这些同步方法仅在初始化后才能正常工作

/**
 * 加载应用设置（同步版本，使用缓存）
 * 注意：首次调用前需要先调用 loadAppSettingsAsync 初始化
 */
export const loadAppSettings = (): AppSettings => {
  if (!cachedSettings) {
    console.warn('设置尚未加载，返回默认设置。请先调用 loadAppSettingsAsync');
    return defaultAppSettings;
  }
  return cachedSettings;
};

/**
 * 保存应用设置（同步版本，使用防抖）
 */
export const saveAppSettings = (settings: AppSettings): void => {
  saveAppSettingsDebounced(settings);
};

/**
 * 重置应用设置（同步版本）
 * 注意：这个方法会立即返回默认设置，但实际保存是异步的
 */
export const resetAppSettings = (): AppSettings => {
  cachedSettings = defaultAppSettings;
  // 异步保存，不等待结果
  resetAppSettingsAsync().catch(error => {
    console.error('异步重置设置失败:', error);
  });
  return defaultAppSettings;
};

/**
 * 更新部分设置（同步版本）
 * 注意：更新会立即反映在缓存中，但实际保存是异步的
 */
export const updateAppSettings = (updates: Partial<AppSettings>): AppSettings => {
  const current = loadAppSettings();
  const updated = { ...current, ...updates };
  saveAppSettings(updated);
  return updated;
};