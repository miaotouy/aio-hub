<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ChatMessageNode } from '../types';
import { useLlmChatStore } from '../store';
import MessageItem from './MessageItem.vue';

interface Props {
  messages: ChatMessageNode[];
  isSending: boolean;
}

interface Emits {
  (e: 'delete-message', messageId: string): void;
  (e: 'regenerate', messageId: string): void;
  (e: 'switch-sibling', nodeId: string, direction: 'prev' | 'next'): void;
  (e: 'toggle-enabled', nodeId: string): void;
  (e: 'edit-message', nodeId: string, newContent: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  const siblings = store.getSiblings(messageId);
  const currentIndex = siblings.findIndex(s => s.id === messageId);
  return {
    siblings,
    currentIndex,
  };
};

const messagesContainer = ref<HTMLElement>();

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// 监听消息变化，自动滚动
watch(() => props.messages, scrollToBottom, { deep: true });
</script>

<template>
  <div ref="messagesContainer" class="message-list">
    <div v-if="messages.length === 0" class="empty-state">
      <p>👋 开始新的对话吧！</p>
    </div>

    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :is-sending="isSending"
      :siblings="getMessageSiblings(message.id).siblings"
      :current-sibling-index="getMessageSiblings(message.id).currentIndex"
      @delete="emit('delete-message', message.id)"
      @regenerate="emit('regenerate', message.id)"
      @switch-sibling="(direction) => emit('switch-sibling', message.id, direction)"
      @toggle-enabled="emit('toggle-enabled', message.id)"
      @edit="(newContent) => emit('edit-message', message.id, newContent)"
      @copy="() => {}"
    />
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: scroll; /* 始终显示滚动条区域以防止布局抖动 */
  padding: 84px 12px 20px 20px; /* 右边距减去滚动条宽度以保持对称 */
  display: flex;
  flex-direction: column;
  gap: 16px;
  clip-path: inset(0); /* 优化滚动渲染 */
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 16px;
}

/* 自定义滚动条 */
.message-list::-webkit-scrollbar {
  width: 8px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.message-list:hover::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
}
</style>