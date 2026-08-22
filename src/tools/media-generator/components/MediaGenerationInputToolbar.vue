<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { isAudioOutputTaskType } from "../types";
import {
  Image as ImageIcon,
  Music,
  Sparkles,
  Wand2,
  MessageSquare,
  Target,
  Video,
} from "lucide-vue-next";
import type { ContextToggleMode } from "../utils/contextToggleUi";
import PromptOptimizePanel from "./PromptOptimizePanel.vue";
import QuickPromptLibrary from "./QuickPromptLibrary.vue";

const props = defineProps<{
  disabled?: boolean;
  promptText: string;
  includeContext: boolean;
  showContextToggle?: boolean;
  contextToggleLabel?: string;
  contextToggleTooltip?: string;
  contextToggleMode?: ContextToggleMode;
}>();

const emit = defineEmits<{
  (e: "update:includeContext", value: boolean): void;
  (e: "trigger-attachment"): void;
  (e: "insert-quick-prompt", prompt: string): void;
}>();

const store = useMediaGenStore();

const showOptimizePopover = ref(false);
const showQuickPromptPopover = ref(false);

const attachmentButton = computed(() => {
  const activeType = store.currentConfig.activeType;
  const isAudioMode = isAudioOutputTaskType(activeType);
  const isVideoMode = activeType === "video";
  return {
    label: isVideoMode ? "参考素材" : isAudioMode ? "参考音频" : "参考图",
    title: isVideoMode
      ? "添加参考图、参考视频或参考音频"
      : isAudioMode
        ? "添加参考音频"
        : "添加参考图",
    isAudioMode,
    isVideoMode,
  };
});

const contextToggleLabel = computed(() => props.contextToggleLabel || "上下文");
const contextToggleTooltip = computed(
  () =>
    props.contextToggleTooltip ||
    "Chat / Responses 路由会携带历史消息；普通生成端点仅可把会话中上一轮结果作为参考输入"
);

const handleApplyOptimized = (value: string) => {
  store.inputPrompt = value;
  showOptimizePopover.value = false;
};

const handleCancelOptimize = () => {
  showOptimizePopover.value = false;
};

const handleInsertQuickPrompt = (prompt: string) => {
  emit("insert-quick-prompt", prompt);
};
</script>

<template>
  <div class="input-toolbar">
    <div class="toolbar-left">
      <template v-if="props.showContextToggle !== false">
        <el-tooltip :content="contextToggleTooltip" placement="top">
          <button
            class="tool-btn"
            :class="{ 'is-active': props.includeContext }"
            @click="emit('update:includeContext', !props.includeContext)"
          >
            <el-icon v-if="props.contextToggleMode === 'conversation'">
              <MessageSquare />
            </el-icon>
            <el-icon v-else><Target /></el-icon>
            <span>{{ contextToggleLabel }}</span>
          </button>
        </el-tooltip>
        <div class="v-divider" />
      </template>
      <button
        class="tool-btn"
        :disabled="props.disabled"
        @click="emit('trigger-attachment')"
        :title="attachmentButton.title"
      >
        <el-icon>
          <Music v-if="attachmentButton.isAudioMode" />
          <Video v-else-if="attachmentButton.isVideoMode" />
          <ImageIcon v-else />
        </el-icon>
        <span>{{ attachmentButton.label }}</span>
      </button>
      <div class="v-divider" />
      <el-popover
        v-model:visible="showQuickPromptPopover"
        placement="top-start"
        :width="660"
        trigger="click"
        popper-class="quick-prompt-popover"
      >
        <template #reference>
          <button
            class="tool-btn"
            :disabled="props.disabled"
            title="快捷提示词"
          >
            <el-icon class="quick-prompt-trigger-icon"><Wand2 /></el-icon>
            <span>快捷提示词</span>
          </button>
        </template>

        <QuickPromptLibrary
          :active-type="store.currentConfig.activeType"
          :disabled="props.disabled"
          @insert="handleInsertQuickPrompt"
        />
      </el-popover>
      <div class="v-divider" />
      <el-popover
        v-model:visible="showOptimizePopover"
        placement="top-start"
        :width="460"
        trigger="click"
        popper-class="optimize-popover"
      >
        <template #reference>
          <button
            class="tool-btn"
            :disabled="props.disabled"
            title="提示词优化"
          >
            <el-icon class="optimize-trigger-icon">
              <Sparkles />
            </el-icon>
            <span>提示词优化</span>
          </button>
        </template>

        <PromptOptimizePanel
          :prompt-text="props.promptText"
          @apply="handleApplyOptimized"
          @cancel="handleCancelOptimize"
        />
      </el-popover>
    </div>
  </div>
</template>

<style scoped>
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  border: none;
  outline: none;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: all 0.2s;
}

.tool-btn :deep(.el-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn span {
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.tool-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.v-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 2px;
  opacity: 0.5;
}
</style>

<style>
/* 全局样式覆盖，用于优化弹窗 */
.quick-prompt-popover {
  z-index: var(--z-index-popover) !important;
  overflow: visible !important;
  padding: 16px !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
}

.optimize-popover {
  z-index: var(--z-index-popover) !important;
  overflow: visible !important;
  padding: 16px !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2) !important;
  background-color: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
}
</style>
