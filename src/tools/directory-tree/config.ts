/**
 * 目录树工具的配置管理模块
 * 负责自定义过滤规则的持久化存储
 */

import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

const MODULE_DIR = 'directory_tree';
const CONFIG_FILE = 'config.json';
const CONFIG_VERSION = '1.0.0';

/**
 * 目录树配置接口
 */
export interface DirectoryTreeConfig {
  /** 自定义过滤规则 */
  customPatterns: string;
  /** 上次使用的过滤模式 */
  lastFilterMode: 'none' | 'gitignore' | 'custom';
  /** 上次使用的目标路径 */
  lastTargetPath: string;
  /** 上次的显示选项 */
  showFiles: boolean;
  showHidden: boolean;
  /** 上次的深度限制 */
  maxDepth: number;
  /** 配置版本 */
  version: string;
}

/**
 * 获取配置文件的完整路径
 */
async function getConfigPath(): Promise<string> {
  const appDir = await appDataDir();
  const moduleDir = await join(appDir, MODULE_DIR);
  return join(moduleDir, CONFIG_FILE);
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
 * 创建默认配置
 */
function createDefaultConfig(): DirectoryTreeConfig {
  return {
    customPatterns: '# 自定义过滤规则示例\nnode_modules\n.git\ndist\nbuild\n*.log',
    lastFilterMode: 'none',
    lastTargetPath: '',
    showFiles: true,
    showHidden: false,
    maxDepth: 5,
    version: CONFIG_VERSION
  };
}

/**
 * 加载配置
 */
export async function loadConfig(): Promise<DirectoryTreeConfig> {
  try {
    await ensureModuleDir();
    const configPath = await getConfigPath();
    
    if (!await exists(configPath)) {
      // 配置文件不存在，创建默认配置
      const defaultConfig = createDefaultConfig();
      await saveConfig(defaultConfig);
      return defaultConfig;
    }
    
    const content = await readTextFile(configPath);
    const config: DirectoryTreeConfig = JSON.parse(content);
    
    // 确保配置结构完整，填充缺失的字段
    const defaultConfig = createDefaultConfig();
    return {
      ...defaultConfig,
      ...config
    };
  } catch (error: any) {
    console.error('加载配置失败:', error);
    // 加载失败时返回默认配置
    return createDefaultConfig();
  }
}

/**
 * 保存配置
 */
export async function saveConfig(config: DirectoryTreeConfig): Promise<void> {
  try {
    await ensureModuleDir();
    const configPath = await getConfigPath();
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error: any) {
    console.error('保存配置失败:', error);
    throw new Error(`保存配置失败: ${error.message}`);
  }
}

/**
 * 更新配置的部分字段
 */
export async function updateConfig(updates: Partial<DirectoryTreeConfig>): Promise<void> {
  const config = await loadConfig();
  const newConfig = { ...config, ...updates };
  await saveConfig(newConfig);
}