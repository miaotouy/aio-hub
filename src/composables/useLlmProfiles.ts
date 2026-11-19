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
import {
  materializeModelIdentity,
  normalizeDeepSeekProfile,
} from "@aiohub/llm-core";
import type {
  LlmProfile,
  LlmModelInfo,
  LlmParameterSupport,
  ProviderType,
} from "../types/llm-profiles";
import { migrateAggregateProfile } from "@/utils/llm-aggregate-profile";
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
import { join } from "@/platform/native/path";

import {
  normalizeLlmProfile,
  type LlmProfilesSnapshot,
} from "../llm-apis/configuration/profiles";
import { getElectronBridge, request } from "../platform/electron/client";

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
const revision = ref<string | null>(null);
let committedSecrets: LlmSecretMap = {};
let committedProfiles: LlmProfile[] = [];
let profileWriteQueue: Promise<unknown> = Promise.resolve();

export function useLlmProfiles() {
  /**
   * 规范化配置：合并默认值并处理旧版本迁移
   */
  const normalizeProfile = (profile: any) =>
    normalizeLlmProfile(profile, normalizeIconPath);

  const persistProfiles = async (
    nextProfiles: LlmProfile[],
    expectedRevision = revision.value
  ): Promise<LlmProfilesSnapshot> => {
    if (!secretVaultReady)
      throw new Error("渠道配置尚未成功加载，请刷新后重试");
    let saved: LlmProfilesSnapshot;
    if (getElectronBridge()) {
      saved = await request<LlmProfilesSnapshot>("llm.config.save", {
        profiles: nextProfiles,
        expectedRevision,
      });
    } else {
      if (expectedRevision !== revision.value)
        throw Object.assign(new Error("渠道配置已更新，请刷新后重新保存"), {
          code: "LLM_CONFIG_CONFLICT",
        });
      const nextSecrets = extractLlmSecrets(nextProfiles);
      const nextRevision = createLlmSecretRevision();
      await secretVault.stage({
        revision: nextRevision,
        secrets: nextSecrets,
        previousRevision: revision.value,
        previousSecrets: committedSecrets,
      });
      await configManager.save({
        profiles: stripLlmSecrets(nextProfiles),
        secretRevision: nextRevision,
      });
      committedSecrets = nextSecrets;
      saved = { profiles: nextProfiles, revision: nextRevision };
    }
    committedProfiles = JSON.parse(JSON.stringify(saved.profiles));
    profiles.value = JSON.parse(JSON.stringify(saved.profiles));
    revision.value = saved.revision;
    return saved;
  };

  const enqueueWrite = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = profileWriteQueue.catch(() => {}).then(operation);
    profileWriteQueue = task;
    return task;
  };

  const writeProfiles = (
    update: (latest: LlmProfile[]) => LlmProfile[],
    expectedRevision?: string | null
  ) =>
    enqueueWrite(async () => {
      try {
        // A failed initial load has no usable revision. Recover it before building a write.
        if (!secretVaultReady) await loadProfiles(true);
        return await persistProfiles(
          update(JSON.parse(JSON.stringify(committedProfiles))),
          expectedRevision === undefined ? revision.value : expectedRevision
        );
      } catch (error) {
        errorHandler.error(error, "保存 LLM 配置失败");
        throw error;
      }
    });

  /**
   * 从文件系统加载配置（支持 localStorage 迁移）
   */
  const loadProfiles = async (force = false) => {
    // 如果已经加载完成，直接返回
    if (isLoaded.value && !force) return;

    // 如果正在加载中，返回现有的 promise
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      let resolvedProfiles: LlmProfile[] | null = null;
      try {
        logger.info("开始加载 LLM 配置");

        if (getElectronBridge()) {
          const snapshot =
            await request<LlmProfilesSnapshot>("llm.config.load");
          profiles.value = snapshot.profiles.map(normalizeProfile);
          committedProfiles = JSON.parse(JSON.stringify(profiles.value));
          revision.value = snapshot.revision;
          secretVaultReady = true;
          const stored =
            profiles.value.length === 0
              ? localStorage.getItem(STORAGE_KEY)
              : null;
          if (stored) {
            let legacy: unknown;
            try {
              legacy = JSON.parse(stored);
            } catch (error) {
              errorHandler.handle(error, {
                userMessage: "解析 localStorage 数据失败",
                showToUser: false,
              });
            }
            if (Array.isArray(legacy)) {
              await persistProfiles(legacy.map(normalizeProfile));
              localStorage.removeItem(STORAGE_KEY);
            }
          }
          isLoaded.value = true;
          return;
        }

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
        committedProfiles = JSON.parse(JSON.stringify(profiles.value));
        revision.value = loadedSecrets.revision;
        committedSecrets = loadedSecrets.secrets;
        secretVaultReady = true;

        if (
          reconciled.changed ||
          normalized.some(
            (profile, index) =>
              profile.type !== loadedProfiles[index]?.type ||
              profile.baseUrl !== loadedProfiles[index]?.baseUrl ||
              profile.options?.deepseekBeta !==
                loadedProfiles[index]?.options?.deepseekBeta
          ) ||
          fromLocalStorage ||
          loadedSecrets.needsRewrite ||
          !config.secretRevision
        ) {
          await persistProfiles(reconciled.profiles);
          if (fromLocalStorage) localStorage.removeItem(STORAGE_KEY);
          logger.info("LLM 渠道配置已完成兼容迁移", {
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
        if (!force) profiles.value = resolvedProfiles ?? [];
        isLoaded.value = false;
        if (force) throw error;
      } finally {
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  };

  /** Full drafts carry the revision at which editing began. */
  const saveProfile = (
    value: LlmProfile,
    options: { expectedRevision?: string | null } = {}
  ) => {
    const profile = migrateAggregateProfile(JSON.parse(JSON.stringify(value)));
    // Inserting a fresh id is a queued domain operation; existing drafts keep their original CAS baseline.
    const creating =
      !committedProfiles.some((item) => item.id === profile.id) &&
      (options.expectedRevision == null ||
        options.expectedRevision === revision.value);
    const expectedRevision = creating
      ? undefined
      : options.expectedRevision === undefined
        ? revision.value
        : options.expectedRevision;
    return writeProfiles((latest) => {
      const index = latest.findIndex((item) => item.id === profile.id);
      const existing = latest[index];
      const merged = { ...existing, ...profile };
      if (existing && !Array.isArray(profile.apiKeys))
        merged.apiKeys = existing.apiKeys;
      if (
        existing &&
        (!profile.customHeaders || typeof profile.customHeaders !== "object")
      )
        merged.customHeaders = existing.customHeaders;
      const normalized = normalizeDeepSeekProfile(merged);
      if (index < 0) latest.push(normalized);
      else latest[index] = normalized;
      return latest;
    }, expectedRevision).then((saved) => ({
      value: JSON.parse(
        JSON.stringify(saved.profiles.find((item) => item.id === profile.id)!)
      ) as LlmProfile,
      revision: saved.revision,
    }));
  };

  /** Apply a model field update against the confirmed snapshot inside the write queue. */
  const patchProfileModel = (
    profileId: string,
    modelId: string,
    patch: Partial<LlmModelInfo>
  ) => {
    const changes = JSON.parse(JSON.stringify(patch)) as Partial<LlmModelInfo>;
    return writeProfiles((latest) => {
      const model = latest
        .find((item) => item.id === profileId)
        ?.models.find((item) => item.id === modelId);
      if (!model) throw new Error("模型已移除，请重新选择模型");
      const capabilities = changes.capabilities
        ? { ...model.capabilities, ...changes.capabilities }
        : model.capabilities;
      Object.assign(model, changes, { id: modelId, capabilities });
      return latest;
    });
  };

  const deleteProfile = (id: string) =>
    writeProfiles((latest) => latest.filter((item) => item.id !== id));
  const refreshProfiles = () => enqueueWrite(() => loadProfiles(true));

  /**
   * 根据 ID 获取配置
   */
  const getProfileById = (id: string): LlmProfile | undefined => {
    return profiles.value.find((p) => p.id === id);
  };

  /** 按提供商解析启用渠道；空绑定使用列表首项，显式绑定失效时保留待修复状态。 */
  const getEnabledProfileByType = (
    type: ProviderType,
    profileId = ""
  ): LlmProfile | undefined => {
    return profiles.value.find(
      (profile) =>
        profile.enabled &&
        profile.type === type &&
        (!profileId || profile.id === profileId)
    );
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

  const toggleProfileEnabled = (id: string) =>
    writeProfiles((latest) => {
      const profile = latest.find((item) => item.id === id);
      if (profile) profile.enabled = !profile.enabled;
      return latest;
    });

  const updateProfilesOrder = (ordered: LlmProfile[]) => {
    const ids = ordered.map((item) => item.id);
    return writeProfiles((latest) => [
      ...ids.flatMap((id) => latest.filter((item) => item.id === id)),
      ...latest.filter((item) => !ids.includes(item.id)),
    ]);
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
    revision,
    refreshProfiles,
    patchProfileModel,
    loadProfiles,
    saveProfile,
    deleteProfile,
    getProfileById,
    getEnabledProfileByType,
    enabledProfiles,
    visionProfiles,
    toggleProfileEnabled,
    updateProfilesOrder,
    generateId,
    createFromPreset,
    getSupportedParameters,
  };
}
