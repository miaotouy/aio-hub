/**
 * 正则预设的 Pinia Store
 * 统一管理所有正则预设的状态和操作
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { RegexPreset, PresetsConfig, RegexRule } from './types';
import { generateId } from './engine';
import { 
  loadPresets, 
  savePresets, 
  createPreset as createNewPreset,
  duplicatePreset as duplicateExistingPreset,
  touchPreset as touchPresetTimestamp,
  createDebouncedPresetsSave
} from './presets';

export const usePresetStore = defineStore('preset', () => {
  // ===== State =====
  const presets = ref<RegexPreset[]>([]);
  const activePresetId = ref<string | null>(null);
  const isLoading = ref(false);
  const version = ref('1.0.0');

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

  // ===== 内部辅助函数 =====
  
  /**
   * 创建防抖保存函数
   */
  const debouncedSave = createDebouncedPresetsSave(500);
  
  /**
   * 保存当前状态到文件
   */
  async function saveCurrentState(): Promise<void> {
    const config: PresetsConfig = {
      presets: presets.value,
      activePresetId: activePresetId.value,
      version: version.value
    };
    await debouncedSave(config);
  }

  // ===== Actions =====

  /**
   * 从文件加载预设
   */
  async function loadPresetsFromFile(): Promise<void> {
    isLoading.value = true;
    try {
      const config = await loadPresets();
      
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
      
      activePresetId.value = config.activePresetId;
      version.value = config.version || '1.0.0';
      
    } catch (error: any) {
      console.error('加载预设失败:', error);
      // 加载失败时创建默认配置
      const defaultPreset = createNewPreset('默认预设', '空白预设，可以开始添加你的规则');
      presets.value = [defaultPreset];
      activePresetId.value = defaultPreset.id;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 保存预设（对外接口）
   */
  async function savePresetsToFile(): Promise<void> {
    await saveCurrentState();
  }

  /**
   * 创建新预设
   */
  function createPreset(name: string, description?: string): RegexPreset {
    const newPreset = createNewPreset(name, description);
    
    presets.value.push(newPreset);
    activePresetId.value = newPreset.id;
    saveCurrentState();
    
    return newPreset;
  }

  /**
   * 复制预设
   */
  function duplicatePreset(presetId: string, newName?: string): RegexPreset | null {
    const sourcePreset = presets.value.find(p => p.id === presetId);
    if (!sourcePreset) return null;
    
    const newPreset = duplicateExistingPreset(sourcePreset, newName);
    
    presets.value.push(newPreset);
    activePresetId.value = newPreset.id;
    saveCurrentState();
    
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
    saveCurrentState();
    
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
    saveCurrentState();
    
    return true;
  }

  /**
   * 切换激活的预设
   */
  function setActivePreset(presetId: string): boolean {
    const preset = presets.value.find(p => p.id === presetId);
    if (!preset) return false;
    
    activePresetId.value = presetId;
    saveCurrentState();
    
    return true;
  }

  /**
   * 更新预设的更新时间
   */
  function touchPreset(presetId: string): void {
    const preset = presets.value.find(p => p.id === presetId);
    if (preset) {
      touchPresetTimestamp(preset);
      saveCurrentState();
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
    saveCurrentState();
    
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
    saveCurrentState();
    
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
    saveCurrentState();
    
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
    saveCurrentState();
    
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
    saveCurrentState();
    
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
      // 导入时直接保存，不使用防抖
      const config: PresetsConfig = {
        presets: presets.value,
        activePresetId: activePresetId.value,
        version: version.value
      };
      await savePresets(config);
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
    loadPresets: loadPresetsFromFile,
    savePresets: savePresetsToFile,
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