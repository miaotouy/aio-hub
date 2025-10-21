<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ChatMessageNode } from '../types';
import MessageHeader from './MessageHeader.vue';
import MessageContent from './MessageContent.vue';
import MessageMenubar from './MessageMenubar.vue';

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: 'delete'): void;
  (e: 'regenerate'): void;
  (e: 'switch-sibling', direction: 'prev' | 'next'): void;
  (e: 'toggle-enabled'): void;
  (e: 'edit', newContent: string): void;
  (e: 'copy'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 编辑状态
const isEditing = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);

// 开始编辑
const startEdit = () => {
  isEditing.value = true;
};

// 保存编辑
const saveEdit = (newContent: string) => {
  emit('edit', newContent);
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
    emit('copy');
  } catch (error) {
    console.error('复制失败', error);
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
      { 'is-disabled': isDisabled }
    ]"
  >
    <MessageHeader :message="message" />
    
    <MessageContent
      :message="message"
      :is-editing="isEditing"
      @save-edit="saveEdit"
      @cancel-edit="cancelEdit"
    />

    <!-- 悬浮操作栏（非编辑和非生成状态时显示） -->
    <MessageMenubar
      v-if="message.status !== 'generating' && !isEditing"
      :message="message"
      :is-sending="isSending"
      :siblings="props.siblings"
      :current-sibling-index="props.currentSiblingIndex"
      @copy="copyMessage"
      @edit="startEdit"
      @delete="emit('delete')"
      @regenerate="emit('regenerate')"
      @toggle-enabled="emit('toggle-enabled')"
      @switch="(direction) => emit('switch-sibling', direction)"
    />
  </div>
</template>

<style scoped>
.chat-message {
  padding: 16px;
  border-radius: 8px;
  transition: all 0.2s;
  position: relative;
}

.chat-message:hover {
  border-color: var(--primary-color);
}

/* 悬停时显示操作栏 */
.chat-message:hover .message-menubar {
  opacity: 1;
}

/* 禁用状态样式 */
.chat-message.is-disabled {
  opacity: 0.5;
}

.chat-message.is-disabled :deep(.message-text) {
  color: var(--text-color-light);
}
</style>