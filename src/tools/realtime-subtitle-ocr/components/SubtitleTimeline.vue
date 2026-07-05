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

<template>
  <div class="subtitle-timeline">
    <div class="subtitle-timeline__header">
      <span class="subtitle-timeline__title">
        字幕时间轴
        <span class="subtitle-timeline__count">({{ subtitles.length }})</span>
      </span>
      <div class="subtitle-timeline__actions">
        <el-button size="small" :disabled="!subtitles.length" @click="copyAll">
          <CopyIcon :size="14" /> 复制全部
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!subtitles.length"
          @click="onExportSrt"
        >
          <DownloadIcon :size="14" /> 导出 SRT
        </el-button>
      </div>
    </div>

    <div class="subtitle-timeline__list" ref="listRef">
      <div
        v-for="sub in subtitles"
        :key="sub.id"
        class="subtitle-item"
        :class="{ 'subtitle-item--editing': editingId === sub.id }"
      >
        <div class="subtitle-item__time">
          {{ formatTime(sub.startMs) }} --> {{ formatTime(sub.endMs) }}
        </div>
        <div
          v-if="editingId !== sub.id"
          class="subtitle-item__text"
          @dblclick="startEdit(sub.id)"
          :title="'双击编辑'"
        >
          {{ sub.text || "(空)" }}
        </div>
        <el-input
          v-else
          v-model="editingText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          autofocus
          @blur="commitEdit(sub.id)"
          @keydown.esc="cancelEdit"
          @keydown.enter.ctrl="commitEdit(sub.id)"
          placeholder="Ctrl+Enter 提交保存"
        />
        <div class="subtitle-item__ops">
          <button class="icon-btn" title="编辑" @click="startEdit(sub.id)">
            <PencilIcon :size="13" />
          </button>
          <button class="icon-btn" title="删除" @click="remove(sub.id)">
            <TrashIcon :size="13" />
          </button>
        </div>
      </div>
      <div v-if="!subtitles.length" class="subtitle-timeline__empty">
        暂无字幕，开始监控后将在此显示
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";
import { ElButton, ElInput } from "element-plus";
import {
  Copy as CopyIcon,
  Download as DownloadIcon,
  Pencil as PencilIcon,
  Trash2 as TrashIcon,
} from "lucide-vue-next";
import { formatSrtTime } from "../utils/algorithms";
import type { SubtitleEntry } from "../types";

const props = defineProps<{
  subtitles: SubtitleEntry[];
}>();
const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "update-text", id: string, text: string): void;
  (e: "export-srt"): void;
  (e: "copy-all"): void;
}>();

const listRef = ref<HTMLElement | null>(null);
const editingId = ref<string | null>(null);
const editingText = ref("");

function formatTime(ms: number): string {
  return formatSrtTime(ms);
}

function startEdit(id: string) {
  const target = props.subtitles.find((s) => s.id === id);
  if (!target) return;
  editingId.value = id;
  editingText.value = target.text;
  nextTick(() => {
    const el = listRef.value?.querySelector<HTMLTextAreaElement>(
      ".subtitle-item--editing textarea"
    );
    el?.focus();
  });
}

function commitEdit(id: string) {
  if (editingId.value !== id) return;
  emit("update-text", id, editingText.value);
  editingId.value = null;
  editingText.value = "";
}

function cancelEdit() {
  editingId.value = null;
  editingText.value = "";
}

function remove(id: string) {
  emit("remove", id);
}

function copyAll() {
  emit("copy-all");
}

function onExportSrt() {
  emit("export-srt");
}
</script>

<style scoped>
.subtitle-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.subtitle-timeline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.subtitle-timeline__title {
  font-weight: 600;
  font-size: 14px;
}

.subtitle-timeline__count {
  color: var(--el-text-color-secondary);
  font-weight: 400;
  margin-left: 4px;
}

.subtitle-timeline__actions {
  display: flex;
  gap: 8px;
}

.subtitle-timeline__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  min-height: 0;
}

.subtitle-timeline__empty {
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 32px 0;
  font-size: 13px;
}

.subtitle-item {
  position: relative;
  padding: 8px 64px 8px 8px;
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  transition:
    background 0.15s,
    border-color 0.15s;
}

.subtitle-item:hover {
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-color: var(--el-color-primary-light-5);
}

.subtitle-item--editing {
  background: var(--input-bg);
  border-color: var(--el-color-primary);
}

.subtitle-item__time {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.subtitle-item__text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
}

.subtitle-item__ops {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.subtitle-item:hover .subtitle-item__ops {
  opacity: 1;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--el-color-primary);
  color: #fff;
}
</style>

