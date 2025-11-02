<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { ChatMessageNode } from '../../types';
import type { Asset } from '@/types/asset-management';
import { useLlmChatStore } from '../../store';
import { useChatSettings } from '../../composables/useChatSettings';
import ChatMessage from './ChatMessage.vue';
import MessageNavigator from './MessageNavigator.vue';

interface Props {
  messages: ChatMessageNode[];
  isSending: boolean;
}
interface Emits {
  (e: 'delete-message', messageId: string): void;
  (e: 'regenerate', messageId: string): void;
  (e: 'switch-sibling', nodeId: string, direction: 'prev' | 'next'): void;
  (e: 'toggle-enabled', nodeId: string): void;
  (e: 'edit-message', nodeId: string, newContent: string, attachments?: Asset[]): void;
  (e: 'abort-node', nodeId: string): void;
  (e: 'create-branch', nodeId: string): void;
  (e: 'analyze-context', nodeId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();
const { settings } = useChatSettings();

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  const siblings = store.getSiblings(messageId);
  // 找到在当前活动路径上的兄弟节点（而不是传入的 messageId 自己）
  const currentIndex = siblings.findIndex(s => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex,
  };
};

// 虚拟滚动容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 消息数量（响应式）
const messageCount = computed(() => props.messages.length);

// 创建虚拟化器
const virtualizer = useVirtualizer({
  get count() {
    return messageCount.value;
  },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 200, // 预估每条消息的高度为 200px
  overscan: 5, // 预渲染可视区域外的 5 条消息，提升滚动流畅度
});

// 虚拟项列表
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

// 总高度
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 自动滚动到底部
const scrollToBottom = () => {
  if (!settings.value.uiPreferences.autoScroll) {
    return;
  }
  
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// 追踪是否有新消息（用于显示徽章）
const hasNewMessages = ref(false);
const previousMessageCount = ref(props.messages.length);

// 监听消息变化
watch(() => props.messages.length, (newCount) => {
  // 如果消息增加了，标记有新消息
  if (newCount > previousMessageCount.value) {
    // 检查是否在底部附近，如果不在则显示新消息提示
    if (messagesContainer.value) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (!isNearBottom) {
        hasNewMessages.value = true;
      }
    }
  }
  previousMessageCount.value = newCount;
  
  // 自动滚动
  scrollToBottom();
});

// 滚动到顶部
const scrollToTop = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = 0;
  }
};

// 手动滚动到底部时清除新消息标记
const handleScrollToBottom = () => {
  hasNewMessages.value = false;
  scrollToBottom();
};

// 滚动到下一条消息
const scrollToNext = () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  const scrollAmount = Math.min(container.clientHeight * 0.8, 500); // 滚动80%的视口高度或500px
  container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
};

// 滚动到上一条消息
const scrollToPrev = () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  const scrollAmount = Math.min(container.clientHeight * 0.8, 500);
  container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
};

// 暴露滚动方法供外部调用
defineExpose({
  scrollToBottom: handleScrollToBottom,
  scrollToTop,
  scrollToNext,
  scrollToPrev,
});
</script>

<template>
  <div class="message-list-container">
    <div ref="messagesContainer" class="message-list">
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 开始新的对话吧！</p>
      </div>

      <!-- 虚拟滚动容器 -->
      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <!-- 仅渲染可见的虚拟项 -->
        <div
          v-for="virtualItem in virtualItems"
          :key="messages[virtualItem.index].id"
          :data-index="virtualItem.index"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }"
        >
          <div class="message-wrapper">
            <ChatMessage
              :message="messages[virtualItem.index]"
              :is-sending="isSending"
              :siblings="getMessageSiblings(messages[virtualItem.index].id).siblings"
              :current-sibling-index="getMessageSiblings(messages[virtualItem.index].id).currentIndex"
              @delete="emit('delete-message', messages[virtualItem.index].id)"
              @regenerate="emit('regenerate', messages[virtualItem.index].id)"
              @switch-sibling="(direction: 'prev' | 'next') => emit('switch-sibling', messages[virtualItem.index].id, direction)"
              @toggle-enabled="emit('toggle-enabled', messages[virtualItem.index].id)"
              @edit="(newContent: string, attachments?: Asset[]) => emit('edit-message', messages[virtualItem.index].id, newContent, attachments)"
              @copy="() => {}"
              @abort="emit('abort-node', messages[virtualItem.index].id)"
              @create-branch="emit('create-branch', messages[virtualItem.index].id)"
              @analyze-context="emit('analyze-context', messages[virtualItem.index].id)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 消息导航器 -->
    <MessageNavigator
      :scroll-element="messagesContainer"
      :message-count="messages.length"
      :has-new-messages="hasNewMessages"
      @scroll-to-bottom="handleScrollToBottom"
      @scroll-to-next="scrollToNext"
      @scroll-to-prev="scrollToPrev"
    />
  </div>
</template>

<style scoped>
.message-list-container {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.message-list {
  flex: 1;
  overflow-y: auto; /* 使用 auto 以支持虚拟滚动 */
  padding: 84px 12px 20px 20px; /* 右边距减去滚动条宽度以保持对称 */
  clip-path: inset(0); /* 优化滚动渲染 */
}

.message-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0; /* 消息间距 */
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