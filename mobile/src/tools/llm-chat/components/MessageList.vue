<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useThrottleFn } from "@vueuse/core";
import { useI18n } from "@/i18n";
import type { ChatMessageNode } from "../types";
import ChatMessage from "./ChatMessage.vue";
import MessageNavigator from "./MessageNavigator.vue";

const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.llm-chat.MessageList.${key}`);

const props = withDefaults(
  defineProps<{
    messages: ChatMessageNode[];
    /** Controls only automatic scroll reactions; explicit navigation remains available. */
    autoScroll?: boolean;
    /** Multiplier persisted by the chat UI preference. */
    fontSize?: number;
    /** Shows the compact overlay navigator without enabling automatic scroll. */
    showNavigator?: boolean;
  }>(),
  {
    autoScroll: true,
    fontSize: 1,
    showNavigator: false,
  }
);

const scrollContainerRef = ref<HTMLElement | null>(null);
const activeMessageId = ref<string | null>(null);
const isNearBottom = ref(true);
const visibleMessageIndex = ref(0);

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
  (e: "continue", message: ChatMessageNode): void;
  (e: "delete", message: ChatMessageNode): void;
  (
    e: "switch-sibling",
    message: ChatMessageNode,
    direction: "prev" | "next"
  ): void;
  (e: "switch-branch", nodeId: string): void;
}>();

const scrollToBottom = useThrottleFn((behavior: ScrollBehavior = "smooth") => {
  visibleMessageIndex.value = Math.max(props.messages.length - 1, 0);
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
    const targets = Array.from(
      container?.querySelectorAll<HTMLElement>("[data-message-id]") ?? []
    );
    const targetIndex = targets.findIndex(
      (element) => element.dataset.messageId === messageId
    );
    const target = targets[targetIndex];
    if (!container || !target) return;
    activeMessageId.value = messageId;
    visibleMessageIndex.value = targetIndex;
    target.scrollIntoView({ behavior, block: "center" });
  });
};

const updateVisibleMessageIndex = () => {
  const container = scrollContainerRef.value;
  if (!container || !props.messages.length) {
    visibleMessageIndex.value = 0;
    return;
  }

  const elements = Array.from(
    container.querySelectorAll<HTMLElement>("[data-message-id]")
  );
  if (!elements.length) return;

  const viewportCenter =
    container.getBoundingClientRect().top + container.clientHeight / 2;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [index, element] of elements.entries()) {
    const rect = element.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }

  visibleMessageIndex.value = Math.min(
    closestIndex,
    Math.max(props.messages.length - 1, 0)
  );
};

const scrollToNavigationIndex = (
  index: number,
  behavior: ScrollBehavior = "smooth"
) => {
  const container = scrollContainerRef.value;
  if (!container || !props.messages.length) return;

  const targetIndex = Math.min(Math.max(index, 0), props.messages.length - 1);
  const target = Array.from(
    container.querySelectorAll<HTMLElement>("[data-message-id]")
  )[targetIndex];
  if (!target) return;

  visibleMessageIndex.value = targetIndex;
  target.scrollIntoView({ behavior, block: "center" });
};

const scrollToPreviousMessage = () => {
  scrollToNavigationIndex(visibleMessageIndex.value - 1);
};

const scrollToNextMessage = () => {
  scrollToNavigationIndex(visibleMessageIndex.value + 1);
};

const scrollToTop = () => {
  if (!scrollContainerRef.value) return;
  visibleMessageIndex.value = 0;
  scrollContainerRef.value.scrollTo({ top: 0, behavior: "smooth" });
};

const handleScroll = () => {
  if (!scrollContainerRef.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.value;
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < 96;
  updateVisibleMessageIndex();
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
    visibleMessageIndex.value = Math.min(
      visibleMessageIndex.value,
      Math.max(props.messages.length - 1, 0)
    );
    if (props.autoScroll) {
      scrollToBottom("smooth");
    }
    nextTick(updateVisibleMessageIndex);
  }
);

defineExpose({
  scrollToBottom,
  scrollToMessage,
  scrollToTop,
  scrollToPreviousMessage,
  scrollToNextMessage,
});
</script>

<template>
  <div class="message-list">
    <div
      ref="scrollContainerRef"
      class="message-scroll-container"
      :class="{ 'with-navigator': showNavigator && messages.length > 1 }"
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
          @continue="(m) => emit('continue', m)"
          @delete="(m) => emit('delete', m)"
          @switch-sibling="
            (m, direction) => emit('switch-sibling', m, direction)
          "
          @switch-branch="(nodeId) => emit('switch-branch', nodeId)"
        />
      </div>
    </div>

    <MessageNavigator
      v-if="showNavigator"
      :current-index="visibleMessageIndex + 1"
      :total="messages.length"
      @top="scrollToTop"
      @previous="scrollToPreviousMessage"
      @next="scrollToNextMessage"
      @bottom="scrollToBottom"
    />
  </div>
</template>

<style scoped>
.message-list {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.message-scroll-container {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  padding: 12px 0;
}

.message-scroll-container.with-navigator {
  padding-bottom: 64px;
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
