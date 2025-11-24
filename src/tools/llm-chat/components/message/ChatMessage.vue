<script setup lang="ts">
import { ref, computed } from "vue";
import type { ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import MessageHeader from "./MessageHeader.vue";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";

import type { ButtonVisibility } from "../../types";

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  buttonVisibility?: ButtonVisibility;
}

interface Emits {
  (e: "delete"): void;
  (e: "regenerate"): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled"): void;
  (e: "edit", newContent: string, attachments?: Asset[]): void;
  (e: "copy"): void;
  (e: "abort"): void;
  (e: "create-branch"): void;
  (e: "analyze-context"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 编辑状态
const isEditing = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);
const isPresetDisplay = computed(() => props.message.metadata?.isPresetDisplay === true);

// 开始编辑
const startEdit = () => {
  isEditing.value = true;
};

// 保存编辑
const saveEdit = (newContent: string, attachments?: Asset[]) => {
  emit("edit", newContent, attachments);
  isEditing.value = false;
};

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
};

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
  } catch (error) {
    console.error("复制失败", error);
  }
};

// 暴露方法供父组件调用
defineExpose({
  startEdit,
});
</script>

<template>
  <div
    :class="[
      'chat-message',
      `message-${message.role}`,
      { 'is-disabled': isDisabled, 'is-preset-display': isPresetDisplay },
    ]"
  >
    <!-- 背景层：独立出来规避嵌套 backdrop-filter 冲突 -->
    <div class="message-background"></div>

    <!-- 内容层：提高层级 -->
    <div class="message-inner">
      <MessageHeader :message="message" />

      <MessageContent
        :message="message"
        :is-editing="isEditing"
        :llm-think-rules="llmThinkRules"
        :rich-text-style-options="richTextStyleOptions"
        @save-edit="saveEdit"
        @cancel-edit="cancelEdit"
      />
    </div>

    <!-- 悬浮操作栏（始终显示，除非正在编辑） -->
    <div class="menubar-wrapper" v-if="!isEditing">
      <MessageMenubar
        :message="message"
        :is-sending="isSending"
        :siblings="props.siblings"
        :current-sibling-index="props.currentSiblingIndex"
        :button-visibility="props.buttonVisibility"
        @copy="copyMessage"
        @edit="startEdit"
        @delete="emit('delete')"
        @regenerate="emit('regenerate')"
        @toggle-enabled="emit('toggle-enabled')"
        @switch="(direction: 'prev' | 'next') => emit('switch-sibling', direction)"
        @switch-branch="(nodeId: string) => emit('switch-branch', nodeId)"
        @abort="emit('abort')"
        @create-branch="emit('create-branch')"
        @analyze-context="emit('analyze-context')"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  padding: 16px;
  /* 移除原有的背景和边框样式，移交给 .message-background */
  transition: all 0.2s;
}

/* 背景层样式 */
.message-background {
  position: absolute;
  inset: 0; /* 撑满父容器 */
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  transition: all 0.2s;
  z-index: 0;
  pointer-events: none; /* 让点击穿透到内容 */
}

/* 内容层样式 */
.message-inner {
  position: relative;
  z-index: 1;
}

/* Hover 效果迁移：hover 父容器，改变背景层的边框 */
.chat-message:hover .message-background {
  border-color: var(--primary-color);
}

/* 悬停时显示操作栏 */
.chat-message:hover .menubar-wrapper {
  opacity: 1;
}

.menubar-wrapper {
  position: sticky;
  bottom: 8px;
  display: flex;
  justify-content: flex-end;
  /* 通过负margin覆盖在内容上，消除占位 */
  margin-top: -46px;
  z-index: 10;
  padding-right: 12px;

  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none; /* 避免透明层阻挡点击 */
}

.menubar-wrapper > * {
  pointer-events: auto; /* 恢复按钮点击 */
}

/* 禁用状态样式 */
.chat-message.is-disabled {
  opacity: 0.5;
}

.chat-message.is-disabled :deep(.message-text) {
  color: var(--text-color-light);
}
</style>
