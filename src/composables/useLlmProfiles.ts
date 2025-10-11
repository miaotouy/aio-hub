/**
 * LLM 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { LlmProfile } from '../types/llm-profiles';
import type { LlmPreset } from '../config/llm-providers';

const STORAGE_KEY = 'llm-profiles';

// 全局状态
const profiles = ref<LlmProfile[]>([]);
const isLoaded = ref(false);

export function useLlmProfiles() {
  /**
   * 数据迁移：将旧格式的 apiKey 转换为 apiKeys 数组
   */
  const migrateProfile = (profile: any): LlmProfile => {
    // 如果已经是新格式，直接返回
    if (Array.isArray(profile.apiKeys)) {
      return profile as LlmProfile;
    }
    
    // 迁移旧格式
    const migratedProfile: LlmProfile = {
      ...profile,
      apiKeys: profile.apiKey ? [profile.apiKey] : [],
      logoUrl: profile.logoUrl || undefined,
      customHeaders: profile.customHeaders || undefined,
    };
    
    // 删除旧的 apiKey 字段
    delete (migratedProfile as any).apiKey;
    
    return migratedProfile;
  };

  /**
   * 从 localStorage 加载配置
   */
  const loadProfiles = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const rawProfiles = JSON.parse(stored);
        // 迁移所有配置到新格式
        profiles.value = rawProfiles.map(migrateProfile);
        // 保存迁移后的数据
        saveToStorage();
      }
      isLoaded.value = true;
    } catch (error) {
      console.error('加载 LLM 配置失败:', error);
      profiles.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * 保存配置到 localStorage
   */
  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.value));
    } catch (error) {
      console.error('保存 LLM 配置失败:', error);
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = (profile: LlmProfile) => {
    const index = profiles.value.findIndex(p => p.id === profile.id);
    if (index !== -1) {
      // 更新现有配置
      profiles.value[index] = profile;
    } else {
      // 添加新配置
      profiles.value.push(profile);
    }
    saveToStorage();
  };

  /**
   * 删除配置
   */
  const deleteProfile = (id: string) => {
    const index = profiles.value.findIndex(p => p.id === id);
    if (index !== -1) {
      profiles.value.splice(index, 1);
      saveToStorage();
    }
  };

  /**
   * 根据 ID 获取配置
   */
  const getProfileById = (id: string): LlmProfile | undefined => {
    return profiles.value.find(p => p.id === id);
  };

  /**
   * 获取所有启用的配置
   */
  const enabledProfiles = computed(() => {
    return profiles.value.filter(p => p.enabled);
  });

  /**
   * 获取包含视觉模型的配置
   */
  const visionProfiles = computed(() => {
    return enabledProfiles.value.filter(p =>
      p.models.some(m => m.capabilities?.vision)
    );
  });

  /**
   * 切换配置的启用状态
   */
  const toggleProfileEnabled = (id: string) => {
    const profile = profiles.value.find(p => p.id === id);
    if (profile) {
      profile.enabled = !profile.enabled;
      saveToStorage();
    }
  };

  /**
   * 生成唯一 ID
   */
  const generateId = (): string => {
    return `llm-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * 从预设模板创建新配置
   */
  const createFromPreset = (preset: LlmPreset): LlmProfile => {
    return {
      id: generateId(),
      name: preset.name,
      type: preset.type,
      baseUrl: preset.defaultBaseUrl,
      apiKeys: [],
      enabled: true,
      models: preset.defaultModels ? [...preset.defaultModels] : [],
      logoUrl: preset.logoUrl,
    };
  };

  // 如果还未加载,自动加载
  if (!isLoaded.value) {
    loadProfiles();
  }

  return {
    profiles,
    isLoaded,
    loadProfiles,
    saveProfile,
    deleteProfile,
    getProfileById,
    enabledProfiles,
    visionProfiles,
    toggleProfileEnabled,
    generateId,
    createFromPreset,
  };
}