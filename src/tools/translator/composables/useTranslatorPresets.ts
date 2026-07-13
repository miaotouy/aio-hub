// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  applyTemplateToPreset,
  buildInitialDefaultPresets,
  createChannelFromModel,
  findBuiltinTemplate,
  pickFirstTextModels,
  BUILTIN_PRESET_TEMPLATES,
} from "../core/builtinPresets";
import {
  TRANSLATOR_CONFIG_VERSION,
  TRANSLATOR_MODULE_NAME,
} from "../core/config";

const logger = createModuleLogger("tools/translator/presets");

const MAX_CHANNELS_PER_PRESET = 6;

/** 兜底 prompt：当所有内置预设都不可用时（理论不应发生）退化用。 */
const FALLBACK_PROMPT =
  BUILTIN_PRESET_TEMPLATES[0]?.prompt ??
  "Translate the following text from {sourceLang} to {targetLang}.\n\n{text}";

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

/** 内部别名：保留旧名引用，避免大范围改动 */
const firstTextModels = pickFirstTextModels;
const toChannel = createChannelFromModel;

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
          : buildInitialDefaultPresets(enabledProfiles.value);
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
      presets.value = buildInitialDefaultPresets(enabledProfiles.value);
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
      prompt: template?.prompt || base?.prompt || FALLBACK_PROMPT,
    };
    presets.value.push(newPreset);
    return newPreset;
  }

  /**
   * 把内置预设模板应用到一个已存在的预设：
   * 替换 name/icon/prompt/defaultSourceLang/defaultTargetLang，**保留 id 与 channels**。
   *
   * 这是预设管理器中"从内置预设导入"按钮的入口；调用方应已经做过用户二次确认。
   *
   * @returns 是否成功应用
   */
  function applyBuiltinTemplateToPreset(
    presetId: string,
    templateId: string
  ): boolean {
    const index = presets.value.findIndex((preset) => preset.id === presetId);
    if (index === -1) return false;
    const template = findBuiltinTemplate(templateId);
    if (!template) {
      logger.warn("找不到指定内置模板", { templateId });
      return false;
    }
    const current = presets.value[index];
    const next = applyTemplateToPreset(current, template);
    presets.value.splice(index, 1, next);
    return true;
  }

  /**
   * 基于内置模板新建一个预设（带自动填充的渠道）。
   * 用于"新建预设"流程中"直接从内置模板创建"的场景（当前 UI 暂未提供入口，
   * 但 API 已经准备好，方便后续扩展）。
   */
  function createPresetFromTemplate(
    templateId: string
  ): TranslatorPreset | null {
    const template = findBuiltinTemplate(templateId);
    if (!template) {
      logger.warn("找不到指定内置模板", { templateId });
      return null;
    }
    const candidates = firstTextModels(
      enabledProfiles.value,
      template.defaultChannelCount
    );
    const channels: TranslationChannel[] = candidates.map(
      ({ profile, model }, idx) => toChannel(profile, model, idx)
    );
    if (channels.length === 0) {
      const fallback = firstTextModels(enabledProfiles.value, 1)[0];
      if (fallback) {
        channels.push(toChannel(fallback.profile, fallback.model, 0));
      }
    }
    const newPreset: TranslatorPreset = {
      id: generatePresetId(),
      name: template.name,
      icon: template.icon,
      channels,
      defaultSourceLang: template.defaultSourceLang,
      defaultTargetLang: template.defaultTargetLang,
      prompt: template.prompt,
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
    createPresetFromTemplate,
    updatePreset,
    applyBuiltinTemplateToPreset,
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
