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
 * LLM API Key 状态管理 Composable
 */

import { ref } from "vue";
import type { LlmProfile } from "../types/llm-profiles";
import type {
  ApiKeyStatus,
  KeyStatesStorage,
  ProfileKeyManagerSettings,
  ProfileKeyStatusMap,
} from "../types/llm-key-manager";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("LlmKeyManager");
const errorHandler = createModuleErrorHandler("LlmKeyManager");

// 配置文件管理器
const configManager = createConfigManager<KeyStatesStorage>({
  moduleName: "llm-service",
  fileName: "key-states.json",
  version: "1.1.0",
  createDefault: () => ({
    states: {},
    lastUsedIndices: {},
    profileSettings: {},
  }),
});

// 全局状态
const keyStates = ref<KeyStatesStorage>({
  states: {},
  lastUsedIndices: {},
  profileSettings: {},
});
const isLoaded = ref(false);

export type ApiKeyUnavailableReason =
  "all-disabled" | "all-enabled-circuit-broken";

export class ApiKeyUnavailableError extends Error {
  constructor(
    message: string,
    public readonly reason: ApiKeyUnavailableReason,
    public readonly profileId: string,
    public readonly retryAt?: number
  ) {
    super(message);
    this.name = "ApiKeyUnavailableError";
  }
}

type LoadableKeyStatesStorage = Partial<KeyStatesStorage> & {
  enableAutoDisable?: boolean;
  autoRecoveryTime?: number;
};

/**
 * 规范化旧版 Key 状态存储。
 *
 * 1.0.0 将熔断开关和恢复时间错误地保存为全局值，无法无歧义地映射到
 * 某个渠道。升级时保留 Key 状态与轮询位置，但丢弃这两个全局设置，
 * 让每个渠道按 1.1.0 的安全默认值重新显式启用。
 */
export function normalizeKeyStatesStorage(
  config: LoadableKeyStatesStorage
): KeyStatesStorage {
  const normalized = { ...config };
  delete normalized.enableAutoDisable;
  delete normalized.autoRecoveryTime;
  return {
    ...normalized,
    states: normalized.states ?? {},
    lastUsedIndices: normalized.lastUsedIndices ?? {},
    profileSettings: normalized.profileSettings ?? {},
  };
}

export function useLlmKeyManager() {
  const getProfileSettings = (profileId: string): ProfileKeyManagerSettings => {
    if (!keyStates.value.profileSettings[profileId]) {
      keyStates.value.profileSettings[profileId] = {
        enableAutoDisable: false,
        autoRecoveryTime: 60000,
      };
    }
    return keyStates.value.profileSettings[profileId];
  };

  /**
   * 加载状态
   */
  const loadKeyStates = async () => {
    if (isLoaded.value) return;
    try {
      keyStates.value = normalizeKeyStatesStorage(await configManager.load());
      isLoaded.value = true;
      logger.debug("LLM Key 状态加载成功");
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "加载 Key 状态失败",
        showToUser: false,
      });
      isLoaded.value = true;
    }
  };

  /**
   * 保存状态（优化：使用防抖保存，避免阻塞主流程）
   */
  const saveKeyStates = () => {
    try {
      configManager.saveDebounced(keyStates.value);
    } catch (error) {
      logger.error("防抖保存 Key 状态失败", error);
    }
  };

  /**
   * 初始化或更新 Key 状态 Map
   * 确保 profile 中的每个 Key 在状态 Map 中都有记录
   */
  const syncKeyStates = (profile: LlmProfile): ProfileKeyStatusMap => {
    if (!keyStates.value.states[profile.id]) {
      keyStates.value.states[profile.id] = {};
    }

    const profileStates = keyStates.value.states[profile.id];

    // 确保 profile.apiKeys 中的每个 key 都有对应的状态
    profile.apiKeys.forEach((key) => {
      if (!profileStates[key]) {
        profileStates[key] = {
          key,
          isEnabled: true,
          isBroken: false,
          errorCount: 0,
        };
      }
    });

    // 清理不再存在的 Key (可选，防止配置文件无限膨胀)
    const currentKeys = new Set(profile.apiKeys);
    Object.keys(profileStates).forEach((key) => {
      if (!currentKeys.has(key)) {
        delete profileStates[key];
      }
    });

    return profileStates;
  };

  /**
   * 选择一个可用的 API Key (轮询策略 + 状态过滤)
   */
  const pickKey = (profile: LlmProfile): string | undefined => {
    if (!profile.apiKeys || profile.apiKeys.length === 0) return undefined;

    // 同步状态
    const profileStates = syncKeyStates(profile);

    // 过滤出可用的 Key
    const now = Date.now();
    const autoRecoveryTime = getAutoRecoveryTime(profile.id);

    const availableKeys = profile.apiKeys.filter((key) => {
      const state = profileStates[key];

      // 检查自动恢复
      if (
        state.isEnabled &&
        state.isBroken &&
        state.disabledTime &&
        autoRecoveryTime > 0
      ) {
        if (now - state.disabledTime > autoRecoveryTime) {
          state.isBroken = false;
          state.errorCount = 0;
          logger.info("API Key 已自动恢复可用", {
            profileId: profile.id,
            key: key.substring(0, 8) + "...",
          });
          return true;
        }
      }

      return state.isEnabled && !state.isBroken;
    });

    if (availableKeys.length === 0) {
      const enabledStates = profile.apiKeys
        .map((key) => profileStates[key])
        .filter((state) => state.isEnabled);

      if (enabledStates.length === 0) {
        logger.warn("配置下的 API Key 已全部被用户禁用", {
          profileId: profile.id,
        });
        throw new ApiKeyUnavailableError(
          `配置 "${profile.name || profile.id}" 的 API Key 已全部禁用，请先在渠道设置中启用至少一个 Key`,
          "all-disabled",
          profile.id
        );
      }

      const recoveryCandidates = enabledStates
        .filter((state) => state.isBroken && state.disabledTime)
        .map((state) => state.disabledTime! + autoRecoveryTime)
        .filter((time) => autoRecoveryTime > 0 && time > now);
      const retryAt =
        recoveryCandidates.length > 0
          ? Math.min(...recoveryCandidates)
          : undefined;
      logger.warn("配置下所有已启用 API Key 均处于熔断状态", {
        profileId: profile.id,
        retryAt,
      });
      const retryHint = retryAt
        ? `，最早可在 ${new Date(retryAt).toLocaleString()} 后重试`
        : "";
      throw new ApiKeyUnavailableError(
        `配置 "${profile.name || profile.id}" 的所有已启用 API Key 当前均不可用${retryHint}`,
        "all-enabled-circuit-broken",
        profile.id,
        retryAt
      );
    }

    // 轮询逻辑
    let lastIndex = keyStates.value.lastUsedIndices[profile.id] ?? -1;

    // 找到下一个可用 Key 的索引
    // 我们在原始 apiKeys 数组中寻找，以保持轮询的连续性
    let nextKey: string | undefined;
    for (let i = 1; i <= profile.apiKeys.length; i++) {
      const checkIndex = (lastIndex + i) % profile.apiKeys.length;
      const key = profile.apiKeys[checkIndex];
      const state = profileStates[key];

      if (state.isEnabled && !state.isBroken) {
        lastIndex = checkIndex;
        nextKey = key;
        break;
      }
    }

    // 更新索引并返回
    if (nextKey) {
      keyStates.value.lastUsedIndices[profile.id] = lastIndex;
      // 异步保存状态（不阻塞请求）
      saveKeyStates();

      const state = profileStates[nextKey];
      state.lastUsedTime = Date.now();

      logger.debug("选择了 API Key", {
        profileId: profile.id,
        index: lastIndex,
        isRotated: availableKeys.length > 1,
      });
      return nextKey;
    }

    return undefined;
  };

  /**
   * 报告请求成功
   */
  const reportSuccess = (profileId: string, key: string) => {
    const profileStates = keyStates.value.states[profileId];
    if (profileStates && profileStates[key]) {
      const state = profileStates[key];
      state.errorCount = 0;
      state.isBroken = false; // 成功一次就恢复可用（或者可以设置更复杂的恢复逻辑）
      saveKeyStates();
    }
  };

  /**
   * 报告请求失败
   */
  const reportFailure = (
    profileId: string,
    key: string,
    error: any,
    options: {
      allowAutoDisable?: boolean;
      countTowardThreshold?: boolean;
      treatRateLimitAsImmediateBreak?: boolean;
      forceBroken?: boolean;
    } = {}
  ) => {
    const profileStates = keyStates.value.states[profileId];
    if (profileStates && profileStates[key]) {
      const state = profileStates[key];
      if (options.countTowardThreshold !== false) {
        state.errorCount++;
      }
      state.lastErrorTime = Date.now();

      // 关键修复：截断错误消息，防止配置文件爆炸 (22MB 文件惨案)
      const rawError = error?.message || String(error);
      state.lastErrorMessage =
        rawError.length > 2000
          ? rawError.substring(0, 2000) + "... [已截断]"
          : rawError;

      // 识别 429 错误 (Too Many Requests)
      const isRateLimit =
        error?.status === 429 ||
        error?.statusCode === 429 ||
        state.lastErrorMessage?.includes("429") ||
        state.lastErrorMessage?.toLowerCase().includes("rate limit");
      const hasAlternativeKey = Object.entries(profileStates).some(
        ([otherKey, otherState]) =>
          otherKey !== key && otherState.isEnabled && !otherState.isBroken
      );

      // 熔断逻辑：如果是频率限制则直接熔断，否则连续错误超过 3 次触发
      // 仅在启用自动禁用且同渠道仍有其他可用 Key 时生效
      if (
        getEnableAutoDisable(profileId) &&
        hasAlternativeKey &&
        options.allowAutoDisable !== false &&
        !state.isBroken &&
        (options.forceBroken ||
          (isRateLimit && options.treatRateLimitAsImmediateBreak !== false) ||
          state.errorCount >= 3)
      ) {
        state.isBroken = true;
        state.disabledTime = Date.now();
        state.note = options.forceBroken
          ? "凭据认证失败，已标记为不可用"
          : isRateLimit
            ? "触发频率限制 (429)，已自动熔断"
            : "连续多次请求失败，已自动熔断";
        logger.warn(
          options.forceBroken
            ? "API Key 凭据认证失败"
            : isRateLimit
              ? "API Key 触发 429 熔断"
              : "API Key 连续失败熔断",
          {
            profileId,
            key: key.substring(0, 8) + "...",
          }
        );
      }
      saveKeyStates();
    }
  };

  /**
   * 获取某个 Profile 的所有 Key 状态
   */
  const getKeyStatuses = (profileId: string): ProfileKeyStatusMap => {
    return keyStates.value.states[profileId] || {};
  };

  /**
   * 手动更新 Key 状态
   */
  const updateKeyStatus = (
    profileId: string,
    key: string,
    updates: Partial<ApiKeyStatus>
  ) => {
    if (
      keyStates.value.states[profileId] &&
      keyStates.value.states[profileId][key]
    ) {
      Object.assign(keyStates.value.states[profileId][key], updates);
      saveKeyStates();
    }
  };

  /**
   * 移除某个 Key 的状态记录
   */
  const removeKeyStatus = (profileId: string, key: string) => {
    if (
      keyStates.value.states[profileId] &&
      keyStates.value.states[profileId][key]
    ) {
      delete keyStates.value.states[profileId][key];
      saveKeyStates();
    }
  };

  // 自动加载
  if (!isLoaded.value) {
    loadKeyStates();
  }

  /**
   * 批量重置所有自动禁用的 Key
   */
  const resetAllBroken = (profileId: string) => {
    const profileStates = keyStates.value.states[profileId];
    if (profileStates) {
      Object.values(profileStates).forEach((state) => {
        if (state.isBroken) {
          state.isBroken = false;
          state.errorCount = 0;
          state.disabledTime = undefined;
          state.lastErrorMessage = undefined;
        }
      });
      saveKeyStates();
    }
  };

  /**
   * 批量启用/禁用所有 Key
   */
  const batchSetEnabled = (profileId: string, enabled: boolean) => {
    const profileStates = keyStates.value.states[profileId];
    if (profileStates) {
      Object.values(profileStates).forEach((state) => {
        state.isEnabled = enabled;
      });
      saveKeyStates();
    }
  };

  /**
   * 获取自动恢复时长
   */
  const getAutoRecoveryTime = (profileId: string) => {
    return getProfileSettings(profileId).autoRecoveryTime;
  };

  /**
   * 设置自动恢复时长
   */
  const setAutoRecoveryTime = (profileId: string, timeMs: number) => {
    getProfileSettings(profileId).autoRecoveryTime = timeMs;
    saveKeyStates();
  };

  /**
   * 获取是否启用自动禁用
   */
  const getEnableAutoDisable = (profileId: string) => {
    return getProfileSettings(profileId).enableAutoDisable;
  };

  /**
   * 设置是否启用自动禁用
   */
  const setEnableAutoDisable = (profileId: string, enabled: boolean) => {
    getProfileSettings(profileId).enableAutoDisable = enabled;
    saveKeyStates();
  };

  return {
    pickKey,
    reportSuccess,
    reportFailure,
    getKeyStatuses,
    updateKeyStatus,
    removeKeyStatus,
    resetAllBroken,
    batchSetEnabled,
    syncKeyStates,
    getAutoRecoveryTime,
    setAutoRecoveryTime,
    getEnableAutoDisable,
    setEnableAutoDisable,
  };
}
