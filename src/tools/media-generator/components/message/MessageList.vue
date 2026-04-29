<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useThrottleFn } from "@vueuse/core";
import type { MediaMessage, MediaTask } from "../../types";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import ChatMessage from "./ChatMessage.vue";

interface Props {
  messages: MediaMessage[];
  isBatchMode?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "remove-task", taskId: string): void;
  (e: "download-task", task: MediaTask): void;
  (e: "retry", messageId: string): void;
}>();

const store = useMediaGenStore();

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  const siblings = store.getSiblings(messageId);
  // 找到在当前活动路径上的兄弟节点索引
  const currentIndex = siblings.findIndex((s: MediaMessage) => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
  };
};

// 容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 自动滚动到底部
const scrollToBottom = useThrottleFn(() => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}, 100);

const isNearBottom = ref(true);

const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < 100;
};

// 监听消息变化，自动滚动
watch(
  () => props.messages.length,
  (newLength, oldLength) => {
    const isNewMessage = newLength !== oldLength;
    if (isNewMessage && (isNearBottom.value || newLength === 1)) {
      scrollToBottom();
    } else if (isNearBottom.value) {
      scrollToBottom();
    }
  },
);

const handleSwitchSibling = (messageId: string, direction: "prev" | "next") => {
  const { siblings, currentIndex } = getMessageSiblings(messageId);
  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  if (nextIndex >= 0 && nextIndex < siblings.length) {
    store.switchToBranch(siblings[nextIndex].id);
  }
};

const handleSwitchBranch = (nodeId: string) => {
  store.switchToBranch(nodeId);
};

const handleRemove = (messageId: string) => {
  store.deleteMessage(messageId);
};

defineExpose({
  scrollToBottom,
});
</script>

<template>
  <div class="message-list-container">
    <div ref="messagesContainer" class="message-list" @scroll="onScroll">
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 开始新的创作吧！</p>
      </div>

      <div v-else class="messages-container">
        <template v-for="msg in messages" :key="msg.id">
          <ChatMessage
            :message="msg"
            :siblings="getMessageSiblings(msg.id).siblings"
            :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
            :is-selected="msg.isSelected"
            :is-batch-mode="isBatchMode"
            @remove="handleRemove"
            @download="emit('download-task', $event)"
            @retry="emit('retry', msg.id)"
            @select="store.toggleMessageSelection(msg.id)"
            @switch-sibling="(dir) => handleSwitchSibling(msg.id, dir)"
            @switch-branch="handleSwitchBranch"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  /* 禁用浏览器自动滚动锚定，避免与程序化 scrollTo 产生对抗导致布局抖动 */
  overflow-anchor: none;
  overscroll-behavior: contain;
  /* 渲染隔离：防止内部布局变化影响外部容器 */
  contain: layout style;
  padding: 20px;
  box-sizing: border-box;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.messages-container :deep(.chat-message) {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 16px;
  height: 100%;
}

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
