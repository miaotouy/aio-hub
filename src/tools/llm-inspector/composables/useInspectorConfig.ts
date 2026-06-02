/**
 * useInspectorConfig — 配置 / 布局 / 历史 / 复制脱敏 子 composable
 *
 * 从原 `useInspectorManager` 拆出的纯持久化层：
 * - 配置 (port / target_url / header_override_rules)
 * - UI 偏好 (maskApiKeys)
 * - 布局 (splitRatio)
 * - 目标地址历史 (targetUrlHistory，最近 10 条)
 *
 * 提供：
 * - 初始化加载 (`loadConfig`)
 * - 自动节流保存（通过外部 watch 驱动 `saveConfig`）
 * - 历史去重前置 (`addUrlToHistory`)
 * - API Key 脱敏复制 (`copyWithMask`)
 *
 * 不持有任何状态机字段，所以可被 `useInspectorManager` 安全聚合使用。
 */

import { ref } from "vue";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import {
  loadSettings,
  saveSettings,
  DEFAULT_SPLIT_RATIO,
} from "../core/configManager";
import { maskSensitiveData, copyToClipboard } from "../core/utils";
import type {
  InspectorConfig,
  InspectorLayoutSettings,
  LlmInspectorSettings,
  FilterOptions,
} from "../types";

const logger = createModuleLogger("LlmInspector/InspectorConfig");
const errorHandler = createModuleErrorHandler("LlmInspector/InspectorConfig");

/** 历史目标地址最多保留多少条 */
const MAX_TARGET_URL_HISTORY = 10;

export interface UseInspectorConfigOptions {
  /** 提供当前的过滤选项，用于持久化（recordManager 拥有真值） */
  getFilterOptions: () => FilterOptions;
}

export function useInspectorConfig(options: UseInspectorConfigOptions) {
  const config = ref<InspectorConfig>({
    port: 8999,
    target_url: "https://api.openai.com",
    header_override_rules: [],
  });

  const maskApiKeys = ref(true);
  const targetUrlHistory = ref<string[]>([]);
  const layout = ref<InspectorLayoutSettings>({
    splitRatio: DEFAULT_SPLIT_RATIO,
  });

  /** 从持久化存储加载全部配置 */
  async function loadConfig(): Promise<void> {
    try {
      const settings = await loadSettings();
      config.value = settings.config;
      maskApiKeys.value = settings.maskApiKeys ?? true;
      targetUrlHistory.value = settings.targetUrlHistory ?? [];
      layout.value = settings.layout ?? { splitRatio: DEFAULT_SPLIT_RATIO };

      logger.info("配置加载成功", {
        port: settings.config.port,
        targetUrl: settings.config.target_url,
        historyCount: targetUrlHistory.value.length,
        splitRatio: layout.value.splitRatio,
      });
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "加载配置失败",
        showToUser: false,
      });
      throw err;
    }
  }

  /** 把当前所有内存状态写回持久化存储（包括过滤选项） */
  async function saveConfig(): Promise<void> {
    try {
      const filterOptions = options.getFilterOptions();
      const settings: LlmInspectorSettings = {
        config: config.value,
        searchQuery: filterOptions.searchQuery,
        filterStatus: filterOptions.filterStatus,
        maskApiKeys: maskApiKeys.value,
        targetUrlHistory: targetUrlHistory.value,
        layout: layout.value,
      };

      await saveSettings(settings);
      logger.debug("配置已保存");
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "保存配置失败",
        showToUser: false,
      });
      throw err;
    }
  }

  /** 把 URL 插入历史首位（已存在则前置去重），并截断到容量上限 */
  function addUrlToHistory(url: string): void {
    if (!url || !url.trim()) return;

    const history = [...targetUrlHistory.value];
    const index = history.indexOf(url);
    if (index !== -1) {
      history.splice(index, 1);
    }
    history.unshift(url);
    targetUrlHistory.value = history.slice(0, MAX_TARGET_URL_HISTORY);
    logger.debug("已添加到历史记录", { url });
  }

  /**
   * 根据 maskApiKeys 设置决定是否脱敏后复制到剪贴板。
   * 失败时抛出错误供调用方处理。
   */
  async function copyWithMask(
    text: string,
    message: string = "已复制"
  ): Promise<void> {
    const textToCopy = maskApiKeys.value ? maskSensitiveData(text) : text;
    await copyToClipboard(textToCopy, message);
  }

  return {
    // 响应式状态
    config,
    maskApiKeys,
    targetUrlHistory,
    layout,

    // 方法
    loadConfig,
    saveConfig,
    addUrlToHistory,
    copyWithMask,
  };
}
