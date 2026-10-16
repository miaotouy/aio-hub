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
import { computed } from "vue";
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
  Maximize2,
  Minimize2,
} from "lucide-vue-next";
import type { ContextToggleMode } from "../utils/contextToggleUi";
import {
  useInputPanel,
  type InputPanelDefinition,
} from "@/composables/useInputPanel";
import PromptOptimizePanel from "./PromptOptimizePanel.vue";
import QuickPromptLibrary from "./QuickPromptLibrary.vue";

const props = defineProps<{
  disabled?: boolean;
  promptText: string;
  isExpanded: boolean;
  includeContext: boolean;
  showContextToggle?: boolean;
  contextToggleLabel?: string;
  contextToggleTooltip?: string;
  contextToggleMode?: ContextToggleMode;
}>();

const emit = defineEmits<{
  (e: "update:includeContext", value: boolean): void;
  (e: "trigger-attachment"): void;
  (e: "toggle-expand"): void;
}>();

const store = useMediaGenStore();

const panel = useInputPanel();
const quickPromptButton = computed<InputPanelDefinition>(() => ({
  id: "quick-prompt",
  title: "快捷提示词",
  icon: Wand2,
  component: QuickPromptLibrary,
  scroll: "layout",
  props: {
    activeType: computed(() => store.currentConfig.activeType),
    disabled: computed(() => props.disabled),
  },
}));
const optimizeButton = computed<InputPanelDefinition>(() => ({
  id: "prompt-optimize",
  title: "提示词优化",
  icon: Sparkles,
  component: PromptOptimizePanel,
  scroll: "layout",
  props: {
    promptText: computed(() => props.promptText),
    disabled: computed(() => props.disabled),
  },
}));

function togglePanel(definition: InputPanelDefinition, event: MouseEvent) {
  const trigger = event.currentTarget as HTMLButtonElement;
  panel.toggle(definition, () => trigger);
}

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
</script>

<template>
  <div class="input-toolbar">
    <div class="toolbar-left">
      <button
        type="button"
        class="tool-btn"
        :class="{ 'is-active': props.isExpanded }"
        :aria-expanded="props.isExpanded"
        :aria-label="props.isExpanded ? '收起输入框' : '展开输入框'"
        :title="props.isExpanded ? '收起输入框' : '展开输入框'"
        @click="emit('toggle-expand')"
      >
        <el-icon>
          <Minimize2 v-if="props.isExpanded" />
          <Maximize2 v-else />
        </el-icon>
      </button>
      <template v-if="props.showContextToggle !== false">
        <el-tooltip :content="contextToggleTooltip" placement="top">
          <button
            type="button"
            class="tool-btn"
            :class="{ 'is-active': props.includeContext }"
            :aria-pressed="props.includeContext"
            :disabled="props.disabled"
            @click="emit('update:includeContext', !props.includeContext)"
          >
            <el-icon v-if="props.contextToggleMode === 'conversation'">
              <MessageSquare />
            </el-icon>
            <el-icon v-else><Target /></el-icon>
            <span>{{ contextToggleLabel }}</span>
          </button>
        </el-tooltip>
      </template>
      <button
        type="button"
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

      <button
        type="button"
        class="tool-btn"
        :class="{
          'is-active': panel.activePanel.value?.id === quickPromptButton.id,
        }"
        :disabled="props.disabled"
        :aria-expanded="
          panel.activePanel.value?.id === quickPromptButton.id &&
          !panel.collapsed.value
        "
        :aria-controls="
          panel.activePanel.value?.id === quickPromptButton.id
            ? panel.contentId
            : undefined
        "
        @click="togglePanel(quickPromptButton, $event)"
      >
        <el-icon><Wand2 /></el-icon>
        <span>快捷提示词</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        :class="{
          'is-active': panel.activePanel.value?.id === optimizeButton.id,
        }"
        :disabled="props.disabled"
        :aria-expanded="
          panel.activePanel.value?.id === optimizeButton.id &&
          !panel.collapsed.value
        "
        :aria-controls="
          panel.activePanel.value?.id === optimizeButton.id
            ? panel.contentId
            : undefined
        "
        @click="togglePanel(optimizeButton, $event)"
      >
        <el-icon><Sparkles /></el-icon>
        <span>提示词优化</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-toolbar {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  padding: 0 4px;
}

.toolbar-left {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
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

.tool-btn.is-active,
.tool-btn:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.tool-btn:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
