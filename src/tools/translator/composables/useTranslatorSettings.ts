import { ref, watch } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type { TranslatorSettings } from "../types";

const logger = createModuleLogger("tools/translator/settings");

const MODULE_NAME = "translator";
const CONFIG_VERSION = "1.0.0";

export const DEFAULT_TRANSLATOR_SETTINGS: TranslatorSettings = {
  defaultMaxTokens: 16384,
  autoExpandMaxTokens: true,
  outputExpansionFactor: 3.0,
  streamingEnabled: true,
  autoScrollResults: true,
  saveHistory: true,
  defaultTemperature: 0.3,
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
    settings.value = { ...DEFAULT_TRANSLATOR_SETTINGS };
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
  };
}

export const TRANSLATOR_CONFIG_VERSION = CONFIG_VERSION;
export const TRANSLATOR_MODULE_NAME = MODULE_NAME;
