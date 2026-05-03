<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import { useThrottleFn } from "@vueuse/core";
import type { ChatMessageNode, ChatSessionIndex, ChatSessionDetail } from "../../types";
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

const props = defineProps<Props>();

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
// 记录捕获时的原始滚动位置，用于检测浏览器强制修正
const switchingOriginalScrollTop = ref<number>(0);

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
      // 增加多次尝试，应对异步渲染
      nextTick(() => restoreSwitchingMessagePosition());
      setTimeout(() => restoreSwitchingMessagePosition(), 50);
      setTimeout(() => restoreSwitchingMessagePosition(), 150);
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
const handleReparseTools = async (nodeId: string) => {
  try {
    const { customMessage } = await import("@/utils/customMessage");
    customMessage.info("正在重新解析工具...");
    await store.reparseNodeTools(nodeId);
    customMessage.success("工具重新解析完成");
  } catch (error) {
    const { createModuleLogger } = await import("@utils/logger");
    const logger = createModuleLogger("MessageList");
    logger.error("重新解析工具失败", error);
    const { customMessage } = await import("@/utils/customMessage");
    customMessage.error("重新解析失败");
  }
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
  switchingOriginalScrollTop.value = container.scrollTop;
};

/**
 * 恢复切换后的消息位置
 */
const restoreSwitchingMessagePosition = () => {
  if (!switchingMessageId.value) return;

  const container = messagesContainer.value;
  if (!container) return;

  const messageEl = container.querySelector(`[data-message-id="${switchingMessageId.value}"]`) as HTMLElement;

  if (!messageEl) return;

  const containerRect = container.getBoundingClientRect();
  const messageRect = messageEl.getBoundingClientRect();

  // 计算当前偏移量
  const currentOffset = messageRect.top - containerRect.top;
  // 我们希望 currentOffset 等于 switchingMessageViewportOffset
  const scrollDelta = currentOffset - switchingMessageViewportOffset.value;

  if (Math.abs(scrollDelta) > 0.5) {
    const targetScrollTop = container.scrollTop + scrollDelta;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const finalScrollTop = Math.max(0, Math.min(targetScrollTop, maxScroll));

    container.scrollTop = finalScrollTop;
  }

  // 只要尝试恢复了（不管有没有 delta），就清除状态，避免反复触发
  switchingMessageId.value = null;
  switchingMessageViewportOffset.value = 0;
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
            @toggle-enabled="store.toggleNodeEnabled(msg.id)"
            @delete="store.deleteMessage(msg.id)"
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
            @delete="store.deleteMessage(msg.id)"
            @regenerate="store.regenerateFromNode(msg.id, $event)"
            @switch-sibling="
              (dir: any) => {
                captureSwitchingMessagePosition(msg.id);
                store.switchToSiblingBranch(msg.id, dir);
              }
            "
            @switch-branch="
              (nodeId: any) => {
                captureSwitchingMessagePosition(msg.id);
                store.switchBranch(nodeId);
              }
            "
            @toggle-enabled="store.toggleNodeEnabled(msg.id)"
            @edit="(newContent: any, attachments: any) => store.editMessage(msg.id, newContent, attachments)"
            @copy="() => {}"
            @abort="store.abortNodeGeneration(msg.id)"
            @continue="store.continueGeneration(msg.id, $event)"
            @create-branch="
              () => {
                captureSwitchingMessagePosition(msg.id);
                store.createBranch(msg.id);
              }
            "
            @analyze-context="
              () => {
                store.contextAnalyzerNodeId = msg.id;
                store.contextAnalyzerVisible = true;
              }
            "
            @reparse-tools="handleReparseTools(msg.id)"
            @save-to-branch="
              (newContent: any, attachments: any) => store.createBranchFromEdit(msg.id, newContent, attachments)
            "
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
            @delete="store.deleteMessage(msg.id)"
            @regenerate="store.regenerateFromNode(msg.id, $event)"
            @switch-sibling="
              (dir: any) => {
                captureSwitchingMessagePosition(msg.id);
                store.switchToSiblingBranch(msg.id, dir);
              }
            "
            @switch-branch="
              (nodeId: any) => {
                captureSwitchingMessagePosition(msg.id);
                store.switchBranch(nodeId);
              }
            "
            @toggle-enabled="store.toggleNodeEnabled(msg.id)"
            @edit="(newContent: any, attachments: any) => store.editMessage(msg.id, newContent, attachments)"
            @save-to-branch="
              (newContent: any, attachments: any) => store.createBranchFromEdit(msg.id, newContent, attachments)
            "
            @copy="() => {}"
            @abort="store.abortNodeGeneration(msg.id)"
            @continue="store.continueGeneration(msg.id, $event)"
            @create-branch="
              () => {
                captureSwitchingMessagePosition(msg.id);
                store.createBranch(msg.id);
              }
            "
            @analyze-context="
              () => {
                store.contextAnalyzerNodeId = msg.id;
                store.contextAnalyzerVisible = true;
              }
            "
            @reparse-tools="handleReparseTools(msg.id)"
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
  flex: 1 1 0%; /* 强制 flex-basis 为 0，防止内容反向撑开 */
  height: 0; /* 配合 flex: 1，确保高度完全受父级支配 */
  overflow-y: auto;
  /* 禁用浏览器自动滚动锚定，避免与程序化 scrollTo 产生对抗导致布局抖动 */
  overflow-anchor: none;
  /* 彻底阻断滚动链传播，防止滚动溢出到 App 容器 */
  overscroll-behavior: contain;
  /* 渲染隔离：size 确保内容高度变化不触发父级重排，layout 和 paint 提升渲染性能 */
  contain: size layout paint;
  padding: 84px 20px 20px 28px;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * 性能优化：使用 content-visibility 开启虚拟渲染
 * 在 Vite 8 / Lightning CSS 环境下，确保这些现代属性不被误删或优化掉
 */
.messages-container :deep(.chat-message) {
  content-visibility: auto !important;
  contain-intrinsic-size: auto 600px !important;
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
