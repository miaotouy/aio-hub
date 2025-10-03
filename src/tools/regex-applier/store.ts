/**
 * 正则预设的 Pinia Store
 * 统一管理所有正则预设的状态和操作
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RegexPreset, PresetsConfig, RegexRule } from './types';
import { generateId } from './engine';
import { mkdir, exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { debounce } from 'lodash';

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

export const usePresetStore = defineStore('preset', () => {
  // ===== State =====
  const presets = ref<RegexPreset[]>([]);
  const activePresetId = ref<string | null>(null);
  const isLoading = ref(false);
  const version = ref(CONFIG_VERSION);

  // ===== Getters =====
  
  /** 获取当前激活的预设 */
  const activePreset = computed(() => {
    if (!activePresetId.value) return undefined;
    return presets.value.find(p => p.id === activePresetId.value);
  });

  /** 根据 ID 获取预设 */
  const getPresetById = computed(() => {
    return (id: string) => presets.value.find(p => p.id === id);
  });

  /** 获取所有预设的简要信息（用于选择器） */
  const presetOptions = computed(() => {
    return presets.value.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description
    }));
  });

  // ===== Actions =====

  /**
   * 从文件加载预设
   */
  async function loadPresets(): Promise<void> {
    isLoading.value = true;
    try {
      await ensureModuleDir();
      const configPath = await getConfigPath();
      
      if (!await exists(configPath)) {
        // 配置文件不存在，创建默认配置
        const defaultPreset = createDefaultPreset();
        presets.value = [defaultPreset];
        activePresetId.value = defaultPreset.id;
        await savePresetsToFile();
        return;
      }
      
      const content = await readTextFile(configPath);
      const config: PresetsConfig = JSON.parse(content);
      
      // 确保配置结构完整
      if (!config.presets || !Array.isArray(config.presets)) {
        throw new Error('无效的配置格式');
      }
      
      // 确保每个预设和规则都有必要的字段，进行数据清洗
      presets.value = config.presets.map(preset => ({
        ...preset,
        id: preset.id || generateId('preset'),
        rules: (preset.rules || []).map((rule: Partial<RegexRule>) => ({
          id: rule.id || generateId('rule'),
          enabled: rule.enabled ?? true,
          regex: rule.regex || '',
          replacement: rule.replacement || '',
        })),
      }));
      
      // 如果没有激活的预设，激活第一个
      activePresetId.value = config.activePresetId || (presets.value.length > 0 ? presets.value[0].id : null);
      
    } catch (error: any) {
      console.error('加载预设失败:', error);
      // 加载失败时创建默认配置
      const defaultPreset = createDefaultPreset();
      presets.value = [defaultPreset];
      activePresetId.value = defaultPreset.id;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 保存预设到文件（内部使用，带 debounce）
   */
  async function savePresetsToFile(): Promise<void> {
    try {
      await ensureModuleDir();
      const configPath = await getConfigPath();
      const config: PresetsConfig = {
        presets: presets.value,
        activePresetId: activePresetId.value,
        version: version.value
      };
      await writeTextFile(configPath, JSON.stringify(config, null, 2));
    } catch (error: any) {
      console.error('保存预设失败:', error);
      throw new Error(`保存预设失败: ${error.message}`);
    }
  }

  /**
   * 防抖保存
   */
  const debouncedSave = debounce(async () => {
    await savePresetsToFile();
  }, 500);

  /**
   * 保存预设（对外接口）
   */
  async function savePresets(): Promise<void> {
    await debouncedSave();
  }

  /**
   * 创建新预设
   */
  function createPreset(name: string, description?: string): RegexPreset {
    const now = Date.now();
    const newPreset: RegexPreset = {
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
    
    presets.value.push(newPreset);
    activePresetId.value = newPreset.id;
    savePresets();
    
    return newPreset;
  }

  /**
   * 复制预设
   */
  function duplicatePreset(presetId: string, newName?: string): RegexPreset | null {
    const sourcePreset = presets.value.find(p => p.id === presetId);
    if (!sourcePreset) return null;
    
    const now = Date.now();
    const newPreset: RegexPreset = {
      ...sourcePreset,
      id: generateId('preset'),
      name: newName || `${sourcePreset.name} (副本)`,
      rules: sourcePreset.rules.map(rule => ({
        ...rule,
        id: generateId('rule')
      })),
      createdAt: now,
      updatedAt: now
    };
    
    presets.value.push(newPreset);
    activePresetId.value = newPreset.id;
    savePresets();
    
    return newPreset;
  }

  /**
   * 重命名预设
   */
  function renamePreset(presetId: string, newName: string): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    preset.name = newName;
    preset.updatedAt = Date.now();
    savePresets();
    
    return true;
  }

  /**
   * 删除预设
   */
  function deletePreset(presetId: string): boolean {
    const index = presets.value.findIndex(p => p.id === presetId);
    if (index === -1) return false;
    
    // 如果删除的是激活的预设，切换到第一个预设
    if (activePresetId.value === presetId) {
      const remainingPresets = presets.value.filter((_, i) => i !== index);
      activePresetId.value = remainingPresets.length > 0 ? remainingPresets[0].id : null;
    }
    
    presets.value.splice(index, 1);
    savePresets();
    
    return true;
  }

  /**
   * 切换激活的预设
   */
  function setActivePreset(presetId: string): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    activePresetId.value = presetId;
    savePresets();
    
    return true;
  }

  /**
   * 更新预设的更新时间
   */
  function touchPreset(presetId: string): void {
    const preset = presets.value.find(p => p.id === presetId);
    if (preset) {
      preset.updatedAt = Date.now();
      savePresets();
    }
  }

  // ===== 规则操作 =====

  /**
   * 向预设添加规则
   */
  function addRule(presetId: string, rule?: Partial<RegexRule>): RegexRule | null {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return null;
    
    const newRule: RegexRule = {
      id: generateId('rule'),
      enabled: rule?.enabled ?? true,
      regex: rule?.regex ?? '',
      replacement: rule?.replacement ?? ''
    };
    
    preset.rules.push(newRule);
    preset.updatedAt = Date.now();
    savePresets();
    
    return newRule;
  }

  /**
   * 更新规则
   */
  function updateRule(presetId: string, ruleId: string, updates: Partial<RegexRule>): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    const rule = preset.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    Object.assign(rule, updates);
    preset.updatedAt = Date.now();
    savePresets();
    
    return true;
  }

  /**
   * 删除规则
   */
  function deleteRule(presetId: string, ruleId: string): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    const index = preset.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;
    
    preset.rules.splice(index, 1);
    preset.updatedAt = Date.now();
    savePresets();
    
    return true;
  }

  /**
   * 切换规则启用状态
   */
  function toggleRuleEnabled(presetId: string, ruleId: string): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    const rule = preset.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    
    rule.enabled = !rule.enabled;
    preset.updatedAt = Date.now();
    savePresets();
    
    return true;
  }

  /**
   * 更新规则顺序
   */
  function reorderRules(presetId: string, newOrder: RegexRule[]): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    preset.rules = newOrder;
    preset.updatedAt = Date.now();
    savePresets();
    
    return true;
  }

  /**
   * 导入规则（JSON）
   */
  async function importRules(presetId: string, rules: Partial<RegexRule>[]): Promise<number> {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return 0;
    
    const existingRulesMap = new Map(preset.rules.map(r => [`${r.regex}::${r.replacement}`, r]));
    let addedCount = 0;
    
    rules.forEach((newRule) => {
      const key = `${newRule.regex}::${newRule.replacement}`;
      if (!existingRulesMap.has(key)) {
        preset.rules.push({
          id: generateId('rule'),
          enabled: newRule.enabled ?? true,
          regex: newRule.regex || '',
          replacement: newRule.replacement || ''
        });
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      preset.updatedAt = Date.now();
      await savePresetsToFile();
    }
    
    return addedCount;
  }

  /**
   * 导出预设（返回 JSON 字符串）
   */
  function exportPreset(presetId: string): string | null {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return null;
    
    return JSON.stringify(preset, null, 2);
  }

  return {
    // State
    presets,
    activePresetId,
    isLoading,
    version,
    
    // Getters
    activePreset,
    getPresetById,
    presetOptions,
    
    // Actions
    loadPresets,
    savePresets,
    createPreset,
    duplicatePreset,
    renamePreset,
    deletePreset,
    setActivePreset,
    touchPreset,
    
    // 规则操作
    addRule,
    updateRule,
    deleteRule,
    toggleRuleEnabled,
    reorderRules,
    importRules,
    exportPreset
  };
});