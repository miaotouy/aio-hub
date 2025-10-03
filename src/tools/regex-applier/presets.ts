/**
 * 预设管理模块
 * 负责预设的持久化、加载、保存和管理
 */

import type { RegexPreset, PresetsConfig, RegexRule } from './types';
import { generateId } from './engine';
import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

const MODULE_DIR = 'regex_applier';
const CONFIG_FILE = 'presets.json';
const CONFIG_VERSION = '1.0.0';

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
 * 创建默认预设
 */
function createDefaultPreset(): RegexPreset {
  const now = Date.now();
  return {
    id: generateId('preset'),
    name: '默认预设',
    description: '空白预设，可以开始添加你的规则',
    rules: [
      {
        id: generateId('rule'),
        enabled: true,
        regex: '',
        replacement: ''
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 创建默认配置
 */
function createDefaultConfig(): PresetsConfig {
  const defaultPreset = createDefaultPreset();
  return {
    presets: [defaultPreset],
    activePresetId: defaultPreset.id,
    version: CONFIG_VERSION
  };
}

/**
 * 加载所有预设
 * @returns 预设配置
 */
export async function loadPresets(): Promise<PresetsConfig> {
  try {
    await ensureModuleDir();
    const configPath = await getConfigPath();
    
    if (!await exists(configPath)) {
      // 配置文件不存在，创建默认配置
      const defaultConfig = createDefaultConfig();
      await savePresets(defaultConfig);
      return defaultConfig;
    }
    
    const content = await readTextFile(configPath);
    const config: PresetsConfig = JSON.parse(content);
    
    // 确保配置结构完整
    if (!config.presets || !Array.isArray(config.presets)) {
      throw new Error('无效的配置格式');
    }
    
    // 确保每个预设都有必要的字段
    config.presets = config.presets.map(preset => ({
      ...preset,
      id: preset.id || generateId('preset'),
      rules: preset.rules || []
    }));
    
    // 如果没有激活的预设，激活第一个
    if (!config.activePresetId && config.presets.length > 0) {
      config.activePresetId = config.presets[0].id;
    }
    
    return config;
  } catch (error: any) {
    console.error('加载预设失败:', error);
    // 加载失败时返回默认配置
    return createDefaultConfig();
  }
}

/**
 * 保存所有预设
 * @param config 预设配置
 */
export async function savePresets(config: PresetsConfig): Promise<void> {
  try {
    await ensureModuleDir();
    const configPath = await getConfigPath();
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error: any) {
    console.error('保存预设失败:', error);
    throw new Error(`保存预设失败: ${error.message}`);
  }
}

/**
 * 创建新预设
 * @param name 预设名称
 * @param description 预设描述
 * @returns 新创建的预设
 */
export function createPreset(name: string, description?: string): RegexPreset {
  const now = Date.now();
  return {
    id: generateId('preset'),
    name,
    description,
    rules: [
      {
        id: generateId('rule'),
        enabled: true,
        regex: '',
        replacement: ''
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 创建新规则
 * @param regex 正则表达式
 * @param replacement 替换内容
 * @param enabled 是否启用
 * @returns 新创建的规则
 */
export function createRule(regex: string = '', replacement: string = '', enabled: boolean = true): RegexRule {
  return {
    id: generateId('rule'),
    enabled,
    regex,
    replacement
  };
}

/**
 * 复制预设
 * @param preset 源预设
 * @param newName 新预设名称
 * @returns 复制后的新预设
 */
export function duplicatePreset(preset: RegexPreset, newName?: string): RegexPreset {
  const now = Date.now();
  return {
    ...preset,
    id: generateId('preset'),
    name: newName || `${preset.name} (副本)`,
    rules: preset.rules.map(rule => ({
      ...rule,
      id: generateId('rule')
    })),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 更新预设的更新时间
 * @param preset 预设
 */
export function touchPreset(preset: RegexPreset): void {
  preset.updatedAt = Date.now();
}