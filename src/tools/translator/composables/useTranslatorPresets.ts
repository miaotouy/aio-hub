import { computed, ref, watch, type Ref } from "vue";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  TranslationChannel,
  TranslatorLanguageCode,
  TranslatorPreset,
} from "../types";
import {
  TRANSLATOR_CONFIG_VERSION,
  TRANSLATOR_MODULE_NAME,
} from "./useTranslatorSettings";

const logger = createModuleLogger("tools/translator/presets");

const DEFAULT_PROMPT =
  "Translate the following text from {sourceLang} to {targetLang}. Preserve meaning, tone, formatting, code blocks, numbers, and names. Output only the translation.\n\n{text}";

const ACADEMIC_PROMPT =
  "Translate the following academic or technical text from {sourceLang} to {targetLang}. Use precise terminology, keep citations and formulas unchanged, and output only the polished translation.\n\n{text}";

const CODE_PROMPT =
  "Translate comments, docstrings, and user-facing text from {sourceLang} to {targetLang}. Preserve code, identifiers, placeholders, markdown, and indentation exactly. Output only the translation.\n\n{text}";

const CODE_EXPLAIN_PROMPT =
  "Rewrite the following content as a natural-language description in {targetLang}. For any code, snippets, function definitions, configs, or technical syntax, do NOT keep them in their original form — instead, explain their purpose, control flow, key branches, side effects, and behavior step by step in fluent {targetLang} prose. For non-code text, translate it from {sourceLang} to {targetLang} faithfully. Keep identifier names, numbers, and key references inline for clarity. Output only the {targetLang} description.\n\n{text}";

const MAX_CHANNELS_PER_PRESET = 6;

interface TranslatorPresetsFile {
  presets: TranslatorPreset[];
  activePresetId: string;
  version?: string;
}

const presetsManager = createConfigManager<TranslatorPresetsFile>({
  moduleName: TRANSLATOR_MODULE_NAME,
  fileName: "presets.json",
  version: TRANSLATOR_CONFIG_VERSION,
  debounceDelay: 400,
  createDefault: () => ({
    presets: [],
    activePresetId: "quick",
    version: TRANSLATOR_CONFIG_VERSION,
  }),
});

const createChannelId = () =>
  `translator-channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const generatePresetId = () =>
  `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
      defaultTargetLang: "Chinese (Simplified)",
      prompt: DEFAULT_PROMPT,
    },
    {
      id: "academic",
      name: "学术精翻",
      icon: "BookOpen",
      channels: makeChannels(3),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese (Simplified)",
      prompt: ACADEMIC_PROMPT,
    },
    {
      id: "code-comments",
      name: "代码注释",
      icon: "Code2",
      channels: makeChannels(2),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese (Simplified)",
      prompt: CODE_PROMPT,
    },
    {
      id: "code-explain",
      name: "代码释义",
      icon: "ScrollText",
      channels: makeChannels(2),
      defaultSourceLang: "auto",
      defaultTargetLang: "Chinese (Simplified)",
      prompt: CODE_EXPLAIN_PROMPT,
    },
  ];
}

/**
 * v1.0.0 → v1.1.0 迁移：把旧的笼统 "Chinese" 映射到 "Chinese (Simplified)"。
 * 同步修复历史里残留的旧 code，确保和新内置库一致。
 */
function migrateLegacyLanguageCode(
  code: TranslatorLanguageCode
): TranslatorLanguageCode {
  if (code === "Chinese") return "Chinese (Simplified)";
  return code;
}

function migrateLegacyPresets(presets: TranslatorPreset[]): TranslatorPreset[] {
  return presets.map((preset) => ({
    ...preset,
    defaultSourceLang: migrateLegacyLanguageCode(preset.defaultSourceLang),
    defaultTargetLang: migrateLegacyLanguageCode(preset.defaultTargetLang),
  }));
}

interface PresetsDeps {
  enabledProfiles: Ref<LlmProfile[]>;
}

/**
 * 翻译预设管理 composable。
 * 负责预设的 CRUD、渠道操作、排序和持久化。
 */
export function useTranslatorPresets(deps: PresetsDeps) {
  const { enabledProfiles } = deps;

  const presets = ref<TranslatorPreset[]>([]);
  const activePresetId = ref("quick");
  const initialized = ref(false);
  const isLoading = ref(false);

  const activePreset = computed(() =>
    presets.value.find((preset) => preset.id === activePresetId.value)
  );
  const activeChannels = computed(() => activePreset.value?.channels ?? []);
  const hasConfiguredChannels = computed(() => activeChannels.value.length > 0);

  async function initialize() {
    if (initialized.value) return;
    isLoading.value = true;
    try {
      const file = await presetsManager.load();
      const rawRestored =
        Array.isArray(file.presets) && file.presets.length > 0
          ? file.presets
          : buildDefaultPresets(enabledProfiles.value);
      const restored = migrateLegacyPresets(rawRestored);
      presets.value = restored;

      const desiredActiveId =
        file.activePresetId &&
        restored.some((preset) => preset.id === file.activePresetId)
          ? file.activePresetId
          : restored[0]?.id || "quick";
      activePresetId.value = desiredActiveId;
    } catch (error) {
      logger.warn("预设加载失败，使用默认预设", { error: String(error) });
      presets.value = buildDefaultPresets(enabledProfiles.value);
      activePresetId.value = presets.value[0]?.id || "quick";
    } finally {
      isLoading.value = false;
      initialized.value = true;
    }
  }

  function findPreset(id: string) {
    return presets.value.find((preset) => preset.id === id);
  }

  function pickFallbackChannelCandidate(preset: TranslatorPreset) {
    const selectedKeys = new Set(
      preset.channels.map(
        (channel) => `${channel.profileId}:${channel.modelId}`
      )
    );
    return (
      firstTextModels(enabledProfiles.value, 12).find(
        ({ profile, model }) => !selectedKeys.has(`${profile.id}:${model.id}`)
      ) ?? firstTextModels(enabledProfiles.value, 1)[0]
    );
  }

  // ---- 当前激活预设的快捷渠道操作 ----

  function addChannel() {
    const preset = activePreset.value;
    if (!preset || preset.channels.length >= MAX_CHANNELS_PER_PRESET) return;
    const candidate = pickFallbackChannelCandidate(preset);
    if (!candidate) return;
    preset.channels.push(
      toChannel(candidate.profile, candidate.model, preset.channels.length)
    );
  }

  function removeChannel(channelId: string) {
    const preset = activePreset.value;
    if (!preset || preset.channels.length <= 1) return;
    preset.channels = preset.channels.filter(
      (channel) => channel.id !== channelId
    );
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

  // ---- 跨预设的渠道操作（预设管理器用）----

  function addChannelToPreset(presetId: string) {
    const preset = findPreset(presetId);
    if (!preset || preset.channels.length >= MAX_CHANNELS_PER_PRESET) return;
    const candidate = pickFallbackChannelCandidate(preset);
    if (!candidate) return;
    preset.channels.push(
      toChannel(candidate.profile, candidate.model, preset.channels.length)
    );
  }

  function removeChannelFromPreset(presetId: string, channelId: string) {
    const preset = findPreset(presetId);
    if (!preset || preset.channels.length <= 1) return;
    preset.channels = preset.channels.filter(
      (channel) => channel.id !== channelId
    );
  }

  function updateChannelInPreset(
    presetId: string,
    channelId: string,
    profileId: string,
    modelId: string
  ) {
    const preset = findPreset(presetId);
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

  // ---- 预设 CRUD ----

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
      defaultTargetLang: template?.defaultTargetLang || "Chinese (Simplified)",
      prompt: template?.prompt || base?.prompt || DEFAULT_PROMPT,
    };
    presets.value.push(newPreset);
    return newPreset;
  }

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

  /**
   * 删除预设；返回是否真的执行了删除。
   * 注意：本 composable 不直接处理"删除激活预设后切换到哪一个"的副作用，
   * 调用方（门面 store）需要根据返回的 newActiveId 做相应的 UI 状态联动。
   */
  function deletePreset(id: string): {
    deleted: boolean;
    newActivePreset: TranslatorPreset | null;
  } {
    if (presets.value.length <= 1) {
      return { deleted: false, newActivePreset: null };
    }
    const target = findPreset(id);
    if (!target) return { deleted: false, newActivePreset: null };

    const wasActive = activePresetId.value === id;
    presets.value = presets.value.filter((preset) => preset.id !== id);

    let newActive: TranslatorPreset | null = null;
    if (wasActive) {
      newActive = presets.value[0] || null;
      if (newActive) {
        activePresetId.value = newActive.id;
      }
    }
    return { deleted: true, newActivePreset: newActive };
  }

  function duplicatePreset(id: string): TranslatorPreset | null {
    const source = findPreset(id);
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

  function setActivePresetId(id: string): TranslatorPreset | undefined {
    const preset = findPreset(id);
    if (!preset) return undefined;
    activePresetId.value = id;
    return preset;
  }

  /** 给定一个语言代码，判断它是否是某预设的默认值（用于"语言粘性"判断） */
  function isLangFromPresetDefaults(
    sourceLang: TranslatorLanguageCode,
    targetLang: TranslatorLanguageCode,
    preset: TranslatorPreset
  ) {
    return (
      sourceLang === preset.defaultSourceLang &&
      targetLang === preset.defaultTargetLang
    );
  }

  // ---- 持久化 watch ----
  watch(
    [presets, activePresetId],
    ([nextPresets, nextActiveId]) => {
      if (!initialized.value || isLoading.value) return;
      presetsManager.saveDebounced({
        presets: nextPresets as TranslatorPreset[],
        activePresetId: nextActiveId as string,
        version: TRANSLATOR_CONFIG_VERSION,
      });
    },
    { deep: true }
  );

  return {
    // state
    presets,
    activePresetId,
    activePreset,
    activeChannels,
    hasConfiguredChannels,
    initialized,
    // lifecycle
    initialize,
    // 激活预设的快捷渠道操作
    addChannel,
    removeChannel,
    updateChannelModel,
    // 跨预设的渠道操作
    addChannelToPreset,
    removeChannelFromPreset,
    updateChannelInPreset,
    // 预设 CRUD
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    reorderPresets,
    movePresetUp,
    movePresetDown,
    setActivePresetId,
    // utils
    isLangFromPresetDefaults,
  };
}

export const TRANSLATOR_MAX_CHANNELS_PER_PRESET = MAX_CHANNELS_PER_PRESET;
