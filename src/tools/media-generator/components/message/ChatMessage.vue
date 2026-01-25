<script setup lang="ts">
import { ref, computed } from "vue";
import { useResizeObserver } from "@vueuse/core";
import type { MediaMessage, MediaTask } from "../../types";
import MessageHeader from "./MessageHeader.vue";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";

interface Props {
  message: MediaMessage;
  siblings: MediaMessage[];
  currentSiblingIndex: number;
  isSelected?: boolean;
  isBatchMode?: boolean;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: "remove", taskId: string): void;
  (e: "download", task: MediaTask): void;
  (e: "retry"): void;
  (e: "select"): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "resize", el: HTMLElement | null): void;
}>();

// ===== 背景分块渲染逻辑 (解决超长消息 backdrop-filter 失效问题) =====
const messageRef = ref<HTMLElement | null>(null);
const messageHeight = ref(0);
const BLOCK_SIZE = 2000;

useResizeObserver(messageRef, (entries) => {
  const entry = entries[0];
  const { height } = entry.contentRect;
  messageHeight.value = height;
});

// 计算需要多少个背景块
const backgroundBlocks = computed(() => {
  if (messageHeight.value <= 0) return 1;
  return Math.ceil(messageHeight.value / BLOCK_SIZE);
});

const onSwitchSibling = (direction: "prev" | "next") => emit("switch-sibling", direction);
const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);

// 暴露给虚拟列表用于精确测量的 ref
const getElement = () => messageRef.value;

defineExpose({
  getElement,
});
</script>

<template>
  <div
    ref="messageRef"
    class="chat-message"
    :class="[`role-${message.role}`, { 'is-selected': isSelected, 'batch-mode': isBatchMode }]"
    @click="isBatchMode && emit('select')"
  >
    <!-- 背景层：分块渲染以规避浏览器对大尺寸 backdrop-filter 的限制 -->
    <div class="message-background-container">
      <div
        v-for="i in backgroundBlocks"
        :key="i"
        class="message-background-slice"
        :style="{
          top: `${(i - 1) * BLOCK_SIZE}px`,
          height: i === backgroundBlocks ? 'auto' : `${BLOCK_SIZE}px`,
          bottom: i === backgroundBlocks ? '0' : 'auto',
        }"
      ></div>
    </div>

    <!-- 内容层 -->
    <div class="message-inner">
      <MessageHeader :message="message" />

      <MessageContent :message="message" />
    </div>

    <!-- 悬浮操作栏 (批量模式下隐藏) -->
    <div v-if="!isBatchMode" class="menubar-wrapper">
      <MessageMenubar
        :message="message"
        :siblings="siblings"
        :current-sibling-index="currentSiblingIndex"
        @delete="emit('remove', $event)"
        @download="emit('download', $event)"
        @retry="emit('retry')"
        @switch="onSwitchSibling"
        @switch-branch="onSwitchBranch"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  display: flow-root;
  margin-bottom: 12px;
  padding: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.chat-message.batch-mode {
  cursor: pointer;
}

/* 背景层容器 */
.message-background-container {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: 8px;
  overflow: hidden;
}

/* 独立的边框层 */
.chat-message::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.chat-message.is-selected::after {
  border-color: var(--el-color-primary);
  border-width: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--el-color-primary), transparent 85%);
}

.chat-message.batch-mode:hover::after {
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 40%);
}

.chat-message.is-selected .message-background-slice {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
}

/* 背景切片 */
.message-background-slice {
  position: absolute;
  left: 0;
  right: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.message-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menubar-wrapper {
  position: sticky;
  bottom: 8px;
  display: flex;
  justify-content: flex-end;
  margin-top: -32px;
  z-index: 10;
  padding-right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.menubar-wrapper > * {
  pointer-events: auto;
}

.chat-message:hover .menubar-wrapper {
  opacity: 1;
}
</style>
