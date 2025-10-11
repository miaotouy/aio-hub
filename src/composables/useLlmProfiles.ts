/**
 * LLM 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { LlmProfile } from '../types/llm-profiles';
import type { LlmPreset } from '../config/llm-providers';
import { createConfigManager } from '../utils/configManager';

const STORAGE_KEY = 'llm-profiles'; // 用于 localStorage 数据迁移

// 配置文件管理器
const configManager = createConfigManager<{ profiles: LlmProfile[] }>({
  moduleName: 'llm-service',
  fileName: 'profiles.json',
  version: '1.0.0',
  createDefault: () => ({ profiles: [] }),
});

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
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  const loadProfiles = async () => {
    try {
      // 尝试从文件系统加载
      const config = await configManager.load();
      let loadedProfiles = config.profiles || [];

      // 如果文件系统中没有数据，尝试从 localStorage 迁移
      if (loadedProfiles.length === 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          console.log('检测到 localStorage 数据，开始迁移到文件系统...');
          const rawProfiles = JSON.parse(stored);
          loadedProfiles = rawProfiles.map(migrateProfile);
          
          // 保存到文件系统
          await configManager.save({ profiles: loadedProfiles });
          
          // 清除 localStorage 数据
          localStorage.removeItem(STORAGE_KEY);
          console.log('数据迁移完成');
        }
      } else {
        // 迁移现有数据到新格式
        loadedProfiles = loadedProfiles.map(migrateProfile);
      }

      profiles.value = loadedProfiles;
      isLoaded.value = true;
    } catch (error) {
      console.error('加载 LLM 配置失败:', error);
      profiles.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * 保存配置到文件系统
   */
  const saveToStorage = async () => {
    try {
      await configManager.save({ profiles: profiles.value });
    } catch (error) {
      console.error('保存 LLM 配置失败:', error);
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = async (profile: LlmProfile) => {
    const index = profiles.value.findIndex(p => p.id === profile.id);
    if (index !== -1) {
      // 更新现有配置
      profiles.value[index] = profile;
    } else {
      // 添加新配置
      profiles.value.push(profile);
    }
    await saveToStorage();
  };

  /**
   * 删除配置
   */
  const deleteProfile = async (id: string) => {
    const index = profiles.value.findIndex(p => p.id === id);
    if (index !== -1) {
      profiles.value.splice(index, 1);
      await saveToStorage();
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
  const toggleProfileEnabled = async (id: string) => {
    const profile = profiles.value.find(p => p.id === id);
    if (profile) {
      profile.enabled = !profile.enabled;
      await saveToStorage();
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