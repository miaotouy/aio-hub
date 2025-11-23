/**
 * 云端 OCR 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { OcrProfile } from '../types/ocr-profiles';
import type { OcrPreset } from '../config/ocr-providers';
import { createConfigManager } from '@utils/configManager';
import { createModuleLogger } from '@utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('OcrProfiles');
const errorHandler = createModuleErrorHandler('OcrProfiles');

const STORAGE_KEY = 'ocr-profiles'; // 用于 localStorage 数据迁移

// 配置文件管理器
const configManager = createConfigManager<{ profiles: OcrProfile[] }>({
  moduleName: 'ocr-service',
  fileName: 'profiles.json',
  version: '1.0.0',
  createDefault: () => ({ profiles: [] }),
});

// 全局状态
const profiles = ref<OcrProfile[]>([]);
const isLoaded = ref(false);

export function useOcrProfiles() {
  /**
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  const loadProfiles = async () => {
    try {
      logger.info('开始加载 OCR 配置');
      
      // 尝试从文件系统加载
      const config = await configManager.load();
      let loadedProfiles = config.profiles || [];

      // 如果文件系统中没有数据，尝试从 localStorage 迁移
      if (loadedProfiles.length === 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          logger.info('检测到 localStorage 数据，开始迁移到文件系统');
          try {
            loadedProfiles = JSON.parse(stored);
            
            // 保存到文件系统
            await configManager.save({ profiles: loadedProfiles });
            
            // 清除 localStorage 数据
            localStorage.removeItem(STORAGE_KEY);
            logger.info('数据迁移完成', { profileCount: loadedProfiles.length });
          } catch (parseError) {
            errorHandler.error(parseError, '解析 localStorage 数据失败', { showToUser: false });
          }
        }
      }

      profiles.value = loadedProfiles;
      isLoaded.value = true;
      logger.info('OCR 配置加载成功', { profileCount: loadedProfiles.length });
    } catch (error) {
      errorHandler.error(error, '加载 OCR 配置失败');
      profiles.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * 保存配置到文件系统
   */
  const saveToStorage = async () => {
    try {
      logger.debug('保存 OCR 配置到文件系统', { profileCount: profiles.value.length });
      await configManager.save({ profiles: profiles.value });
      logger.info('OCR 配置保存成功');
    } catch (error) {
      errorHandler.error(error, '保存 OCR 配置失败', { context: { profileCount: profiles.value.length } });
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = async (profile: OcrProfile) => {
    try {
      const index = profiles.value.findIndex(p => p.id === profile.id);
      if (index !== -1) {
        // 更新现有配置
        logger.info('更新 OCR 配置', { profileId: profile.id, profileName: profile.name });
        profiles.value[index] = profile;
      } else {
        // 添加新配置
        logger.info('添加新 OCR 配置', { profileId: profile.id, profileName: profile.name });
        profiles.value.push(profile);
      }
      await saveToStorage();
    } catch (error) {
      errorHandler.error(error, '保存 OCR 配置失败', {
        context: {
          profileId: profile.id,
          profileName: profile.name
        }
      });
      throw error;
    }
  };

  /**
   * 删除配置
   */
  const deleteProfile = async (id: string) => {
    try {
      const index = profiles.value.findIndex(p => p.id === id);
      if (index !== -1) {
        const profileName = profiles.value[index].name;
        logger.info('删除 OCR 配置', { profileId: id, profileName });
        profiles.value.splice(index, 1);
        await saveToStorage();
      } else {
        logger.warn('尝试删除不存在的配置', { profileId: id });
      }
    } catch (error) {
      errorHandler.error(error, '删除 OCR 配置失败', { context: { profileId: id } });
      throw error;
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
  const toggleProfileEnabled = async (id: string) => {
    try {
      const profile = profiles.value.find(p => p.id === id);
      if (profile) {
        profile.enabled = !profile.enabled;
        logger.info('切换 OCR 配置状态', {
          profileId: id,
          profileName: profile.name,
          enabled: profile.enabled
        });
        await saveToStorage();
      } else {
        logger.warn('尝试切换不存在的配置', { profileId: id });
      }
    } catch (error) {
      errorHandler.error(error, '切换配置状态失败', { context: { profileId: id } });
      throw error;
    }
  };

  /**
   * 生成唯一 ID
   */
  const generateId = (): string => {
    return `ocr-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  /**
   * 从预设创建配置
   */
  const createFromPreset = (preset: OcrPreset): OcrProfile => {
    return {
      id: generateId(),
      name: preset.name,
      provider: preset.provider,
      endpoint: preset.endpoint,
      credentials: {
        apiKey: '',
        apiSecret: '',
      },
      enabled: true,
      concurrency: 3,
      delay: 0,
    };
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
    createFromPreset,
  };
}