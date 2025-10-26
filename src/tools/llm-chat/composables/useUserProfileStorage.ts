/**
 * 用户档案分离式文件存储
 * 参考智能体的存储方案：
 * - 使用 ConfigManager 管理索引文件（user-profiles-index.json）
 * - 每个用户档案存储为独立文件（user-profiles/{profileId}.json）
 */

import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { createConfigManager } from '@/utils/configManager';
import type { UserProfile } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/user-profile-storage');

const MODULE_NAME = 'llm-chat';
const PROFILES_SUBDIR = 'user-profiles';

/**
 * 用户档案索引项（包含显示所需的元数据）
 */
interface ProfileIndexItem {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
  lastUsedAt?: string;
  enabled?: boolean;
}

/**
 * 用户档案索引配置
 */
interface ProfilesIndex {
  version: string;
  globalProfileId: string | null;
  profiles: ProfileIndexItem[];
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): ProfilesIndex {
  return {
    version: '1.0.0',
    globalProfileId: null,
    profiles: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<ProfilesIndex>({
  moduleName: MODULE_NAME,
  fileName: 'user-profiles-index.json',
  version: '1.0.0',
  createDefault: createDefaultIndex,
});

/**
 * 用户档案设置（已整合到索引中）
 */
export interface UserProfileSettings {
  globalProfileId: string | null;
}

/**
 * 分离式用户档案存储 composable
 */
export function useUserProfileStorage() {
  /**
   * 获取用户档案文件路径
   */
  async function getProfilePath(profileId: string): Promise<string> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const profilesDir = await join(moduleDir, PROFILES_SUBDIR);
    return join(profilesDir, `${profileId}.json`);
  }

  /**
   * 加载用户档案索引
   */
  async function loadIndex(): Promise<ProfilesIndex> {
    return await indexManager.load();
  }

  /**
   * 保存用户档案索引
   */
  async function saveIndex(index: ProfilesIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个用户档案
   */
  async function loadProfile(profileId: string): Promise<UserProfile | null> {
    try {
      const profilePath = await getProfilePath(profileId);
      const profileExists = await exists(profilePath);
      
      if (!profileExists) {
        logger.warn('用户档案文件不存在', { profileId });
        return null;
      }

      const content = await readTextFile(profilePath);
      const profile: UserProfile = JSON.parse(content);
      
      logger.debug('用户档案加载成功', { profileId, name: profile.name });
      return profile;
    } catch (error) {
      logger.error('加载用户档案失败', error as Error, { profileId });
      return null;
    }
  }

  /**
   * 确保 user-profiles 子目录存在
   */
  async function ensureProfilesDir(): Promise<void> {
    const appDir = await appDataDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const profilesDir = await join(moduleDir, PROFILES_SUBDIR);
    
    if (!await exists(profilesDir)) {
      const { mkdir } = await import('@tauri-apps/plugin-fs');
      await mkdir(profilesDir, { recursive: true });
      logger.debug('创建 user-profiles 目录', { profilesDir });
    }
  }

  /**
   * 保存单个用户档案（仅在内容变化时写入）
   */
  async function saveProfile(profile: UserProfile, forceWrite: boolean = false): Promise<void> {
    try {
      await indexManager.ensureModuleDir();
      await ensureProfilesDir();
      const profilePath = await getProfilePath(profile.id);
      const newContent = JSON.stringify(profile, null, 2);
      
      // 如果不是强制写入，先检查内容是否真的改变了
      if (!forceWrite) {
        const fileExists = await exists(profilePath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(profilePath);
            // 内容相同则跳过写入
            if (oldContent === newContent) {
              logger.debug('用户档案内容未变化，跳过写入', { profileId: profile.id });
              return;
            }
          } catch (readError) {
            logger.warn('读取现有用户档案文件失败，继续写入', { profileId: profile.id });
          }
        }
      }
      
      await writeTextFile(profilePath, newContent);
      
      logger.debug('用户档案保存成功', {
        profileId: profile.id,
        name: profile.name
      });
    } catch (error) {
      logger.error('保存用户档案失败', error as Error, { profileId: profile.id });
      throw error;
    }
  }

  /**
   * 删除单个用户档案文件（移入回收站）
   */
  async function deleteProfileFile(profileId: string): Promise<void> {
    try {
      const profilePath = await getProfilePath(profileId);
      const profileExists = await exists(profilePath);
      if (profileExists) {
        await invoke<string>('delete_file_to_trash', { filePath: profilePath });
        logger.info('用户档案文件已移入回收站', { profileId, path: profilePath });
      } else {
        logger.warn('用户档案文件不存在，跳过删除', { profileId, path: profilePath });
      }
    } catch (error) {
      logger.error('删除用户档案文件失败', error as Error, { profileId });
      throw error;
    }
  }

  /**
   * 扫描 user-profiles 目录，获取所有档案文件的 ID
   */
  async function scanProfileDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import('@tauri-apps/plugin-fs');
      const appDir = await appDataDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const profilesDir = await join(moduleDir, PROFILES_SUBDIR);
      
      const dirExists = await exists(profilesDir);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(profilesDir);
      const profileIds = entries
        .filter(entry => entry.name?.endsWith('.json'))
        .map(entry => entry.name!.replace('.json', ''));
      
      logger.debug('扫描用户档案目录完成', { count: profileIds.length });
      return profileIds;
    } catch (error) {
      logger.error('扫描用户档案目录失败', error as Error);
      return [];
    }
  }

  /**
   * 从用户档案创建索引项
   */
  function createIndexItem(profile: UserProfile): ProfileIndexItem {
    return {
      id: profile.id,
      name: profile.name,
      icon: profile.icon,
      createdAt: profile.createdAt,
      lastUsedAt: profile.lastUsedAt,
      enabled: profile.enabled,
    };
  }

  /**
   * 同步索引：合并索引中的 ID 和目录中的文件，加载新文件的元数据
   */
  async function syncIndex(index: ProfilesIndex): Promise<ProfileIndexItem[]> {
    // 1. 扫描目录获取所有档案文件 ID
    const fileIds = await scanProfileDirectory();
    
    // 2. 创建 ID 映射
    const fileIdSet = new Set(fileIds);
    const indexMap = new Map(index.profiles.map(item => [item.id, item]));
    
    // 3. 找出新增的文件 ID
    const newIds = fileIds.filter(id => !indexMap.has(id));
    
    // 4. 加载新文件的元数据
    const newItems: ProfileIndexItem[] = [];
    for (const id of newIds) {
      const profile = await loadProfile(id);
      if (profile) {
        newItems.push(createIndexItem(profile));
      }
    }
    
    // 5. 过滤掉已删除的文件，保持原有顺序
    const validItems = index.profiles.filter(item => fileIdSet.has(item.id));
    
    // 6. 合并：保持原有顺序，新文件追加在后面
    const syncedItems = [...validItems, ...newItems];
    
    if (newItems.length > 0 || validItems.length !== index.profiles.length) {
      logger.info('索引已同步', {
        total: syncedItems.length,
        new: newItems.length,
        removed: index.profiles.length - validItems.length
      });
    }
    
    return syncedItems;
  }

  /**
   * 加载所有用户档案
   */
  const loadProfiles = async (): Promise<UserProfile[]> => {
    try {
      logger.debug('开始加载所有用户档案');
      
      // 1. 加载索引
      let index = await loadIndex();
      
      // 2. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);
      
      // 3. 并行加载所有档案的完整数据
      const profilePromises = syncedItems.map(item => loadProfile(item.id));
      const profileResults = await Promise.all(profilePromises);
      
      // 4. 过滤掉加载失败的档案
      const profiles = profileResults.filter((p): p is UserProfile => p !== null);
      
      // 5. 如果索引被同步过，保存更新后的索引
      const validItems = profiles.map(p => createIndexItem(p));
      if (syncedItems.length !== index.profiles.length ||
          !syncedItems.every((item, i) => item.id === index.profiles[i]?.id)) {
        index.profiles = validItems;
        await saveIndex(index);
      }

      logger.info('所有用户档案加载成功', {
        profileCount: profiles.length,
        globalProfileId: index.globalProfileId
      });
      
      return profiles;
    } catch (error) {
      logger.error('加载所有用户档案失败', error as Error);
      return [];
    }
  };

  /**
   * 保存单个用户档案并更新索引
   */
  const persistProfile = async (profile: UserProfile): Promise<void> => {
    try {
      logger.debug('保存单个用户档案', { profileId: profile.id });
      
      // 1. 保存档案文件
      await saveProfile(profile, true); // 强制写入
      
      // 2. 更新索引
      const index = await loadIndex();
      
      // 更新或添加当前档案的索引项
      const profileIndex = index.profiles.findIndex(p => p.id === profile.id);
      const newIndexItem = createIndexItem(profile);
      
      if (profileIndex >= 0) {
        index.profiles[profileIndex] = newIndexItem;
      } else {
        index.profiles.push(newIndexItem);
      }
      
      await saveIndex(index);
      
      logger.debug('单个用户档案保存成功', { profileId: profile.id });
    } catch (error) {
      logger.error('保存单个用户档案失败', error as Error, { profileId: profile.id });
      throw error;
    }
  };

  /**
   * 保存所有用户档案（仅用于批量操作）
   */
  const saveProfiles = async (profiles: UserProfile[]): Promise<void> => {
    try {
      logger.debug('开始批量保存所有用户档案', { profileCount: profiles.length });
      
      // 1. 并行保存所有档案文件
      await Promise.all(profiles.map(profile => saveProfile(profile, true)));
      
      // 2. 更新索引
      const index = await loadIndex();
      index.profiles = profiles.map(p => createIndexItem(p));
      await saveIndex(index);
      
      logger.info('所有用户档案批量保存成功', {
        profileCount: profiles.length
      });
    } catch (error) {
      logger.error('批量保存所有用户档案失败', error as Error, {
        profileCount: profiles.length,
      });
      throw error;
    }
  };

  /**
   * 删除用户档案（同时删除文件和索引）
   */
  const deleteProfile = async (profileId: string): Promise<void> => {
    try {
      // 1. 删除档案文件
      await deleteProfileFile(profileId);
      
      // 2. 从索引中移除
      const index = await loadIndex();
      index.profiles = index.profiles.filter(item => item.id !== profileId);
      
      // 3. 如果删除的是全局档案，清除选择
      if (index.globalProfileId === profileId) {
        index.globalProfileId = null;
      }
      
      await saveIndex(index);
      
      logger.info('用户档案已删除', { profileId });
    } catch (error) {
      logger.error('删除用户档案失败', error as Error, { profileId });
      throw error;
    }
  };

  /**
   * 加载用户档案设置
   */
  const loadSettings = async (): Promise<UserProfileSettings> => {
    try {
      const index = await loadIndex();
      return {
        globalProfileId: index.globalProfileId,
      };
    } catch (error) {
      logger.error('加载用户档案设置失败', error as Error);
      return { globalProfileId: null };
    }
  };

  /**
   * 保存用户档案设置
   */
  const saveSettings = async (settings: Partial<UserProfileSettings>): Promise<void> => {
    try {
      const index = await loadIndex();
      if (settings.globalProfileId !== undefined) {
        index.globalProfileId = settings.globalProfileId;
      }
      await saveIndex(index);
      logger.debug('保存用户档案设置成功', settings);
    } catch (error) {
      logger.error('保存用户档案设置失败', error as Error);
      throw error;
    }
  };

  return {
    loadProfiles,
    saveProfiles,
    persistProfile, // 新增：单档案保存
    deleteProfile,  // 新增：删除档案
    loadSettings,
    saveSettings,
  };
}