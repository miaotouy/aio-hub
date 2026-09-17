/**
 * LLM API Key 状态管理 Composable (移动端适配版)
 */

import { ref } from "vue";
import type { LlmProfile } from "../types";
import type {
  ApiKeyStatus,
  KeyStatesStorage,
  ProfileKeyManagerSettings,
  ProfileKeyStatusMap,
} from "../types/key-manager";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  hashApiKey,
  normalizeKeyStatesStorage,
} from "@shared/utils/llm-secret";

const logger = createModuleLogger("llm-api/LlmKeyManager");
const errorHandler = createModuleErrorHandler("llm-api/LlmKeyManager");

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
      const normalized = normalizeKeyStatesStorage(await configManager.load());
      const { changed, ...storage } = normalized;
      keyStates.value = storage;
      isLoaded.value = true;

      if (changed) {
        // 旧版明文索引与回显凭据的历史错误消息需要立即清洗落盘
        await configManager.save(storage);
        logger.info("Key 状态索引已迁移为哈希并清洗落盘");
      } else {
        logger.debug("LLM Key 状态加载成功");
      }
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "加载 Key 状态失败",
        showToUser: false,
      });
      isLoaded.value = true;
    }
  };

  /**
   * 保存状态
   */
  const saveKeyStates = async () => {
    try {
      await configManager.save(keyStates.value);
    } catch (error) {
      logger.error("保存 Key 状态失败", error);
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
      const index = hashApiKey(key);
      if (!profileStates[index]) {
        profileStates[index] = {
          key: index,
          isEnabled: true,
          isBroken: false,
          errorCount: 0,
        };
      }
    });

    // 清理不再存在的 Key
    const currentIndices = new Set(profile.apiKeys.map(hashApiKey));
    Object.keys(profileStates).forEach((index) => {
      if (!currentIndices.has(index)) {
        delete profileStates[index];
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
      const state = profileStates[hashApiKey(key)];

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
      logger.warn("配置下没有可用的 API Key (可能全部被禁用或熔断)", {
        profileId: profile.id,
      });
      return profile.apiKeys[0];
    }

    // 轮询逻辑
    let lastIndex = keyStates.value.lastUsedIndices[profile.id] ?? -1;

    let nextKey: string | undefined;
    for (let i = 1; i <= profile.apiKeys.length; i++) {
      const checkIndex = (lastIndex + i) % profile.apiKeys.length;
      const key = profile.apiKeys[checkIndex];
      const state = profileStates[hashApiKey(key)];

      if (state.isEnabled && !state.isBroken) {
        lastIndex = checkIndex;
        nextKey = key;
        break;
      }
    }

    // 更新索引并返回
    if (nextKey) {
      keyStates.value.lastUsedIndices[profile.id] = lastIndex;
      saveKeyStates();

      const state = profileStates[hashApiKey(nextKey)];
      state.lastUsedTime = Date.now();

      logger.debug("选择了 API Key", {
        profileId: profile.id,
        index: lastIndex,
        isRotated: availableKeys.length > 1,
      });
      return nextKey;
    }

    return profile.apiKeys[0];
  };

  /**
   * 报告请求成功
   */
  const reportSuccess = (profileId: string, key: string) => {
    const profileStates = keyStates.value.states[profileId];
    const keyIndex = hashApiKey(key);
    if (profileStates && profileStates[keyIndex]) {
      const state = profileStates[keyIndex];
      state.errorCount = 0;
      state.isBroken = false;
      saveKeyStates();
    }
  };

  /**
   * 报告请求失败
   */
  const reportFailure = (profileId: string, key: string, error: any) => {
    const profileStates = keyStates.value.states[profileId];
    const keyIndex = hashApiKey(key);
    if (profileStates && profileStates[keyIndex]) {
      const state = profileStates[keyIndex];
      state.errorCount++;
      state.lastErrorTime = Date.now();
      // 上游错误可能回显凭据，落盘前先脱敏当前 Key
      const rawError = error?.message || String(error);
      const sanitizedError =
        key.length > 0 ? rawError.split(key).join("[redacted-key]") : rawError;
      // 截断超长错误，防止配置文件爆炸
      state.lastErrorMessage =
        sanitizedError.length > 2000
          ? sanitizedError.substring(0, 2000) + "... [已截断]"
          : sanitizedError;

      // 识别 429 错误
      const isRateLimit =
        error?.status === 429 ||
        error?.statusCode === 429 ||
        state.lastErrorMessage?.includes("429") ||
        state.lastErrorMessage?.toLowerCase().includes("rate limit");
      const hasAlternativeKey = Object.entries(profileStates).some(
        ([otherIndex, otherState]) =>
          otherIndex !== keyIndex &&
          otherState.isEnabled &&
          !otherState.isBroken
      );

      if (
        getEnableAutoDisable(profileId) &&
        hasAlternativeKey &&
        !state.isBroken &&
        (isRateLimit || state.errorCount >= 3)
      ) {
        state.isBroken = true;
        state.disabledTime = Date.now();
        state.note = isRateLimit
          ? "触发频率限制 (429)，已自动熔断"
          : "连续多次请求失败，已自动熔断";
        logger.warn(
          isRateLimit ? "API Key 触发 429 熔断" : "API Key 连续失败熔断",
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
   * 注意：返回的 Map 以 `hashApiKey(key)` 为索引，不包含明文 Key
   */
  const getKeyStatuses = (profileId: string): ProfileKeyStatusMap => {
    return keyStates.value.states[profileId] || {};
  };

  /**
   * 获取单个 Key 的状态（入参为明文 Key，内部按哈希索引查询）
   */
  const getKeyStatus = (
    profileId: string,
    key: string
  ): ApiKeyStatus | undefined => {
    return keyStates.value.states[profileId]?.[hashApiKey(key)];
  };

  /**
   * 手动更新 Key 状态
   */
  const updateKeyStatus = (
    profileId: string,
    key: string,
    updates: Partial<ApiKeyStatus>
  ) => {
    const profileStates = keyStates.value.states[profileId];
    const keyIndex = hashApiKey(key);
    if (profileStates && profileStates[keyIndex]) {
      Object.assign(profileStates[keyIndex], updates, { key: keyIndex });
      saveKeyStates();
    }
  };

  /**
   * 移除某个 Key 的状态记录
   */
  const removeKeyStatus = (profileId: string, key: string) => {
    const profileStates = keyStates.value.states[profileId];
    const keyIndex = hashApiKey(key);
    if (profileStates && profileStates[keyIndex]) {
      delete profileStates[keyIndex];
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

  const getAutoRecoveryTime = (profileId: string) => {
    return getProfileSettings(profileId).autoRecoveryTime;
  };

  const setAutoRecoveryTime = (profileId: string, timeMs: number) => {
    getProfileSettings(profileId).autoRecoveryTime = timeMs;
    saveKeyStates();
  };

  const getEnableAutoDisable = (profileId: string) => {
    return getProfileSettings(profileId).enableAutoDisable;
  };

  const setEnableAutoDisable = (profileId: string, enabled: boolean) => {
    getProfileSettings(profileId).enableAutoDisable = enabled;
    saveKeyStates();
  };

  return {
    pickKey,
    reportSuccess,
    reportFailure,
    getKeyStatuses,
    getKeyStatus,
    updateKeyStatus,
    removeKeyStatus,
    resetAllBroken,
    batchSetEnabled,
    syncKeyStates,
    getAutoRecoveryTime,
    setAutoRecoveryTime,
    getEnableAutoDisable,
    setEnableAutoDisable,
    keyStates,
  };
}
