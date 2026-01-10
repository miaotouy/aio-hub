<script setup lang="ts">
import { ref } from 'vue';
import type { ChatMessageNode } from '../types';
import MessageBubble from './MessageBubble.vue';

defineProps<{
  messages: ChatMessageNode[];
}>();

const scrollContainerRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
  if (scrollContainerRef.value) {
    scrollContainerRef.value.scrollTo({
      top: scrollContainerRef.value.scrollHeight,
      behavior: 'smooth'
    });
  }
};

defineExpose({
  scrollToBottom
});
</script>

<template>
  <div ref="scrollContainerRef" class="message-list">
    <div class="messages-inner">
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />
    </div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
}

.messages-inner {
  display: flex;
  flex-direction: column;
  min-height: min-content;
}
</style>