<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

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
  provide,
} from "vue";
import { useThrottleFn } from "@vueuse/core";
import type {
  ChatMessageNode,
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../types";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useMessageLayout } from "../../composables/ui/useMessageLayout";
import { useMessageScrollAnchor } from "../../composables/ui/useMessageScrollAnchor";
import { useMessageHeights } from "../../composables/ui/useMessageHeights";
import { provideMessageReadingArea } from "../../composables/ui/useMessageReadingArea";
import {
  provideRendererReadingInteraction,
  rendererLayoutRevisionKey,
} from "@/tools/rich-text-renderer/composables/useRendererDisplay";

import {
  rendererHostActiveKey,
  rendererViewportKey,
} from "@/tools/rich-text-renderer/composables/useRendererViewState";

import ContextCompressionTask from "./ContextCompressionTask.vue";
import { useContextCompressor } from "../../composables/features/useContextCompressor";
import MessageRow from "./MessageRow.vue";
import { useMessagePresentation } from "../../composables/ui/useMessagePresentation";
import type { Asset } from "@/types/asset-management";

interface Props {
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  messages: ChatMessageNode[];
  isSending: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  /** 是否处于截图模式(隐藏交互元素、传递到子组件) */
  screenshotMode?: boolean;
  /** 显式绑定的会话作用域；为空时回退当前选中会话 */
  scopeSessionId?: string | null;
  /** 阻断所有会话写操作，用于伴生会话等只读透视场景 */
  readonly?: boolean;
}

const props = defineProps<Props>();

const store = useLlmChatStore();
const { manualCompress } = useContextCompressor();
const { settings } = useChatSettings();

// 会话作用域：有值时读写显式绑定到该会话，不再依赖 currentSessionId
const scopedSessionId = computed(() => props.scopeSessionId ?? null);
const viewSessionId = computed(
  () =>
    scopedSessionId.value ??
    props.sessionDetail?.id ??
    props.sessionIndex?.id ??
    store.currentSessionId ??
    ""
);
const compressionTask = computed(() =>
  store.getContextCompressionTask(viewSessionId.value)
);
const compressionTaskContainer = ref<HTMLElement | null>(null);

// 会话切换时如果消息还没加载，挂起滚动到底部的操作
const pendingInitialScroll = ref(false);
const listActive = ref(true);
provide(rendererHostActiveKey, listActive);
const readingInteraction = provideRendererReadingInteraction(listActive);
onDeactivated(() => {
  listActive.value = false;
  suspendScrollAnchor();
  disconnectResizeObserver();
});
onActivated(() => {
  const resuming = !listActive.value;
  listActive.value = true;
  // Display children remount in the same flush. Restore again on async height changes.
  nextTick(() => {
    if (!listActive.value) return;
    if (resuming) resumeScrollAnchor();
    readingArea.refresh();
    setupResizeObserver();
  });
});

// 布局编排：压缩节点、兄弟信息、角色 / 对齐、CSS 变量
// —— 提取至 useMessageLayout,主列表与截图渲染器共享同一份计算
const {
  compressedNodeIds,
  getMessageLayout,
  getMessageSiblings,
  bubbleLayout,
  bubbleLayoutVars,
  isBubbleMode,
  avatarPlacement,
  headerPlacement,
  showAvatar,
  shouldHideHeaderAvatar,
  shouldUseOutsideHeader,
} = useMessageLayout({
  messages: computed(() => props.messages),
  settings,
  getSiblings: (id) => {
    const sessionId = scopedSessionId.value;
    return sessionId
      ? store.getSiblingsInSession(id, sessionId)
      : store.getSiblings(id);
  },
  isNodeInActivePath: (id) => {
    const sessionId = scopedSessionId.value;
    return sessionId
      ? store.isNodeInActivePathInSession(id, sessionId)
      : store.isNodeInActivePath(id);
  },
});

const isCompactMode = computed(() => bubbleLayout.value.mode === "compact");
const { presentation, characterCounts, rowLayoutKeys } = useMessagePresentation(
  computed(() => props.messages),
  isCompactMode
);
const navigationPoints = computed(() => presentation.value.navigationPoints);
const navigationIndex = ref(0);

// 截图模式：通过 prop 控制,默认 false
const screenshotMode = computed(() => props.screenshotMode ?? false);
const isSessionReadOnly = computed(() => props.readonly ?? false);
provide("screenshotMode", screenshotMode);
provide("isSessionReadOnly", isSessionReadOnly);

// 写操作统一经此代理进入 store；只读视图即便出现遗漏的事件，也不会改变会话数据。
const guardedStore = new Proxy(store, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      if (isSessionReadOnly.value) return undefined;
      return value.apply(target, args);
    };
  },
  set(target, property, value, receiver) {
    if (isSessionReadOnly.value) return true;
    return Reflect.set(target, property, value, receiver);
  },
});

// 容器引用
const messagesContainer = ref<HTMLElement | null>(null);
provide(rendererViewportKey, messagesContainer);
const messagesInnerContainer = ref<HTMLElement | null>(null);
const readingArea = provideMessageReadingArea({
  viewport: messagesContainer,
  rows: messagesInnerContainer,
  active: listActive,
  all: () => !!props.screenshotMode || readingInteraction.selection.value,
  focus: readingInteraction.focus,
});
const {
  suspend: suspendScrollAnchor,
  resume: resumeScrollAnchor,
  cancelResume,
  rememberReadingAnchor,
  preserveReadingPosition,
  navigateToMessage,
  shouldStickToBottom,
  isNearBottom,
  onScroll: updateScrollAnchor,
  onWheel,
  onKeydown,
  onPointerdown,
  followBottom,
  pauseFollowing,
} = useMessageScrollAnchor({
  container: messagesContainer,
  autoScroll: () => settings.value.uiPreferences.autoScroll,
  threshold: () => settings.value.uiPreferences.autoScrollThreshold,
  resolveMessageOffset: (id) => {
    const index = props.messages.findIndex((message) => message.id === id);
    const slot = messagesInnerContainer.value?.children[index];
    const container = messagesContainer.value;
    if (!slot || !container) return;
    return (
      slot.getBoundingClientRect().top - container.getBoundingClientRect().top
    );
  },
});

// 暴露滚动容器供外部使用
const getScrollElement = () => messagesContainer.value;

// 暴露消息区当前宽度 (CSS px), 用于截图对话框 auto 模式采样
// 取滚动容器的 clientWidth (含左右内边距), 与用户视觉宽度一致
const getMessageAreaWidth = (): number => {
  return messagesContainer.value?.clientWidth ?? 0;
};

const { vMessageSize, layoutRevision } = useMessageHeights({
  readingArea,
  container: messagesInnerContainer,
  preferences: () => settings.value.uiPreferences,
  appearance: () => [
    settings.value.uiPreferences,
    settings.value.regexConfig,
    props.richTextStyleOptions,
    props.userRichTextStyleOptions,
    props.llmThinkRules,
    props.readonly,
  ],
  sessionId: () => scopedSessionId.value ?? props.sessionIndex?.id,
  screenshotMode: () => screenshotMode.value,
  onWidthChange: preserveReadingPosition,
});
provide(rendererLayoutRevisionKey, layoutRevision);

// 当前可见的消息索引 (1-based)
const currentVisibleIndex = ref(0);

// 追踪正在切换的消息 ID 和其在视口中的相对位置
const switchingMessageId = ref<string | null>(null);
const switchingMessageViewportOffset = ref<number>(0);
// 记录捕获时的原始滚动位置，用于检测浏览器强制修正
const switchingOriginalScrollTop = ref<number>(0);

// -------------------- ResizeObserver：内容高度变化时自动跟随底部 --------------------
let resizeObserver: ResizeObserver | null = null;
const onContentResize = () => {
  followBottom();
  // content-visibility 展开可能只改变消息坐标，scrollTop 保持原值。
  updateVisibleIndex();
  readingArea.refresh();
};

const setupResizeObserver = () => {
  disconnectResizeObserver();
  if (!listActive.value) return;
  const inner = messagesInnerContainer.value;
  if (!inner && !compressionTaskContainer.value) return;

  resizeObserver = new ResizeObserver(onContentResize);
  if (inner) resizeObserver.observe(inner);
  if (compressionTaskContainer.value)
    resizeObserver.observe(compressionTaskContainer.value);
};

const disconnectResizeObserver = () => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
};

watch(
  [messagesInnerContainer, compressionTaskContainer],
  () => {
    setupResizeObserver();
  },
  { flush: "post" }
);

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
    if (
      messagesContainer.value &&
      shouldStickToBottom.value &&
      settings.value.uiPreferences.autoScroll
    ) {
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
  cancelResume();
  shouldStickToBottom.value = true;
  if (messagesContainer.value) {
    const maxScroll =
      messagesContainer.value.scrollHeight -
      messagesContainer.value.clientHeight;
    messagesContainer.value.scrollTop = Math.max(0, maxScroll);
  }
};

// 滚动到顶部
const scrollToTop = () => {
  pauseFollowing();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({ top: 0, behavior: "smooth" });
  }
};
// Row shells keep navigable geometry while their content is outside the reading range.
const getMessageSlot = (id: string) => {
  const index = props.messages.findIndex((message) => message.id === id);
  return messagesInnerContainer.value?.children[index] as
    HTMLElement | undefined;
};

const MESSAGE_NAVIGATION_OFFSET = 120;

// 滚动到指定消息
const scrollToMessageId = (id: string) => {
  if (getMessageSlot(id)) {
    navigateToMessage({ id, offset: MESSAGE_NAVIGATION_OFFSET });
    readingArea.refresh();
  }
};

// 导航点与物理消息行分开，紧凑模式下覆盖整段提问与回复。
function scrollToNavigation(direction: "next" | "prev") {
  pauseFollowing();
  const container = messagesContainer.value;
  if (!container) return;
  if (isCompactMode.value) {
    const index =
      Math.max(0, navigationIndex.value - 1) + (direction === "next" ? 1 : -1);
    const point = navigationPoints.value[Math.max(0, index)];
    if (point) scrollToMessageId(point.anchorNodeId);
    else if (direction === "next") scrollToEnd();
    return;
  }
  const line =
    container.getBoundingClientRect().top + MESSAGE_NAVIGATION_OFFSET;
  const points =
    direction === "prev"
      ? [...navigationPoints.value].reverse()
      : navigationPoints.value;
  const point = points.find((point) => {
    const slot = getMessageSlot(point.anchorNodeId);
    if (!slot) return false;
    const top = slot.getBoundingClientRect().top;
    return direction === "next" ? top > line + 2 : top < line - 2;
  });
  if (point) scrollToMessageId(point.anchorNodeId);
}
const scrollToNext = () => scrollToNavigation("next");
const scrollToPrev = () => scrollToNavigation("prev");

// 更新当前可见索引
const updateVisibleIndex = () => {
  if (!messagesContainer.value || props.messages.length === 0) {
    currentVisibleIndex.value = 0;
    navigationIndex.value = 0;
    rememberReadingAnchor(null);
    return;
  }
  if (
    isNearBottom.value &&
    shouldStickToBottom.value &&
    settings.value.uiPreferences.autoScroll
  ) {
    currentVisibleIndex.value = props.messages.length;
    navigationIndex.value = navigationPoints.value.length;
    rememberReadingAnchor(null);
    return;
  }

  const containerRect = messagesContainer.value.getBoundingClientRect();
  const slots = messagesInnerContainer.value?.children;
  if (!slots?.length) return;
  const centerY = containerRect.top + containerRect.height / 2;

  // 外层 slot 与消息一一对应；二分查找避免每次滚动遍历全部富文本消息。
  let low = 0;
  let high = slots.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (slots[mid].getBoundingClientRect().bottom < centerY) low = mid + 1;
    else high = mid;
  }
  currentVisibleIndex.value = isNearBottom.value
    ? props.messages.length
    : low + 1;
  // Active question follows the same alignment line as clicking a navigation point.
  const referenceY = containerRect.top + MESSAGE_NAVIGATION_OFFSET + 2;
  let navigationLow = 0;
  let navigationHigh = navigationPoints.value.length - 1;
  while (navigationLow < navigationHigh) {
    const mid = Math.ceil((navigationLow + navigationHigh) / 2);
    const slot = getMessageSlot(navigationPoints.value[mid].anchorNodeId);
    if (slot && slot.getBoundingClientRect().top <= referenceY)
      navigationLow = mid;
    else navigationHigh = mid - 1;
  }
  navigationIndex.value = navigationPoints.value.length
    ? messagesContainer.value.scrollHeight -
        messagesContainer.value.clientHeight -
        messagesContainer.value.scrollTop <=
      2
      ? navigationPoints.value.length
      : navigationLow + 1
    : 0;
  const message = props.messages[low];
  if (message) {
    rememberReadingAnchor({
      id: message.id,
      offset: slots[low].getBoundingClientRect().top - containerRect.top,
    });
  }
};

watch(
  () => [isCompactMode.value, navigationPoints.value.length],
  () => {
    preserveReadingPosition();
    nextTick(updateVisibleIndex);
  },
  { flush: "pre" }
);

// 滚动事件处理
const onScroll = () => {
  if (!messagesContainer.value) return;
  const container = messagesContainer.value;
  // 阻断水平滚动，同时保留内容增长前的底部跟随意图。
  if (container.scrollLeft !== 0) container.scrollLeft = 0;
  updateScrollAnchor();

  updateVisibleIndex();
  readingArea.refresh();
};

/**
 * 激活底部锁定并立即滚动到底部。
 * ResizeObserver 会在后续内容高度变化（content-visibility 渐进渲染）时自动跟随。
 */
const activateBottomLock = () => {
  cancelResume();
  shouldStickToBottom.value = true;
  isNearBottom.value = true;
  nextTick(() => {
    if (messagesContainer.value && shouldStickToBottom.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
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
  () => props.messages.length,
  (newLength, oldLength) => {
    if (!settings.value.uiPreferences.autoScroll) return;

    const isNewMessage = newLength !== oldLength;

    if (isNewMessage) {
      // 消息从空变为非空：首次加载场景（刷新页面/打开应用恢复会话）
      if (oldLength === 0 && newLength > 0 && pendingInitialScroll.value) {
        pendingInitialScroll.value = false;
        activateBottomLock();
        return;
      }

      if (shouldStickToBottom.value || newLength === 1) {
        // 新消息加入时，如果原本就在底部，激活底部锁定
        shouldStickToBottom.value = true;
        scrollToBottom(true);
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

    const isAtBottom = shouldStickToBottom.value;

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
// 将作用域会话注入带 options 的生成动作（无作用域时保持原样）
type GenerationOptions = {
  modelId?: string;
  profileId?: string;
  agentId?: string;
  sessionId?: string;
};

function withScopedSession(
  options?: GenerationOptions
): GenerationOptions | undefined {
  const sessionId = scopedSessionId.value;
  if (!sessionId) return options;
  return { ...options, sessionId };
}

const handleReparseTools = async (
  nodeId: string,
  options?: { modelId?: string; profileId?: string }
) => {
  if (isSessionReadOnly.value) return;
  try {
    const { customMessage } = await import("@/utils/customMessage");
    customMessage.info("正在重新解析工具...");
    const temporaryModel =
      options?.modelId && options?.profileId
        ? { modelId: options.modelId, profileId: options.profileId }
        : null;
    const sessionId = scopedSessionId.value;
    if (sessionId) {
      await store.reparseNodeToolsInSession(nodeId, sessionId, {
        temporaryModel,
      });
    } else {
      await store.reparseNodeTools(nodeId, { temporaryModel });
    }
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

  const messageEl = getMessageSlot(messageId);
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

  const messageEl = getMessageSlot(switchingMessageId.value);

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

interface ListEmits {
  (e: "screenshot", messageId: string): void;
}
const emit = defineEmits<ListEmits>();

function messageActions(msg: ChatMessageNode) {
  type RequestOptions = Parameters<typeof store.regenerateFromNode>[1];
  const capture = () => captureSwitchingMessagePosition(msg.id);
  return {
    delete: () => guardedStore.deleteMessage(msg.id, scopedSessionId.value),
    regenerate: (options: RequestOptions) =>
      guardedStore.regenerateFromNode(msg.id, withScopedSession(options)),
    "switch-sibling": (direction: "prev" | "next") => {
      capture();
      guardedStore.switchToSiblingBranch(
        msg.id,
        direction,
        scopedSessionId.value
      );
    },
    "switch-branch": (id: string) => {
      capture();
      guardedStore.switchBranch(id, scopedSessionId.value);
    },
    "toggle-enabled": () =>
      guardedStore.toggleNodeEnabled(msg.id, scopedSessionId.value),
    edit: (content: string, attachments?: Asset[]) =>
      guardedStore.editMessage(
        msg.id,
        content,
        attachments,
        scopedSessionId.value
      ),
    "save-to-branch": (content: string, attachments?: Asset[]) =>
      guardedStore.createBranchFromEdit(
        msg.id,
        content,
        attachments,
        scopedSessionId.value
      ),
    abort: () => guardedStore.abortNodeGeneration(msg.id),
    continue: (options: RequestOptions) =>
      guardedStore.continueGeneration(msg.id, withScopedSession(options)),
    "create-branch": () => {
      capture();
      guardedStore.createBranch(msg.id, scopedSessionId.value);
    },
    "analyze-context": () => {
      guardedStore.contextAnalyzerNodeId = msg.id;
      guardedStore.contextAnalyzerVisible = true;
    },
    "reparse-tools": (options: Parameters<typeof handleReparseTools>[1]) =>
      handleReparseTools(msg.id, options),
    screenshot: () => emit("screenshot", msg.id),
    "compress-to-here": () => {
      if (isSessionReadOnly.value || !props.sessionIndex || !props.sessionDetail)
        return;
      void manualCompress(props.sessionIndex, props.sessionDetail, msg.id);
    },
    "update-translation": (
      translation: NonNullable<ChatMessageNode["metadata"]>["translation"]
    ) =>
      guardedStore.updateMessageTranslation(
        msg.id,
        translation,
        scopedSessionId.value
      ),
    "update-content": (content: string) =>
      guardedStore.editMessage(
        msg.id,
        content,
        undefined,
        scopedSessionId.value
      ),
    "update-role": (role: ChatMessageNode["role"]) =>
      guardedStore.updateNodeData(msg.id, { role }, scopedSessionId.value),
  };
}

defineExpose({
  scrollToBottom,
  scrollToEnd,
  scrollToTop,
  scrollToNext,
  scrollToPrev,
  scrollToMessageId,
  getScrollElement,
  currentVisibleIndex,
  navigationPoints,
  navigationIndex,
  isCompactMode,
  getMessageAreaWidth,
});
</script>

<template>
  <div class="message-list-container" :class="{ 'is-compact': isCompactMode }">
    <div
      ref="messagesContainer"
      class="message-list"
      :style="{
        overflowAnchor:
          (shouldStickToBottom && settings.uiPreferences.autoScroll) ||
          switchingMessageId
            ? 'none'
            : 'auto',
      }"
      @scroll="onScroll"
      @wheel.passive="onWheel"
      @keydown="onKeydown"
      @pointerdown="onPointerdown"
    >
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 开始新的对话吧！</p>
      </div>

      <div
        v-else
        ref="messagesInnerContainer"
        class="messages-container chat-message-rows"
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
        <MessageRow
          v-for="(msg, index) in messages"
          :key="msg.id"
          v-message-size="{
            message: msg,
            eager: index === messages.length - 1,
            presentation: rowLayoutKeys.get(msg.id),
          }"
          :session-index="sessionIndex"
          :session-detail="sessionDetail"
          :message="msg"
          :message-depth="messages.length - 1 - index"
          :is-sending="isSending"
          :screenshot-mode="screenshotMode"
          :readonly="isSessionReadOnly"
          :llm-think-rules="llmThinkRules"
          :rich-text-style-options="
            msg.role === 'user'
              ? userRichTextStyleOptions || richTextStyleOptions
              : richTextStyleOptions
          "
          :bubble-layout="bubbleLayout"
          :layout="getMessageLayout(index)"
          :sibling-info="getMessageSiblings(msg.id)"
          :compressed="compressedNodeIds.has(msg.id)"
          :show-avatar="showAvatar"
          :hide-header-avatar="shouldHideHeaderAvatar"
          :outside-header="shouldUseOutsideHeader(msg, getMessageLayout(index))"
          :presentation="presentation.rows.get(msg.id)!"
          :group="
            presentation.groupById.get(presentation.rows.get(msg.id)!.groupId)!
          "
          :character-counts="characterCounts"
          :actions="messageActions(msg)"
        />
      </div>
      <div
        v-if="compressionTask && !screenshotMode"
        ref="compressionTaskContainer"
      >
        <ContextCompressionTask
          :task="compressionTask"
          :readonly="isSessionReadOnly"
          @cancel="guardedStore.cancelContextCompression(viewSessionId)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list-container.is-compact .message-list {
  padding-right: 56px;
}

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
  /* 阅读历史时由浏览器抵消屏外消息从占位高度到真实高度的变化。
   * 底部跟随与分支定位期间通过内联样式接管滚动。 */
  overflow-anchor: auto;
  /* 彻底阻断滚动链传播，防止滚动溢出到 App 容器 */
  overscroll-behavior: contain;
  /* 渲染隔离：size 确保内容高度变化不触发父级重排，layout 和 paint 提升渲染性能 */
  contain: size layout paint;
  /* 为末条消息下方的浮层操作栏保留完整空间。 */
  --message-list-bottom-space: 64px;
  padding: 120px 20px var(--message-list-bottom-space) 28px;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * 整行消息使用 content-visibility 开启虚拟渲染，绘制边界覆盖外置操作栏。
 * 在 Vite 8 / Lightning CSS 环境下，确保这些现代属性不被误删或优化掉
 */
.messages-container > .message-slot {
  /* 浮层按实际高度扩展绘制边界，换行时保留全部操作和按钮阴影。 */
  overflow-clip-margin: var(--message-toolbar-clip-margin, 48px);
  content-visibility: auto !important;
  contain-intrinsic-size: none 500px !important;
}

/* 最后一项消息禁用虚拟渲染，确保底部锚定计算准确，防止滚动回弹 */
.messages-container > .message-slot:last-child {
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
