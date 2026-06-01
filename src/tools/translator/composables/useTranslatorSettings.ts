import { ref, watch } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type { TranslatorSettings } from "../types";

const logger = createModuleLogger("tools/translator/settings");

const MODULE_NAME = "translator";
const CONFIG_VERSION = "1.1.0";

export const DEFAULT_TRANSLATOR_SETTINGS: TranslatorSettings = {
  defaultMaxTokens: 16384,
  autoExpandMaxTokens: true,
  outputExpansionFactor: 3.0,
  streamingEnabled: true,
  autoScrollResults: true,
  saveHistory: true,
  defaultTemperature: 0.3,
  customLanguages: [],
  channelSectionCollapsed: false,
};

interface TranslatorSettingsFile extends TranslatorSettings {
  version?: string;
}

const settingsManager = createConfigManager<TranslatorSettingsFile>({
  moduleName: MODULE_NAME,
  fileName: "settings.json",
  version: CONFIG_VERSION,
  debounceDelay: 400,
  createDefault: () => ({
    ...DEFAULT_TRANSLATOR_SETTINGS,
    version: CONFIG_VERSION,
  }),
});

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numericOrDefault(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeCustomLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function sanitizeSettings(
  value: Partial<TranslatorSettings>
): TranslatorSettings {
  return {
    ...DEFAULT_TRANSLATOR_SETTINGS,
    ...value,
    defaultMaxTokens: clampNumber(
      numericOrDefault(
        value.defaultMaxTokens,
        DEFAULT_TRANSLATOR_SETTINGS.defaultMaxTokens
      ),
      1024,
      131072
    ),
    outputExpansionFactor: clampNumber(
      numericOrDefault(
        value.outputExpansionFactor,
        DEFAULT_TRANSLATOR_SETTINGS.outputExpansionFactor
      ),
      1.0,
      8.0
    ),
    defaultTemperature: clampNumber(
      numericOrDefault(
        value.defaultTemperature,
        DEFAULT_TRANSLATOR_SETTINGS.defaultTemperature
      ),
      0,
      2
    ),
    customLanguages: sanitizeCustomLanguages(value.customLanguages),
    channelSectionCollapsed: value.channelSectionCollapsed === true,
  };
}

/**
 * 翻译工作台设置管理 composable。
 * 负责设置的加载、持久化与重置。
 */
export function useTranslatorSettings() {
  const settings = ref<TranslatorSettings>({ ...DEFAULT_TRANSLATOR_SETTINGS });
  const initialized = ref(false);
  const isLoading = ref(false);

  async function initialize() {
    if (initialized.value) return;
    isLoading.value = true;
    try {
      const file = await settingsManager.load();
      settings.value = sanitizeSettings(file);
    } catch (error) {
      logger.warn("翻译设置加载失败，使用默认值", { error: String(error) });
      settings.value = { ...DEFAULT_TRANSLATOR_SETTINGS };
    } finally {
      isLoading.value = false;
      initialized.value = true;
    }
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_TRANSLATOR_SETTINGS, customLanguages: [] };
  }

  /**
   * 添加一种自定义语言。
   * - 自动去除首尾空白；
   * - 已存在或为空时静默忽略；
   * - 返回是否实际新增。
   */
  function addCustomLanguage(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (settings.value.customLanguages.includes(trimmed)) return false;
    settings.value = {
      ...settings.value,
      customLanguages: [...settings.value.customLanguages, trimmed],
    };
    return true;
  }

  /**
   * 删除一种自定义语言。
   * 注意：调用方需要自行处理"该语言正在被预设/输入区引用"的回退逻辑。
   */
  function removeCustomLanguage(name: string): boolean {
    if (!settings.value.customLanguages.includes(name)) return false;
    settings.value = {
      ...settings.value,
      customLanguages: settings.value.customLanguages.filter(
        (item) => item !== name
      ),
    };
    return true;
  }

  // 自动持久化
  watch(
    settings,
    (value) => {
      if (!initialized.value || isLoading.value) return;
      settingsManager.saveDebounced({ ...value, version: CONFIG_VERSION });
    },
    { deep: true }
  );

  return {
    settings,
    initialized,
    initialize,
    resetSettings,
    addCustomLanguage,
    removeCustomLanguage,
  };
}

export const TRANSLATOR_CONFIG_VERSION = CONFIG_VERSION;
export const TRANSLATOR_MODULE_NAME = MODULE_NAME;
