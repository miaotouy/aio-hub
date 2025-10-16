/**
 * LLM 配置管理 Composable
 */

import { ref, computed } from 'vue';
import type { LlmProfile, LlmParameterSupport, ProviderType } from '../types/llm-profiles';
import type { LlmPreset } from '../config/llm-providers';
import { providerTypes } from '../config/llm-providers';
import { createConfigManager } from '@utils/configManager';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('LlmProfiles');

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
      logger.info('开始加载 LLM 配置');
      
      // 尝试从文件系统加载
      const config = await configManager.load();
      let loadedProfiles = config.profiles || [];

      // 如果文件系统中没有数据，尝试从 localStorage 迁移
      if (loadedProfiles.length === 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          logger.info('检测到 localStorage 数据，开始迁移到文件系统');
          try {
            const rawProfiles = JSON.parse(stored);
            loadedProfiles = rawProfiles.map(migrateProfile);
            
            // 保存到文件系统
            await configManager.save({ profiles: loadedProfiles });
            
            // 清除 localStorage 数据
            localStorage.removeItem(STORAGE_KEY);
            logger.info('数据迁移完成', { profileCount: loadedProfiles.length });
          } catch (parseError) {
            logger.error('解析 localStorage 数据失败', parseError);
          }
        }
      } else {
        // 迁移现有数据到新格式
        loadedProfiles = loadedProfiles.map(migrateProfile);
      }

      profiles.value = loadedProfiles;
      isLoaded.value = true;
      logger.info('LLM 配置加载成功', { profileCount: loadedProfiles.length });
    } catch (error) {
      logger.error('加载 LLM 配置失败', error);
      profiles.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * 保存配置到文件系统
   */
  const saveToStorage = async () => {
    try {
      logger.debug('保存 LLM 配置到文件系统', { profileCount: profiles.value.length });
      await configManager.save({ profiles: profiles.value });
      logger.info('LLM 配置保存成功');
    } catch (error) {
      logger.error('保存 LLM 配置失败', error, { profileCount: profiles.value.length });
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = async (profile: LlmProfile) => {
    try {
      const index = profiles.value.findIndex(p => p.id === profile.id);
      if (index !== -1) {
        // 更新现有配置
        logger.info('更新 LLM 配置', { profileId: profile.id, profileName: profile.name });
        profiles.value[index] = profile;
      } else {
        // 添加新配置
        logger.info('添加新 LLM 配置', { profileId: profile.id, profileName: profile.name });
        profiles.value.push(profile);
      }
      await saveToStorage();
    } catch (error) {
      logger.error('保存 LLM 配置失败', error, {
        profileId: profile.id,
        profileName: profile.name
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
        logger.info('删除 LLM 配置', { profileId: id, profileName });
        profiles.value.splice(index, 1);
        await saveToStorage();
      } else {
        logger.warn('尝试删除不存在的配置', { profileId: id });
      }
    } catch (error) {
      logger.error('删除 LLM 配置失败', error, { profileId: id });
      throw error;
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
    try {
      const profile = profiles.value.find(p => p.id === id);
      if (profile) {
        profile.enabled = !profile.enabled;
        logger.info('切换 LLM 配置状态', {
          profileId: id,
          profileName: profile.name,
          enabled: profile.enabled
        });
        await saveToStorage();
      } else {
        logger.warn('尝试切换不存在的配置', { profileId: id });
      }
    } catch (error) {
      logger.error('切换配置状态失败', error, { profileId: id });
      throw error;
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

  /**
   * 获取指定渠道类型支持的参数
   */
  const getSupportedParameters = (providerType: ProviderType): LlmParameterSupport => {
    const provider = providerTypes.find(p => p.type === providerType);
    
    // 如果找到了配置且定义了支持的参数，返回配置的参数
    if (provider?.supportedParameters) {
      return provider.supportedParameters;
    }
    
    // 否则返回默认基本参数（保证向后兼容）
    return {
      temperature: true,
      maxTokens: true,
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
    getSupportedParameters,
  };
}