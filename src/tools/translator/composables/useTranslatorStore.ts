import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  TranslationChannel,
  TranslationHistoryEntry,
  TranslationResult,
  TranslationResultStatus,
  TranslatorSettings,
  TranslatorLanguageCode,
  TranslatorPreset,
} from "../types";
import { useTranslatorCore } from "./useTranslatorCore";

const logger = createModuleLogger("tools/translator/store");

const DEFAULT_PROMPT =
  "Translate the following text from {sourceLang} to {targetLang}. Preserve meaning, tone, formatting, code blocks, numbers, and names. Output only the translation.\n\n{text}";

const ACADEMIC_PROMPT =
  "Translate the following academic or technical text from {sourceLang} to {targetLang}. Use precise terminology, keep citations and formulas unchanged, and output only the polished translation.\n\n{text}";

const CODE_PROMPT =
  "Translate comments, docstrings, and user-facing text from {sourceLang} to {targetLang}. Preserve code, identifiers, placeholders, markdown, and indentation exactly. Output only the translation.\n\n{text}";

const MODULE_NAME = "translator";
const CONFIG_VERSION = "1.0.0";

const DEFAULT_SETTINGS: TranslatorSettings = {
  defaultMaxTokens: 16384,
  autoExpandMaxTokens: true,
  outputExpansionFactor: 3.0,
  streamingEnabled: true,
  autoScrollResults: true,
  saveHistory: true,
  defaultTemperature: 0.3,
};

const MAX_HISTORY_ENTRIES = 30;

/** 持久化文件结构 */
interface TranslatorSettingsFile extends TranslatorSettings {
  version?: string;
}

interface TranslatorHistoryFile {
  list: TranslationHistoryEntry[];
  version?: string;
}

interface TranslatorPresetsFile {
  presets: TranslatorPreset[];
  activePresetId: string;
  version?: string;
}

const settingsManager = createConfigManager<TranslatorSettingsFile>({
  moduleName: MODULE_NAME,
  fileName: "settings.json",
  version: CONFIG_VERSION,
  debounceDelay: 400,
  createDefault: () => ({ ...DEFAULT_SETTINGS, version: CONFIG_VERSION }),
});

const historyManager = createConfigManager<TranslatorHistoryFile>({
  moduleName: MODULE_NAME,
  fileName: "history.json",
  version: CONFIG_VERSION,
  debounceDelay: 600,
  createDefault: () => ({ list: [], version: CONFIG_VERSION }),
});

const presetsManager = createConfigManager<TranslatorPresetsFile>({
  moduleName: MODULE_NAME,
  fileName: "presets.json",
  version: CONFIG_VERSION,
  debounceDelay: 400,
  createDefault: () => ({
    presets: [],
    activePresetId: "quick",
    version: CONFIG_VERSION,
  }),
});

const createChannelId = () =>
  `translator-channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function firstTextModels(profiles: LlmProfile[], count: number) {
  return profiles
    .flatMap((profile) =>
      profile.models
        .filter((model) => {
          const caps = model.capabilities;
          return (
            !caps?.embedding &&
            !caps?.rerank &&
            !caps?.imageGeneration &&
            !caps?.videoGeneration &&
            !caps?.audioGeneration &&
            !caps?.musicGeneration
          );
        })
        .map((model) => ({ profile, model }))
    )
    .slice(0, count);
}

function toChannel(
  profile: LlmProfile,
  model: LlmProfile["models"][number],
  index: number
): TranslationChannel {
  return {
    id: createChannelId(),
    displayName: model.name || model.id || `渠道 ${index + 1}`,
    profileId: profile.id,
    modelId: model.id,
  };
}

function buildDefaultPresets(profiles: LlmProfile[]): TranslatorPreset[] {
  const baseChannels = firstTextModels(profiles, 3);
  const makeChannels = (count: number) =>
    baseChannels
      .slice(0, count)
      .map(({ profile, model }, index) => toChannel(profile, model, index));

  return [
    {
      id: "quick",
      name: "快速查词",
      icon: "Languages",
      channels: makeChannels(2),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese",
      prompt: DEFAULT_PROMPT,
    },
    {
      id: "academic",
      name: "学术精翻",
      icon: "BookOpen",
      channels: makeChannels(3),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese",
      prompt: ACADEMIC_PROMPT,
    },
    {
      id: "code-comments",
      name: "代码注释",
      icon: "Code2",
      channels: makeChannels(2),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese",
      prompt: CODE_PROMPT,
    },
  ];
}

function numericOrDefault(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeSettings(
  value: Partial<TranslatorSettings>
): TranslatorSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    defaultMaxTokens: clampNumber(
      numericOrDefault(
        value.defaultMaxTokens,
        DEFAULT_SETTINGS.defaultMaxTokens
      ),
      1024,
      131072
    ),
    outputExpansionFactor: clampNumber(
      numericOrDefault(
        value.outputExpansionFactor,
        DEFAULT_SETTINGS.outputExpansionFactor
      ),
      1.0,
      8.0
    ),
    defaultTemperature: clampNumber(
      numericOrDefault(
        value.defaultTemperature,
        DEFAULT_SETTINGS.defaultTemperature
      ),
      0,
      2
    ),
  };
}

/** 当前的翻译会话——每次点翻译/重试，都会生成新的会话 */
interface TranslationSession {
  text: string;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  presetId: string;
  basePrompt: string;
}

export const useTranslatorStore = defineStore("translator", () => {
  const { enabledProfiles, loadProfiles } = useLlmProfiles();
  const { translateChannel } = useTranslatorCore();

  const presets = ref<TranslatorPreset[]>([]);
  const activePresetId = ref("quick");
  const inputText = ref("");
  const sourceLang = ref<TranslatorLanguageCode>("auto");
  const targetLang = ref<TranslatorLanguageCode>("Chinese");
  const results = ref<TranslationResult[]>([]);
  const history = ref<TranslationHistoryEntry[]>([]);
  const settings = ref<TranslatorSettings>({ ...DEFAULT_SETTINGS });
  const initialized = ref(false);
  const isLoadingPersistence = ref(false);
  const currentSession = ref<TranslationSession | null>(null);

  /**
   * 上一次激活预设的默认语言快照
   * 用于"智能语言粘性"判断：如果当前 lang 等于上次预设的 default
   * 说明用户没手动改过，切预设时跟随新预设；否则保留用户选择。
   */
  const previousPresetDefaults = ref<{
    source: TranslatorLanguageCode;
    target: TranslatorLanguageCode;
  } | null>(null);

  /** 每个渠道独立的 AbortController */
  const channelControllers = new Map<string, AbortController>();

  const activePreset = computed(() =>
    presets.value.find((preset) => preset.id === activePresetId.value)
  );
  const activeChannels = computed(() => activePreset.value?.channels ?? []);
  const hasConfiguredChannels = computed(() => activeChannels.value.length > 0);
  const isTranslating = computed(() =>
    results.value.some(
      (item) => item.status === "streaming" || item.status === "pending"
    )
  );

  // -------- 持久化 watch --------

  watch(
    settings,
    (value) => {
      if (!initialized.value || isLoadingPersistence.value) return;
      settingsManager.saveDebounced({ ...value, version: CONFIG_VERSION });
    },
    { deep: true }
  );

  watch(
    history,
    (value) => {
      if (!initialized.value || isLoadingPersistence.value) return;
      if (!settings.value.saveHistory) return;
      historyManager.saveDebounced({
        list: value.slice(0, MAX_HISTORY_ENTRIES),
        version: CONFIG_VERSION,
      });
    },
    { deep: true }
  );

  watch(
    [presets, activePresetId],
    ([nextPresets, nextActiveId]) => {
      if (!initialized.value || isLoadingPersistence.value) return;
      presetsManager.saveDebounced({
        presets: nextPresets as TranslatorPreset[],
        activePresetId: nextActiveId as string,
        version: CONFIG_VERSION,
      });
    },
    { deep: true }
  );

  // -------- 初始化 --------

  async function initialize() {
    if (initialized.value) return;
    isLoadingPersistence.value = true;
    try {
      await loadProfiles();

      const [settingsFile, historyFile, presetsFile] = await Promise.all([
        settingsManager.load(),
        historyManager.load(),
        presetsManager.load(),
      ]);

      settings.value = sanitizeSettings(settingsFile);
      history.value = Array.isArray(historyFile.list)
        ? historyFile.list.slice(0, MAX_HISTORY_ENTRIES)
        : [];

      const restoredPresets =
        Array.isArray(presetsFile.presets) && presetsFile.presets.length > 0
          ? presetsFile.presets
          : buildDefaultPresets(enabledProfiles.value);
      presets.value = restoredPresets;

      const desiredActiveId =
        presetsFile.activePresetId &&
        restoredPresets.some(
          (preset) => preset.id === presetsFile.activePresetId
        )
          ? presetsFile.activePresetId
          : restoredPresets[0]?.id || "quick";
      activePresetId.value = desiredActiveId;

      const active = restoredPresets.find(
        (preset) => preset.id === desiredActiveId
      );
      if (active) {
        sourceLang.value = active.defaultSourceLang;
        targetLang.value = active.defaultTargetLang;
        previousPresetDefaults.value = {
          source: active.defaultSourceLang,
          target: active.defaultTargetLang,
        };
      }

      logger.info("翻译工作台初始化完成", {
        presetCount: restoredPresets.length,
        historyCount: history.value.length,
      });
    } catch (error) {
      logger.warn("翻译工作台初始化失败，使用默认配置", {
        error: String(error),
      });
      settings.value = { ...DEFAULT_SETTINGS };
      history.value = [];
      presets.value = buildDefaultPresets(enabledProfiles.value);
      activePresetId.value = presets.value[0]?.id || "quick";
    } finally {
      isLoadingPersistence.value = false;
      initialized.value = true;
    }
  }

  function setActivePreset(id: string) {
    const preset = presets.value.find((item) => item.id === id);
    if (!preset) return;
    abortAll();

    /**
     * 智能语言粘性：
     * - 用户没改过语言（当前 lang === 上次预设默认）→ 跟随新预设
     * - 用户改过 → 保留用户选择
     */
    const prev = previousPresetDefaults.value;
    const userTouched =
      prev !== null &&
      (sourceLang.value !== prev.source || targetLang.value !== prev.target);

    activePresetId.value = id;
    if (!userTouched) {
      sourceLang.value = preset.defaultSourceLang;
      targetLang.value = preset.defaultTargetLang;
    }
    previousPresetDefaults.value = {
      source: preset.defaultSourceLang,
      target: preset.defaultTargetLang,
    };

    results.value = [];
    currentSession.value = null;
  }

  function updateChannelModel(
    channelId: string,
    profileId: string,
    modelId: string
  ) {
    const channel = activeChannels.value.find((item) => item.id === channelId);
    if (!channel) return;
    const profile = enabledProfiles.value.find((item) => item.id === profileId);
    const model = profile?.models.find((item) => item.id === modelId);

    channel.profileId = profileId;
    channel.modelId = modelId;
    channel.displayName = model?.name || modelId;
    // 模型变更后清掉手动 maxTokens，让自动估算重新生效
    channel.maxTokens = undefined;
  }

  function addChannel() {
    const preset = activePreset.value;
    if (!preset || preset.channels.length >= 6) return;

    const selectedKeys = new Set(
      preset.channels.map(
        (channel) => `${channel.profileId}:${channel.modelId}`
      )
    );
    const candidate =
      firstTextModels(enabledProfiles.value, 12).find(
        ({ profile, model }) => !selectedKeys.has(`${profile.id}:${model.id}`)
      ) ?? firstTextModels(enabledProfiles.value, 1)[0];

    if (!candidate) return;
    preset.channels.push(
      toChannel(candidate.profile, candidate.model, preset.channels.length)
    );
  }

  function removeChannel(channelId: string) {
    const preset = activePreset.value;
    if (!preset || preset.channels.length <= 1) return;
    abortChannel(channelId);
    preset.channels = preset.channels.filter(
      (channel) => channel.id !== channelId
    );
    results.value = results.value.filter(
      (result) => result.channelId !== channelId
    );
  }

  function swapLanguages() {
    if (sourceLang.value === "auto") return;
    const oldSource = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = oldSource;
  }

  function clearInput() {
    abortAll();
    inputText.value = "";
    results.value = [];
    currentSession.value = null;
  }

  function abortChannel(channelId: string) {
    const controller = channelControllers.get(channelId);
    if (controller) {
      controller.abort();
      channelControllers.delete(channelId);
    }
  }

  function abortAll() {
    for (const controller of channelControllers.values()) {
      controller.abort();
    }
    channelControllers.clear();
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS };
  }

  function clearHistory() {
    history.value = [];
    // 立即落盘一份空数据，避免依赖防抖
    historyManager
      .save({ list: [], version: CONFIG_VERSION })
      .catch((error) => {
        logger.warn("清空翻译历史落盘失败", { error: String(error) });
      });
  }

  function getModelOutputLimit(channel: TranslationChannel) {
    const profile = enabledProfiles.value.find(
      (item) => item.id === channel.profileId
    );
    const model = profile?.models.find((item) => item.id === channel.modelId);
    return model?.tokenLimits?.output;
  }

  /**
   * 估算翻译输出所需 token 上限
   * - 输入字符数 * 膨胀因子（覆盖中→英、英→俄等"输出更长"的情况）
   * - + 段落格式预留（按行数推算）
   * 大模型一般 1 token ≈ 1 个中文字符 / 0.75 个英文单词，按字符近似换算后再乘膨胀因子
   */
  function estimateTranslationOutputTokens(text: string) {
    const charCount = Array.from(text).length;
    const lineCount = text.split(/\r\n|\r|\n/).length;
    const formatReserve = clampNumber(lineCount * 16, 512, 4096);
    return Math.ceil(
      charCount * settings.value.outputExpansionFactor + formatReserve
    );
  }

  function getEffectiveMaxTokens(text: string, channel: TranslationChannel) {
    const baseLimit = channel.maxTokens || settings.value.defaultMaxTokens;
    const expandedLimit = settings.value.autoExpandMaxTokens
      ? Math.max(baseLimit, estimateTranslationOutputTokens(text))
      : baseLimit;
    const modelLimit = getModelOutputLimit(channel);
    return clampNumber(
      modelLimit ? Math.min(expandedLimit, modelLimit) : expandedLimit,
      256,
      131072
    );
  }

  function updateResult(channelId: string, patch: Partial<TranslationResult>) {
    const index = results.value.findIndex(
      (item) => item.channelId === channelId
    );
    if (index === -1) return;
    const current = results.value[index];
    const next: TranslationResult = { ...current, ...patch };
    // 同步 isStreaming 兼容字段
    next.isStreaming = next.status === "streaming" || next.status === "pending";
    results.value.splice(index, 1, next);
  }

  function ensureResultSlot(
    channel: TranslationChannel,
    appliedMaxTokens: number,
    modelOutputLimit: number | undefined
  ) {
    const placeholder: TranslationResult = {
      channelId: channel.id,
      channelName: channel.displayName,
      content: "",
      status: "pending",
      isStreaming: true,
      startedAt: Date.now(),
      appliedMaxTokens,
      modelOutputLimit,
    };
    const index = results.value.findIndex(
      (item) => item.channelId === channel.id
    );
    if (index === -1) {
      results.value.push(placeholder);
    } else {
      results.value.splice(index, 1, placeholder);
    }
  }

  async function runChannelRequest(
    channel: TranslationChannel,
    session: TranslationSession
  ) {
    // 复用同 channel 上一次的 controller 先 abort
    abortChannel(channel.id);
    const controller = new AbortController();
    channelControllers.set(channel.id, controller);

    const appliedMaxTokens = getEffectiveMaxTokens(session.text, channel);
    const modelOutputLimit = getModelOutputLimit(channel);
    ensureResultSlot(channel, appliedMaxTokens, modelOutputLimit);

    const startedAt = Date.now();
    let firstChunkSeen = false;

    try {
      const result = await translateChannel(session.text, channel, {
        sourceLang: session.sourceLang,
        targetLang: session.targetLang,
        basePrompt: session.basePrompt,
        maxTokens: appliedMaxTokens,
        temperature: channel.temperature ?? settings.value.defaultTemperature,
        signal: controller.signal,
        onStream: settings.value.streamingEnabled
          ? (chunk) => {
              if (controller.signal.aborted) return;
              if (!firstChunkSeen) {
                firstChunkSeen = true;
                updateResult(channel.id, { status: "streaming" });
              }
              const current = results.value.find(
                (item) => item.channelId === channel.id
              );
              if (current) {
                updateResult(channel.id, {
                  content: current.content + chunk,
                  status: "streaming",
                });
              }
            }
          : undefined,
      });

      if (controller.signal.aborted) return;

      // 把 core 返回的最终内容跟 store 已累积的做一次最长保护
      const current = results.value.find(
        (item) => item.channelId === channel.id
      );
      const accumulated = (current?.content || "").trim();
      const final = result.content.trim();
      const merged = final.length >= accumulated.length ? final : accumulated;

      updateResult(channel.id, {
        content: merged,
        status: "completed",
        duration: Date.now() - startedAt,
        finishReason: result.finishReason,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      const isAborted =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      const message = error instanceof Error ? error.message : String(error);

      const current = results.value.find(
        (item) => item.channelId === channel.id
      );
      const partial = current?.content || "";

      updateResult(channel.id, {
        status: isAborted ? "aborted" : "failed",
        error: isAborted ? undefined : message,
        content: partial,
        duration: Date.now() - startedAt,
      });

      if (!isAborted) {
        logger.warn("渠道翻译失败", {
          channelId: channel.id,
          channelName: channel.displayName,
          error: message,
        });
      }
    } finally {
      const stored = channelControllers.get(channel.id);
      if (stored === controller) {
        channelControllers.delete(channel.id);
      }
    }
  }

  function pushHistory(session: TranslationSession) {
    if (!settings.value.saveHistory) return;
    const snapshot = results.value.map((item) => ({ ...item }));
    history.value.unshift({
      id: `translator-history-${Date.now()}`,
      timestamp: Date.now(),
      sourceText: session.text,
      sourceLang: session.sourceLang,
      targetLang: session.targetLang,
      presetId: session.presetId,
      results: snapshot,
    });
    history.value = history.value.slice(0, MAX_HISTORY_ENTRIES);
  }

  async function translate() {
    const text = inputText.value.trim();
    const preset = activePreset.value;
    if (!text || !preset || preset.channels.length === 0) return;

    abortAll();

    const session: TranslationSession = {
      text,
      sourceLang: sourceLang.value,
      targetLang: targetLang.value,
      presetId: preset.id,
      basePrompt: preset.prompt,
    };
    currentSession.value = session;

    // 先全部填 pending 占位，避免卡片闪烁
    results.value = preset.channels.map<TranslationResult>((channel) => ({
      channelId: channel.id,
      channelName: channel.displayName,
      content: "",
      status: "pending",
      isStreaming: true,
      startedAt: Date.now(),
      appliedMaxTokens: getEffectiveMaxTokens(text, channel),
      modelOutputLimit: getModelOutputLimit(channel),
    }));

    logger.info("开始多渠道翻译", {
      presetId: preset.id,
      channelCount: preset.channels.length,
      sourceLang: session.sourceLang,
      targetLang: session.targetLang,
      textLength: text.length,
    });

    // 真正的并发：每个渠道独立 Promise，不互相等待
    const tasks = preset.channels.map((channel) =>
      runChannelRequest(channel, session)
    );

    try {
      await Promise.allSettled(tasks);
    } finally {
      if (currentSession.value === session) {
        pushHistory(session);
      }
    }
  }

  /** 单独重试某个渠道——常用于个别渠道失败/超时 */
  async function retryChannel(channelId: string) {
    const session = currentSession.value;
    const channel = activeChannels.value.find((item) => item.id === channelId);
    if (!session || !channel) return;
    await runChannelRequest(channel, session);
  }

  /** 用某个历史条目重新填充输入区 */
  function loadHistoryEntry(entryId: string) {
    const entry = history.value.find((item) => item.id === entryId);
    if (!entry) return;
    inputText.value = entry.sourceText;
    sourceLang.value = entry.sourceLang;
    targetLang.value = entry.targetLang;
    // 历史条目记录了它当时使用的预设，如果还存在则切回去
    if (
      entry.presetId &&
      entry.presetId !== activePresetId.value &&
      presets.value.some((preset) => preset.id === entry.presetId)
    ) {
      activePresetId.value = entry.presetId;
    }
  }

  /** 删除单条历史 */
  function deleteHistoryEntry(entryId: string) {
    history.value = history.value.filter((item) => item.id !== entryId);
  }

  // ---- 预设 CRUD ----

  function generatePresetId() {
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** 新建预设：从当前激活预设克隆一份作为起点 */
  function createPreset(
    template?: Partial<TranslatorPreset>
  ): TranslatorPreset {
    const base = activePreset.value;
    const sourceChannels = template?.channels ?? base?.channels ?? [];
    const clonedChannels: TranslationChannel[] = sourceChannels.map(
      (channel) => ({
        ...channel,
        id: createChannelId(),
      })
    );

    if (clonedChannels.length === 0) {
      const fallback = firstTextModels(enabledProfiles.value, 1)[0];
      if (fallback) {
        clonedChannels.push(toChannel(fallback.profile, fallback.model, 0));
      }
    }

    const newPreset: TranslatorPreset = {
      id: generatePresetId(),
      name: template?.name?.trim() || "新预设",
      icon: template?.icon || "Sparkles",
      channels: clonedChannels,
      defaultSourceLang: template?.defaultSourceLang || "auto",
      defaultTargetLang: template?.defaultTargetLang || "Chinese",
      prompt: template?.prompt || base?.prompt || DEFAULT_PROMPT,
    };
    presets.value.push(newPreset);
    return newPreset;
  }

  /** 更新预设属性（不含 channels，channels 通过专门方法操作） */
  function updatePreset(
    id: string,
    patch: Partial<
      Pick<
        TranslatorPreset,
        "name" | "icon" | "prompt" | "defaultSourceLang" | "defaultTargetLang"
      >
    >
  ) {
    const index = presets.value.findIndex((preset) => preset.id === id);
    if (index === -1) return;
    const current = presets.value[index];
    presets.value.splice(index, 1, {
      ...current,
      ...patch,
      name: patch.name?.trim() || current.name,
    });
  }

  /** 删除预设：至少保留 1 个；删除当前激活预设时切到第一个 */
  function deletePreset(id: string) {
    if (presets.value.length <= 1) return;
    const target = presets.value.find((preset) => preset.id === id);
    if (!target) return;
    abortAll();
    presets.value = presets.value.filter((preset) => preset.id !== id);
    if (activePresetId.value === id) {
      const fallback = presets.value[0];
      if (fallback) {
        activePresetId.value = fallback.id;
        sourceLang.value = fallback.defaultSourceLang;
        targetLang.value = fallback.defaultTargetLang;
        previousPresetDefaults.value = {
          source: fallback.defaultSourceLang,
          target: fallback.defaultTargetLang,
        };
        results.value = [];
        currentSession.value = null;
      }
    }
  }

  /** 复制预设：克隆一份独立的副本 */
  function duplicatePreset(id: string): TranslatorPreset | null {
    const source = presets.value.find((preset) => preset.id === id);
    if (!source) return null;
    const cloned: TranslatorPreset = {
      ...source,
      id: generatePresetId(),
      name: `${source.name} 副本`,
      channels: source.channels.map((channel) => ({
        ...channel,
        id: createChannelId(),
      })),
    };
    const index = presets.value.findIndex((preset) => preset.id === id);
    presets.value.splice(index + 1, 0, cloned);
    return cloned;
  }

  /** 预设排序：把 from 位置移动到 to 位置 */
  function reorderPresets(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= presets.value.length) return;
    if (toIndex < 0 || toIndex >= presets.value.length) return;
    const next = [...presets.value];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    presets.value = next;
  }

  function movePresetUp(id: string) {
    const index = presets.value.findIndex((preset) => preset.id === id);
    if (index <= 0) return;
    reorderPresets(index, index - 1);
  }

  function movePresetDown(id: string) {
    const index = presets.value.findIndex((preset) => preset.id === id);
    if (index === -1 || index >= presets.value.length - 1) return;
    reorderPresets(index, index + 1);
  }

  /** 给特定预设添加渠道（不限于当前激活预设） */
  function addChannelToPreset(presetId: string) {
    const preset = presets.value.find((item) => item.id === presetId);
    if (!preset || preset.channels.length >= 6) return;

    const selectedKeys = new Set(
      preset.channels.map(
        (channel) => `${channel.profileId}:${channel.modelId}`
      )
    );
    const candidate =
      firstTextModels(enabledProfiles.value, 12).find(
        ({ profile, model }) => !selectedKeys.has(`${profile.id}:${model.id}`)
      ) ?? firstTextModels(enabledProfiles.value, 1)[0];

    if (!candidate) return;
    preset.channels.push(
      toChannel(candidate.profile, candidate.model, preset.channels.length)
    );
  }

  function removeChannelFromPreset(presetId: string, channelId: string) {
    const preset = presets.value.find((item) => item.id === presetId);
    if (!preset || preset.channels.length <= 1) return;
    if (presetId === activePresetId.value) {
      abortChannel(channelId);
    }
    preset.channels = preset.channels.filter(
      (channel) => channel.id !== channelId
    );
    if (presetId === activePresetId.value) {
      results.value = results.value.filter(
        (result) => result.channelId !== channelId
      );
    }
  }

  function updateChannelInPreset(
    presetId: string,
    channelId: string,
    profileId: string,
    modelId: string
  ) {
    const preset = presets.value.find((item) => item.id === presetId);
    if (!preset) return;
    const channel = preset.channels.find((item) => item.id === channelId);
    if (!channel) return;
    const profile = enabledProfiles.value.find((item) => item.id === profileId);
    const model = profile?.models.find((item) => item.id === modelId);
    channel.profileId = profileId;
    channel.modelId = modelId;
    channel.displayName = model?.name || modelId;
    channel.maxTokens = undefined;
  }

  function getResultStatus(
    channelId: string
  ): TranslationResultStatus | undefined {
    return results.value.find((item) => item.channelId === channelId)?.status;
  }

  return {
    presets,
    activePresetId,
    activePreset,
    activeChannels,
    inputText,
    sourceLang,
    targetLang,
    results,
    history,
    settings,
    isTranslating,
    initialized,
    hasConfiguredChannels,
    initialize,
    setActivePreset,
    updateChannelModel,
    addChannel,
    removeChannel,
    swapLanguages,
    clearInput,
    abortAll,
    abortChannel,
    retryChannel,
    resetSettings,
    clearHistory,
    loadHistoryEntry,
    deleteHistoryEntry,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    reorderPresets,
    movePresetUp,
    movePresetDown,
    addChannelToPreset,
    removeChannelFromPreset,
    updateChannelInPreset,
    translate,
    getResultStatus,
  };
});

