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
import { ref, watch } from "vue";
import { ElInput } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { formatSrtTime } from "../utils/algorithms";
import type { SubtitleEntry } from "../types";

const props = defineProps<{
  activeSubtitle: SubtitleEntry | null;
  activeSubtitleIndex: number;
}>();

const emit = defineEmits<{
  (e: "update-text", id: string, text: string): void;
}>();

const localSubtitleText = ref("");
const editorInputRef = ref<InstanceType<typeof ElInput> | null>(null);
const isEditing = ref(false);
let lastActiveId = "";

watch(
  () => props.activeSubtitle,
  (newVal) => {
    if (!newVal) {
      localSubtitleText.value = "";
      lastActiveId = "";
      return;
    }

    // 如果切换了字幕条目（ID 变了），或者用户当前没有在编辑，则同步文本
    if (newVal.id !== lastActiveId || !isEditing.value) {
      localSubtitleText.value = newVal.text;
      lastActiveId = newVal.id;

      // 自动聚焦到大编辑框
      setTimeout(() => {
        const textarea = editorInputRef.value?.$el?.querySelector("textarea");
        textarea?.focus();
      }, 50);
    }
  },
  { immediate: true }
);

function onEditorFocus() {
  isEditing.value = true;
}

function onEditorBlur() {
  // 延迟失焦，防止点击保存按钮时先触发失焦导致状态重置
  setTimeout(() => {
    isEditing.value = false;
  }, 200);
}

function commitSubtitleEdit() {
  if (!props.activeSubtitle) return;
  emit("update-text", props.activeSubtitle.id, localSubtitleText.value);
  isEditing.value = false;
  lastActiveId = props.activeSubtitle.id; // 保持 ID 一致
  customMessage.success("字幕已保存");
}

function formatTime(ms: number): string {
  return formatSrtTime(ms);
}
</script>

<template>
  <div class="editor-panel">
    <div class="editor-panel__header">
      <span class="editor-panel__title">当前字幕编辑</span>
      <span class="editor-panel__tip" v-if="activeSubtitle">
        正在编辑 #{{ activeSubtitleIndex + 1 }} ({{
          formatTime(activeSubtitle.startMs)
        }})
      </span>
    </div>
    <div class="editor-panel__body">
      <el-input
        ref="editorInputRef"
        v-model="localSubtitleText"
        type="textarea"
        :disabled="!activeSubtitle"
        placeholder="双击下方时间轴列表中的字幕，或等待最新识别结果在此处编辑。Ctrl+Enter 提交保存。"
        class="large-subtitle-input"
        @focus="onEditorFocus"
        @blur="onEditorBlur"
        @keydown.enter.ctrl.prevent="commitSubtitleEdit"
      />
    </div>
  </div>
</template>

<style scoped>
.editor-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  box-sizing: border-box;
}

.editor-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.editor-panel__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.editor-panel__tip {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.editor-panel__body {
  flex: 1;
  min-height: 0;
}

.large-subtitle-input {
  height: 100%;
}

.large-subtitle-input :deep(.el-textarea__inner) {
  height: 100% !important;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.6;
  padding: 12px;
  resize: none;
  background: var(--input-bg);
  border-color: var(--border-color);
}

.large-subtitle-input :deep(.el-textarea__inner:focus) {
  border-color: var(--el-color-primary);
}
</style>
