/**
 * LLM 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { LlmProfile } from '../types/llm-profiles';

const STORAGE_KEY = 'llm-profiles';

// 全局状态
const profiles = ref<LlmProfile[]>([]);
const isLoaded = ref(false);

export function useLlmProfiles() {
  /**
   * 从 localStorage 加载配置
   */
  const loadProfiles = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        profiles.value = JSON.parse(stored);
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
      p.models.some(m => m.isVision)
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

  // 如果还未加载，自动加载
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
  };
}