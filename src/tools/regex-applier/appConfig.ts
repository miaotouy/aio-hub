/**
 * 应用配置管理模块
 * 负责界面设置的持久化、加载和保存
 */

import { createConfigManager, ConfigManager } from '../../utils/configManager';

const APP_CONFIG_VERSION = '1.0.0';

export interface AppConfig {
  // 处理模式
  processingMode: 'text' | 'file';
  // 选中的预设ID列表
  selectedPresetIds: string[];
  // 是否显示预设选择区域
  showPresetSection: boolean;
  // 文件模式设置
  fileMode: {
    outputDirectory: string;
    forceTxt: boolean;
    filenameSuffix: string;
    clearProcessedFiles: boolean;
  };
  // 版本号
  version: string;
}

/**
 * 创建默认应用配置
 */
function createDefaultAppConfig(): AppConfig {
  return {
    processingMode: 'text',
    selectedPresetIds: [],
    showPresetSection: true,
    fileMode: {
      outputDirectory: '',
      forceTxt: false,
      filenameSuffix: '',
      clearProcessedFiles: false
    },
    version: APP_CONFIG_VERSION
  };
}

/**
 * 自定义配置合并逻辑
 * 确保嵌套对象正确合并
 */
function mergeAppConfig(defaultConfig: AppConfig, loadedConfig: Partial<AppConfig>): AppConfig {
  return {
    ...defaultConfig,
    ...loadedConfig,
    fileMode: {
      ...defaultConfig.fileMode,
      ...(loadedConfig.fileMode || {})
    },
    version: APP_CONFIG_VERSION
  };
}

/**
 * 创建配置管理器实例
 */
const configManager: ConfigManager<AppConfig> = createConfigManager({
  moduleName: 'regex_applier',
  fileName: 'app_config.json',
  version: APP_CONFIG_VERSION,
  createDefault: createDefaultAppConfig,
  mergeConfig: mergeAppConfig
});

/**
 * 加载应用配置
 */
export async function loadAppConfig(): Promise<AppConfig> {
  return configManager.load();
}

/**
 * 保存应用配置
 */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  return configManager.save(config);
}

/**
 * 创建防抖保存函数
 */
export function createDebouncedSave(delay: number = 500) {
  return configManager.createDebouncedSave(delay);
}