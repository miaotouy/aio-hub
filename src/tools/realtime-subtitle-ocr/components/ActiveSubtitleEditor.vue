<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElInput } from "element-plus";
import { Check, ChevronDown, ChevronUp, Clock3, Plus, Save } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { formatSrtTime } from "../utils/algorithms";
import type { SubtitleEntry } from "../types";

const props = defineProps<{
  activeSubtitle: SubtitleEntry | null;
  activeSubtitleIndex: number;
  subtitles?: SubtitleEntry[];
}>();

const emit = defineEmits<{
  (e: "update-text", id: string, text: string): void;
  (e: "select", id: string): void;
  /** 编辑完成（保存或焦点移出编辑器），用于把键盘焦点交还监视器。 */
  (e: "finish"): void;
}>();

const localSubtitleText = ref("");
const editorInputRef = ref<InstanceType<typeof ElInput> | null>(null);
const isEditing = ref(false);
let lastActiveId = "";

const subtitleList = computed(() => props.subtitles ?? []);
const hasChanges = computed(
  () => !!props.activeSubtitle && localSubtitleText.value !== props.activeSubtitle.text
);

watch(
  () => props.activeSubtitle,
  (newVal) => {
    if (!newVal) {
      localSubtitleText.value = "";
      lastActiveId = "";
      isEditing.value = false;
      return;
    }

    // 切换条目时同步内容，但不再强制抢焦点；Resolve 的 Inspector 只在用户主动编辑时获得焦点。
    if (newVal.id !== lastActiveId || !isEditing.value) {
      localSubtitleText.value = newVal.text;
      lastActiveId = newVal.id;
      isEditing.value = false;
    }
  },
  { immediate: true }
);

function onEditorFocus() {
  isEditing.value = true;
}

function shouldReturnFocus(related: HTMLElement | null): boolean {
  if (!related) return true;
  if (related.isContentEditable) return false;
  const tag = related.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  return !related.closest(
    "button, [role='button'], .el-select, .el-input-number, .el-switch, .el-slider"
  );
}

function onEditorBlur(event: FocusEvent) {
  const related = (event.relatedTarget as HTMLElement | null) ?? null;
  window.setTimeout(() => {
    if (hasChanges.value) commitSubtitleEdit(false);
    isEditing.value = false;
    if (shouldReturnFocus(related)) emit("finish");
  }, 120);
}

function commitSubtitleEdit(showMessage = true) {
  if (!props.activeSubtitle || !hasChanges.value) return;
  emit("update-text", props.activeSubtitle.id, localSubtitleText.value);
  isEditing.value = false;
  lastActiveId = props.activeSubtitle.id;
  if (showMessage) customMessage.success("字幕已保存");
}

function selectSubtitle(id: string) {
  if (id === props.activeSubtitle?.id) return;
  if (hasChanges.value) commitSubtitleEdit(false);
  emit("select", id);
}

function selectPrevious() {
  const index = props.activeSubtitleIndex - 1;
  if (index >= 0) selectSubtitle(subtitleList.value[index].id);
}

function selectNext() {
  const index = props.activeSubtitleIndex + 1;
  if (index < subtitleList.value.length) selectSubtitle(subtitleList.value[index].id);
}

function formatTime(ms: number): string {
  return formatSrtTime(ms).replace(",", ".");
}

function statusLabel(subtitle: SubtitleEntry): string {
  if (subtitle.status === "processing") return "识别中";
  if (subtitle.status === "error") return "失败";
  return "已识别";
}
</script>

<template>
  <div class="subtitle-inspector" data-testid="rsocr-subtitle-editor">
    <div class="subtitle-inspector__heading">
      <div>
        <span class="subtitle-inspector__eyebrow">SUBTITLE INSPECTOR</span>
        <h3>字幕</h3>
      </div>
      <div class="subtitle-inspector__counter">
        {{ activeSubtitle ? `${activeSubtitleIndex + 1} / ${subtitleList.length}` : "—" }}
      </div>
    </div>

    <template v-if="activeSubtitle">
      <div class="subtitle-inspector__time-row">
        <div class="time-field">
          <label>开始</label>
          <div class="time-field__value"><Clock3 :size="12" />{{ formatTime(activeSubtitle.startMs) }}</div>
        </div>
        <div class="time-field">
          <label>结束</label>
          <div class="time-field__value"><Clock3 :size="12" />{{ formatTime(activeSubtitle.endMs) }}</div>
        </div>
      </div>

      <div class="subtitle-inspector__editor-head">
        <span>字幕内容</span>
        <span class="subtitle-inspector__state" :class="{ 'is-dirty': hasChanges }">
          <Check :size="12" />{{ hasChanges ? "未保存" : "已同步" }}
        </span>
      </div>
      <el-input
        ref="editorInputRef"
        v-model="localSubtitleText"
        type="textarea"
        :disabled="activeSubtitle.status === 'processing'"
        :rows="4"
        resize="none"
        placeholder="输入字幕内容"
        class="subtitle-text-input"
        @focus="onEditorFocus"
        @blur="onEditorBlur"
        @keydown.enter.ctrl.prevent="commitSubtitleEdit()"
      />

      <div class="subtitle-inspector__actions">
        <el-button size="small" text :disabled="activeSubtitleIndex <= 0" @click="selectPrevious">
          <ChevronUp :size="14" /> 上一条
        </el-button>
        <el-button size="small" text :disabled="activeSubtitleIndex >= subtitleList.length - 1" @click="selectNext">
          下一条 <ChevronDown :size="14" />
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!hasChanges"
          @click="commitSubtitleEdit()"
        >
          <Save :size="13" /> 保存
        </el-button>
      </div>
    </template>
    <div v-else class="subtitle-inspector__empty">
      <span class="subtitle-inspector__empty-icon"><Plus :size="16" /></span>
      <strong>选择一条字幕</strong>
      <span>从下方字幕轨道选择片段后，在这里编辑内容。</span>
    </div>

    <div class="subtitle-list" :class="{ 'is-empty': !subtitleList.length }">
      <div class="subtitle-list__header">
        <span>字幕片段</span>
        <span>{{ subtitleList.length }} 条</span>
      </div>
      <button
        v-for="(subtitle, index) in subtitleList"
        :key="subtitle.id"
        type="button"
        class="subtitle-list__item"
        :class="{ 'is-active': subtitle.id === activeSubtitle?.id }"
        @click="selectSubtitle(subtitle.id)"
      >
        <span class="subtitle-list__index">{{ String(index + 1).padStart(2, "0") }}</span>
        <span class="subtitle-list__copy">
          <span class="subtitle-list__time">{{ formatTime(subtitle.startMs) }} — {{ formatTime(subtitle.endMs) }}</span>
          <span class="subtitle-list__text">{{ subtitle.text || "（空字幕）" }}</span>
        </span>
        <span class="subtitle-list__status">{{ statusLabel(subtitle) }}</span>
      </button>
      <div v-if="!subtitleList.length" class="subtitle-list__placeholder">识别后字幕片段会显示在这里</div>
    </div>
  </div>
</template>

<style scoped>
.subtitle-inspector {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 14px 0;
  box-sizing: border-box;
  background: var(--card-bg);
  color: var(--el-text-color-primary);
}
.subtitle-inspector__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}
.subtitle-inspector__eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.subtitle-inspector h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.subtitle-inspector__counter {
  padding: 4px 7px;
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 10px;
}
.subtitle-inspector__time-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 0;
}
.time-field label {
  display: block;
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
}
.time-field__value {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--el-text-color-regular);
  background: var(--input-bg);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 10px;
  white-space: nowrap;
}
.subtitle-inspector__editor-head,
.subtitle-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--el-text-color-regular);
  font-size: 11px;
  font-weight: 600;
}
.subtitle-inspector__state {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--el-color-success);
  font-size: 10px;
  font-weight: 400;
}
.subtitle-inspector__state.is-dirty {
  color: var(--el-color-warning);
}
.subtitle-text-input :deep(.el-textarea__inner) {
  min-height: 86px !important;
  padding: 9px 10px;
  border-color: var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--el-text-color-primary);
  font-size: 13px;
  line-height: 1.55;
  box-shadow: none;
}
.subtitle-text-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
}
.subtitle-inspector__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 0 12px;
  border-bottom: 1px solid var(--border-color);
}
.subtitle-inspector__actions .el-button {
  margin-left: 0;
  padding: 5px 6px;
  font-size: 11px;
}
.subtitle-inspector__actions .el-button:last-child {
  margin-left: auto;
}
.subtitle-inspector__actions :deep(svg) {
  vertical-align: -2px;
}
.subtitle-inspector__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.subtitle-inspector__empty strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.subtitle-inspector__empty span:last-child {
  font-size: 11px;
  line-height: 1.5;
}
.subtitle-inspector__empty-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  color: var(--el-color-primary);
}
.subtitle-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-top: 12px;
}
.subtitle-list__header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding-bottom: 6px;
  background: var(--card-bg);
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-weight: 500;
}
.subtitle-list__item {
  display: flex;
  align-items: flex-start;
  width: 100%;
  gap: 8px;
  padding: 8px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
}
.subtitle-list__item:hover {
  background: var(--el-fill-color-light);
}
.subtitle-list__item.is-active {
  border-color: color-mix(in srgb, var(--el-color-primary) 55%, transparent);
  background: color-mix(in srgb, var(--el-color-primary) 13%, transparent);
}
.subtitle-list__index {
  width: 19px;
  padding-top: 1px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 10px;
}
.subtitle-list__copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.subtitle-list__time {
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 9px;
}
.subtitle-list__text {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subtitle-list__status {
  flex-shrink: 0;
  padding-top: 1px;
  color: var(--el-text-color-secondary);
  font-size: 9px;
}
.subtitle-list__placeholder {
  padding: 16px 0;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-align: center;
}
@media (max-width: 720px) {
  .subtitle-inspector { padding-inline: 10px; }
  .subtitle-inspector__actions .el-button { padding-inline: 4px; }
}
</style>
