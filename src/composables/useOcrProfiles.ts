/**
 * 云端 OCR 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { OcrProfile } from '../types/ocr-profiles';

const STORAGE_KEY = 'ocr-profiles';

// 全局状态
const profiles = ref<OcrProfile[]>([]);
const isLoaded = ref(false);

export function useOcrProfiles() {
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
      console.error('加载云端 OCR 配置失败:', error);
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
      console.error('保存云端 OCR 配置失败:', error);
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = (profile: OcrProfile) => {
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
  const getProfileById = (id: string): OcrProfile | undefined => {
    return profiles.value.find(p => p.id === id);
  };

  /**
   * 获取所有启用的配置
   */
  const enabledProfiles = computed(() => {
    return profiles.value.filter(p => p.enabled);
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
    return `ocr-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    toggleProfileEnabled,
    generateId,
  };
}