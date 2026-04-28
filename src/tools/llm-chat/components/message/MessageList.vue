<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import { useThrottleFn } from "@vueuse/core";
import type { ChatMessageNode, ChatSessionIndex, ChatSessionDetail } from "../../types";
import type { Asset } from "@/types/asset-management";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import ChatMessage from "./ChatMessage.vue";
import CompressionMessage from "./CompressionMessage.vue";
import ToolCallMessage from "./ToolCallMessage.vue";

interface Props {
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  messages: ChatMessageNode[];
  isSending: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
}

interface Emits {
  (e: "delete-message", messageId: string): void;
  (e: "regenerate", messageId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled", nodeId: string): void;
  (e: "edit-message", nodeId: string, newContent: string, attachments?: Asset[]): void;
  (e: "abort-node", nodeId: string): void;
  (e: "continue", nodeId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch", nodeId: string): void;
  (e: "analyze-context", nodeId: string): void;
  (e: "reparse-tools", nodeId: string): void;
  (e: "save-to-branch", nodeId: string, newContent: string, attachments?: Asset[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();
const { settings } = useChatSettings();

/**
 * 被压缩的节点 ID 集合
 */
const compressedNodeIds = computed(() => {
  const ids = new Set<string>();
  props.messages.forEach((node) => {
    if (node.metadata?.isCompressionNode && node.isEnabled !== false) {
      if (node.metadata.compressedNodeIds) {
        node.metadata.compressedNodeIds.forEach((id) => ids.add(id));
      }
    }
  });
  return ids;
});

// 为每条消息计算兄弟节点信息
const getMessageSiblings = (messageId: string) => {
  const message = props.messages.find((m) => m.id === messageId);

  if (message?.metadata?.isPresetDisplay) {
    return {
      siblings: [message],
      currentIndex: 0,
    };
  }

  const siblings = store.getSiblings(messageId);
  const currentIndex = siblings.findIndex((s: ChatMessageNode) => store.isNodeInActivePath(s.id));
  return {
    siblings,
    currentIndex,
  };
};

// 容器引用
const messagesContainer = ref<HTMLElement | null>(null);

// 暴露滚动容器供外部使用
const getScrollElement = () => messagesContainer.value;

// 记录用户是否接近底部
const isNearBottom = ref(true);
// 当前可见的消息索引 (1-based)
const currentVisibleIndex = ref(0);

// 追踪正在切换的消息 ID 和其在视口中的相对位置
const switchingMessageId = ref<string | null>(null);
const switchingMessageViewportOffset = ref<number>(0);

// 滚动到底部
const scrollToBottom = useThrottleFn(() => {
  nextTick(() => {
    if (messagesContainer.value) {
      const container = messagesContainer.value;
      if (settings.value.uiPreferences.smoothAutoScroll) {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  });
}, 50);

// 滚动到底部（供 Navigator 使用）
const scrollToEnd = () => {
  if (messagesContainer.value) {
    const maxScroll = messagesContainer.value.scrollHeight - messagesContainer.value.clientHeight;
    messagesContainer.value.scrollTop = Math.max(0, maxScroll);
  }
};

// 滚动到顶部
const scrollToTop = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({ top: 0, behavior: "smooth" });
  }
};
// 滚动到指定消息
const scrollToMessageId = (id: string) => {
  const container = messagesContainer.value;
  if (!container) return;
  const messageEl = container.querySelector(`[data-message-id="${id}"]`) as HTMLElement;
  if (messageEl) {
    const containerRect = container.getBoundingClientRect();
    const messageRect = messageEl.getBoundingClientRect();
    const targetScrollTop = container.scrollTop + (messageRect.top - containerRect.top) - 84; // 84是padding-top
    const maxScroll = container.scrollHeight - container.clientHeight;
    const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    container.scrollTo({ top: clampedScrollTop, behavior: "smooth" });
  }
};

// 滚动到下一条消息
const scrollToNext = () => {
  if (!messagesContainer.value) return;

  const container = messagesContainer.value;
  const messageEls = Array.from(container.querySelectorAll(".chat-message"));
  const containerRect = container.getBoundingClientRect();

  const nextMsg = messageEls.find((el) => {
    const rect = el.getBoundingClientRect();
    // 寻找第一个顶部在视口中心下方的消息，或者底部在视口下方的消息
    return rect.top > containerRect.top + containerRect.height / 2 || rect.bottom > containerRect.bottom + 10;
  }) as HTMLElement;

  if (nextMsg) {
    const rect = nextMsg.getBoundingClientRect();
    const targetScrollTop = container.scrollTop + (rect.top - containerRect.top) - 84;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    container.scrollTo({ top: clampedScrollTop, behavior: "smooth" });
  }
};

// 滚动到上一条消息
const scrollToPrev = () => {
  if (!messagesContainer.value) return;

  const container = messagesContainer.value;
  const messageEls = Array.from(container.querySelectorAll(".chat-message"));
  const containerRect = container.getBoundingClientRect();

  const prevMsg = [...messageEls].reverse().find((el) => {
    const rect = el.getBoundingClientRect();
    // 寻找上一个顶部在视口上方的消息
    return rect.top < containerRect.top - 10;
  }) as HTMLElement;

  if (prevMsg) {
    const rect = prevMsg.getBoundingClientRect();
    const targetScrollTop = container.scrollTop + (rect.top - containerRect.top) - 84;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));
    container.scrollTo({ top: clampedScrollTop, behavior: "smooth" });
  }
};

// 更新当前可见索引
const updateVisibleIndex = () => {
  if (!messagesContainer.value || props.messages.length === 0) {
    currentVisibleIndex.value = 0;
    return;
  }
  if (isNearBottom.value) {
    currentVisibleIndex.value = props.messages.length;
    return;
  }

  const container = messagesContainer.value;
  const containerRect = container.getBoundingClientRect();
  const messageEls = Array.from(container.querySelectorAll(".chat-message"));
  const centerY = containerRect.top + containerRect.height / 2;

  let found = false;
  for (let i = 0; i < messageEls.length; i++) {
    const rect = messageEls[i].getBoundingClientRect();
    if (rect.top <= centerY && rect.bottom >= centerY) {
      currentVisibleIndex.value = i + 1;
      found = true;
      break;
    }
  }
  if (!found) currentVisibleIndex.value = 1;
};

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < settings.value.uiPreferences.autoScrollThreshold;
  updateVisibleIndex();
};

// 监听会话切换
watch(
  () => props.sessionIndex?.id,
  (newId, oldId) => {
    if (newId !== oldId && newId) {
      // 第一次 nextTick 等待 DOM 结构生成
      nextTick(() => {
        if (messagesContainer.value && props.messages.length > 0) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
          isNearBottom.value = true;
          updateVisibleIndex();

          // 第二次 nextTick 应对重型渲染器导致的布局变化
          setTimeout(() => {
            if (messagesContainer.value) {
              messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
            }
          }, 50);
          setTimeout(() => {
            if (messagesContainer.value) {
              messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
            }
          }, 150);
        }
      });
    }
  },
  { flush: "post" },
);

// 监听消息变化，自动滚动
watch(
  [() => props.messages.length, () => props.messages[props.messages.length - 1]?.content],
  ([newLength, newLastContent], [oldLength, oldLastContent]) => {
    if (!settings.value.uiPreferences.autoScroll) return;

    const isNewMessage = newLength !== oldLength;
    const isContentChanged = newLastContent !== oldLastContent;

    if (isNewMessage) {
      if (isNearBottom.value || newLength === 1) {
        scrollToBottom();
      }
    } else if (isContentChanged) {
      if (isNearBottom.value) {
        scrollToBottom();
      }
    }
  },
);

// 监听消息列表引用变化，处理分支切换等场景的位置保持
watch(
  () => props.messages,
  (newMsgs, oldMsgs) => {
    if (newMsgs === oldMsgs) return;

    const container = messagesContainer.value;
    if (!container) return;

    const isAtBottom = isNearBottom.value;

    // 如果正在追踪切换的消息，优先恢复其位置
    if (switchingMessageId.value) {
      nextTick(() => {
        restoreSwitchingMessagePosition();
      });
      return;
    }

    if (isAtBottom) {
      scrollToBottom();
    } else {
      const messageEls = Array.from(container.querySelectorAll(".chat-message"));
      const containerRect = container.getBoundingClientRect();
      const firstVisibleEl = messageEls.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > containerRect.top;
      });
      const anchorId = firstVisibleEl?.getAttribute("data-message-id");

      nextTick(() => {
        if (anchorId) {
          const targetEl = container.querySelector(`[data-message-id="${anchorId}"]`);
          targetEl?.scrollIntoView({ block: "start" });
        }
      });
    }
  },
);

// 事件处理
const handleRegenerate = (messageId: string, options?: { modelId?: string; profileId?: string }) => {
  emit("regenerate", messageId, options);
};

const handleContinue = (messageId: string, options?: { modelId?: string; profileId?: string }) => {
  emit("continue", messageId, options);
};

const handleSwitchSibling = (messageId: string, direction: "prev" | "next") => {
  // 记录切换前的消息位置
  captureSwitchingMessagePosition(messageId);
  emit("switch-sibling", messageId, direction);
};

const handleSwitchBranch = (nodeId: string) => {
  // 记录切换前的消息位置
  captureSwitchingMessagePosition(nodeId);
  emit("switch-branch", nodeId);
};

/**
 * 捕获正在切换的消息在视口中的位置
 */
const captureSwitchingMessagePosition = (messageId: string) => {
  const container = messagesContainer.value;
  if (!container) return;

  const messageEl = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
  if (!messageEl) return;

  const containerRect = container.getBoundingClientRect();
  const messageRect = messageEl.getBoundingClientRect();

  // 记录消息顶部相对于容器顶部的偏移量
  switchingMessageId.value = messageId;
  switchingMessageViewportOffset.value = messageRect.top - containerRect.top;
};

/**
 * 恢复切换后的消息位置
 */
const restoreSwitchingMessagePosition = () => {
  if (!switchingMessageId.value) return;

  const container = messagesContainer.value;
  if (!container) return;

  const messageEl = container.querySelector(`[data-message-id="${switchingMessageId.value}"]`) as HTMLElement;
  if (!messageEl) {
    // 如果找不到消息元素，清除追踪状态
    switchingMessageId.value = null;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const messageRect = messageEl.getBoundingClientRect();

  // 计算需要滚动的距离，使消息保持在相同的视口位置
  const currentOffset = messageRect.top - containerRect.top;
  const scrollDelta = currentOffset - switchingMessageViewportOffset.value;

  if (Math.abs(scrollDelta) > 1) {
    container.scrollTop += scrollDelta;
  }

  // 清除追踪状态
  switchingMessageId.value = null;
  switchingMessageViewportOffset.value = 0;
};

const handleEditMessage = (nodeId: string, newContent: string, attachments?: Asset[]) => {
  emit("edit-message", nodeId, newContent, attachments);
};

const handleSaveToBranch = (nodeId: string, newContent: string, attachments?: Asset[]) => {
  emit("save-to-branch", nodeId, newContent, attachments);
};

defineExpose({
  scrollToBottom,
  scrollToEnd,
  scrollToTop,
  scrollToNext,
  scrollToPrev,
  scrollToMessageId,
  getScrollElement,
  currentVisibleIndex,
});
</script>

<template>
  <div class="message-list-container">
    <div ref="messagesContainer" class="message-list" @scroll="onScroll">
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 开始新的对话吧！</p>
      </div>

      <div v-else class="messages-container">
        <template v-for="msg in messages" :key="msg.id">
          <!-- 压缩节点渲染 -->
          <CompressionMessage
            v-if="msg.metadata?.isCompressionNode"
            :session-index="props.sessionIndex"
            :session-detail="props.sessionDetail"
            :message="msg"
            :message-depth="messages.length - 1 - messages.indexOf(msg)"
            @toggle-enabled="emit('toggle-enabled', msg.id)"
            @delete="emit('delete-message', msg.id)"
            @update-content="(content: string) => store.editMessage(msg.id, content)"
            @update-role="(role: any) => store.updateNodeData(msg.id, { role })"
          />

          <!-- 工具调用结果渲染 -->
          <ToolCallMessage
            v-else-if="msg.role === 'tool'"
            :session-index="props.sessionIndex"
            :session-detail="props.sessionDetail"
            :message="msg"
            :message-depth="messages.length - 1 - messages.indexOf(msg)"
            :is-sending="isSending"
            :siblings="getMessageSiblings(msg.id).siblings"
            :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
            @delete="emit('delete-message', msg.id)"
            @regenerate="handleRegenerate(msg.id, $event)"
            @switch-sibling="handleSwitchSibling(msg.id, $event)"
            @switch-branch="handleSwitchBranch"
            @toggle-enabled="emit('toggle-enabled', msg.id)"
            @edit="(newContent: any, attachments: any) => handleEditMessage(msg.id, newContent, attachments)"
            @copy="() => {}"
            @abort="emit('abort-node', msg.id)"
            @continue="handleContinue(msg.id, $event)"
            @create-branch="emit('create-branch', msg.id)"
            @analyze-context="emit('analyze-context', msg.id)"
            @reparse-tools="emit('reparse-tools', msg.id)"
            @save-to-branch="handleSaveToBranch(msg.id, $event)"
            @update-translation="(translation: any) => store.updateMessageTranslation(msg.id, translation)"
          />

          <!-- 普通消息渲染 -->
          <ChatMessage
            v-else
            :session-index="props.sessionIndex"
            :session-detail="props.sessionDetail"
            :message="msg"
            :is-compressed="compressedNodeIds.has(msg.id)"
            :message-depth="messages.length - 1 - messages.indexOf(msg)"
            :is-sending="isSending"
            :siblings="getMessageSiblings(msg.id).siblings"
            :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
            :llm-think-rules="llmThinkRules"
            :rich-text-style-options="
              msg.role === 'user' ? userRichTextStyleOptions || richTextStyleOptions : richTextStyleOptions
            "
            @delete="emit('delete-message', msg.id)"
            @regenerate="handleRegenerate(msg.id, $event)"
            @switch-sibling="handleSwitchSibling(msg.id, $event)"
            @switch-branch="handleSwitchBranch"
            @toggle-enabled="emit('toggle-enabled', msg.id)"
            @edit="(newContent: any, attachments: any) => handleEditMessage(msg.id, newContent, attachments)"
            @save-to-branch="(newContent: any, attachments: any) => handleSaveToBranch(msg.id, newContent, attachments)"
            @copy="() => {}"
            @abort="emit('abort-node', msg.id)"
            @continue="handleContinue(msg.id, $event)"
            @create-branch="emit('create-branch', msg.id)"
            @analyze-context="emit('analyze-context', msg.id)"
            @reparse-tools="emit('reparse-tools', msg.id)"
            @update-translation="(translation: any) => store.updateMessageTranslation(msg.id, translation)"
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
}

.message-list {
  flex: 1;
  overflow-y: auto;
  /* 禁用浏览器自动滚动锚定，避免与程序化 scrollTo 产生对抗导致布局抖动 */
  overflow-anchor: none;
  overscroll-behavior: contain;
  /* 渲染隔离：防止内部布局变化影响外部容器 */
  contain: layout style;
  padding: 84px 20px 20px 28px;
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
