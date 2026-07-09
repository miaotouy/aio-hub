// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 用户档案分离式文件存储
 * 参考智能体的存储方案：
 * - 使用 ConfigManager 管理索引文件（user-profiles-index.json）
 * - 每个用户档案存储为一个独立目录（user-profiles/{profileId}/），包含 profile.json 和相关资源
 */

import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join, extname } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { invoke } from "@tauri-apps/api/core";
import { createConfigManager } from "@/utils/configManager";
import {
  createDefaultUserProfileConfig,
  type UserProfile,
} from "../../types/profile";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("user-profile-manager/storage");
const errorHandler = createModuleErrorHandler("user-profile-manager/storage");

const MODULE_NAME = "user-profile-manager";
const PROFILES_SUBDIR = "user-profiles";

/**
 * 用户档案索引项（包含显示所需的元数据）
 */
interface ProfileIndexItem {
  id: string;
  name: string;
  displayName?: string;
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
    version: "1.1.0",
    globalProfileId: null,
    profiles: [],
  };
}

/**
 * 索引文件管理器
 */
const indexManager = createConfigManager<ProfilesIndex>({
  moduleName: MODULE_NAME,
  fileName: "user-profiles-index.json",
  version: "1.1.0",
  createDefault: createDefaultIndex,
});

let indexMutationQueue: Promise<void> = Promise.resolve();

async function updateIndex<T>(
  updater: (index: ProfilesIndex) => T | Promise<T>
): Promise<T> {
  const task = indexMutationQueue.then(async () => {
    const index = await indexManager.load();
    const result = await updater(index);
    await indexManager.save(index);
    return result;
  });

  indexMutationQueue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}

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
   * 获取用户档案目录路径
   */
  async function getProfileDirPath(profileId: string): Promise<string> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const profilesDir = await join(moduleDir, PROFILES_SUBDIR);
    return join(profilesDir, profileId);
  }

  /**
   * 获取用户档案配置文件路径
   */
  async function getProfileConfigPath(profileId: string): Promise<string> {
    const profileDir = await getProfileDirPath(profileId);
    return join(profileDir, `profile.json`);
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

  function normalizeProfile(
    profile: Partial<UserProfile>,
    fallbackId: string
  ): UserProfile {
    const defaults = createDefaultUserProfileConfig();
    return {
      ...defaults,
      ...profile,
      id: profile.id || fallbackId,
      name: profile.name || defaults.name,
      createdAt: profile.createdAt || new Date().toISOString(),
      content: profile.content ?? "",
      displayName: profile.displayName ?? defaults.displayName,
      icon: profile.icon ?? defaults.icon,
      avatarHistory: profile.avatarHistory ?? defaults.avatarHistory,
      enabled: profile.enabled ?? defaults.enabled,
      richTextStyleOptions:
        profile.richTextStyleOptions ?? defaults.richTextStyleOptions,
      richTextStyleBehavior:
        profile.richTextStyleBehavior ?? defaults.richTextStyleBehavior,
      regexConfig: profile.regexConfig ?? defaults.regexConfig,
      worldbookIds: profile.worldbookIds ?? defaults.worldbookIds,
      quickActionSetIds:
        profile.quickActionSetIds ?? defaults.quickActionSetIds,
    };
  }

  /**
   * 加载单个用户档案
   */
  async function loadProfile(profileId: string): Promise<UserProfile | null> {
    try {
      const profilePath = await getProfileConfigPath(profileId);
      const profileExists = await exists(profilePath);

      if (!profileExists) {
        logger.warn("用户档案配置文件不存在", { profileId, path: profilePath });
        return null;
      }

      const content = await readTextFile(profilePath);
      const profile = normalizeProfile(JSON.parse(content), profileId);

      // 迁移逻辑：处理绝对路径
      let isDirty = false;
      let icon = profile.icon?.trim();

      // 处理被引号包裹的路径
      if (icon?.startsWith('"') && icon?.endsWith('"')) {
        icon = icon.substring(1, icon.length - 1);
      }

      // 判断是否为真正的绝对路径
      // 1. 排除 appdata:// 和网络路径
      // 2. 排除以 / 开头的 Web 相对路径 (如 /model-icons/...)
      // 3. 匹配 Windows 盘符 (C:\) 或 file:// 协议
      const isWebRelative = icon?.startsWith("/");
      const isAppData = icon?.startsWith("appdata://");
      const isNetwork = icon?.startsWith("http");
      const isWindowsPath = /^[a-zA-Z]:\\/.test(icon || "");
      const isFileProtocol = icon?.startsWith("file://");

      const shouldMigrate =
        icon &&
        !isAppData &&
        !isNetwork &&
        !isWebRelative &&
        (isWindowsPath || isFileProtocol);

      if (shouldMigrate) {
        try {
          const sourcePath = icon!.replace("file://", "");
          const { extname } = await import("@tauri-apps/api/path");
          const extension = await extname(sourcePath).catch(() => "png");
          const newAvatarName = `avatar-${Date.now()}.${extension}`;

          await invoke("copy_file_to_app_data", {
            sourcePath,
            subdirectory: await join(MODULE_NAME, PROFILES_SUBDIR, profileId),
            newFilename: newAvatarName,
          });

          profile.icon = newAvatarName;
          if (!profile.avatarHistory) profile.avatarHistory = [];
          if (!profile.avatarHistory.includes(newAvatarName)) {
            profile.avatarHistory.push(newAvatarName);
          }
          isDirty = true;
          logger.info("用户档案头像绝对路径已迁移", {
            profileId,
            oldPath: icon,
            newName: newAvatarName,
          });
        } catch (e) {
          logger.warn("用户档案头像绝对路径迁移失败", {
            profileId,
            icon,
            error: e,
          });
        }
      }

      // 迁移逻辑：初始化历史记录
      if (!profile.avatarHistory) {
        try {
          const { readDir } = await import("@tauri-apps/plugin-fs");
          const profileDir = await getProfileDirPath(profileId);
          if (await exists(profileDir)) {
            const entries = await readDir(profileDir);
            const imageExts = [
              ".png",
              ".jpg",
              ".jpeg",
              ".gif",
              ".webp",
              ".svg",
            ];
            profile.avatarHistory = entries
              .filter(
                (e) =>
                  e.isFile &&
                  imageExts.some((ext) => e.name.toLowerCase().endsWith(ext)) &&
                  e.name !== "profile.json"
              )
              .map((e) => e.name);
            isDirty = true;
          }
        } catch (e) {
          logger.warn("初始化用户档案头像历史失败", { profileId, error: e });
          profile.avatarHistory = [];
        }
      }

      if (isDirty) {
        await saveProfile(profile, true);
      }

      return profile;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载用户档案失败",
        showToUser: false,
        context: { profileId },
      });
      return null;
    }
  }

  /**
   * 校验用户档案是否完整，防止损坏的文件覆盖磁盘
   */
  function validateProfile(profile: UserProfile): {
    valid: boolean;
    reason?: string;
  } {
    if (!profile.id) return { valid: false, reason: "缺少 id" };
    if (!profile.name) return { valid: false, reason: "缺少 name (档案名称)" };
    if (!profile.createdAt) return { valid: false, reason: "缺少 createdAt" };

    if (typeof profile.content !== "string") {
      return { valid: false, reason: "content 不是字符串" };
    }

    // 结构检查：检查关键配置项是否存在（即使是空的）
    if (!profile.regexConfig)
      return { valid: false, reason: "缺少 regexConfig 结构" };

    return { valid: true };
  }

  /**
   * 确保用户档案目录存在
   */
  async function ensureProfileDir(profileId: string): Promise<void> {
    const profileDir = await getProfileDirPath(profileId);
    if (!(await exists(profileDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(profileDir, { recursive: true });
      logger.debug("创建用户档案目录", { profileDir });
    }
  }

  /**
   * 保存单个用户档案（仅在内容变化时写入）
   */
  async function saveProfile(
    profile: UserProfile,
    forceWrite: boolean = false
  ): Promise<void> {
    try {
      // 保存前的严格校验
      const validation = validateProfile(profile);
      if (!validation.valid) {
        logger.error("拒绝保存不完整的用户档案，防止数据丢失", {
          profileId: profile.id,
          reason: validation.reason,
          profileName: profile.name,
        });
        // 如果是强制写入但校验失败，我们不能继续，否则会破坏磁盘文件
        if (forceWrite) {
          throw new Error(`用户档案校验失败: ${validation.reason}`);
        }
        return;
      }

      await ensureProfileDir(profile.id); // 确保用户档案目录存在
      const profilePath = await getProfileConfigPath(profile.id);

      // 在序列化之前，处理 icon 路径
      const profileToSave = JSON.parse(JSON.stringify(profile)); // 深拷贝以避免修改内存状态

      // 如果 icon 是完整的 appdata 路径（指向自己的目录），转换为相对文件名
      const icon = profileToSave.icon?.trim();
      const selfAssetPathPrefix = `appdata://user-profile-manager/${PROFILES_SUBDIR}/${profile.id}/`;
      if (icon && icon.startsWith(selfAssetPathPrefix)) {
        profileToSave.icon = icon.substring(selfAssetPathPrefix.length);
      }

      const newContent = JSON.stringify(profileToSave, null, 2);

      // 如果不是强制写入，先检查内容是否真的改变了
      if (!forceWrite) {
        const fileExists = await exists(profilePath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(profilePath);
            // 内容相同则跳过写入
            if (oldContent === newContent) {
              logger.debug("用户档案内容未变化，跳过写入", {
                profileId: profile.id,
              });
              return;
            }
          } catch (readError) {
            logger.warn("读取现有用户档案文件失败，继续写入", {
              profileId: profile.id,
            });
          }
        }
      }

      await writeTextFile(profilePath, newContent);

      logger.debug("用户档案保存成功", {
        profileId: profile.id,
        name: profile.name,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存用户档案失败",
        showToUser: false,
        context: { profileId: profile.id },
      });
      throw error;
    }
  }

  /**
   * 删除单个用户档案目录（移入回收站）
   */
  async function deleteProfileDirectory(profileId: string): Promise<void> {
    try {
      const profileDir = await getProfileDirPath(profileId);
      const relativePath = (
        await join(MODULE_NAME, PROFILES_SUBDIR, profileId)
      ).replace(/\\/g, "/");

      const dirExists = await exists(profileDir);
      if (dirExists) {
        await invoke<string>("delete_directory_in_app_data", { relativePath });
        logger.info("用户档案目录已移入回收站", {
          profileId,
          path: profileDir,
        });
      } else {
        logger.warn("用户档案目录不存在，跳过删除", {
          profileId,
          path: profileDir,
        });
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除用户档案目录失败",
        showToUser: false,
        context: { profileId },
      });
      throw error;
    }
  }

  /**
   * 扫描 user-profiles 目录，获取所有档案文件的 ID
   */
  async function scanProfileDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const profilesDir = await join(moduleDir, PROFILES_SUBDIR);

      const dirExists = await exists(profilesDir);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(profilesDir);
      // 过滤出目录项，目录名即为 profileId
      const profileIds = entries
        .filter((entry) => entry.isDirectory && entry.name)
        .map((entry) => entry.name!);

      logger.debug("扫描用户档案目录完成", { count: profileIds.length });
      return profileIds;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "扫描用户档案目录失败",
        showToUser: false,
      });
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
      displayName: profile.displayName,
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
    const indexMap = new Map(index.profiles.map((item) => [item.id, item]));

    // 3. 找出新增的文件 ID
    const newIds = fileIds.filter((id) => !indexMap.has(id));

    // 4. 加载新文件的元数据
    const newItems: ProfileIndexItem[] = [];
    for (const id of newIds) {
      const profile = await loadProfile(id);
      if (profile) {
        newItems.push(createIndexItem(profile));
      }
    }

    // 5. 过滤掉已删除的文件，保持原有顺序
    const validItems = index.profiles.filter((item) => fileIdSet.has(item.id));

    // 6. 合并：保持原有顺序，新文件追加在后面
    const syncedItems = [...validItems, ...newItems];

    if (newItems.length > 0 || validItems.length !== index.profiles.length) {
      logger.info("索引已同步", {
        total: syncedItems.length,
        new: newItems.length,
        removed: index.profiles.length - validItems.length,
      });
    }

    return syncedItems;
  }

  /**
   * 执行从 v1 (文件) 到 v2 (目录) 的数据迁移
   */
  async function runMigration(): Promise<void> {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const profilesDir = await join(moduleDir, PROFILES_SUBDIR);

    if (!(await exists(profilesDir))) {
      return; // 目录不存在，无需迁移
    }

    const entries = await readDir(profilesDir);
    const oldJsonFiles = entries.filter(
      (entry) => entry.name?.endsWith(".json") && !entry.isDirectory
    );

    if (oldJsonFiles.length === 0) {
      return; // 没有旧格式文件，无需迁移
    }

    logger.info(
      `检测到 ${oldJsonFiles.length} 个旧版用户档案文件，开始迁移...`
    );

    for (const fileEntry of oldJsonFiles) {
      const oldPath = await join(profilesDir, fileEntry.name!);
      const profileId = fileEntry.name!.replace(".json", "");

      try {
        const newConfigPath = await getProfileConfigPath(profileId);

        // 1. 确保新目录存在
        await ensureProfileDir(profileId);

        // 2. 读取旧文件内容
        const content = await readTextFile(oldPath);
        const profile: UserProfile = JSON.parse(content);

        // 3. 处理头像
        if (profile.icon && profile.icon.startsWith("appdata://")) {
          const assetRelativePath = profile.icon.substring(10);
          const assetFullPath = await join(appDir, assetRelativePath);

          if (await exists(assetFullPath)) {
            const extension = await extname(assetFullPath);
            const newAvatarName = `avatar-${Date.now()}.${extension}`;

            // 复制头像到新目录
            await invoke("copy_file_to_app_data", {
              sourcePath: assetFullPath,
              subdirectory: await join(MODULE_NAME, PROFILES_SUBDIR, profileId),
              newFilename: newAvatarName,
            });

            // 更新 profile 对象中的 icon 字段
            profile.icon = newAvatarName;
            logger.debug("用户档案头像已迁移", {
              profileId,
              oldIcon: profile.icon,
              newIcon: newAvatarName,
            });
          }
        }

        // 4. 写入新的 profile.json
        await writeTextFile(newConfigPath, JSON.stringify(profile, null, 2));

        // 5. 删除旧的 .json 文件
        await invoke("delete_file_to_trash", { filePath: oldPath });

        logger.info(`用户档案 ${profileId} 迁移成功`);
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: `迁移用户档案 ${profileId} 失败`,
          showToUser: false,
          context: { oldPath },
        });
      }
    }
    logger.info("用户档案数据迁移完成");
  }

  /**
   * 跨模块冷启动自动检测与物理迁移
   */
  async function migrateFromOldModule(): Promise<void> {
    try {
      const appDir = await getAppConfigDir();
      const oldModuleName = "llm-chat";
      const newModuleName = "user-profile-manager";

      const oldIndexManager = createConfigManager<ProfilesIndex>({
        moduleName: oldModuleName,
        fileName: "user-profiles-index.json",
        version: "1.1.0",
        createDefault: createDefaultIndex,
      });

      const newIndexExists = await exists(
        await join(appDir, newModuleName, "user-profiles-index.json")
      );
      const oldIndexExists = await exists(
        await join(appDir, oldModuleName, "user-profiles-index.json")
      );

      if (!newIndexExists && oldIndexExists) {
        logger.info("检测到旧版用户档案索引，开始跨模块迁移...");

        // 1. 加载旧索引
        const oldIndex = await oldIndexManager.load();

        // 2. 确保新目录存在
        const newProfilesDir = await join(
          appDir,
          newModuleName,
          PROFILES_SUBDIR
        );
        if (!(await exists(newProfilesDir))) {
          const { mkdir } = await import("@tauri-apps/plugin-fs");
          await mkdir(newProfilesDir, { recursive: true });
        }

        // 3. 迁移每个 profile
        const { readDir } = await import("@tauri-apps/plugin-fs");
        const oldProfilesDir = await join(
          appDir,
          oldModuleName,
          PROFILES_SUBDIR
        );
        if (await exists(oldProfilesDir)) {
          const entries = await readDir(oldProfilesDir);
          for (const entry of entries) {
            if (entry.isDirectory && entry.name) {
              const profileId = entry.name;
              const oldProfileConfigPath = await join(
                oldProfilesDir,
                profileId,
                "profile.json"
              );
              if (await exists(oldProfileConfigPath)) {
                const content = await readTextFile(oldProfileConfigPath);

                // 确保新 profile 目录存在
                const newProfileDir = await join(newProfilesDir, profileId);
                if (!(await exists(newProfileDir))) {
                  const { mkdir } = await import("@tauri-apps/plugin-fs");
                  await mkdir(newProfileDir, { recursive: true });
                }

                // 写入新路径
                const newProfileConfigPath = await join(
                  newProfileDir,
                  "profile.json"
                );
                await writeTextFile(newProfileConfigPath, content);

                // 迁移头像资产
                const oldProfileDir = await join(oldProfilesDir, profileId);
                const profileEntries = await readDir(oldProfileDir);
                for (const pEntry of profileEntries) {
                  if (
                    pEntry.isFile &&
                    pEntry.name &&
                    pEntry.name !== "profile.json"
                  ) {
                    const oldAssetPath = await join(oldProfileDir, pEntry.name);
                    // 复制头像文件
                    try {
                      await invoke("copy_file_to_app_data", {
                        sourcePath: oldAssetPath,
                        subdirectory: await join(
                          newModuleName,
                          PROFILES_SUBDIR,
                          profileId
                        ),
                        newFilename: pEntry.name,
                      });
                    } catch (e) {
                      logger.warn("复制头像资产失败", {
                        profileId,
                        asset: pEntry.name,
                        error: e,
                      });
                    }
                  }
                }

                logger.info(`跨模块迁移用户档案成功: ${profileId}`);
              }
            }
          }
        }

        // 4. 保存新索引
        await indexManager.save(oldIndex);
        logger.info("跨模块迁移用户档案索引成功");
      }
    } catch (error) {
      logger.error("跨模块迁移用户档案失败", error);
    }
  }

  /**
   * 加载用户档案索引（轻量级，仅包含元数据）
   */
  const loadProfilesIndex = async (): Promise<{
    profiles: ProfileIndexItem[];
    globalProfileId: string | null;
  }> => {
    try {
      logger.debug("开始加载用户档案索引");

      // 跨模块迁移
      await migrateFromOldModule();

      // 在加载前执行数据迁移
      await runMigration();

      // 1. 加载索引
      let index = await loadIndex();

      // 2. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);

      // 3. 如果索引被同步过，保存更新后的索引
      if (
        syncedItems.length !== index.profiles.length ||
        !syncedItems.every((item, i) => item.id === index.profiles[i]?.id)
      ) {
        index.profiles = syncedItems;
        await saveIndex(index);
      }

      return {
        profiles: syncedItems,
        globalProfileId: index.globalProfileId,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载用户档案索引失败",
        showToUser: false,
      });
      return { profiles: [], globalProfileId: null };
    }
  };

  /**
   * 加载所有用户档案（全量加载，已标记为重型操作）
   */
  const loadProfilesAll = async (): Promise<UserProfile[]> => {
    try {
      logger.debug("开始全量加载所有用户档案");

      // 1. 先加载索引元数据
      const { profiles: indexItems } = await loadProfilesIndex();

      // 2. 并行加载所有档案的完整数据
      const profilePromises = indexItems.map((item) => loadProfile(item.id));
      const profileResults = await Promise.all(profilePromises);

      // 3. 过滤掉加载失败的档案
      const profiles = profileResults.filter(
        (p): p is UserProfile => p !== null
      );

      const loadedIds = new Set(profiles.map((profile) => profile.id));
      const nextIndexItems = profiles.map((profile) =>
        createIndexItem(profile)
      );
      const indexNeedsUpdate =
        nextIndexItems.length !== indexItems.length ||
        !indexItems.every(
          (item, index) =>
            JSON.stringify(item) === JSON.stringify(nextIndexItems[index])
        );

      if (
        indexNeedsUpdate ||
        (profiles.length > 0 && indexItems.length === 0)
      ) {
        await updateIndex((index) => {
          index.profiles = nextIndexItems;
          if (index.globalProfileId && !loadedIds.has(index.globalProfileId)) {
            index.globalProfileId = null;
          }
        });
      }

      logger.info(`全量加载了 ${profiles.length} 个用户档案`);
      return profiles;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "全量加载用户档案失败",
        showToUser: false,
      });
      return [];
    }
  };

  /**
   * 加载所有用户档案（兼容接口，目前指向全量加载）
   */
  const loadProfiles = async (): Promise<UserProfile[]> => {
    return await loadProfilesAll();
  };

  /**
   * 保存单个用户档案并更新索引
   */
  const persistProfile = async (profile: UserProfile): Promise<void> => {
    try {
      logger.debug("保存单个用户档案", { profileId: profile.id });

      // 1. 保存档案文件
      await saveProfile(profile, true); // 强制写入

      // 2. 更新索引
      await updateIndex((index) => {
        // 更新或添加当前档案的索引项
        const profileIndex = index.profiles.findIndex(
          (p) => p.id === profile.id
        );
        const newIndexItem = createIndexItem(profile);

        if (profileIndex >= 0) {
          index.profiles[profileIndex] = newIndexItem;
        } else {
          index.profiles.push(newIndexItem);
        }
      });

      logger.debug("单个用户档案保存成功", { profileId: profile.id });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存单个用户档案失败",
        showToUser: false,
        context: { profileId: profile.id },
      });
      throw error;
    }
  };

  /**
   * 保存所有用户档案（仅用于批量操作）
   */
  const saveProfiles = async (profiles: UserProfile[]): Promise<void> => {
    try {
      logger.debug("开始批量保存用户档案", {
        total: profiles.length,
      });

      // 1. 并行保存完整档案文件
      await Promise.all(profiles.map((profile) => saveProfile(profile, true)));

      // 2. 更新索引
      await updateIndex((index) => {
        const profileIds = new Set(profiles.map((profile) => profile.id));
        index.profiles = profiles.map((p) => createIndexItem(p));
        if (index.globalProfileId && !profileIds.has(index.globalProfileId)) {
          index.globalProfileId = null;
        }
      });

      logger.info("所有用户档案批量保存成功", {
        profileCount: profiles.length,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "批量保存所有用户档案失败",
        showToUser: false,
        context: { profileCount: profiles.length },
      });
      throw error;
    }
  };

  /**
   * 删除用户档案（同时删除目录和索引）
   */
  const deleteProfile = async (profileId: string): Promise<void> => {
    try {
      // 1. 删除档案目录
      await deleteProfileDirectory(profileId);

      // 2. 从索引中移除
      await updateIndex((index) => {
        index.profiles = index.profiles.filter((item) => item.id !== profileId);

        // 3. 如果删除的是全局档案，清除选择
        if (index.globalProfileId === profileId) {
          index.globalProfileId = null;
        }
      });

      logger.info("用户档案已删除", { profileId });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除用户档案失败",
        showToUser: false,
        context: { profileId },
      });
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
      errorHandler.handle(error as Error, {
        userMessage: "加载用户档案设置失败",
        showToUser: false,
      });
      return { globalProfileId: null };
    }
  };

  /**
   * 保存用户档案设置
   */
  const saveSettings = async (
    settings: Partial<UserProfileSettings>
  ): Promise<void> => {
    try {
      await updateIndex((index) => {
        if (settings.globalProfileId !== undefined) {
          index.globalProfileId = settings.globalProfileId;
        }
      });
      logger.debug("保存用户档案设置成功", settings);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存用户档案设置失败",
        showToUser: false,
      });
      throw error;
    }
  };

  return {
    loadProfiles,
    loadProfilesIndex,
    loadProfilesAll,
    saveProfiles,
    persistProfile,
    deleteProfile,
    loadProfile,
    loadSettings,
    saveSettings,
    getProfileDirPath,
    getProfileConfigPath,
  };
}
