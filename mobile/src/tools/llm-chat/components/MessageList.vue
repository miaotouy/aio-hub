<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useThrottleFn } from "@vueuse/core";
import type { ChatMessageNode } from "../types";
import ChatMessage from "./ChatMessage.vue";

const props = defineProps<{
  messages: ChatMessageNode[];
}>();

const scrollContainerRef = ref<HTMLElement | null>(null);
const activeMessageId = ref<string | null>(null);
const isNearBottom = ref(true);

const handleMessageClick = (id: string) => {
  if (activeMessageId.value === id) {
    activeMessageId.value = null;
  } else {
    activeMessageId.value = id;
  }
};

const handleListClick = () => {
  activeMessageId.value = null;
};

const emit = defineEmits<{
  (e: "copy", message: ChatMessageNode): void;
  (e: "edit", message: ChatMessageNode): void;
  (e: "regenerate", message: ChatMessageNode): void;
  (e: "delete", message: ChatMessageNode): void;
  (
    e: "switch-sibling",
    message: ChatMessageNode,
    direction: "prev" | "next"
  ): void;
  (e: "switch-branch", nodeId: string): void;
}>();

const scrollToBottom = useThrottleFn((behavior: ScrollBehavior = "smooth") => {
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTo({
        top: scrollContainerRef.value.scrollHeight,
        behavior,
      });
    }
  });
}, 80);

const handleScroll = () => {
  if (!scrollContainerRef.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.value;
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < 96;
};

watch(
  () =>
    props.messages
      .map((msg) => `${msg.id}:${msg.content.length}:${msg.status}`)
      .join("|"),
  () => {
    if (isNearBottom.value) {
      scrollToBottom("auto");
    }
  }
);

watch(
  () => props.messages.map((msg) => msg.id).join("|"),
  () => {
    activeMessageId.value = null;
    scrollToBottom("smooth");
  }
);

defineExpose({
  scrollToBottom,
});
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="message-list"
    @click="handleListClick"
    @scroll="handleScroll"
  >
    <div v-if="messages.length === 0" class="empty-state">
      <div class="empty-title">开始新的对话</div>
      <div class="empty-subtitle">
        输入消息后，这里会显示当前分支的线性对话。
      </div>
    </div>

    <div v-else class="messages-inner">
      <ChatMessage
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :is-active="activeMessageId === msg.id"
        @click.stop="handleMessageClick(msg.id)"
        @close="activeMessageId = null"
        @copy="(m) => emit('copy', m)"
        @edit="(m) => emit('edit', m)"
        @regenerate="(m) => emit('regenerate', m)"
        @delete="(m) => emit('delete', m)"
        @switch-sibling="(m, direction) => emit('switch-sibling', m, direction)"
        @switch-branch="(nodeId) => emit('switch-branch', nodeId)"
      />
    </div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
}

.messages-inner {
  display: flex;
  flex-direction: column;
  min-height: min-content;
}

.messages-inner :deep(.message-item) {
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 32px;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-subtitle {
  font-size: 0.86rem;
  line-height: 1.5;
}
</style>
