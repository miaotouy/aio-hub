import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { ElMessageBox } from "element-plus";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createModuleLogger } from "@/utils/logger";
import type {
  ChannelEstimation,
  ChannelOverflowReason,
  TranslatorLanguageCode,
} from "../types";
import { useTranslatorSettings } from "./useTranslatorSettings";
import { useTranslatorPresets } from "./useTranslatorPresets";
import {
  useTranslatorEngine,
  type TranslationSession,
} from "./useTranslatorEngine";
import { useTranslatorHistory } from "./useTranslatorHistory";
import { estimateSplitChunkCount } from "../core/textSplitter";

const logger = createModuleLogger("tools/translator/store");

/** 把估算原因翻译为面向用户的简短描述 */
function describeOverflowReason(
  reason: ChannelOverflowReason,
  est: ChannelEstimation
): string {
  switch (reason) {
    case "output-exceeds":
      return `预估输出 ~${est.estimatedOutputTokens.toLocaleString()} / 上限 ${(
        est.modelOutputLimit ?? 0
      ).toLocaleString()}（输出会被截断）`;
    case "near-output-limit":
      return `预估输出 ~${est.estimatedOutputTokens.toLocaleString()} / 上限 ${(
        est.modelOutputLimit ?? 0
      ).toLocaleString()}（接近上限，可能截断）`;
    case "input-exceeds-context":
      return `输入 ~${est.estimatedInputTokens.toLocaleString()} tokens / context ${(
        est.modelContextLimit ?? 0
      ).toLocaleString()}（输入超过 context 窗口，请求会被拒绝）`;
    case "input-near-context":
      return `输入 ~${est.estimatedInputTokens.toLocaleString()} tokens / context ${(
        est.modelContextLimit ?? 0
      ).toLocaleString()}（接近 context 窗口）`;
    default:
      return "";
  }
}

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
  const splitTranslationActive = ref(false);
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
    splitTranslationActive.value = false;
    engineModule.resetResults();
    currentSession.value = null;
  }

  function enableSplitTranslation() {
    if (!settingsModule.settings.value.splitTranslationEnabled) return;
    splitTranslationActive.value = true;
  }

  function disableSplitTranslation() {
    splitTranslationActive.value = false;
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

  // ---- 渠道超限估算（事前预警）----

  const channelEstimations = computed<ChannelEstimation[]>(() => {
    const text = inputText.value;
    const channels = presetsModule.activeChannels.value;
    if (!text.trim() || channels.length === 0) return [];
    return channels.map((channel) =>
      engineModule.getChannelEstimation(text, channel)
    );
  });

  const riskSummary = computed(() => {
    const summary = { safe: 0, warning: 0, danger: 0, unknown: 0 };
    for (const est of channelEstimations.value) {
      summary[est.risk] += 1;
    }
    return summary;
  });

  const overallRisk = computed<{
    shouldWarn: boolean;
    severity: "warning" | "danger";
    title: string;
    description: string;
  }>(() => {
    const dangers = channelEstimations.value.filter((e) => e.risk === "danger");
    const warnings = channelEstimations.value.filter(
      (e) => e.risk === "warning"
    );
    if (dangers.length > 0) {
      return {
        shouldWarn: true,
        severity: "danger",
        title: `${dangers.length} 个渠道预计输出截断`,
        description: dangers
          .map(
            (est) =>
              `${est.channelName}：${describeOverflowReason(est.reasons[0], est)}`
          )
          .join("；"),
      };
    }
    if (warnings.length > 0) {
      return {
        shouldWarn: true,
        severity: "warning",
        title: `${warnings.length} 个渠道接近模型上限`,
        description: warnings
          .map(
            (est) =>
              `${est.channelName}：${describeOverflowReason(est.reasons[0], est)}`
          )
          .join("；"),
      };
    }
    return {
      shouldWarn: false,
      severity: "warning",
      title: "",
      description: "",
    };
  });

  const inputCharCount = computed(() => Array.from(inputText.value).length);

  const shouldSuggestSplitTranslation = computed(
    () =>
      settingsModule.settings.value.splitTranslationEnabled &&
      !splitTranslationActive.value &&
      inputCharCount.value >= settingsModule.settings.value.splitThreshold
  );

  const splitEstimatedChunkCount = computed(() => {
    if (!inputText.value.trim()) return 0;
    return estimateSplitChunkCount(inputText.value, {
      chunkSize: settingsModule.settings.value.splitChunkSize,
    });
  });

  const splitConfigSummary = computed(() => {
    const mode =
      settingsModule.settings.value.splitMode === "sequential"
        ? "质量优先"
        : "速度优先";
    return `分片 ${settingsModule.settings.value.splitChunkSize.toLocaleString()} 字 · ${mode} · 约 ${splitEstimatedChunkCount.value} 片`;
  });

  /**
   * 渠道预估输出会截断/超 context 时弹二次确认。
   * 用户确认或没有 danger 渠道时返回 true；取消时返回 false。
   */
  async function confirmOverflow(
    dangers: ChannelEstimation[]
  ): Promise<boolean> {
    const detailLines = dangers
      .map((est) => {
        const reasonText = est.reasons
          .map((reason) => describeOverflowReason(reason, est))
          .filter(Boolean)
          .join("；");
        return `<li><strong>${est.channelName}</strong> · ${reasonText}</li>`;
      })
      .join("");
    try {
      await ElMessageBox.confirm(
        `<div style="font-size:13px;line-height:1.6;">
          <p style="margin:0 0 8px;">检测到以下渠道的预估超过模型上限，继续翻译可能得到不完整的译文。</p>
          <ul style="margin:0;padding-left:18px;">${detailLines}</ul>
          <p style="margin:10px 0 0;color:var(--text-color-secondary);">建议缩短输入或更换更大上下文的模型。</p>
        </div>`,
        "输出可能不完整",
        {
          confirmButtonText: "仍然继续",
          cancelButtonText: "取消",
          type: "warning",
          dangerouslyUseHTMLString: true,
          lockScroll: false,
        }
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---- 翻译主流程 ----

  async function translate() {
    const text = inputText.value.trim();
    const preset = presetsModule.activePreset.value;
    if (!text || !preset || preset.channels.length === 0) return;

    const useSplitTranslation =
      settingsModule.settings.value.splitTranslationEnabled &&
      splitTranslationActive.value &&
      text.length >= settingsModule.settings.value.splitThreshold;

    // 超限二次确认（分片翻译会按 chunk 规避整段输出上限，因此不再用整段估算阻塞）
    if (
      !useSplitTranslation &&
      settingsModule.settings.value.warnOnOutputOverflow
    ) {
      const dangers = channelEstimations.value.filter(
        (est) => est.risk === "danger"
      );
      if (dangers.length > 0) {
        const confirmed = await confirmOverflow(dangers);
        if (!confirmed) return;
      }
    }

    const session: TranslationSession = {
      text,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      presetId: preset.id,
      basePrompt: preset.prompt,
    };
    currentSession.value = session;

    try {
      if (useSplitTranslation) {
        await engineModule.runLongTextSession(preset.channels, session);
      } else {
        await engineModule.runSession(preset.channels, session);
      }
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
    const useSplitTranslation =
      settingsModule.settings.value.splitTranslationEnabled &&
      splitTranslationActive.value &&
      session.text.length >= settingsModule.settings.value.splitThreshold;
    if (useSplitTranslation) {
      await engineModule.retryLongTextChannelRequest(channel, session);
    } else {
      await engineModule.runChannelRequest(channel, session);
    }
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
    createPresetFromTemplate: presetsModule.createPresetFromTemplate,
    applyBuiltinTemplateToPreset: presetsModule.applyBuiltinTemplateToPreset,
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

    // ---- 超限估算 ----
    channelEstimations,
    riskSummary,
    overallRisk,
    splitTranslationActive,
    shouldSuggestSplitTranslation,
    splitEstimatedChunkCount,
    splitConfigSummary,

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
    enableSplitTranslation,
    disableSplitTranslation,
    removeChannel,
    removeChannelFromPreset,
    deletePreset,
    translate,
    retryChannel,
    loadHistoryEntry,
  };
});
