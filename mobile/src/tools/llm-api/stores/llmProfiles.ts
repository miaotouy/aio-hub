import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { LlmProfile } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";

const logger = createModuleLogger("LlmProfilesStore");
const errorHandler = createModuleErrorHandler("LlmProfilesStore");

interface LlmProfilesState {
  profiles: LlmProfile[];
  selectedProfileId: string | null;
}

const DEFAULT_STATE: LlmProfilesState = {
  profiles: [],
  selectedProfileId: null,
};

const configManager = createConfigManager<LlmProfilesState>({
  moduleName: "llm-profiles",
  fileName: "llm_profiles.json",
  version: "1.0.0",
  createDefault: () => DEFAULT_STATE,
});

export const useLlmProfilesStore = defineStore("llm-profiles", () => {
  const profiles = ref<LlmProfile[]>([]);
  const selectedProfileId = ref<string | null>(null);
  const isLoaded = ref(false);
  const isLoading = ref(false);

  async function init() {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    try {
      const loaded = await configManager.load();
      profiles.value = loaded.profiles || [];
      selectedProfileId.value = loaded.selectedProfileId || null;
      logger.info("LLM 配置加载成功", { count: profiles.value.length });
    } catch (err) {
      errorHandler.error(err, "加载 LLM 配置失败");
    } finally {
      isLoading.value = false;
      isLoaded.value = true;
    }
  }

  async function save() {
    try {
      await configManager.save({
        profiles: profiles.value,
        selectedProfileId: selectedProfileId.value,
      });
    } catch (err) {
      errorHandler.error(err, "保存 LLM 配置失败");
    }
  }

  const selectedProfile = computed(() => {
    if (!selectedProfileId.value) return profiles.value.find(p => p.enabled) || null;
    return profiles.value.find(p => p.id === selectedProfileId.value) || null;
  });

  const enabledProfiles = computed(() => profiles.value.filter(p => p.enabled));

  function addProfile(profile: LlmProfile) {
    // 确保必要字段存在
    const newProfile: LlmProfile = {
      ...profile,
      customHeaders: profile.customHeaders || {},
      customEndpoints: profile.customEndpoints || {},
      models: profile.models || [],
      apiKeys: profile.apiKeys || [],
    };
    profiles.value.push(newProfile);
    if (!selectedProfileId.value) selectedProfileId.value = newProfile.id;
    save();
  }

  function updateProfile(id: string, updates: Partial<LlmProfile>) {
    const index = profiles.value.findIndex(p => p.id === id);
    if (index !== -1) {
      profiles.value[index] = { ...profiles.value[index], ...updates };
      save();
    }
  }

  function deleteProfile(id: string) {
    profiles.value = profiles.value.filter(p => p.id !== id);
    if (selectedProfileId.value === id) {
      selectedProfileId.value = profiles.value[0]?.id || null;
    }
    save();
  }

  function selectProfile(id: string) {
    selectedProfileId.value = id;
    save();
  }

  return {
    profiles,
    selectedProfileId,
    selectedProfile,
    enabledProfiles,
    isLoaded,
    isLoading,
    init,
    save,
    addProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
  };
});