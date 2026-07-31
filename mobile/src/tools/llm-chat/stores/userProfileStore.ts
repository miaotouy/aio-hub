import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type { MobileUserProfile, MobileUserProfileConfig } from "../types";

const logger = createModuleLogger("llm-chat/user-profile-store");
const errorHandler = createModuleErrorHandler("llm-chat/user-profile-store");

const profileManager = createConfigManager<MobileUserProfileConfig>({
  moduleName: "llm-chat",
  fileName: "user-profiles.json",
  version: "1.0.0",
  createDefault: () => ({ profiles: [], globalProfileId: null }),
  mergeConfig: (defaultConfig, loadedConfig) => ({
    ...defaultConfig,
    ...loadedConfig,
    profiles: Array.isArray(loadedConfig.profiles) ? loadedConfig.profiles : [],
    globalProfileId:
      typeof loadedConfig.globalProfileId === "string"
        ? loadedConfig.globalProfileId
        : null,
  }),
});

export const useUserProfileStore = defineStore("llm-chat-user-profiles", () => {
  const profiles = ref<MobileUserProfile[]>([]);
  const globalProfileId = ref<string | null>(null);
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const sortedProfiles = computed(() =>
    [...profiles.value].sort((a, b) =>
      (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt)
    )
  );
  const globalProfile = computed(
    () =>
      profiles.value.find((profile) => profile.id === globalProfileId.value) ??
      null
  );

  function createConfigSnapshot(): MobileUserProfileConfig {
    return {
      profiles: profiles.value,
      globalProfileId: globalProfileId.value,
    };
  }

  async function persist(): Promise<void> {
    await profileManager.save(createConfigSnapshot());
  }

  function persistDebounced(): void {
    profileManager.saveDebounced(createConfigSnapshot());
  }

  async function init(): Promise<void> {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    try {
      const config = await profileManager.load();
      profiles.value = config.profiles.filter(
        (profile): profile is MobileUserProfile =>
          Boolean(profile) &&
          typeof profile.id === "string" &&
          typeof profile.name === "string" &&
          typeof profile.content === "string"
      );
      globalProfileId.value = profiles.value.some(
        (profile) => profile.id === config.globalProfileId
      )
        ? config.globalProfileId
        : null;
      isLoaded.value = true;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载用户档案失败",
        showToUser: false,
      });
      profiles.value = [];
      globalProfileId.value = null;
      isLoaded.value = true;
    } finally {
      isLoading.value = false;
    }
  }

  function getProfileById(
    id: string | null | undefined
  ): MobileUserProfile | null {
    if (!id) return null;
    return profiles.value.find((profile) => profile.id === id) ?? null;
  }

  function getEffectiveProfile(
    agentProfileId?: string | null
  ): MobileUserProfile | null {
    const agentProfile = getProfileById(agentProfileId);
    if (agentProfile?.enabled) return agentProfile;
    return globalProfile.value?.enabled ? globalProfile.value : null;
  }

  function assertUniqueName(name: string, excludingId?: string): void {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (
      profiles.value.some(
        (profile) =>
          profile.id !== excludingId &&
          profile.name.trim().toLocaleLowerCase() === normalizedName
      )
    ) {
      throw new Error("USER_PROFILE_NAME_DUPLICATE");
    }
  }

  async function createProfile(
    input: Pick<MobileUserProfile, "name" | "content"> &
      Partial<Pick<MobileUserProfile, "displayName" | "icon" | "enabled">>
  ): Promise<MobileUserProfile> {
    const name = input.name.trim();
    if (!name) throw new Error("USER_PROFILE_NAME_REQUIRED");
    assertUniqueName(name);
    const now = new Date().toISOString();
    const profile: MobileUserProfile = {
      id: uuidv4(),
      name,
      content: input.content,
      ...(input.displayName?.trim()
        ? { displayName: input.displayName.trim() }
        : {}),
      ...(input.icon?.trim() ? { icon: input.icon.trim() } : {}),
      enabled: input.enabled !== false,
      createdAt: now,
    };
    profiles.value.unshift(profile);
    if (!globalProfileId.value) globalProfileId.value = profile.id;
    await persist();
    logger.info("Created user profile", { id: profile.id });
    return profile;
  }

  async function updateProfile(
    id: string,
    updates: Pick<MobileUserProfile, "name" | "content"> &
      Partial<Pick<MobileUserProfile, "displayName" | "icon" | "enabled">>
  ): Promise<MobileUserProfile | null> {
    const index = profiles.value.findIndex((profile) => profile.id === id);
    if (index < 0) return null;
    const name = updates.name.trim();
    if (!name) throw new Error("USER_PROFILE_NAME_REQUIRED");
    assertUniqueName(name, id);
    const updated: MobileUserProfile = {
      ...profiles.value[index],
      ...updates,
      name,
      content: updates.content,
      displayName: updates.displayName?.trim() || undefined,
      icon: updates.icon?.trim() || undefined,
      enabled: updates.enabled !== false,
    };
    profiles.value[index] = updated;
    await persist();
    return updated;
  }

  async function removeProfile(id: string): Promise<void> {
    profiles.value = profiles.value.filter((profile) => profile.id !== id);
    if (globalProfileId.value === id) {
      globalProfileId.value = profiles.value[0]?.id ?? null;
    }
    await persist();
  }

  async function setGlobalProfile(id: string | null): Promise<void> {
    globalProfileId.value = id && getProfileById(id) ? id : null;
    await persist();
  }

  function markUsed(id: string): void {
    const profile = getProfileById(id);
    if (!profile) return;
    profile.lastUsedAt = new Date().toISOString();
    persistDebounced();
  }

  return {
    profiles,
    sortedProfiles,
    globalProfileId,
    globalProfile,
    isLoaded,
    isLoading,
    init,
    getProfileById,
    getEffectiveProfile,
    createProfile,
    updateProfile,
    removeProfile,
    setGlobalProfile,
    markUsed,
  };
});
