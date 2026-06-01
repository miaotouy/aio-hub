import { ref } from "vue";
import { defineStore } from "pinia";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import type { TranslatorLanguageCode } from "../types";
import { useTranslatorSettings } from "./useTranslatorSettings";
import { useTranslatorPresets } from "./useTranslatorPresets";
import {
  useTranslatorEngine,
  type TranslationSession,
} from "./useTranslatorEngine";
import { useTranslatorHistory } from "./useTranslatorHistory";

const logger = createModuleLogger("tools/translator/store");

/**
 * 翻译工作台门面 Store。
 *
 * 设计原则：
 * - 本 store 是组合层，状态实现拆分在 4 个子 composable 中：
 *   `useTranslatorSettings` / `useTranslatorPresets`
 *   / `useTranslatorEngine` / `useTranslatorHistory`
 * - 本 store 只持有 UI 输入态（inputText/sourceLang/targetLang/currentSession）
 *   与跨域编排方法（translate/setActivePreset/clearInput/...）
 * - 对外暴露扁平接口，组件侧消费方式与历史版本兼容。
 */
export const useTranslatorStore = defineStore("translator", () => {
  const { enabledProfiles, loadProfiles } = useLlmProfiles();

  // 子模块组合
  const settingsModule = useTranslatorSettings();
  const presetsModule = useTranslatorPresets({ enabledProfiles });
  const engineModule = useTranslatorEngine({
    settings: settingsModule.settings,
    enabledProfiles,
  });
  const historyModule = useTranslatorHistory({
    settings: settingsModule.settings,
  });

  // ---- UI 输入态 ----
  const inputText = ref("");
  const sourceLang = ref<TranslatorLanguageCode>("auto");
  const targetLang = ref<TranslatorLanguageCode>("Chinese (Simplified)");
  const currentSession = ref<TranslationSession | null>(null);
  const initialized = ref(false);

  /**
   * 上一次激活预设的默认语言快照。
   * 用于"智能语言粘性"判断：如果当前 lang 等于上次预设的 default，
   * 说明用户没手动改过，切预设时跟随新预设；否则保留用户选择。
   */
  const previousPresetDefaults = ref<{
    source: TranslatorLanguageCode;
    target: TranslatorLanguageCode;
  } | null>(null);

  // ---- 初始化 ----

  async function initialize() {
    if (initialized.value) return;
    try {
      await loadProfiles();
      await Promise.all([
        settingsModule.initialize(),
        historyModule.initialize(),
        presetsModule.initialize(),
      ]);

      const active = presetsModule.activePreset.value;
      if (active) {
        sourceLang.value = active.defaultSourceLang;
        targetLang.value = active.defaultTargetLang;
        previousPresetDefaults.value = {
          source: active.defaultSourceLang,
          target: active.defaultTargetLang,
        };
      }

      logger.info("翻译工作台初始化完成", {
        presetCount: presetsModule.presets.value.length,
        historyCount: historyModule.history.value.length,
      });
    } catch (error) {
      logger.warn("翻译工作台初始化失败", { error: String(error) });
    } finally {
      initialized.value = true;
    }
  }

  // ---- 预设切换（含智能语言粘性 + 结果清理）----

  function setActivePreset(id: string) {
    const preset = presetsModule.setActivePresetId(id);
    if (!preset) return;
    engineModule.abortAll();

    const prev = previousPresetDefaults.value;
    const userTouched =
      prev !== null &&
      (sourceLang.value !== prev.source || targetLang.value !== prev.target);

    if (!userTouched) {
      sourceLang.value = preset.defaultSourceLang;
      targetLang.value = preset.defaultTargetLang;
    }
    previousPresetDefaults.value = {
      source: preset.defaultSourceLang,
      target: preset.defaultTargetLang,
    };

    engineModule.resetResults();
    currentSession.value = null;
  }

  // ---- 输入区操作 ----

  function swapLanguages() {
    if (sourceLang.value === "auto") return;
    const oldSource = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = oldSource;
  }

  function clearInput() {
    engineModule.abortAll();
    inputText.value = "";
    engineModule.resetResults();
    currentSession.value = null;
  }

  // ---- 激活预设的快捷渠道操作（带结果清理副作用）----

  function removeChannel(channelId: string) {
    engineModule.abortChannel(channelId);
    presetsModule.removeChannel(channelId);
    engineModule.removeResultsByChannel([channelId]);
  }

  function removeChannelFromPreset(presetId: string, channelId: string) {
    if (presetId === presetsModule.activePresetId.value) {
      engineModule.abortChannel(channelId);
    }
    presetsModule.removeChannelFromPreset(presetId, channelId);
    if (presetId === presetsModule.activePresetId.value) {
      engineModule.removeResultsByChannel([channelId]);
    }
  }

  // ---- 预设 CRUD（增强：删除时清理结果/会话）----

  function deletePreset(id: string) {
    const wasActive = presetsModule.activePresetId.value === id;
    if (wasActive) {
      engineModule.abortAll();
    }
    const { deleted, newActivePreset } = presetsModule.deletePreset(id);
    if (!deleted) return;
    if (wasActive && newActivePreset) {
      sourceLang.value = newActivePreset.defaultSourceLang;
      targetLang.value = newActivePreset.defaultTargetLang;
      previousPresetDefaults.value = {
        source: newActivePreset.defaultSourceLang,
        target: newActivePreset.defaultTargetLang,
      };
      engineModule.resetResults();
      currentSession.value = null;
    }
  }

  // ---- 翻译主流程 ----

  async function translate() {
    const text = inputText.value.trim();
    const preset = presetsModule.activePreset.value;
    if (!text || !preset || preset.channels.length === 0) return;

    const session: TranslationSession = {
      text,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      presetId: preset.id,
      basePrompt: preset.prompt,
    };
    currentSession.value = session;

    try {
      await engineModule.runSession(preset.channels, session);
    } finally {
      if (currentSession.value === session) {
        historyModule.pushHistory({
          sourceText: session.text,
          sourceLang: session.sourceLang,
          targetLang: session.targetLang,
          presetId: session.presetId,
          results: engineModule.results.value,
        });
      }
    }
  }

  /** 单独重试某个渠道——常用于个别渠道失败/超时 */
  async function retryChannel(channelId: string) {
    const session = currentSession.value;
    const channel = presetsModule.activeChannels.value.find(
      (item) => item.id === channelId
    );
    if (!session || !channel) return;
    await engineModule.runChannelRequest(channel, session);
  }

  // ---- 历史交互 ----

  /** 用某个历史条目重新填充输入区 */
  function loadHistoryEntry(entryId: string) {
    const entry = historyModule.getHistoryEntry(entryId);
    if (!entry) return;
    inputText.value = entry.sourceText;
    sourceLang.value = entry.sourceLang;
    targetLang.value = entry.targetLang;
    // 历史条目记录了它当时使用的预设，如果还存在则切回去
    if (
      entry.presetId &&
      entry.presetId !== presetsModule.activePresetId.value &&
      presetsModule.presets.value.some((preset) => preset.id === entry.presetId)
    ) {
      presetsModule.setActivePresetId(entry.presetId);
    }
  }

  /**
   * 删除自定义语言。
   * 副作用：如果当前输入区正在使用该语言，回退到内置默认（中文简体）。
   * 预设里以它为 default 的字段保持不动（避免误改预设；用户可在预设管理器手动改）。
   */
  function removeCustomLanguage(name: string) {
    const removed = settingsModule.removeCustomLanguage(name);
    if (!removed) return;
    const FALLBACK: TranslatorLanguageCode = "Chinese (Simplified)";
    if (sourceLang.value === name) {
      sourceLang.value = "auto";
    }
    if (targetLang.value === name) {
      targetLang.value = FALLBACK;
    }
  }

  return {
    // ---- settings ----
    settings: settingsModule.settings,
    resetSettings: settingsModule.resetSettings,
    addCustomLanguage: settingsModule.addCustomLanguage,
    removeCustomLanguage,

    // ---- presets ----
    presets: presetsModule.presets,
    activePresetId: presetsModule.activePresetId,
    activePreset: presetsModule.activePreset,
    activeChannels: presetsModule.activeChannels,
    hasConfiguredChannels: presetsModule.hasConfiguredChannels,
    updateChannelModel: presetsModule.updateChannelModel,
    addChannel: presetsModule.addChannel,
    addChannelToPreset: presetsModule.addChannelToPreset,
    updateChannelInPreset: presetsModule.updateChannelInPreset,
    createPreset: presetsModule.createPreset,
    updatePreset: presetsModule.updatePreset,
    duplicatePreset: presetsModule.duplicatePreset,
    reorderPresets: presetsModule.reorderPresets,
    movePresetUp: presetsModule.movePresetUp,
    movePresetDown: presetsModule.movePresetDown,

    // ---- engine ----
    results: engineModule.results,
    isTranslating: engineModule.isTranslating,
    abortAll: engineModule.abortAll,
    abortChannel: engineModule.abortChannel,
    getResultStatus: engineModule.getResultStatus,

    // ---- history ----
    history: historyModule.history,
    deleteHistoryEntry: historyModule.deleteHistoryEntry,
    clearHistory: historyModule.clearHistory,

    // ---- UI 输入态 ----
    inputText,
    sourceLang,
    targetLang,
    initialized,

    // ---- 编排方法 ----
    initialize,
    setActivePreset,
    swapLanguages,
    clearInput,
    removeChannel,
    removeChannelFromPreset,
    deletePreset,
    translate,
    retryChannel,
    loadHistoryEntry,
  };
});

