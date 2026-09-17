import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { appDataDir } from "@tauri-apps/api/path";
import type { LlmModelInfo, LlmProfile } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createConfigManager } from "@/utils/configManager";
import {
  createLlmSecretRevision,
  createLlmSecretVault,
  extractLlmSecrets,
  mergeLlmSecrets,
  stripLlmSecrets,
  type LlmSecretMap,
} from "@shared/utils/llm-secret";

const logger = createModuleLogger("LlmProfilesStore");
const errorHandler = createModuleErrorHandler("LlmProfilesStore");

// API Key 独立存储（混淆文件），与渠道配置分离落盘
const secretVault = createLlmSecretVault({
  resolveDir: appDataDir,
  fileName: "llm_service_secrets.dat",
});

function normalizeStoredModel(model: LlmModelInfo): LlmModelInfo {
  const normalized = { ...model };
  delete normalized.modelIdentitySuggestion;
  return normalized;
}

interface LlmProfilesState {
  profiles: LlmProfile[];
  selectedProfileId: string | null;
  /** 指向密钥仓库中最后一次完整提交的快照 */
  secretRevision?: string;
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
  let secretVaultReady = false;
  let committedSecretRevision: string | null = null;
  let committedSecrets: LlmSecretMap = {};

  async function persistProfiles() {
    if (!secretVaultReady) {
      throw new Error("LLM 密钥仓库尚未成功加载，已阻止覆盖保存");
    }

    const nextSecrets = extractLlmSecrets(profiles.value);
    const nextRevision = createLlmSecretRevision();
    await secretVault.stage({
      revision: nextRevision,
      secrets: nextSecrets,
      previousRevision: committedSecretRevision,
      previousSecrets: committedSecrets,
    });
    await configManager.save({
      profiles: stripLlmSecrets(profiles.value),
      selectedProfileId: selectedProfileId.value,
      secretRevision: nextRevision,
    });

    committedSecretRevision = nextRevision;
    committedSecrets = nextSecrets;
  }

  async function init() {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    let resolvedProfiles: LlmProfile[] | null = null;
    try {
      const loaded = await configManager.load();
      const normalized = (loaded.profiles || []).map((profile) => ({
        ...profile,
        models: (profile.models || []).map(normalizeStoredModel),
      }));
      resolvedProfiles = normalized;

      // 按配置 revision 读取最后一次完整提交；部分写入时自动回退 previous
      const loadedSecrets = await secretVault.load(
        loaded.secretRevision ?? null
      );
      const reconciled = mergeLlmSecrets(normalized, loadedSecrets.secrets);
      profiles.value = reconciled.profiles;
      selectedProfileId.value = loaded.selectedProfileId || null;
      committedSecretRevision = loadedSecrets.revision;
      committedSecrets = loadedSecrets.secrets;
      secretVaultReady = true;

      if (
        reconciled.changed ||
        loadedSecrets.needsRewrite ||
        !loaded.secretRevision
      ) {
        await persistProfiles();
        logger.info("渠道敏感字段已迁移到独立密钥仓库", {
          count: reconciled.profiles.length,
        });
      }

      logger.info("LLM 配置加载成功", { count: profiles.value.length });
    } catch (err) {
      secretVaultReady = false;
      errorHandler.error(err, "加载 LLM 配置失败");
      // 渠道结构已读到就保留，仅密钥不可用；secretVaultReady=false 已阻止覆盖保存
      profiles.value = resolvedProfiles ?? [];
    } finally {
      isLoading.value = false;
      isLoaded.value = true;
    }
  }

  async function save() {
    try {
      // revision 快照链确保两份文件部分写入时可回退到最后一次完整提交
      await persistProfiles();
    } catch (err) {
      errorHandler.error(err, "保存 LLM 配置失败");
    }
  }

  const selectedProfile = computed(() => {
    if (!selectedProfileId.value)
      return profiles.value.find((p) => p.enabled) || null;
    return profiles.value.find((p) => p.id === selectedProfileId.value) || null;
  });

  const enabledProfiles = computed(() =>
    profiles.value.filter((p) => p.enabled)
  );

  function addProfile(profile: LlmProfile) {
    // 确保必要字段存在
    const newProfile: LlmProfile = {
      ...profile,
      customHeaders: profile.customHeaders || {},
      customEndpoints: profile.customEndpoints || {},
      models: (profile.models || []).map(normalizeStoredModel),
      apiKeys: profile.apiKeys || [],
    };
    profiles.value.push(newProfile);
    if (!selectedProfileId.value) selectedProfileId.value = newProfile.id;
    save();
  }

  function updateProfile(id: string, updates: Partial<LlmProfile>) {
    const index = profiles.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      const existing = profiles.value[index];
      // 未提供有效值的敏感字段保留原值，避免部分更新把已保存的密钥静默清空
      const updated: LlmProfile = { ...existing, ...updates };
      if (!Array.isArray(updates.apiKeys)) updated.apiKeys = existing.apiKeys;
      if (!updates.customHeaders || typeof updates.customHeaders !== "object") {
        updated.customHeaders = existing.customHeaders;
      }
      profiles.value[index] = {
        ...updated,
        models: (updated.models || []).map(normalizeStoredModel),
      };
      save();
    }
  }

  function deleteProfile(id: string) {
    profiles.value = profiles.value.filter((p) => p.id !== id);
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
