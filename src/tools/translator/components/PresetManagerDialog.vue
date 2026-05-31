<template>
  <BaseDialog
    v-model="dialogVisible"
    title="管理翻译预设"
    width="1100px"
    height="80vh"
    close-on-backdrop-click
    show-close-button
  >
    <div class="preset-manager">
      <!-- 左侧：预设列表 -->
      <aside class="preset-list-panel">
        <div class="list-header">
          <span class="list-title">预设</span>
          <el-tooltip content="新建预设" placement="top">
            <el-button
              class="icon-button primary"
              :icon="Plus"
              @click="handleCreate"
            />
          </el-tooltip>
        </div>

        <div class="preset-list">
          <div
            v-for="(preset, index) in store.presets"
            :key="preset.id"
            class="preset-row"
            :class="{ selected: preset.id === selectedId }"
            @click="selectPreset(preset.id)"
          >
            <component
              :is="getPresetIcon(preset.icon)"
              class="preset-row-icon"
            />
            <div class="preset-row-meta">
              <span class="preset-row-name">{{ preset.name }}</span>
              <span class="preset-row-desc">
                {{ preset.channels.length }} 渠道 ·
                {{ getLanguageLabel(preset.defaultSourceLang) }}
                → {{ getLanguageLabel(preset.defaultTargetLang) }}
              </span>
            </div>
            <div class="preset-row-actions" @click.stop>
              <el-tooltip content="上移" placement="top">
                <el-button
                  class="icon-button tiny"
                  :icon="ChevronUp"
                  :disabled="index === 0"
                  @click="store.movePresetUp(preset.id)"
                />
              </el-tooltip>
              <el-tooltip content="下移" placement="top">
                <el-button
                  class="icon-button tiny"
                  :icon="ChevronDown"
                  :disabled="index === store.presets.length - 1"
                  @click="store.movePresetDown(preset.id)"
                />
              </el-tooltip>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：预设详情编辑 -->
      <section v-if="selectedPreset" class="preset-detail-panel">
        <header class="detail-header">
          <div class="header-title-row">
            <component
              :is="getPresetIcon(selectedPreset.icon)"
              class="detail-icon"
            />
            <el-input
              v-model="nameDraft"
              class="name-input"
              placeholder="预设名称"
              maxlength="32"
              @blur="commitName"
              @keydown.enter="commitName"
            />
          </div>

          <div class="header-actions">
            <el-tooltip content="复制预设" placement="top">
              <el-button :icon="Copy" @click="handleDuplicate">复制</el-button>
            </el-tooltip>
            <el-tooltip
              :content="
                store.presets.length <= 1 ? '至少保留一个预设' : '删除预设'
              "
              placement="top"
            >
              <el-button
                type="danger"
                plain
                :icon="Trash2"
                :disabled="store.presets.length <= 1"
                @click="handleDelete"
              >
                删除
              </el-button>
            </el-tooltip>
          </div>
        </header>

        <div class="detail-body">
          <section class="detail-section">
            <div class="section-heading">图标</div>
            <div class="icon-picker">
              <button
                v-for="option in PRESET_ICON_OPTIONS"
                :key="option.key"
                type="button"
                class="icon-option"
                :class="{ active: selectedPreset.icon === option.key }"
                :title="option.label"
                @click="
                  store.updatePreset(selectedPreset.id, { icon: option.key })
                "
              >
                <component :is="option.component" class="icon-option-icon" />
              </button>
            </div>
          </section>

          <section class="detail-section">
            <div class="section-heading">默认语言</div>
            <div class="language-row">
              <div class="lang-field">
                <span class="field-label">源语言</span>
                <el-select
                  :model-value="selectedPreset.defaultSourceLang"
                  teleported
                  @update:model-value="handleSourceLangChange"
                >
                  <el-option
                    v-for="lang in TRANSLATOR_LANGUAGES"
                    :key="lang.value"
                    :label="lang.label"
                    :value="lang.value"
                  />
                </el-select>
              </div>
              <div class="lang-field">
                <span class="field-label">目标语言</span>
                <el-select
                  :model-value="selectedPreset.defaultTargetLang"
                  teleported
                  @update:model-value="handleTargetLangChange"
                >
                  <el-option
                    v-for="lang in targetLanguageOptions"
                    :key="lang.value"
                    :label="lang.label"
                    :value="lang.value"
                  />
                </el-select>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <div class="section-heading">
              <span>翻译指令模板</span>
              <el-tooltip
                content="支持占位符：{text} / {sourceLang} / {targetLang}"
                placement="top"
              >
                <Info class="heading-info-icon" />
              </el-tooltip>
            </div>
            <el-input
              v-model="promptDraft"
              type="textarea"
              :rows="6"
              placeholder="例如：Translate the following text from {sourceLang} to {targetLang}. ..."
              @blur="commitPrompt"
            />
            <div class="placeholder-hints">
              <span
                v-for="hint in PROMPT_PLACEHOLDER_HINTS"
                :key="hint.token"
                class="placeholder-chip"
                @click="insertPlaceholder(hint.token)"
              >
                {{ hint.token }}
                <span class="placeholder-desc">{{ hint.desc }}</span>
              </span>
            </div>
          </section>

          <section class="detail-section">
            <div class="section-heading">
              <span>渠道</span>
              <el-button
                class="icon-button"
                :icon="Plus"
                :disabled="selectedPreset.channels.length >= 6"
                @click="store.addChannelToPreset(selectedPreset.id)"
              />
            </div>
            <div class="channel-list">
              <div
                v-for="(channel, idx) in selectedPreset.channels"
                :key="channel.id"
                class="channel-row"
              >
                <span class="channel-index">{{ idx + 1 }}</span>
                <LlmModelSelector
                  :model-value="`${channel.profileId}:${channel.modelId}`"
                  :capabilities="modelCapabilities"
                  placeholder="选择文本模型"
                  popper-class="translator-model-select"
                  @update:model-value="
                    (v: string) => handleChannelModelChange(channel.id, v)
                  "
                />
                <el-button
                  class="icon-button"
                  :icon="X"
                  :disabled="selectedPreset.channels.length <= 1"
                  @click="
                    store.removeChannelFromPreset(
                      selectedPreset!.id,
                      channel.id
                    )
                  "
                />
              </div>
              <p
                v-if="selectedPreset.channels.length === 0"
                class="empty-channels"
              >
                还没有渠道。点击 + 添加一个文本模型。
              </p>
            </div>
          </section>
        </div>
      </section>

      <section v-else class="preset-detail-panel empty">
        <p>选择左侧预设以查看详情</p>
      </section>
    </div>

    <template #footer>
      <span class="footer-tip">
        预设修改会自动保存。当前共 {{ store.presets.length }} 个预设。
      </span>
      <el-button type="primary" @click="dialogVisible = false">完成</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Component } from "vue";
import { ElMessageBox } from "element-plus";
import {
  BookOpen,
  Bot,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  FileText,
  Globe,
  GraduationCap,
  Info,
  Languages,
  Mail,
  MessageSquare,
  Newspaper,
  Notebook,
  Pen,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { customMessage } from "@/utils/customMessage";
import { parseModelCombo } from "@/utils/modelIdUtils";
import type { ModelCapabilities } from "@/types/llm-profiles";
import { useTranslatorStore } from "../composables/useTranslatorStore";
import { TRANSLATOR_LANGUAGES } from "../constants";
import type { TranslatorLanguageCode } from "../types";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useTranslatorStore();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const PRESET_ICON_OPTIONS: {
  key: string;
  label: string;
  component: Component;
}[] = [
  { key: "Languages", label: "翻译", component: Languages },
  { key: "BookOpen", label: "学术", component: BookOpen },
  { key: "Code2", label: "代码", component: Code2 },
  { key: "FileText", label: "文档", component: FileText },
  { key: "Globe", label: "全球", component: Globe },
  { key: "MessageSquare", label: "对话", component: MessageSquare },
  { key: "Briefcase", label: "商务", component: Briefcase },
  { key: "GraduationCap", label: "教育", component: GraduationCap },
  { key: "Newspaper", label: "新闻", component: Newspaper },
  { key: "Mail", label: "邮件", component: Mail },
  { key: "Bot", label: "AI", component: Bot },
  { key: "Sparkles", label: "灵感", component: Sparkles },
  { key: "Type", label: "排版", component: Type },
  { key: "Notebook", label: "笔记", component: Notebook },
  { key: "Pen", label: "写作", component: Pen },
  { key: "ScrollText", label: "文案", component: ScrollText },
];

const PRESET_ICON_MAP: Record<string, Component> = Object.fromEntries(
  PRESET_ICON_OPTIONS.map((option) => [option.key, option.component])
);

const PROMPT_PLACEHOLDER_HINTS = [
  { token: "{sourceLang}", desc: "源语言名" },
  { token: "{targetLang}", desc: "目标语言名" },
  { token: "{text}", desc: "待翻译文本" },
];

const modelCapabilities: Partial<ModelCapabilities> = {
  embedding: false,
  rerank: false,
  imageGeneration: false,
  videoGeneration: false,
  audioGeneration: false,
  musicGeneration: false,
};

const targetLanguageOptions = TRANSLATOR_LANGUAGES.filter(
  (lang) => lang.value !== "auto"
);

const selectedId = ref<string>(store.activePresetId);
const nameDraft = ref("");
const promptDraft = ref("");

const selectedPreset = computed(() =>
  store.presets.find((preset) => preset.id === selectedId.value)
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      // 打开时默认选择当前激活预设
      selectedId.value = store.activePresetId;
      syncDraftsFromSelected();
    }
  }
);

watch(
  () => selectedPreset.value?.id,
  () => syncDraftsFromSelected()
);

watch(
  () => selectedPreset.value?.name,
  (next) => {
    // 外部更新（如复制预设）时同步
    if (next !== undefined && next !== nameDraft.value) {
      nameDraft.value = next;
    }
  }
);

watch(
  () => selectedPreset.value?.prompt,
  (next) => {
    if (next !== undefined && next !== promptDraft.value) {
      promptDraft.value = next;
    }
  }
);

function syncDraftsFromSelected() {
  if (!selectedPreset.value) {
    nameDraft.value = "";
    promptDraft.value = "";
    return;
  }
  nameDraft.value = selectedPreset.value.name;
  promptDraft.value = selectedPreset.value.prompt;
}

function selectPreset(id: string) {
  selectedId.value = id;
}

function getPresetIcon(icon?: string) {
  return PRESET_ICON_MAP[icon || "Languages"] || Languages;
}

function getLanguageLabel(code: TranslatorLanguageCode) {
  return (
    TRANSLATOR_LANGUAGES.find((lang) => lang.value === code)?.label || code
  );
}

function commitName() {
  if (!selectedPreset.value) return;
  const next = nameDraft.value.trim();
  if (!next) {
    nameDraft.value = selectedPreset.value.name;
    return;
  }
  if (next !== selectedPreset.value.name) {
    store.updatePreset(selectedPreset.value.id, { name: next });
  }
}

function commitPrompt() {
  if (!selectedPreset.value) return;
  if (promptDraft.value !== selectedPreset.value.prompt) {
    store.updatePreset(selectedPreset.value.id, { prompt: promptDraft.value });
  }
}

function insertPlaceholder(token: string) {
  promptDraft.value = `${promptDraft.value}${
    promptDraft.value && !promptDraft.value.endsWith(" ") ? " " : ""
  }${token}`;
  commitPrompt();
}

function handleCreate() {
  const created = store.createPreset();
  selectedId.value = created.id;
  customMessage.success("已新建预设");
}

function handleDuplicate() {
  if (!selectedPreset.value) return;
  const cloned = store.duplicatePreset(selectedPreset.value.id);
  if (cloned) {
    selectedId.value = cloned.id;
    customMessage.success("已复制预设");
  }
}

async function handleDelete() {
  if (!selectedPreset.value) return;
  if (store.presets.length <= 1) return;
  const name = selectedPreset.value.name;
  try {
    await ElMessageBox.confirm(
      `确定要删除预设 "${name}" 吗？此操作无法撤销。`,
      "删除预设",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    const idToDelete = selectedPreset.value.id;
    store.deletePreset(idToDelete);
    selectedId.value = store.activePresetId;
    customMessage.success(`预设 "${name}" 已删除`);
  } catch {
    /* user cancelled */
  }
}

function handleChannelModelChange(channelId: string, value: string) {
  if (!selectedPreset.value) return;
  const [profileId, modelId] = parseModelCombo(value);
  if (!profileId || !modelId) return;
  store.updateChannelInPreset(
    selectedPreset.value.id,
    channelId,
    profileId,
    modelId
  );
}

function handleSourceLangChange(value: unknown) {
  if (!selectedPreset.value) return;
  store.updatePreset(selectedPreset.value.id, {
    defaultSourceLang: value as TranslatorLanguageCode,
  });
}

function handleTargetLangChange(value: unknown) {
  if (!selectedPreset.value) return;
  store.updatePreset(selectedPreset.value.id, {
    defaultTargetLang: value as TranslatorLanguageCode,
  });
}
</script>

<style scoped>
.preset-manager {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.preset-list-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  overflow: hidden;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.list-title {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 700;
}

.preset-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: var(--border-width) solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.preset-row:hover {
  background: var(--card-bg);
}

.preset-row.selected {
  background: var(--card-bg);
  border-color: color-mix(in srgb, var(--primary-color) 48%, transparent);
}

.preset-row-icon {
  width: 18px;
  height: 18px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.preset-row-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preset-row-name {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-row-desc {
  color: var(--text-color-secondary);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-row-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.preset-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  overflow: hidden;
}

.preset-detail-panel.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.detail-icon {
  width: 22px;
  height: 22px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.name-input :deep(.el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  font-size: 15px;
  font-weight: 700;
}

.name-input :deep(.el-input__wrapper):hover,
.name-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px
    color-mix(in srgb, var(--primary-color) 50%, transparent) inset;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 700;
}

.heading-info-icon {
  width: 14px;
  height: 14px;
  color: var(--text-color-secondary);
  cursor: help;
}

.icon-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 6px;
}

.icon-option {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: var(--card-bg);
  color: var(--text-color-secondary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.icon-option:hover {
  color: var(--text-color);
  border-color: color-mix(
    in srgb,
    var(--primary-color) 40%,
    var(--border-color)
  );
}

.icon-option.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, var(--card-bg));
}

.icon-option-icon {
  width: 18px;
  height: 18px;
}

.language-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.lang-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-label {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.placeholder-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.placeholder-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--primary-color);
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.placeholder-chip:hover {
  border-color: var(--primary-color);
}

.placeholder-desc {
  color: var(--text-color-secondary);
  font-family: inherit;
  font-size: 11px;
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.channel-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 32px;
  gap: 8px;
  align-items: center;
}

.channel-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 700;
  border: var(--border-width) solid var(--border-color);
}

.empty-channels {
  margin: 6px 0 0;
  color: var(--text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
}

.icon-button.tiny {
  width: 24px;
  height: 24px;
}

.icon-button.primary {
  color: var(--primary-color);
}

.footer-tip {
  flex: 1;
  color: var(--text-color-secondary);
  font-size: 12px;
  text-align: left;
}

@media (max-width: 960px) {
  .preset-manager {
    grid-template-columns: 1fr;
    grid-template-rows: 200px minmax(0, 1fr);
  }

  .language-row {
    grid-template-columns: 1fr;
  }
}
</style>
