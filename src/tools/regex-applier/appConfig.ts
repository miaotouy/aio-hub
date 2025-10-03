/**
 * 应用配置管理模块
 * 负责界面设置的持久化、加载和保存
 */

import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

const MODULE_DIR = 'regex_applier';
const APP_CONFIG_FILE = 'app_config.json';
const APP_CONFIG_VERSION = '1.0.0';

export interface AppConfig {
  // 处理模式
  processingMode: 'text' | 'file';
  // 选中的预设ID列表
  selectedPresetIds: string[];
  // 文件模式设置
  fileMode: {
    outputDirectory: string;
  };
  // 版本号
  version: string;
}

/**
 * 获取应用配置文件的完整路径
 */
async function getAppConfigPath(): Promise<string> {
  const appDir = await appDataDir();
  const moduleDir = await join(appDir, MODULE_DIR);
  return join(moduleDir, APP_CONFIG_FILE);
}

/**
 * 确保模块目录存在
 */
async function ensureModuleDir(): Promise<void> {
  const appDir = await appDataDir();
  const moduleDir = await join(appDir, MODULE_DIR);
  
  if (!await exists(moduleDir)) {
    await mkdir(moduleDir, { recursive: true });
  }
}

/**
 * 创建默认应用配置
 */
function createDefaultAppConfig(): AppConfig {
  return {
    processingMode: 'text',
    selectedPresetIds: [],
    fileMode: {
      outputDirectory: ''
    },
    version: APP_CONFIG_VERSION
  };
}

/**
 * 加载应用配置
 */
export async function loadAppConfig(): Promise<AppConfig> {
  try {
    await ensureModuleDir();
    const configPath = await getAppConfigPath();
    
    if (!await exists(configPath)) {
      // 配置文件不存在，创建默认配置
      const defaultConfig = createDefaultAppConfig();
      await saveAppConfig(defaultConfig);
      return defaultConfig;
    }
    
    const content = await readTextFile(configPath);
    const config: AppConfig = JSON.parse(content);
    
    // 确保配置结构完整，补充缺失的字段
    const defaultConfig = createDefaultAppConfig();
    const mergedConfig: AppConfig = {
      ...defaultConfig,
      ...config,
      fileMode: {
        ...defaultConfig.fileMode,
        ...(config.fileMode || {})
      }
    };
    
    return mergedConfig;
  } catch (error: any) {
    console.error('加载应用配置失败:', error);
    // 加载失败时返回默认配置
    return createDefaultAppConfig();
  }
}

/**
 * 保存应用配置
 */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  try {
    await ensureModuleDir();
    const configPath = await getAppConfigPath();
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error: any) {
    console.error('保存应用配置失败:', error);
    throw new Error(`保存应用配置失败: ${error.message}`);
  }
}

/**
 * 创建防抖保存函数
 */
export function createDebouncedSave(delay: number = 500) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (config: AppConfig) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(async () => {
      try {
        await saveAppConfig(config);
      } catch (error) {
        console.error('自动保存配置失败:', error);
      }
    }, delay);
  };
}