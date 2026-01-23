/**
 * LLM API Key 状态管理 Composable
 */

import { ref } from "vue";
import type { LlmProfile } from "../types/llm-profiles";
import type { ApiKeyStatus, KeyStatesStorage, ProfileKeyStatusMap } from "../types/llm-key-manager";
import { createConfigManager } from "@utils/configManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("LlmKeyManager");
const errorHandler = createModuleErrorHandler("LlmKeyManager");

// 配置文件管理器
const configManager = createConfigManager<KeyStatesStorage>({
  moduleName: "llm-service",
  fileName: "key-states.json",
  version: "1.0.0",
  createDefault: () => ({
    states: {},
    lastUsedIndices: {},
    enableAutoDisable: true,
    autoRecoveryTime: 60000 // 默认 1 分钟恢复
  }),
});

// 全局状态
const keyStates = ref<KeyStatesStorage>({
  states: {},
  lastUsedIndices: {},
  enableAutoDisable: true,
  autoRecoveryTime: 60000
});
const isLoaded = ref(false);

export function useLlmKeyManager() {
  /**
   * 加载状态
   */
  const loadKeyStates = async () => {
    if (isLoaded.value) return;
    try {
      const config = await configManager.load();
      keyStates.value = config;
      isLoaded.value = true;
      logger.debug("LLM Key 状态加载成功");
    } catch (error) {
      errorHandler.handle(error, { userMessage: "加载 Key 状态失败", showToUser: false });
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
    const autoRecoveryTime = getAutoRecoveryTime();

    const availableKeys = profile.apiKeys.filter((key) => {
      const state = profileStates[key];
      
      // 检查自动恢复
      if (state.isEnabled && state.isBroken && state.disabledTime && autoRecoveryTime > 0) {
        if (now - state.disabledTime > autoRecoveryTime) {
          state.isBroken = false;
          state.errorCount = 0;
          logger.info("API Key 已自动恢复可用", { profileId: profile.id, key: key.substring(0, 8) + "..." });
          return true;
        }
      }

      return state.isEnabled && !state.isBroken;
    });

    if (availableKeys.length === 0) {
      logger.warn("配置下没有可用的 API Key (可能全部被禁用或熔断)", { profileId: profile.id });
      // 如果全部不可用，回退到第一个 Key（或者抛错，这里选择回退第一个，由 API 报错触发反馈）
      return profile.apiKeys[0];
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
        isRotated: availableKeys.length > 1
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
  const reportFailure = (profileId: string, key: string, error: any) => {
    const profileStates = keyStates.value.states[profileId];
    if (profileStates && profileStates[key]) {
      const state = profileStates[key];
      state.errorCount++;
      state.lastErrorTime = Date.now();
      
      // 关键修复：截断错误消息，防止配置文件爆炸 (22MB 文件惨案)
      const rawError = error?.message || String(error);
      state.lastErrorMessage = rawError.length > 2000
        ? rawError.substring(0, 2000) + "... [已截断]"
        : rawError;

      // 识别 429 错误 (Too Many Requests)
      const isRateLimit =
        error?.status === 429 ||
        error?.statusCode === 429 ||
        state.lastErrorMessage?.includes("429") ||
        state.lastErrorMessage?.toLowerCase().includes("rate limit");

      // 熔断逻辑：如果是频率限制则直接熔断，否则连续错误超过 3 次触发
      // 仅在启用自动禁用开关时生效
      if (keyStates.value.enableAutoDisable && !state.isBroken && (isRateLimit || state.errorCount >= 3)) {
        state.isBroken = true;
        state.disabledTime = Date.now();
        state.note = isRateLimit ? "触发频率限制 (429)，已自动熔断" : "连续多次请求失败，已自动熔断";
        logger.error(isRateLimit ? "API Key 触发 429 熔断" : "API Key 连续失败熔断", {
          profileId,
          key: key.substring(0, 8) + "..."
        });
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
  const updateKeyStatus = (profileId: string, key: string, updates: Partial<ApiKeyStatus>) => {
    if (keyStates.value.states[profileId] && keyStates.value.states[profileId][key]) {
      Object.assign(keyStates.value.states[profileId][key], updates);
      saveKeyStates();
    }
  };

  /**
   * 移除某个 Key 的状态记录
   */
  const removeKeyStatus = (profileId: string, key: string) => {
    if (keyStates.value.states[profileId] && keyStates.value.states[profileId][key]) {
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
  const getAutoRecoveryTime = () => {
    return keyStates.value.autoRecoveryTime ?? 60000;
  };

  /**
   * 设置自动恢复时长
   */
  const setAutoRecoveryTime = (timeMs: number) => {
    keyStates.value.autoRecoveryTime = timeMs;
    saveKeyStates();
  };

  /**
   * 获取是否启用自动禁用
   */
  const getEnableAutoDisable = () => {
    return keyStates.value.enableAutoDisable;
  };

  /**
   * 设置是否启用自动禁用
   */
  const setEnableAutoDisable = (enabled: boolean) => {
    keyStates.value.enableAutoDisable = enabled;
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