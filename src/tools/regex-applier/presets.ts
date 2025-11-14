/**
 * 预设管理模块
 * 负责预设的持久化、加载、保存和管理
 */

import type { RegexPreset, PresetsConfig, RegexRule } from './types';
import { generateId } from './engine';
import { createConfigManager, ConfigManager } from '../../utils/configManager';

const CONFIG_VERSION = '1.0.0';

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
 * 自定义配置合并逻辑
 * 确保预设数据结构完整
 */
function mergePresetsConfig(defaultConfig: PresetsConfig, loadedConfig: Partial<PresetsConfig>): PresetsConfig {
  // 确保预设数组存在且有效
  const presets = loadedConfig.presets && Array.isArray(loadedConfig.presets) 
    ? loadedConfig.presets.map(preset => ({
        ...preset,
        id: preset.id || generateId('preset'),
        rules: preset.rules || []
      }))
    : defaultConfig.presets;

  // 确保有激活的预设
  const activePresetId = loadedConfig.activePresetId || 
    (presets.length > 0 ? presets[0].id : defaultConfig.activePresetId);

  return {
    presets,
    activePresetId,
    version: CONFIG_VERSION
  };
}

/**
 * 创建配置管理器实例
 */
export const presetsConfigManager: ConfigManager<PresetsConfig> = createConfigManager({
  moduleName: 'regex_applier',
  fileName: 'presets.json',
  version: CONFIG_VERSION,
  createDefault: createDefaultConfig,
  mergeConfig: mergePresetsConfig
});

/**
 * 加载所有预设
 * @returns 预设配置
 */
export async function loadPresets(): Promise<PresetsConfig> {
  return presetsConfigManager.load();
}

/**
 * 保存所有预设
 * @param config 预设配置
 */
export async function savePresets(config: PresetsConfig): Promise<void> {
  return presetsConfigManager.save(config);
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
 * @param name 规则名称
 * @returns 新创建的规则
 */
export function createRule(regex: string = '', replacement: string = '', enabled: boolean = true, name?: string): RegexRule {
  return {
    id: generateId('rule'),
    enabled,
    regex,
    replacement,
    name
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
