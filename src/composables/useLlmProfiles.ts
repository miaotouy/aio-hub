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
 * LLM 配置管理 Composable
 */

import { ref, computed } from "vue";
import { materializeModelIdentity } from "@aiohub/llm-core";
import type {
  LlmProfile,
  LlmModelInfo,
  LlmParameterSupport,
  ProviderType,
} from "../types/llm-profiles";
import { DEFAULT_LLM_PROFILE } from "../types/llm-profiles";
import type { LlmPreset } from "../config/llm-presets";
import { providerTypes } from "../config/llm-providers";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getAppConfigDir } from "@utils/appPath";
import {
  createLlmSecretRevision,
  createLlmSecretVault,
  extractLlmSecrets,
  mergeLlmSecrets,
  stripLlmSecrets,
  type LlmSecretMap,
} from "@utils/llm-secret";
import { normalizeIconPath } from "../config/model-metadata";
import { useModelMetadata } from "./useModelMetadata";
import { getAioDefaultHeaders } from "@/views/Settings/llm-service/config/customHeadersPresets";
import { join } from "@tauri-apps/api/path";

const logger = createModuleLogger("LlmProfiles");
const errorHandler = createModuleErrorHandler("LlmProfiles");

const STORAGE_KEY = "llm-profiles"; // 用于 localStorage 数据迁移

interface LlmProfilesConfig {
  profiles: LlmProfile[];
  /** 指向密钥仓库中最后一次完整提交的快照 */
  secretRevision?: string;
}

// 配置文件管理器（只保存渠道结构，敏感字段由密钥仓库单独管理）
const configManager = createConfigManager<LlmProfilesConfig>({
  moduleName: "llm-service",
  fileName: "profiles.json",
  version: "1.0.0",
  createDefault: () => ({ profiles: [] }),
});

// API Key 独立存储（混淆文件，与 profiles.json 同目录）
const secretVault = createLlmSecretVault({
  resolveDir: async () => join(await getAppConfigDir(), "llm-service"),
});

// 全局状态
const profiles = ref<LlmProfile[]>([]);
const isLoaded = ref(false);
let loadingPromise: Promise<void> | null = null;
let secretVaultReady = false;
let committedSecretRevision: string | null = null;
let committedSecrets: LlmSecretMap = {};

export function useLlmProfiles() {
  /**
   * 规范化配置：合并默认值并处理旧版本迁移
   */
  const normalizeProfile = (profile: any): LlmProfile => {
    // 1. 处理 API Key 迁移，并无条件移除旧版单数 apiKey 字段
    const { apiKey, ...rest } = profile;
    const inlineKeys = Array.isArray(profile.apiKeys)
      ? profile.apiKeys.filter(
          (key: unknown): key is string => typeof key === "string"
        )
      : [];
    const apiKeys =
      inlineKeys.length > 0
        ? inlineKeys
        : typeof apiKey === "string" && apiKey.length > 0
          ? [apiKey]
          : [];

    // 2. 深度合并与规范化
    const normalized: LlmProfile = {
      ...DEFAULT_LLM_PROFILE,
      ...rest,
      apiKeys: apiKeys,
      logoUrl: rest.logoUrl || undefined,
      icon: rest.icon ? normalizeIconPath(rest.icon) : undefined,
      models: Array.isArray(rest.models)
        ? rest.models.map((m: any) => {
            const normalizedModel = {
              ...m,
              icon: m.icon ? normalizeIconPath(m.icon) : undefined,
            };
            delete normalizedModel.modelIdentitySuggestion;
            return normalizedModel;
          })
        : [],
      customHeaders: rest.customHeaders || DEFAULT_LLM_PROFILE.customHeaders,
      networkStrategy:
        rest.networkStrategy || DEFAULT_LLM_PROFILE.networkStrategy,
    };
    return normalized;
  };

  const persistProfiles = async (nextProfiles: LlmProfile[]) => {
    if (!secretVaultReady) {
      throw new Error("LLM 密钥仓库尚未成功加载，已阻止覆盖保存");
    }

    const nextSecrets = extractLlmSecrets(nextProfiles);
    const nextRevision = createLlmSecretRevision();
    await secretVault.stage({
      revision: nextRevision,
      secrets: nextSecrets,
      previousRevision: committedSecretRevision,
      previousSecrets: committedSecrets,
    });
    await configManager.save({
      profiles: stripLlmSecrets(nextProfiles),
      secretRevision: nextRevision,
    });

    committedSecretRevision = nextRevision;
    committedSecrets = nextSecrets;
  };

  /**
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  const loadProfiles = async () => {
    // 如果已经加载完成，直接返回
    if (isLoaded.value) return;

    // 如果正在加载中，返回现有的 promise
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      let resolvedProfiles: LlmProfile[] | null = null;
      try {
        logger.info("开始加载 LLM 配置");

        // 尝试从文件系统加载
        const config = await configManager.load();
        let loadedProfiles = config.profiles || [];
        let fromLocalStorage = false;

        // 如果文件系统中没有数据，尝试从 localStorage 迁移
        if (loadedProfiles.length === 0) {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            logger.info("检测到 localStorage 数据，开始迁移到文件系统");
            try {
              const rawProfiles = JSON.parse(stored);
              loadedProfiles = Array.isArray(rawProfiles) ? rawProfiles : [];
              fromLocalStorage = true;

              // 成功提交到配置文件和密钥仓库后再清除 localStorage。
            } catch (parseError) {
              errorHandler.handle(parseError, {
                userMessage: "解析 localStorage 数据失败",
                showToUser: false,
              });
            }
          }
        }

        // 规范化现有数据，确保新字段合并
        const normalized = loadedProfiles.map(normalizeProfile);
        resolvedProfiles = normalized;

        // 按配置 revision 读取最后一次完整提交；部分写入时自动回退 previous
        const loadedSecrets = await secretVault.load(
          config.secretRevision ?? null
        );
        const reconciled = mergeLlmSecrets(normalized, loadedSecrets.secrets);

        profiles.value = reconciled.profiles;
        committedSecretRevision = loadedSecrets.revision;
        committedSecrets = loadedSecrets.secrets;
        secretVaultReady = true;

        if (
          reconciled.changed ||
          fromLocalStorage ||
          loadedSecrets.needsRewrite ||
          !config.secretRevision
        ) {
          await persistProfiles(reconciled.profiles);
          if (fromLocalStorage) localStorage.removeItem(STORAGE_KEY);
          logger.info("渠道敏感字段已迁移到独立密钥仓库", {
            profileCount: reconciled.profiles.length,
            secretCount: Object.keys(reconciled.secrets).length,
          });
        }

        isLoaded.value = true;
        logger.info("LLM 配置加载成功", {
          profileCount: reconciled.profiles.length,
        });
      } catch (error) {
        secretVaultReady = false;
        errorHandler.error(error, "加载 LLM 配置失败");
        // 渠道结构已读到就保留，仅密钥不可用；secretVaultReady=false 已阻止覆盖保存
        profiles.value = resolvedProfiles ?? [];
        isLoaded.value = true;
      } finally {
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  };

  /**
   * 保存配置到文件系统
   */
  const saveToStorage = async () => {
    try {
      logger.debug("保存 LLM 配置到文件系统", {
        profileCount: profiles.value.length,
      });
      // revision 快照链确保两份文件部分写入时可回退到最后一次完整提交
      await persistProfiles(profiles.value);
      logger.info("LLM 配置保存成功");
    } catch (error) {
      errorHandler.error(error, "保存 LLM 配置失败", {
        context: { profileCount: profiles.value.length },
      });
      throw error;
    }
  };

  /**
   * 添加或更新配置
   */
  const saveProfile = async (profile: LlmProfile) => {
    try {
      const index = profiles.value.findIndex((p) => p.id === profile.id);
      if (index !== -1) {
        // 更新现有配置
        logger.info("更新 LLM 配置", {
          profileId: profile.id,
          profileName: profile.name,
        });
        // 调用方可能只回写局部字段（例如刷新模型后）：未提供有效值的敏感字段
        // 保留原值，避免不完整的对象把已保存的 API Key、自定义请求头静默清空
        const existing = profiles.value[index];
        const merged: LlmProfile = { ...existing, ...profile };
        if (!Array.isArray(profile.apiKeys)) {
          merged.apiKeys = existing.apiKeys;
        }
        if (
          !profile.customHeaders ||
          typeof profile.customHeaders !== "object"
        ) {
          merged.customHeaders = existing.customHeaders;
        }
        profiles.value[index] = merged;
      } else {
        // 添加新配置
        logger.info("添加新 LLM 配置", {
          profileId: profile.id,
          profileName: profile.name,
        });
        profiles.value.push(profile);
      }
      await saveToStorage();
    } catch (error) {
      errorHandler.error(error, "保存 LLM 配置失败", {
        context: {
          profileId: profile.id,
          profileName: profile.name,
        },
      });
      throw error;
    }
  };

  /**
   * 删除配置
   */
  const deleteProfile = async (id: string) => {
    try {
      const index = profiles.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        const profileName = profiles.value[index].name;
        logger.info("删除 LLM 配置", { profileId: id, profileName });
        profiles.value.splice(index, 1);
        await saveToStorage();
      } else {
        logger.warn("尝试删除不存在的配置", { profileId: id });
      }
    } catch (error) {
      errorHandler.error(error, "删除 LLM 配置失败", {
        context: { profileId: id },
      });
      throw error;
    }
  };

  /**
   * 根据 ID 获取配置
   */
  const getProfileById = (id: string): LlmProfile | undefined => {
    return profiles.value.find((p) => p.id === id);
  };

  /**
   * 获取所有启用的配置
   */
  const enabledProfiles = computed(() => {
    return profiles.value.filter((p) => p.enabled);
  });

  /**
   * 获取包含视觉模型的配置
   */
  const visionProfiles = computed(() => {
    return enabledProfiles.value.filter((p) =>
      p.models.some((m) => m.capabilities?.vision)
    );
  });

  /**
   * 切换配置的启用状态
   */
  const toggleProfileEnabled = async (id: string) => {
    try {
      const profile = profiles.value.find((p) => p.id === id);
      if (profile) {
        profile.enabled = !profile.enabled;
        logger.info("切换 LLM 配置状态", {
          profileId: id,
          profileName: profile.name,
          enabled: profile.enabled,
        });
        await saveToStorage();
      } else {
        logger.warn("尝试切换不存在的配置", { profileId: id });
      }
    } catch (error) {
      errorHandler.error(error, "切换配置状态失败", {
        context: { profileId: id },
      });
      throw error;
    }
  };

  /**
   * 更新配置顺序
   */
  const updateProfilesOrder = async (newProfiles: LlmProfile[]) => {
    try {
      logger.info("更新 LLM 配置顺序", { count: newProfiles.length });
      profiles.value = newProfiles;
      await saveToStorage();
    } catch (error) {
      errorHandler.error(error, "更新 LLM 配置顺序失败");
      throw error;
    }
  };

  const { materializeModel } = useModelMetadata();

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
      models: preset.defaultModels
        ? preset.defaultModels.map((model) =>
            attachMatchedModelMetadata(model, preset.type)
          )
        : [],
      networkStrategy: "auto",
      logoUrl: preset.logoUrl,
      icon: preset.logoUrl, // 同时设置 icon 字段，确保供应商图标正确显示
      links: preset.links ? [...preset.links] : [],
      customEndpoints: preset.customEndpoints
        ? { ...preset.customEndpoints }
        : undefined,
      customHeaders: getAioDefaultHeaders(),
    };
  };

  const attachMatchedModelMetadata = (
    model: LlmModelInfo,
    providerType: ProviderType
  ): LlmModelInfo => {
    const materialized = materializeModel({
      ...model,
      provider: model.provider || providerType,
    }).model;
    return materializeModelIdentity(materialized);
  };
  /**
   * 获取指定渠道类型支持的参数
   */
  const getSupportedParameters = (
    providerType: ProviderType
  ): LlmParameterSupport => {
    const provider = providerTypes.find((p) => p.type === providerType);

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
    updateProfilesOrder,
    generateId,
    createFromPreset,
    getSupportedParameters,
  };
}
