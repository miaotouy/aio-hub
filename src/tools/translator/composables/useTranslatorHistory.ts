import { ref, watch, type Ref } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type {
  TranslationHistoryEntry,
  TranslationResult,
  TranslatorLanguageCode,
  TranslatorSettings,
} from "../types";
import {
  TRANSLATOR_CONFIG_VERSION,
  TRANSLATOR_MODULE_NAME,
} from "../core/config";

const logger = createModuleLogger("tools/translator/history");

const MAX_HISTORY_ENTRIES = 30;

interface TranslatorHistoryFile {
  list: TranslationHistoryEntry[];
  version?: string;
}

const historyManager = createConfigManager<TranslatorHistoryFile>({
  moduleName: TRANSLATOR_MODULE_NAME,
  fileName: "history.json",
  version: TRANSLATOR_CONFIG_VERSION,
  debounceDelay: 600,
  createDefault: () => ({ list: [], version: TRANSLATOR_CONFIG_VERSION }),
});

interface HistoryDeps {
  settings: Ref<TranslatorSettings>;
}

export interface HistoryPushPayload {
  sourceText: string;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  presetId: string;
  results: TranslationResult[];
}

/**
 * 翻译历史管理 composable。
 * 负责历史条目的增删查和持久化。
 */
export function useTranslatorHistory(deps: HistoryDeps) {
  const { settings } = deps;

  const history = ref<TranslationHistoryEntry[]>([]);
  const initialized = ref(false);
  const isLoading = ref(false);

  async function initialize() {
    if (initialized.value) return;
    isLoading.value = true;
    try {
      const file = await historyManager.load();
      history.value = Array.isArray(file.list)
        ? file.list.slice(0, MAX_HISTORY_ENTRIES)
        : [];
    } catch (error) {
      logger.warn("翻译历史加载失败", { error: String(error) });
      history.value = [];
    } finally {
      isLoading.value = false;
      initialized.value = true;
    }
  }

  function pushHistory(payload: HistoryPushPayload) {
    if (!settings.value.saveHistory) return;
    const snapshot = payload.results.map((item) => ({ ...item }));
    history.value.unshift({
      id: `translator-history-${Date.now()}`,
      timestamp: Date.now(),
      sourceText: payload.sourceText,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      presetId: payload.presetId,
      results: snapshot,
    });
    history.value = history.value.slice(0, MAX_HISTORY_ENTRIES);
  }

  function getHistoryEntry(entryId: string) {
    return history.value.find((item) => item.id === entryId);
  }

  function deleteHistoryEntry(entryId: string) {
    history.value = history.value.filter((item) => item.id !== entryId);
  }

  function clearHistory() {
    history.value = [];
    // 立即落盘一份空数据，避免依赖防抖
    historyManager
      .save({ list: [], version: TRANSLATOR_CONFIG_VERSION })
      .catch((error) => {
        logger.warn("清空翻译历史落盘失败", { error: String(error) });
      });
  }

  // ---- 持久化 watch ----
  watch(
    history,
    (value) => {
      if (!initialized.value || isLoading.value) return;
      if (!settings.value.saveHistory) return;
      historyManager.saveDebounced({
        list: value.slice(0, MAX_HISTORY_ENTRIES),
        version: TRANSLATOR_CONFIG_VERSION,
      });
    },
    { deep: true }
  );

  return {
    history,
    initialized,
    initialize,
    pushHistory,
    getHistoryEntry,
    deleteHistoryEntry,
    clearHistory,
  };
}

export const TRANSLATOR_MAX_HISTORY_ENTRIES = MAX_HISTORY_ENTRIES;
