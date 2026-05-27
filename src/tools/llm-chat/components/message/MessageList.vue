<script setup lang="ts">
import {
  ref,
  watch,
  nextTick,
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useThrottleFn } from "@vueuse/core";
import type {
  ChatMessageNode,
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../types";
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

// keep-alive 滚动位置恢复：在 scroll 事件中持续追踪 scrollTop
// （deactivate 时浏览器会将 DOM 移出文档树导致 scrollTop 被重置为 0）
const lastKnownScrollTop = ref(0);
const wasNearBottomBeforeDeactivate = ref(true);

// 会话切换时如果消息还没加载，挂起滚动到底部的操作
const pendingInitialScroll = ref(false);

// 底部锁定状态：当为 true 时，内容高度变化会自动跟随滚动到底部
// 与 isNearBottom 不同，这是一个"意图"标志，用于 ResizeObserver 判断是否需要跟随
const shouldStickToBottom = ref(true);

onDeactivated(() => {
  wasNearBottomBeforeDeactivate.value = isNearBottom.value;
  disconnectResizeObserver();
});

onActivated(() => {
  const container = messagesContainer.value;
  if (!container) return;

  // 重新连接 ResizeObserver
  setupResizeObserver();

  // keep-alive 切换会导致浏览器重置 scrollTop 为 0，需要恢复
  if (container.scrollTop === 0 && lastKnownScrollTop.value > 0) {
    if (wasNearBottomBeforeDeactivate.value) {
      // 之前在底部附近，启用底部锁定让 ResizeObserver 自动跟随
      shouldStickToBottom.value = true;
      container.scrollTop = container.scrollHeight;
    } else {
      // 之前在中间位置，恢复到记录的位置
      shouldStickToBottom.value = false;
      nextTick(() => {
        if (!messagesContainer.value) return;
        const maxScroll =
          messagesContainer.value.scrollHeight -
          messagesContainer.value.clientHeight;
        messagesContainer.value.scrollTop = Math.min(
          lastKnownScrollTop.value,
          maxScroll
        );
      });
    }
  }
});

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
  const currentIndex = siblings.findIndex((s: ChatMessageNode) =>
    store.isNodeInActivePath(s.id)
  );
  return {
    siblings,
    currentIndex,
  };
};

// 容器引用
const messagesContainer = ref<HTMLElement | null>(null);
const messagesInnerContainer = ref<HTMLElement | null>(null);

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

// ==================== ResizeObserver：内容高度变化时自动跟随底部 ====================
let resizeObserver: ResizeObserver | null = null;
// 上一次观测到的内容高度，用于判断是增长还是缩小
let lastObservedHeight = 0;

const onContentResize = () => {
  const container = messagesContainer.value;
  if (!container) return;

  const currentHeight = container.scrollHeight;
  const isGrowing = currentHeight > lastObservedHeight;
  lastObservedHeight = currentHeight;

  // 只在内容增长时跟随（缩小时不动，避免删除消息时跳动）
  if (!isGrowing) return;

  // 当处于底部锁定状态时，自动跟随滚动
  if (shouldStickToBottom.value) {
    container.scrollTop = currentHeight;
  }
};

const setupResizeObserver = () => {
  disconnectResizeObserver();
  const inner = messagesInnerContainer.value;
  if (!inner) return;

  resizeObserver = new ResizeObserver(onContentResize);
  resizeObserver.observe(inner);
  // 初始化高度记录
  if (messagesContainer.value) {
    lastObservedHeight = messagesContainer.value.scrollHeight;
  }
};

const disconnectResizeObserver = () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
};

onMounted(() => {
  setupResizeObserver();
  // 初始加载时如果已有消息，滚动到底部
  if (messagesContainer.value && props.messages.length > 0) {
    shouldStickToBottom.value = true;
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
});

onBeforeUnmount(() => {
  disconnectResizeObserver();
});

// 滚动到底部
const scrollToBottom = useThrottleFn((forceInstant = false) => {
  nextTick(() => {
    if (messagesContainer.value) {
      const container = messagesContainer.value;
      const targetTop = container.scrollHeight;

      // 如果已经非常接近底部，或者强制立即跳转，或者关闭了平滑滚动
      const isAlreadyAtBottom =
        Math.abs(container.scrollTop + container.clientHeight - targetTop) < 12;

      if (
        forceInstant ||
        isAlreadyAtBottom ||
        !settings.value.uiPreferences.smoothAutoScroll
      ) {
        container.scrollTop = targetTop;
      } else {
        container.scrollTo({ top: targetTop, behavior: "smooth" });
      }
    }
  });
}, 50);

// 滚动到底部（供 Navigator 使用）
const scrollToEnd = () => {
  if (messagesContainer.value) {
    const maxScroll =
      messagesContainer.value.scrollHeight -
      messagesContainer.value.clientHeight;
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
  const messageEl = container.querySelector(
    `[data-message-id="${id}"]`
  ) as HTMLElement;
  if (messageEl) {
    const containerRect = container.getBoundingClientRect();
    const messageRect = messageEl.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop + (messageRect.top - containerRect.top) - 84; // 84是padding-top
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
    return (
      rect.top > containerRect.top + containerRect.height / 2 ||
      rect.bottom > containerRect.bottom + 10
    );
  }) as HTMLElement;

  if (nextMsg) {
    const rect = nextMsg.getBoundingClientRect();
    const targetScrollTop =
      container.scrollTop + (rect.top - containerRect.top) - 84;
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
    const targetScrollTop =
      container.scrollTop + (rect.top - containerRect.top) - 84;
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
  const container = messagesContainer.value;
  const { scrollTop, scrollHeight, clientHeight } = container;

  // 持续追踪有效的 scrollTop（用于 keep-alive 恢复）
  lastKnownScrollTop.value = scrollTop;

  // 阻断水平滚动（如果有的话）
  if (container.scrollLeft !== 0) container.scrollLeft = 0;

  const threshold = settings.value.uiPreferences.autoScrollThreshold;
  isNearBottom.value = scrollHeight - clientHeight - scrollTop < threshold;

  // 同步底部锁定状态：用户手动上滚时解除锁定，滚到底部时恢复锁定
  shouldStickToBottom.value = isNearBottom.value;

  updateVisibleIndex();
};

/**
 * 激活底部锁定并立即滚动到底部。
 * ResizeObserver 会在后续内容高度变化（content-visibility 渐进渲染）时自动跟随。
 */
const activateBottomLock = () => {
  shouldStickToBottom.value = true;
  isNearBottom.value = true;
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      lastObservedHeight = messagesContainer.value.scrollHeight;
    }
    updateVisibleIndex();
    // 确保 ResizeObserver 已连接（消息容器可能刚从 v-if 中出现）
    if (!resizeObserver && messagesInnerContainer.value) {
      setupResizeObserver();
    }
  });
};

// 监听会话切换
watch(
  () => props.sessionIndex?.id,
  (newId, oldId) => {
    if (newId !== oldId && newId) {
      if (props.messages.length > 0) {
        // 消息已就绪，激活底部锁定（ResizeObserver 会处理后续渲染导致的高度增长）
        pendingInitialScroll.value = false;
        activateBottomLock();
      } else {
        // 消息还没加载（异步加载 detail），挂起等待
        pendingInitialScroll.value = true;
      }
    }
  },
  { flush: "post" }
);

// 监听消息变化，自动滚动
watch(
  [
    () => props.messages.length,
    () => props.messages[props.messages.length - 1]?.content,
  ],
  ([newLength, newLastContent], [oldLength, oldLastContent]) => {
    if (!settings.value.uiPreferences.autoScroll) return;

    const isNewMessage = newLength !== oldLength;
    const isContentChanged = newLastContent !== oldLastContent;

    if (isNewMessage) {
      // 消息从空变为非空：首次加载场景（刷新页面/打开应用恢复会话）
      if (oldLength === 0 && newLength > 0 && pendingInitialScroll.value) {
        pendingInitialScroll.value = false;
        activateBottomLock();
        return;
      }

      if (isNearBottom.value || newLength === 1) {
        // 新消息加入时，如果原本就在底部，激活底部锁定
        shouldStickToBottom.value = true;
        scrollToBottom(true);
      }
    } else if (isContentChanged) {
      if (isNearBottom.value) {
        scrollToBottom();
      }
    }
  }
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
    }
  }
);

// 事件处理
const handleReparseTools = async (
  nodeId: string,
  options?: { modelId?: string; profileId?: string }
) => {
  try {
    const { customMessage } = await import("@/utils/customMessage");
    customMessage.info("正在重新解析工具...");
    const temporaryModel =
      options?.modelId && options?.profileId
        ? { modelId: options.modelId, profileId: options.profileId }
        : null;
    await store.reparseNodeTools(nodeId, { temporaryModel });
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

  const messageEl = container.querySelector(
    `[data-message-id="${messageId}"]`
  ) as HTMLElement;
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

  const messageEl = container.querySelector(
    `[data-message-id="${switchingMessageId.value}"]`
  ) as HTMLElement;

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

      <div v-else ref="messagesInnerContainer" class="messages-container">
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
            @update-content="
              (content: string) => store.editMessage(msg.id, content)
            "
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
            @edit="
              (newContent: any, attachments: any) =>
                store.editMessage(msg.id, newContent, attachments)
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
            @reparse-tools="(opts: any) => handleReparseTools(msg.id, opts)"
            @save-to-branch="
              (newContent: any, attachments: any) =>
                store.createBranchFromEdit(msg.id, newContent, attachments)
            "
            @update-translation="
              (translation: any) =>
                store.updateMessageTranslation(msg.id, translation)
            "
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
              msg.role === 'user'
                ? userRichTextStyleOptions || richTextStyleOptions
                : richTextStyleOptions
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
            @edit="
              (newContent: any, attachments: any) =>
                store.editMessage(msg.id, newContent, attachments)
            "
            @save-to-branch="
              (newContent: any, attachments: any) =>
                store.createBranchFromEdit(msg.id, newContent, attachments)
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
            @reparse-tools="(opts: any) => handleReparseTools(msg.id, opts)"
            @update-translation="
              (translation: any) =>
                store.updateMessageTranslation(msg.id, translation)
            "
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
  contain-intrinsic-size: auto 500px !important;
}

/* 最后一项消息禁用虚拟渲染，确保底部锚定计算准确，防止滚动回弹 */
.messages-container :deep(.chat-message:last-child) {
  content-visibility: visible !important;
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
