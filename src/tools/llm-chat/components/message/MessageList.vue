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
import MessageExternalAvatar from "./MessageExternalAvatar.vue";
import MessageHeader from "./MessageHeader.vue";

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

// ===== 气泡布局：预计算每条消息的角色 / 对齐信息 =====
interface MessageLayoutInfo {
  /** CSS 选择器友好的角色 (compression 节点视作 system) */
  role: "user" | "assistant" | "tool" | "system";
  /** 对齐方向 */
  align: "left" | "right" | "center";
}

const bubbleLayout = computed(() => settings.value.uiPreferences.bubbleLayout);

/**
 * 每条消息的布局信息（一次性预计算，避免模板里多次扫描）
 *
 * 关键逻辑：
 * - compression 节点强制视作 "system" 角色（姐姐 v3 决策）
 * - tool 消息的 follow-prev 模式：对齐方向跟随前一条（含 user 嫁接、tool 链自动传播）
 * - tool 消息的 center 模式：独立居中显示
 */
const messageLayouts = computed<MessageLayoutInfo[]>(() => {
  const layout = bubbleLayout.value;
  const isBubble = layout.mode === "bubble";
  const messages = props.messages;
  const result: MessageLayoutInfo[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 解析角色：compression 节点视作 system
    let role: MessageLayoutInfo["role"];
    if (msg.metadata?.isCompressionNode) {
      role = "system";
    } else if (msg.role === "tool") {
      role = "tool";
    } else if (msg.role === "user") {
      role = "user";
    } else if (msg.role === "assistant") {
      role = "assistant";
    } else {
      role = "system";
    }

    // 解析对齐
    let align: MessageLayoutInfo["align"] = "left";
    if (isBubble) {
      if (role === "user") {
        align = layout.userAlign;
      } else if (role === "assistant") {
        align = layout.assistantAlign;
      } else if (role === "system") {
        align = layout.systemAlign;
      } else if (role === "tool") {
        if (layout.toolAttachment === "center") {
          align = "center";
        } else {
          // follow-prev: 跟随前一条；链头无 prev 时回退到 assistantAlign
          const prevInfo = i > 0 ? result[i - 1] : null;
          if (prevInfo && prevInfo.align !== "center") {
            align = prevInfo.align;
          } else {
            align = layout.assistantAlign;
          }
        }
      }
    }

    result.push({ role, align });
  }

  return result;
});

/** 获取指定消息的布局信息（按 id 查找以兼容动态更新） */
const getMessageLayout = (index: number): MessageLayoutInfo => {
  return (
    messageLayouts.value[index] ?? {
      role: "system",
      align: "left",
    }
  );
};

/** CSS 变量注入 */
const bubbleLayoutVars = computed(() => {
  const l = bubbleLayout.value;
  return {
    "--bubble-max-width-percent": `${l.maxWidthPercent}%`,
    "--bubble-max-width-px": `${l.maxWidthPx}px`,
    "--system-max-width-percent": `${l.systemMaxWidthPercent}%`,
    "--avatar-outside-size": `${l.avatarSize}px`,
    "--avatar-outside-gap": `${l.avatarGap}px`,
    "--header-outside-gap": `${l.headerGap}px`,
    "--bubble-radius": `${l.borderRadius}px`,
  } as Record<string, string>;
});

const isBubbleMode = computed(() => bubbleLayout.value.mode === "bubble");
const avatarPlacement = computed(() => bubbleLayout.value.avatarPlacement);
const headerPlacement = computed(() => bubbleLayout.value.headerPlacement);
const showAvatar = computed(() => settings.value.uiPreferences.showAvatar);

/**
 * 判断 MessageHeader 内置头像是否应被隐藏：
 * - 全局关闭显示头像
 * - 或者气泡模式下使用外置头像
 */
const shouldHideHeaderAvatar = computed(
  () =>
    !showAvatar.value ||
    (isBubbleMode.value && avatarPlacement.value === "outside")
);

/**
 * 判断某条消息是否应该使用外置 header 布局：
 * - 仅 bubble 模式 + headerPlacement === "outside" 时生效
 * - 仅普通 user / assistant 消息（非压缩、非工具）
 */
const shouldUseOutsideHeader = (
  msg: ChatMessageNode,
  layoutInfo: { role: string; align: string }
): boolean => {
  if (!isBubbleMode.value) return false;
  if (headerPlacement.value !== "outside") return false;
  if (layoutInfo.align === "center") return false;
  if (msg.metadata?.isCompressionNode) return false;
  if (msg.role !== "user" && msg.role !== "assistant") return false;
  return true;
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
      container.scrollTop + (messageRect.top - containerRect.top) - 120; // 120是padding-top
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
      container.scrollTop + (rect.top - containerRect.top) - 120;
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
      container.scrollTop + (rect.top - containerRect.top) - 120;
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

      <div
        v-else
        ref="messagesInnerContainer"
        class="messages-container"
        :class="[
          `mode-${bubbleLayout.mode}`,
          {
            'avatar-outside':
              isBubbleMode && showAvatar && avatarPlacement === 'outside',
            'header-outside': isBubbleMode && headerPlacement === 'outside',
          },
        ]"
        :style="bubbleLayoutVars"
      >
        <template v-for="(msg, index) in messages" :key="msg.id">
          <div
            class="message-slot"
            :data-role="getMessageLayout(index).role"
            :data-align="getMessageLayout(index).align"
            :data-avatar-placement="avatarPlacement"
            :data-header-outside="
              shouldUseOutsideHeader(msg, getMessageLayout(index))
                ? 'true'
                : 'false'
            "
          >
            <!-- 外置头像：仅 bubble + outside + 显示头像 + 非居中 时渲染 -->
            <MessageExternalAvatar
              v-if="
                isBubbleMode &&
                showAvatar &&
                avatarPlacement === 'outside' &&
                getMessageLayout(index).align !== 'center'
              "
              :message="msg"
              :size="bubbleLayout.avatarSize"
            />

            <!-- 外置 header + 气泡 的组合容器（仅 user/assistant 普通消息） -->
            <div
              v-if="shouldUseOutsideHeader(msg, getMessageLayout(index))"
              class="message-body"
            >
              <MessageHeader
                class="external-header"
                :message="msg"
                :hide-avatar="shouldHideHeaderAvatar"
              />
              <ChatMessage
                :session-index="props.sessionIndex"
                :session-detail="props.sessionDetail"
                :message="msg"
                :is-compressed="compressedNodeIds.has(msg.id)"
                :message-depth="messages.length - 1 - index"
                :is-sending="isSending"
                :siblings="getMessageSiblings(msg.id).siblings"
                :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
                :llm-think-rules="llmThinkRules"
                :hide-header="true"
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
            </div>

            <!-- 压缩节点渲染 -->
            <CompressionMessage
              v-else-if="msg.metadata?.isCompressionNode"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
              @toggle-enabled="store.toggleNodeEnabled(msg.id)"
              @delete="store.deleteMessage(msg.id)"
              @update-content="
                (content: string) => store.editMessage(msg.id, content)
              "
              @update-role="
                (role: any) => store.updateNodeData(msg.id, { role })
              "
            />

            <!-- 工具调用结果渲染 -->
            <ToolCallMessage
              v-else-if="msg.role === 'tool'"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
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
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
              :llm-think-rules="llmThinkRules"
              :hide-header-avatar="shouldHideHeaderAvatar"
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
          </div>
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
  padding: 120px 20px 20px 28px;
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

/* ===========================================================
 * Bubble Layout — 气泡布局
 * 通过 .message-slot 外层 wrapper + data-* 属性 + CSS 变量驱动
 * mode-card: 保持原有行为（message-slot 透明，子元素全宽）
 * mode-bubble: 按 data-align 对齐，限宽，工具粘附融合
 * =========================================================== */

/* 卡片模式：message-slot 仅作为透明 wrapper（不改变现有视觉） */
.messages-container.mode-card .message-slot {
  display: block;
  width: 100%;
}

/* 气泡模式：message-slot 作为对齐容器 */
.messages-container.mode-bubble {
  gap: 12px;
}

.messages-container.mode-bubble .message-slot {
  display: flex;
  width: 100%;
  align-items: flex-start;
  /* min-width: 0 防止 flex item 内容溢出造成横向滚动 */
  min-width: 0;
}

/* 对齐方向 */
.messages-container.mode-bubble .message-slot[data-align="left"] {
  justify-content: flex-start;
}
.messages-container.mode-bubble .message-slot[data-align="right"] {
  justify-content: flex-end;
}
.messages-container.mode-bubble .message-slot[data-align="center"] {
  justify-content: center;
}

/* 气泡子元素的宽度限制 */
.messages-container.mode-bubble .message-slot > .chat-message,
.messages-container.mode-bubble .message-slot > .tool-call-message,
.messages-container.mode-bubble .message-slot > .compression-message,
.messages-container.mode-bubble .message-slot > .message-body,
.messages-container.mode-bubble :deep(.message-slot > .chat-message),
.messages-container.mode-bubble :deep(.message-slot > .tool-call-message),
.messages-container.mode-bubble :deep(.message-slot > .compression-message) {
  max-width: min(
    var(--bubble-max-width-percent, 75%),
    var(--bubble-max-width-px, 720px)
  );
  flex: 0 1 auto;
  min-width: 0;
}

/* 外置头像会额外占据一列，气泡最大宽度需要扣掉头像列，避免右侧气泡压到头像横坐标 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .chat-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .tool-call-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .compression-message,
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
  > .message-body,
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .chat-message
  ),
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .tool-call-message
  ),
.messages-container.mode-bubble.avatar-outside
  :deep(
    .message-slot[data-avatar-placement="outside"]:not([data-align="center"])
      > .compression-message
  ) {
  max-width: min(
    max(
      0px,
      calc(
        var(--bubble-max-width-percent, 75%) -
          var(--avatar-outside-size, 36px) - var(--avatar-outside-gap, 8px)
      )
    ),
    var(--bubble-max-width-px, 720px)
  );
}

/* System / Compression 消息使用独立的居中宽度 */
.messages-container.mode-bubble .message-slot[data-role="system"] > * {
  max-width: var(--system-max-width-percent, 60%);
}

/* 圆角同步：覆写消息组件内部的 8px 圆角为可配置值 */
.messages-container.mode-bubble :deep(.chat-message),
.messages-container.mode-bubble :deep(.tool-call-message),
.messages-container.mode-bubble :deep(.compression-message) {
  border-radius: var(--bubble-radius, 12px);
}
.messages-container.mode-bubble :deep(.message-background-container) {
  border-radius: var(--bubble-radius, 12px);
}
.messages-container.mode-bubble :deep(.chat-message::after),
.messages-container.mode-bubble :deep(.tool-call-message::after),
.messages-container.mode-bubble :deep(.compression-message::after) {
  border-radius: var(--bubble-radius, 12px);
}

/* ========== 外置头像 (avatar outside) ========== */
/* 头像与气泡顶部对齐，符合多数 IM 习惯 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"] {
  align-items: flex-start;
  gap: var(--avatar-outside-gap, 8px);
}

/* 右对齐：flex-direction: row-reverse，头像在气泡右侧 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"][data-align="right"] {
  flex-direction: row-reverse;
  /* 在 row-reverse 下，flex-start 才是右对齐，覆盖默认的 flex-end */
  justify-content: flex-start;
}

/* 外置头像的透明占位（tool/system 行）保持气泡缩进对齐，但鼠标不响应 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]
  > .message-external-avatar {
  pointer-events: none;
}

/* ========== 外置 Header (headerPlacement: outside) ========== */
/*
 * message-body 是 [header + 气泡] 的列容器，让 header 紧贴气泡上方
 * 气泡本身的宽度限制由 message-body 继承（max-width 已在前面统一设置）。
 * 容器按内容收缩，避免短消息被外置 header 撑成整段 max-width。
 */
.messages-container.mode-bubble .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--header-outside-gap, 4px);
  min-width: 0;
  width: fit-content;
}

/* 右对齐时让 header 和气泡都贴住同一条右边界 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  .message-body {
  align-items: flex-end;
}

/* message-body 内的气泡：按内容收缩，并由 message-body 的 max-width 负责换行上限 */
.messages-container.mode-bubble .message-body > .chat-message {
  max-width: 100%;
  width: fit-content;
}

/* 外置 header：解除内置 margin-bottom，避免 gap 重复；缩小尺寸感 */
.messages-container.mode-bubble .message-body > .external-header {
  margin-bottom: 0;
  max-width: 100%;
  /* 让 header 自身右对齐时，header-right 不要被 margin-left:auto 推远 */
  padding: 0 4px;
}

/* 左对齐时 header 内容靠左 */
.messages-container.mode-bubble
  .message-slot[data-align="left"]
  .external-header {
  justify-content: flex-start;
}

/* 右对齐时 header 内容靠右（依赖后面的通用镜像规则把 header 内部 row-reverse） */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  .external-header {
  justify-content: flex-end;
}

/* ========== 右对齐通用镜像（同时覆盖 inside / outside 两种头像放置） ========== */
/* 右对齐时，气泡内部 header 整体镜像：
 *  - inside  模式让头像贴向气泡右侧
 *  - outside 模式让名字/时间右对齐与外置头像呼应
 *
 * 注意：外置 header (.external-header) 使用 column 布局（名字在上、
 * header-right 在下），不应用 row-reverse，否则会被翻转为 column-reverse。
 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header:not(.external-header)) {
  flex-direction: row-reverse;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header .header-left) {
  flex-direction: row-reverse;
}
/* header-right 在原样式里有 margin-left: auto，会和 row-reverse 冲突，需要反向 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header:not(.external-header) .header-right) {
  margin-left: 0;
  margin-right: auto;
}
/* 名称行 / 副标题在镜像后改为右对齐，避免悬空 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header .message-info) {
  align-items: flex-end;
  text-align: right;
}
/* 外置 header + 右对齐：header-right 跟随名字行右对齐 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header.external-header .header-right) {
  align-self: flex-end;
  margin-left: 0;
  margin-right: 0;
}

/* ========== 工具消息气泡镜像 ========== */
/* 右对齐时整体 row-reverse，让装饰条 .tool-bar 贴到气泡右侧 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message) {
  flex-direction: row-reverse;
}
/* 工具头部的 collapse-icon + role-badge + tool-name 链路同步镜像 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message .tool-header) {
  flex-direction: row-reverse;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message .tool-header .header-left) {
  flex-direction: row-reverse;
}
/* ==========================================================
 * 气泡模式：底部信息与操作栏的"双侧布局"
 * - 底部信息 (.message-meta) 对齐到消息同方向（信息跟随气泡）
 * - 操作栏 (.menubar-wrapper) 对齐到对面方向（与信息水平错开）
 * 例：用户气泡 right-align → Token 信息靠右、操作栏靠左
 *     助手气泡 left-align  → Token 信息靠左、操作栏靠右
 * ========================================================== */

/* —— 底部信息：跟随消息方向对齐 —— */
.messages-container.mode-bubble
  .message-slot[data-align="left"]
  :deep(.message-meta) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-meta) {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
/* 右对齐时 error-info 内部是 flex 行布局，让按钮与文本镜像 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-meta .error-info) {
  flex-direction: row-reverse;
  text-align: right;
}

/* —— 操作栏：对齐到对面方向，与底部信息水平错开 —— */
.messages-container.mode-bubble
  .message-slot[data-align="left"]
  :deep(.menubar-wrapper) {
  /* 左对齐消息（助手）→ 操作栏靠右 */
  justify-content: flex-end;
  padding-left: 0;
  padding-right: 12px;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.menubar-wrapper) {
  /* 右对齐消息（用户）→ 操作栏靠左 */
  justify-content: flex-start;
  padding-right: 0;
  padding-left: 12px;
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
