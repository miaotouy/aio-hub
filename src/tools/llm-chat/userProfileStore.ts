/**
 * 用户档案管理 Store
 */

import { defineStore } from "pinia";
import { useUserProfileStorage } from "./composables/useUserProfileStorage";
import { type UserProfile, createDefaultUserProfileConfig } from "./types";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";

const logger = createModuleLogger("llm-chat/userProfileStore");
const errorHandler = createModuleErrorHandler("llm-chat/userProfileStore");

interface UserProfileStoreState {
  /** 所有用户档案列表 */
  profiles: UserProfile[];
  /** 当前全局选中的用户档案 ID */
  globalProfileId: string | null;
}

export const useUserProfileStore = defineStore("llmChatUserProfile", {
  state: (): UserProfileStoreState => ({
    profiles: [],
    globalProfileId: null,
  }),

  getters: {
    /**
     * 根据 ID 获取用户档案
     */
    getProfileById:
      (state) =>
      (id: string): UserProfile | undefined => {
        return state.profiles.find((profile) => profile.id === id);
      },

    /**
     * 按最后使用时间排序的档案列表
     */
    sortedProfiles: (state): UserProfile[] => {
      return [...state.profiles].sort((a, b) => {
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      });
    },

    /**
     * 当前全局选中的用户档案
     */
    globalProfile: (state): UserProfile | null => {
      if (!state.globalProfileId) return null;
      return (
        state.profiles.find(
          (profile) => profile.id === state.globalProfileId,
        ) || null
      );
    },

    /**
     * 获取所有已启用的档案（按最后使用时间排序）
     */
    enabledProfiles(): UserProfile[] {
      return this.sortedProfiles.filter((p) => p.enabled !== false);
    },
  },

  actions: {
    /**
     * 创建新用户档案
     */
    createProfile(
      name: string,
      content: string,
      options?: {
        displayName?: string;
        icon?: string;
        richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
        richTextStyleBehavior?: "follow_agent" | "custom";
        regexConfig?: import("./types").ChatRegexConfig;
      },
    ): string {
      const profileId = `user-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      const defaults = createDefaultUserProfileConfig();

      const profile: UserProfile = {
        ...defaults,
        id: profileId,
        name,
        content,
        createdAt: now,
        // 使用传入的 options 覆盖默认值（如果存在）
        displayName: options?.displayName ?? defaults.displayName,
        icon: options?.icon ?? defaults.icon,
        richTextStyleOptions:
          options?.richTextStyleOptions ?? defaults.richTextStyleOptions,
        richTextStyleBehavior:
          options?.richTextStyleBehavior ?? defaults.richTextStyleBehavior,
        regexConfig: options?.regexConfig ?? defaults.regexConfig,
      };

      this.profiles.push(profile);
      this.persistProfile(profileId); // 使用单个档案保存

      logger.info("创建新用户档案", {
        profileId,
        name,
      });

      return profileId;
    },
    /**
     * 更新用户档案
     */
    updateProfile(
      profileId: string,
      updates: Partial<Omit<UserProfile, "id" | "createdAt">>,
    ): void {
      const profile = this.profiles.find((p) => p.id === profileId);
      if (!profile) {
        logger.warn("更新用户档案失败：档案不存在", { profileId });
        return;
      }

      Object.assign(profile, updates);

      this.persistProfile(profileId);
      logger.info("更新用户档案成功", { profileId, updates });
    },

    /**
     * 删除用户档案
     */
    deleteProfile(profileId: string): void {
      const index = this.profiles.findIndex((p) => p.id === profileId);
      if (index === -1) {
        logger.warn("删除用户档案失败：档案不存在", { profileId });
        return;
      }

      const profile = this.profiles[index];

      // 使用新的 deleteProfile 方法（会同时删除文件和索引）
      const { deleteProfile } = useUserProfileStorage();
      deleteProfile(profileId).catch((error: unknown) =>
        errorHandler.handle(error as Error, {
          userMessage: "删除用户档案文件失败",
          showToUser: false,
          context: { profileId },
        }),
      );

      this.profiles.splice(index, 1);

      // 如果删除的是当前全局档案，则清除全局设置
      if (this.globalProfileId === profileId) {
        this.globalProfileId = null;
        this.persistSettings();
      }

      logger.info("用户档案已删除", { profileId, name: profile.name });
    },

    /**
     * 设置全局默认档案
     */
    selectGlobalProfile(profileId: string | null): void {
      if (profileId && !this.profiles.find((p) => p.id === profileId)) {
        logger.warn("设置全局档案失败：档案不存在", { profileId });
        return;
      }

      this.globalProfileId = profileId;
      this.persistSettings();

      logger.info("设置全局用户档案", { profileId });
    },

    /**
     * 更新档案的最后使用时间
     */
    updateLastUsed(profileId: string): void {
      const profile = this.profiles.find((p) => p.id === profileId);
      if (profile) {
        profile.lastUsedAt = new Date().toISOString();
        this.persistProfile(profileId);
      }
    },

    /**
     * 切换档案启用状态
     */
    toggleProfileEnabled(profileId: string): void {
      const profile = this.profiles.find((p) => p.id === profileId);
      if (!profile) {
        logger.warn("切换档案启用状态失败：档案不存在", { profileId });
        return;
      }

      profile.enabled = !profile.enabled;
      this.persistProfile(profileId);

      logger.info("切换用户档案启用状态", {
        profileId,
        enabled: profile.enabled,
      });
    },

    /**
     * 持久化所有用户档案到文件（批量操作）
     */
    persistProfiles(): void {
      const { saveProfiles } = useUserProfileStorage();
      saveProfiles(this.profiles).catch((error: unknown) =>
        errorHandler.handle(error as Error, {
          userMessage: "持久化用户档案失败",
          showToUser: false,
          context: { profileCount: this.profiles.length },
        }),
      );
    },

    /**
     * 持久化单个档案到文件（推荐使用）
     */
    persistProfile(profileId: string): void {
      const profile = this.profiles.find((p) => p.id === profileId);
      if (!profile) {
        logger.warn("档案不存在，无法持久化", { profileId });
        return;
      }

      const { persistProfile } = useUserProfileStorage();
      persistProfile(profile).catch((error: unknown) =>
        errorHandler.handle(error as Error, {
          userMessage: "持久化单个用户档案失败",
          showToUser: false,
          context: { profileId },
        }),
      );
    },

    /**
     * 持久化设置（全局档案选择）到文件
     */
    persistSettings(): void {
      const { saveSettings } = useUserProfileStorage();
      saveSettings({ globalProfileId: this.globalProfileId }).catch(
        (error: unknown) =>
          errorHandler.handle(error as Error, {
            userMessage: "持久化用户档案设置失败",
            showToUser: false,
          }),
      );
    },

    /**
     * 从文件加载用户档案
     */
    async loadProfiles(): Promise<void> {
      try {
        const { loadProfiles, loadSettings } = useUserProfileStorage();

        // 加载档案列表
        const profiles = await loadProfiles();
        if (profiles.length > 0) {
          this.profiles = profiles;
          logger.info("加载用户档案成功", {
            profileCount: this.profiles.length,
          });
        }

        // 加载设置
        const settings = await loadSettings();
        if (settings.globalProfileId) {
          this.globalProfileId = settings.globalProfileId;
          logger.info("加载用户档案设置成功", {
            globalProfileId: settings.globalProfileId,
          });
        }
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: "加载用户档案失败",
          showToUser: false,
        });
        this.profiles = [];
        this.globalProfileId = null;
      }
    },
  },
});
