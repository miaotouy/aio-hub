<script setup lang="ts">
/**
 * 截图渲染器: 离屏 DOM 镜像, 专门为 modern-screenshot 截图服务。
 *
 * 使用方式:
 * - 调用方 (ShareScreenshotDialog) 把它挂载在 position: fixed; left: -99999px
 *   的离屏容器里, 用户视觉上完全看不到, 仅供 domToPng / domToCanvas 读取。
 * - 截图通过 getMessageElements() 返回所有 .message-slot 节点, 由调用方
 *   拼接 / 缩放 / 复制 / 保存。
 *
 * 关键设计:
 * - 复用 useMessageLayout, 排版与主列表完全一致
 * - 固定 720px 宽度, 排版稳定 (气泡模式不依赖父容器宽度)
 * - provide("screenshotMode", true) 注入给子组件, 隐藏交互
 * - 禁用 content-visibility, 强制全量展开渲染 (避免离屏内容被回收)
 * - 接受 elementToggles 覆盖系统设置, 影响最终截图内容
 */
import { computed, provide, ref } from "vue";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import { useMessageLayout } from "../../composables/ui/useMessageLayout";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import ChatMessage from "../message/ChatMessage.vue";
import CompressionMessage from "../message/CompressionMessage.vue";
import ToolCallMessage from "../message/ToolCallMessage.vue";
import MessageExternalAvatar from "../message/MessageExternalAvatar.vue";
import MessageHeader from "../message/MessageHeader.vue";
import {
  type CollapseStrategy,
  type LayoutOverrides,
  type ScreenshotElementOverrides,
  SCREENSHOT_OVERRIDES_KEY,
} from "./screenshotTypes";

const DEFAULT_OVERRIDES: ScreenshotElementOverrides = {
  showAvatar: true,
  showTimestamp: true,
  showTokenCount: true,
  showTokenCountForBlocks: true,
  showCharCount: true,
  showModelInfo: true,
  showPerformanceMetrics: true,
};

interface Props {
  messages: ChatMessageNode[];
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  isSending?: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  userRichTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  /** 折叠策略, 默认 preserve (维持当前状态, 由主列表提供) */
  collapseStrategy?: CollapseStrategy;
  /** 渲染宽度 (CSS px), 默认 720 */
  width?: number;
  /** 元素显示覆盖, 控制截图中各元素的可见性 */
  elementToggles?: ScreenshotElementOverrides;
  /** 临时布局覆盖 (与系统设置合并, 不修改系统设置) */
  layoutOverrides?: LayoutOverrides;
}

const props = withDefaults(defineProps<Props>(), {
  isSending: false,
  collapseStrategy: "config",
  width: 720,
});

const store = useLlmChatStore();
const { settings } = useChatSettings();

const screenshotMode = ref(true);
provide("screenshotMode", screenshotMode);
provide(
  "screenshotCollapseStrategy",
  computed(() => props.collapseStrategy)
);

// ----- 元素覆盖: 将 elementToggles provide 给子组件 -----
const elementOverrides = computed<ScreenshotElementOverrides>(
  () => props.elementToggles ?? DEFAULT_OVERRIDES
);
provide(SCREENSHOT_OVERRIDES_KEY, elementOverrides);

const {
  compressedNodeIds,
  getMessageLayout,
  getMessageSiblings,
  bubbleLayout,
  bubbleLayoutVars,
  isBubbleMode,
  avatarPlacement,
  headerPlacement,
  showAvatar: layoutShowAvatar,
  shouldHideHeaderAvatar,
  shouldUseOutsideHeader,
} = useMessageLayout({
  messages: computed(() => props.messages),
  settings,
  getSiblings: (id) => store.getSiblings(id),
  isNodeInActivePath: (id) => store.isNodeInActivePath(id),
  layoutOverrides: () => props.layoutOverrides,
});

// 覆盖 showAvatar: 当 elementToggles.showAvatar 为 false 时强制隐藏头像
const showAvatar = computed(
  () => elementOverrides.value.showAvatar && layoutShowAvatar.value
);

// 覆盖 shouldHideHeaderAvatar: 当 elementToggles.showAvatar 为 false 时强制隐藏 header 内头像
const screenshotHideHeaderAvatar = computed(() => {
  if (!elementOverrides.value.showAvatar) return true;
  return shouldHideHeaderAvatar.value;
});

// ----- CSS 类: 根据 elementToggles 生成隐藏类 -----
const elementHideClasses = computed(() => {
  const o = elementOverrides.value;
  const classes: string[] = [];
  if (!o.showTimestamp) classes.push("hide-timestamp");
  if (!o.showModelInfo) classes.push("hide-model-info");
  if (!o.showPerformanceMetrics) classes.push("hide-performance");
  if (!o.showTokenCount) classes.push("hide-token-count");
  if (!o.showCharCount) classes.push("hide-char-count");
  if (!o.showAvatar) classes.push("hide-avatar");
  return classes;
});

// ----- 字体大小覆盖: 转为 CSS 变量 --message-font-size -----
// 仅当 layoutOverrides.fontSize 是有效数字时设置, 否则不输出 (回退到子组件 v-bind 读取系统设置)
const messageFontSizeStyle = computed<Record<string, string>>(() => {
  const fs = props.layoutOverrides?.fontSize;
  if (typeof fs !== "number" || !Number.isFinite(fs) || fs <= 0) return {} as Record<string, string>;
  return { "--message-font-size": `${fs}px` };
});

const rootRef = ref<HTMLElement | null>(null);

/** 暴露给外部截图工具: 收集所有可截图的消息节点 */
function getMessageElements(): HTMLElement[] {
  const root = rootRef.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(".message-slot"));
}

defineExpose({
  getMessageElements,
  rootRef,
});
</script>

<template>
  <div
    ref="rootRef"
    class="screenshot-renderer"
    :class="[
      'screenshot-mode',
      `mode-${bubbleLayout.mode}`,
      ...elementHideClasses,
    ]"
    :style="{
      ...bubbleLayoutVars,
      ...messageFontSizeStyle,
      '--screenshot-width': `${props.width}px`,
    }"
  >
    <div
      class="messages-container"
      :class="[
        `mode-${bubbleLayout.mode}`,
        {
          'avatar-outside':
            isBubbleMode && showAvatar && avatarPlacement === 'outside',
          'header-outside': isBubbleMode && headerPlacement === 'outside',
        },
      ]"
    >
      <template v-for="(msg, index) in messages" :key="msg.id">
        <div
          class="message-slot"
          :data-role="getMessageLayout(index).role"
          :data-align="getMessageLayout(index).align"
          :data-avatar-placement="avatarPlacement"
          :data-message-id="msg.id"
          :data-header-outside="
            shouldUseOutsideHeader(msg, getMessageLayout(index))
              ? 'true'
              : 'false'
          "
        >
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

          <div
            v-if="shouldUseOutsideHeader(msg, getMessageLayout(index))"
            class="message-body"
          >
            <MessageHeader
              class="external-header"
              :message="msg"
              :hide-avatar="screenshotHideHeaderAvatar"
              :screenshot-mode="true"
            />
            <ChatMessage
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :is-compressed="compressedNodeIds.has(msg.id)"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
              :llm-think-rules="llmThinkRules"
              :hide-header="true"
              :rich-text-style-options="
                msg.role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
            />
          </div>

          <template v-else>
            <CompressionMessage
              v-if="msg.metadata?.isCompressionNode"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
              :screenshot-mode="true"
            />

            <ToolCallMessage
              v-else-if="msg.role === 'tool'"
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
            />

            <ChatMessage
              v-else
              :session-index="props.sessionIndex"
              :session-detail="props.sessionDetail"
              :message="msg"
              :is-compressed="compressedNodeIds.has(msg.id)"
              :message-depth="messages.length - 1 - index"
              :is-sending="isSending"
              :screenshot-mode="true"
              :siblings="getMessageSiblings(msg.id).siblings"
              :current-sibling-index="getMessageSiblings(msg.id).currentIndex"
              :llm-think-rules="llmThinkRules"
              :hide-header-avatar="screenshotHideHeaderAvatar"
              :rich-text-style-options="
                msg.role === 'user'
                  ? userRichTextStyleOptions || richTextStyleOptions
                  : richTextStyleOptions
              "
            />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.screenshot-renderer {
  /* 固定宽度, 排版稳定 (由父容器负责定位与缩放) */
  width: var(--screenshot-width, 720px);
  min-width: var(--screenshot-width, 720px);
  max-width: var(--screenshot-width, 720px);
  box-sizing: border-box;
  overflow: visible !important;
}

/* 强制全量展开 — 关键, 否则视口外消息渲染不出来 */
:deep(.chat-message),
:deep(.tool-call-message),
:deep(.compression-message) {
  content-visibility: visible !important;
  contain-intrinsic-size: auto 0px !important;
}

/* 容器不需要滚动 */
.messages-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  width: 100%;
  box-sizing: border-box;
}
/* Bubble 模式: 消息间距比卡片模式更大, 与 MessageList 保持一致 */
.messages-container.mode-bubble {
  gap: 12px;
}

/* ===========================================================
 * 卡片模式：message-slot 仅作为透明 wrapper（不改变现有视觉）
 * 必须显式声明，因为 MessageList.vue 的对应样式是 scoped，
 * 不会作用到本组件渲染出来的元素上。
 * =========================================================== */
.messages-container.mode-card .message-slot {
  display: block;
  width: 100%;
  min-width: 0;
}

/* ===========================================================
 * 气泡模式：message-slot 作为对齐容器
 * 完整复刻 MessageList.vue 中的 bubble 布局规则，
 * 否则 bubble 模式下的对齐、限宽、外置头像/header 全部失效，
 * 进而导致 .message-slot 收缩到气泡自然宽度，截出来变成窄条。
 * =========================================================== */
.messages-container.mode-bubble .message-slot {
  display: flex;
  width: 100%;
  align-items: flex-start;
  /* min-width: 0 防止 flex item 内容溢出造成横向滚动 */
  min-width: 0;
  box-sizing: border-box;
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

/* 气泡子元素的宽度限制（避免气泡被父容器撑满成全宽） */
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
/* 外置头像: 气泡宽度需要扣掉头像列, 否则右对齐气泡会被推到边缘
 * 关键: :not([data-align="center"]) 居中消息不挂头像, 无需扣减 */
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
/* 圆角同步: 覆写消息组件内部的 8px 圆角为可配置值 (含背景容器与 ::after)
 * 缺少这条, 气泡模式截图出来的圆角会保持组件默认的 8px, 与系统设置不符 */
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

/* 外置头像：与气泡顶部对齐，flex-direction row-reverse 让头像贴在气泡外侧 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"] {
  align-items: flex-start;
  gap: var(--avatar-outside-gap, 8px);
}
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"][data-align="right"] {
  flex-direction: row-reverse;
  /* row-reverse 下, flex-start 才是右对齐, 覆盖默认的 flex-end */
  justify-content: flex-start;
}
/* 外置头像的透明占位 (tool/system 行) 保持气泡缩进对齐, 但不响应交互 */
.messages-container.mode-bubble.avatar-outside
  .message-slot[data-avatar-placement="outside"]
  > .message-external-avatar {
  pointer-events: none;
}

/* 外置 Header 容器：让 header 紧贴气泡上方 */
.messages-container.mode-bubble .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--header-outside-gap, 4px);
  min-width: 0;
  width: fit-content;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  .message-body {
  align-items: flex-end;
}
.messages-container.mode-bubble .message-body > .chat-message {
  max-width: 100%;
  width: fit-content;
}

/* 右对齐通用镜像：保证 header / 工具头 / 底部信息的视觉镜像 */
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
/* header-right 原 margin-left: auto 与 row-reverse 冲突, 镜像 */
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header:not(.external-header) .header-right) {
  margin-left: 0;
  margin-right: auto;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-header .message-info) {
  align-items: flex-end;
  text-align: right;
}
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.tool-call-message) {
  flex-direction: row-reverse;
}
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
/* ----------------------------------------------------------
 * 气泡模式: 底部信息 (.message-meta) 与消息方向对齐
 * 截图模式下 menubar 整体被隐藏, 但 meta (token/字数/性能) 仍需正确对齐
 * ---------------------------------------------------------- */
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
.messages-container.mode-bubble
  .message-slot[data-align="right"]
  :deep(.message-meta .error-info) {
  flex-direction: row-reverse;
  text-align: right;
}

/* 隐藏滚动条 */
:deep(*) {
  scrollbar-width: none !important;
}
:deep(*::-webkit-scrollbar) {
  display: none !important;
}

/* ===== 元素覆盖: 根据 elementToggles 隐藏对应元素 ===== */

/* 隐藏头像: 外置头像 */
.hide-avatar :deep(.message-external-avatar) {
  display: none !important;
}

/* 隐藏头像: header 内头像 (卡片模式或气泡模式内嵌头像) */
.hide-avatar :deep(.message-header .header-left .avatar),
.hide-avatar :deep(.message-header .header-left .tool-avatar) {
  display: none !important;
}

/* 隐藏模型信息/副标题 */
.hide-model-info :deep(.message-subtitle) {
  display: none !important;
}

/* 隐藏时间戳 */
.hide-timestamp :deep(.message-time) {
  display: none !important;
}

/* 隐藏性能指标 */
.hide-performance :deep(.performance-stats) {
  display: none !important;
}

/* 隐藏 Token 统计 (按 data-meta-type 精确匹配) */
.hide-token-count :deep(.usage-info[data-meta-type="token"]) {
  display: none !important;
}

/* 隐藏字数统计 (按 data-meta-type 精确匹配) */
.hide-char-count :deep(.usage-info[data-meta-type="char"]) {
  display: none !important;
}

/* Token + 字数都隐藏时, 隐藏整个 meta 区域 */
.hide-token-count.hide-char-count :deep(.message-meta) {
  display: none !important;
}

/* 只有字数统计开启时, 隐藏 token 统计后 meta 区域仍然需要显示 */
.hide-token-count:not(.hide-char-count) :deep(.message-meta) {
  display: block !important;
}

/* 只有 token 统计开启时 */
.hide-char-count:not(.hide-token-count) :deep(.message-meta) {
  display: block !important;
}
</style>
