<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import type { ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useLlmChatStore } from "../../store";
import { useChatSettings } from "../../composables/useChatSettings";
import ChatMessage from "./ChatMessage.vue";

interface Props {
  messages: ChatMessageNode[];
  isSending: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions; // 智能体样式（默认）
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions; // 用户样式
}
interface Emits {
  (e: "delete-message", messageId: string): void;
  (e: "regenerate", messageId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled", nodeId: string): void;
  (e: "edit-message", nodeId: string, newContent: string, attachments?: Asset[]): void;
  (e: "abort-node", nodeId: string): void;
  (e: "create-branch", nodeId: string): void;
  (e: "analyze-context", nodeId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();
const { settings } = useChatSettings();

// 事件处理函数
const onRegenerate = (id: string, options?: { modelId?: string; profileId?: string }) =>
  emit("regenerate", id, options);

const onSwitchSibling = (id: string, direction: "prev" | "next") =>
  emit("switch-sibling", id, direction);

const onEditMessage = (id: string, newContent: string, attachments?: Asset[]) =>
  emit("edit-message", id, newContent, attachments);

const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  const message = props.messages.find((m) => m.id === messageId);

  // 预设消息不在会话节点树中，返回只包含自己的特殊结构（不显示分支导航）
  if (message?.metadata?.isPresetDisplay) {
    return {
      siblings: [message],
      currentIndex: 0,
    };
  }

  const siblings = store.getSiblings(messageId);
  // 找到在当前活动路径上的兄弟节点（而不是传入的 messageId 自己）
  const currentIndex = siblings.findIndex((s) => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex,
  };
};

// 虚拟滚动容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 暴露滚动容器供外部使用（如 MessageNavigator）
const getScrollElement = () => messagesContainer.value;

// 消息数量（响应式）
const messageCount = computed(() => props.messages.length);

// 创建虚拟化器
const virtualizer = useVirtualizer({
  get count() {
    return messageCount.value;
  },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 160, // 预估每条消息的高度
  overscan: 5, // 预渲染可视区域外的 5 条消息，提升滚动流畅度
});

// 虚拟项列表
const virtualItems = computed(() => virtualizer.value.getVirtualItems());

// 总高度
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 自动滚动到底部
const scrollToBottom = () => {
  // 直接使用原生滚动，强制滚到真正的底部
  // 不依赖虚拟列表的高度计算，确保流式输出时能及时跟随
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// 记录用户是否接近底部
const isNearBottom = ref(true);

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  // 阈值设为 100px，在这个范围内认为用户想看最新消息
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < 100;
};

// 监听消息数量、总高度变化以及最后一条消息的内容变化
watch(
  [
    () => props.messages.length,
    totalSize,
    // 监听最后一条消息的内容，以便在流式输出时更及时地触发滚动
    () => {
      const lastMsg = props.messages[props.messages.length - 1];
      return lastMsg ? lastMsg.content : "";
    },
  ],
  ([newLength, newTotalSize, newLastContent], [oldLength, oldTotalSize, oldLastContent]) => {
    if (!settings.value.uiPreferences.autoScroll) return;

    const isNewMessage = newLength !== oldLength;
    const isContentChanged = newLastContent !== oldLastContent;

    // 策略：
    // 1. 如果是新消息出现，且用户之前就在底部附近，或者这是第一条消息，则滚动
    // 2. 如果仅仅是内容变长(流式输出)，且用户在底部附近，则跟随滚动
    // 3. 如果用户已经手动向上滚动查看历史(isNearBottom 为 false)，则不打扰

    if (isNewMessage) {
      // 对于新消息，我们稍微放宽一点条件，只要不是离得太远，通常都希望看到新消息
      // 或者是用户自己发送的消息（这里简化处理，假设新消息都滚动，除非用户特意翻上去）
      if (isNearBottom.value || newLength === 1) {
        scrollToBottom();
      }
    } else if (isContentChanged || newTotalSize !== oldTotalSize) {
      // 内容变化（流式输出）或总高度变化
      if (isNearBottom.value) {
        scrollToBottom();
      }
    }
  }
);

// 滚动到顶部
const scrollToTop = () => {
  if (messagesContainer.value) {
    virtualizer.value.scrollToIndex(0, { align: "start" });
  }
};

// 滚动到下一条消息
const scrollToNext = () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  const scrollAmount = Math.min(container.clientHeight * 0.8, 500); // 滚动80%的视口高度或500px
  container.scrollBy({ top: scrollAmount, behavior: "smooth" });
};

// 滚动到上一条消息
const scrollToPrev = () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  const scrollAmount = Math.min(container.clientHeight * 0.8, 500);
  container.scrollBy({ top: -scrollAmount, behavior: "smooth" });
};

// 暴露滚动方法和容器引用供外部调用
defineExpose({
  scrollToBottom,
  scrollToTop,
  scrollToNext,
  scrollToPrev,
  getScrollElement,
});
</script>

<template>
  <div class="message-list-container">
    <div ref="messagesContainer" class="message-list" @scroll="onScroll">
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
          :ref="
            (el) => {
              if (el) virtualizer.measureElement(el as HTMLElement);
            }
          "
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
              :current-sibling-index="
                getMessageSiblings(messages[virtualItem.index].id).currentIndex
              "
              :llm-think-rules="llmThinkRules"
              :rich-text-style-options="
                messages[virtualItem.index].role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
              @delete="emit('delete-message', messages[virtualItem.index].id)"
              @regenerate="(options) => onRegenerate(messages[virtualItem.index].id, options)"
              @switch-sibling="
                (direction) => onSwitchSibling(messages[virtualItem.index].id, direction)
              "
              @switch-branch="onSwitchBranch"
              @toggle-enabled="emit('toggle-enabled', messages[virtualItem.index].id)"
              @edit="
                (content, attachments) =>
                  onEditMessage(messages[virtualItem.index].id, content, attachments)
              "
              @copy="() => {}"
              @abort="emit('abort-node', messages[virtualItem.index].id)"
              @create-branch="emit('create-branch', messages[virtualItem.index].id)"
              @analyze-context="emit('analyze-context', messages[virtualItem.index].id)"
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
}

.message-list {
  flex: 1;
  overflow-y: auto; /* 使用 auto 以支持虚拟滚动 */
  padding: 84px 20px 20px 28px; /* 左右各增加8px间距 */
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
