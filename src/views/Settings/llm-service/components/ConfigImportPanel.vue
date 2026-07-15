<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  FilePlus2,
  KeyRound,
  Trash2,
  X,
} from "lucide-vue-next";
import { providerTypes } from "@/config/llm-providers";
import type { LlmProfile } from "@/types/llm-profiles";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  normalizeComparableBaseUrl,
  parseLlmChannelConfig,
  type LlmConfigImportDiagnostic,
  type LlmConfigImportDocument,
  type LlmConfigImportFormat,
  type ParsedLlmProfileDraft,
} from "@/utils/llm-config-import";

interface Props {
  mode?: "create" | "edit";
  existingProfiles?: LlmProfile[];
}

interface ImportedFile {
  id: string;
  name: string;
  content: string;
}

const props = withDefaults(defineProps<Props>(), {
  mode: "create",
  existingProfiles: () => [],
});
const emit = defineEmits<{
  (e: "import", profiles: ParsedLlmProfileDraft[]): void;
}>();

const errorHandler = createModuleErrorHandler("LlmConfigImport");
const formats: Array<{ label: string; value: LlmConfigImportFormat }> = [
  { label: "自动检测", value: "auto" },
  { label: "cURL", value: "curl" },
  { label: "环境变量", value: "env" },
  { label: "JSON", value: "json" },
  { label: "TOML", value: "toml" },
];

const format = ref<LlmConfigImportFormat>("auto");
const textInput = ref("");
const files = ref<ImportedFile[]>([]);
const profiles = ref<ParsedLlmProfileDraft[]>([]);
const diagnostics = ref<LlmConfigImportDiagnostic[]>([]);
const detectedFormat = ref<string | null>(null);
const selectedIds = ref<string[]>([]);
let parseTimer: ReturnType<typeof setTimeout> | null = null;

const documents = computed<LlmConfigImportDocument[]>(() => {
  const result: LlmConfigImportDocument[] = [];
  if (textInput.value.trim()) {
    result.push({ id: "pasted-content", content: textInput.value });
  }
  result.push(...files.value.map((file) => ({ ...file })));
  return result;
});

const runParse = () => {
  const result = parseLlmChannelConfig(documents.value, format.value);
  profiles.value = result.profiles;
  diagnostics.value = result.diagnostics;
  detectedFormat.value = result.detectedFormat;

  const availableIds = new Set(result.profiles.map((profile) => profile.id));
  selectedIds.value = selectedIds.value.filter((id) => availableIds.has(id));
  if (result.profiles.length === 1 && isImportable(result.profiles[0])) {
    selectedIds.value = [result.profiles[0].id];
  }
};

watch(
  [documents, format],
  () => {
    if (parseTimer) clearTimeout(parseTimer);
    if (!documents.value.length) {
      profiles.value = [];
      diagnostics.value = [];
      detectedFormat.value = null;
      selectedIds.value = [];
      return;
    }
    parseTimer = setTimeout(runParse, 250);
  },
  { deep: true, immediate: true }
);

onBeforeUnmount(() => {
  if (parseTimer) clearTimeout(parseTimer);
});

const duplicateProfiles = (profile: ParsedLlmProfileDraft) =>
  props.existingProfiles.filter(
    (existing) =>
      existing.type === profile.providerType &&
      normalizeComparableBaseUrl(existing.baseUrl) ===
        normalizeComparableBaseUrl(profile.baseUrl)
  );

function isImportable(profile: ParsedLlmProfileDraft) {
  return (
    !!profile.suggestedName.trim() &&
    !!profile.baseUrl &&
    !profile.warnings.some(
      (warning) => warning.blocking || warning.severity === "error"
    )
  );
}

const selectedProfiles = computed(() =>
  profiles.value.filter(
    (profile) => selectedIds.value.includes(profile.id) && isImportable(profile)
  )
);

const selectProfile = (profile: ParsedLlmProfileDraft, selected: boolean) => {
  if (!isImportable(profile)) return;
  if (props.mode === "edit") {
    selectedIds.value = selected ? [profile.id] : [];
    return;
  }
  selectedIds.value = selected
    ? Array.from(new Set([...selectedIds.value, profile.id]))
    : selectedIds.value.filter((id) => id !== profile.id);
};

const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) textInput.value = text;
  } catch {
    customMessage.warning("无法读取剪贴板，请手动粘贴配置");
  }
};

const selectFiles = async () => {
  try {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "选择 LLM 配置文件",
      filters: [
        {
          name: "配置文件",
          extensions: ["json", "toml", "env", "txt", "conf", "cfg"],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    const paths = Array.isArray(selected)
      ? selected
      : selected
        ? [selected]
        : [];
    const existingIds = new Set(files.value.map((file) => file.id));
    const additions: ImportedFile[] = [];
    for (const path of paths) {
      if (existingIds.has(path)) continue;
      additions.push({
        id: path,
        name: path.split(/[\\/]/).pop() || "config",
        content: await readTextFile(path),
      });
    }
    files.value.push(...additions);
  } catch (error) {
    errorHandler.error(error, "读取配置文件失败");
  }
};

const removeFile = (id: string) => {
  files.value = files.value.filter((file) => file.id !== id);
};

const clearAll = () => {
  textInput.value = "";
  files.value = [];
  profiles.value = [];
  diagnostics.value = [];
  selectedIds.value = [];
};

const maskKey = (key: string) => {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
};

const confirmImport = () => {
  if (!selectedProfiles.value.length) return;
  emit(
    "import",
    selectedProfiles.value.map((profile) => JSON.parse(JSON.stringify(profile)))
  );
};
</script>

<template>
  <div class="config-import-panel">
    <el-segmented
      v-model="format"
      :options="formats"
      class="format-segmented"
    />

    <div class="import-workspace">
      <section class="input-pane" aria-label="配置输入">
        <div class="pane-toolbar">
          <span class="pane-title">配置内容</span>
          <div class="toolbar-actions">
            <el-tooltip content="从剪贴板粘贴" placement="top">
              <el-button
                text
                circle
                aria-label="从剪贴板粘贴"
                @click="pasteFromClipboard"
              >
                <ClipboardPaste :size="16" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="选择配置文件" placement="top">
              <el-button
                text
                circle
                aria-label="选择配置文件"
                @click="selectFiles"
              >
                <FilePlus2 :size="16" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="清空" placement="top">
              <el-button
                text
                circle
                aria-label="清空配置"
                :disabled="!documents.length"
                @click="clearAll"
              >
                <Trash2 :size="16" />
              </el-button>
            </el-tooltip>
          </div>
        </div>

        <el-input
          v-model="textInput"
          type="textarea"
          :rows="12"
          resize="none"
          class="config-textarea"
          placeholder="粘贴 cURL、环境变量、JSON 或 TOML 配置"
          aria-label="配置内容"
        />

        <div v-if="files.length" class="file-list" aria-label="已选配置文件">
          <div v-for="file in files" :key="file.id" class="file-row">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <el-button
              text
              circle
              :aria-label="`移除 ${file.name}`"
              @click="removeFile(file.id)"
            >
              <X :size="14" />
            </el-button>
          </div>
        </div>
      </section>

      <section class="result-pane" aria-label="解析结果">
        <div class="pane-toolbar">
          <span class="pane-title">候选渠道</span>
          <span
            v-if="detectedFormat && format === 'auto'"
            class="detected-format"
          >
            {{ detectedFormat.toUpperCase() }}
          </span>
        </div>

        <div v-if="!documents.length" class="result-empty">
          粘贴内容或选择文件后，将在这里显示可导入渠道。
        </div>

        <div v-else-if="profiles.length" class="candidate-list">
          <article
            v-for="profile in profiles"
            :key="profile.id"
            class="candidate-card"
            :class="{
              selected: selectedIds.includes(profile.id),
              blocked: !isImportable(profile),
            }"
          >
            <div class="candidate-select">
              <el-radio
                v-if="mode === 'edit'"
                :model-value="selectedIds[0] || ''"
                :value="profile.id"
                :disabled="!isImportable(profile)"
                @change="selectProfile(profile, true)"
              />
              <el-checkbox
                v-else
                :model-value="selectedIds.includes(profile.id)"
                :disabled="!isImportable(profile)"
                @change="(value: boolean) => selectProfile(profile, value)"
              />
            </div>

            <div class="candidate-content">
              <div class="candidate-heading">
                <el-input
                  v-model="profile.suggestedName"
                  size="small"
                  maxlength="50"
                  aria-label="渠道名称"
                />
                <el-select
                  v-model="profile.providerType"
                  size="small"
                  aria-label="渠道类型"
                >
                  <el-option
                    v-for="provider in providerTypes"
                    :key="provider.type"
                    :label="provider.name"
                    :value="provider.type"
                  />
                </el-select>
              </div>

              <div class="candidate-meta">
                <span>{{ profile.sourceKind }}</span>
                <span>{{
                  profile.confidence === "high"
                    ? "高置信度"
                    : profile.confidence === "medium"
                      ? "中置信度"
                      : "低置信度"
                }}</span>
              </div>
              <div class="candidate-url mono">
                {{ profile.baseUrl || "缺少 Base URL" }}
              </div>
              <div class="candidate-summary">
                <span class="summary-item">
                  <KeyRound :size="13" />
                  {{
                    profile.apiKeys.length
                      ? maskKey(profile.apiKeys[0])
                      : "未配置 Key"
                  }}
                  <template v-if="profile.apiKeys.length > 1"
                    >等 {{ profile.apiKeys.length }} 个</template
                  >
                </span>
                <span>{{ profile.models.length }} 个模型</span>
                <span v-if="profile.models.length" class="model-summary mono">
                  {{
                    profile.models
                      .slice(0, 3)
                      .map((model) => model.id)
                      .join(", ")
                  }}
                </span>
              </div>

              <div
                v-if="duplicateProfiles(profile).length"
                class="candidate-warning"
              >
                <AlertCircle :size="14" />
                <span
                  >已有相同类型和 API 地址的渠道：{{
                    duplicateProfiles(profile)
                      .map((item) => item.name)
                      .join(", ")
                  }}</span
                >
              </div>
              <div
                v-for="warning in profile.warnings"
                :key="`${warning.code}-${warning.message}`"
                class="candidate-warning"
                :class="warning.severity"
              >
                <AlertCircle :size="14" />
                <span>{{ warning.message }}</span>
              </div>
            </div>
          </article>
        </div>

        <div v-if="diagnostics.length" class="diagnostic-list">
          <div
            v-for="diagnostic in diagnostics"
            :key="`${diagnostic.code}-${diagnostic.documentId || ''}`"
            class="diagnostic-item"
            :class="diagnostic.severity"
          >
            <AlertCircle :size="14" />
            <span>{{ diagnostic.message }}</span>
          </div>
        </div>
      </section>
    </div>

    <div class="import-actions">
      <span class="selection-summary">
        已选择 {{ selectedProfiles.length }} 个渠道
      </span>
      <el-button
        type="primary"
        :disabled="!selectedProfiles.length"
        @click="confirmImport"
      >
        <Check :size="15" />
        {{ mode === "edit" ? "应用到当前渠道" : "创建选中渠道" }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.config-import-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.format-segmented {
  width: 100%;
  flex-shrink: 0;
}

.format-segmented :deep(.el-segmented__group) {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.import-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 0.9fr) minmax(340px, 1.1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.input-pane,
.result-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
}

.pane-toolbar {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.pane-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.detected-format {
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.config-textarea {
  flex: 1;
  min-height: 180px;
}

.config-textarea :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 180px !important;
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.55;
  background: var(--input-bg);
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  max-height: 92px;
  overflow-y: auto;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding-left: 8px;
  background: var(--input-bg);
  border-radius: 6px;
}

.file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.candidate-card {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  padding: 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.candidate-card.selected {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.06);
}

.candidate-card.blocked {
  opacity: 0.78;
}

.candidate-select {
  padding-top: 3px;
}

.candidate-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.candidate-heading {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(150px, 0.8fr);
  gap: 8px;
}

.candidate-meta,
.candidate-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.candidate-url {
  font-size: 12px;
  color: var(--text-color);
  overflow-wrap: anywhere;
}

.summary-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.model-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-warning,
.diagnostic-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--el-color-warning);
}

.candidate-warning.error,
.diagnostic-item.error {
  color: var(--el-color-danger);
}

.candidate-warning svg,
.diagnostic-item svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.diagnostic-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.result-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.import-actions {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: var(--border-width) solid var(--border-color);
}

.selection-summary {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.mono {
  font-family: "JetBrains Mono", "Consolas", monospace;
}

@media (max-width: 900px) {
  .import-workspace {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .input-pane,
  .result-pane {
    min-height: 300px;
  }
}

@media (max-width: 560px) {
  .format-segmented :deep(.el-segmented__group) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .candidate-heading {
    grid-template-columns: 1fr;
  }

  .candidate-summary {
    flex-wrap: wrap;
  }

  .import-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
