<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useThrottleFn } from "@vueuse/core";
import { useI18n } from "@/i18n";
import type { ChatMessageNode } from "../types";
import ChatMessage from "./ChatMessage.vue";

const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.MessageList.${key}`);

const props = withDefaults(
  defineProps<{
    messages: ChatMessageNode[];
    /** Controls only automatic scroll reactions; explicit navigation remains available. */
    autoScroll?: boolean;
    /** Multiplier persisted by the chat UI preference. */
    fontSize?: number;
  }>(),
  {
    autoScroll: true,
    fontSize: 1,
  }
);

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
  (e: "copy-error"): void;
  (e: "edit", message: ChatMessageNode): void;
  (e: "reply", message: ChatMessageNode): void;
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

const scrollToMessage = (
  messageId: string,
  behavior: ScrollBehavior = "smooth"
) => {
  nextTick(() => {
    const container = scrollContainerRef.value;
    const target = Array.from(
      container?.querySelectorAll<HTMLElement>("[data-message-id]") ?? []
    ).find((element) => element.dataset.messageId === messageId);
    if (!container || !target) return;
    activeMessageId.value = messageId;
    target.scrollIntoView({ behavior, block: "center" });
  });
};

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
    if (props.autoScroll && isNearBottom.value) {
      scrollToBottom("auto");
    }
  }
);

watch(
  () => props.messages.map((msg) => msg.id).join("|"),
  () => {
    activeMessageId.value = null;
    if (props.autoScroll) {
      scrollToBottom("smooth");
    }
  }
);

defineExpose({
  scrollToBottom,
  scrollToMessage,
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
      <div class="empty-title">{{ t("开始新的对话") }}</div>
      <div class="empty-subtitle">
        {{ t("空会话提示") }}
      </div>
    </div>

    <div v-else class="messages-inner">
      <ChatMessage
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :font-size="fontSize"
        :is-active="activeMessageId === msg.id"
        @click="handleMessageClick(msg.id)"
        @close="activeMessageId = null"
        @copy="(m) => emit('copy', m)"
        @copy-error="emit('copy-error')"
        @edit="(m) => emit('edit', m)"
        @reply="(m) => emit('reply', m)"
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
