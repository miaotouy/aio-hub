<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import { useThrottleFn } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import type { MediaMessage, MediaTask } from "../../types";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import ChatMessage from "./ChatMessage.vue";

interface Props {
  messages: MediaMessage[];
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

// 虚拟滚动容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 消息数量
const messageCount = computed(() => props.messages.length);

// 创建虚拟化器
const virtualizer = useVirtualizer({
  get count() {
    return messageCount.value;
  },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 200, // 媒体生成的卡片通常比文字高
  overscan: 5,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

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
watch([() => props.messages.length, totalSize], ([newLength], [oldLength]) => {
  const isNewMessage = newLength !== oldLength;
  if (isNewMessage && (isNearBottom.value || newLength === 1)) {
    scrollToBottom();
  } else if (isNearBottom.value) {
    scrollToBottom();
  }
});

const handleResize = (dom: HTMLElement | null) => {
  if (dom) {
    virtualizer.value.measureElement(dom);
  }
};

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

      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="messages[virtualItem.index].id"
          :data-index="virtualItem.index"
          :ref="
            (el) => {
              if (el) virtualizer.measureElement(el as HTMLElement);
            }
          "
          :style="{
            position: 'absolute',
            top: `${virtualItem.start}px`,
            left: 0,
            width: '100%',
          }"
        >
          <div class="message-wrapper">
            <ChatMessage
              :message="messages[virtualItem.index]"
              :siblings="getMessageSiblings(messages[virtualItem.index].id).siblings"
              :current-sibling-index="
                getMessageSiblings(messages[virtualItem.index].id).currentIndex
              "
              :is-selected="messages[virtualItem.index].isSelected"
              @remove="handleRemove"
              @download="emit('download-task', $event)"
              @retry="emit('retry', messages[virtualItem.index].id)"
              @select="store.toggleMessageSelection(messages[virtualItem.index].id)"
              @switch-sibling="(dir) => handleSwitchSibling(messages[virtualItem.index].id, dir)"
              @switch-branch="handleSwitchBranch"
              @resize="handleResize"
            />
          </div>
        </div>
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
  padding: 20px;
}

.message-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
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

/* 自定义滚动条 */
.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.message-list:hover::-webkit-scrollbar-thumb {
  background: var(--el-border-color-darker);
}
</style>
