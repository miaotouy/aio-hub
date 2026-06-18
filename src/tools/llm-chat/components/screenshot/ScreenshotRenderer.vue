<script setup lang="ts">
/**
 * 截图渲染器: 离屏 DOM 镜像, 专门为截图服务。
 *
 * 关键设计:
 * - 复用 `useMessageLayout`, 排版与主列表完全一致
 * - 固定 720px 宽度, 排版稳定
 * - `provide("screenshotMode", true)` 注入给子组件, 隐藏交互
 * - 禁用 `content-visibility`, 全量展开渲染
 * - 暴露 `getMessageElements()` 返回所有 `.message-slot` 节点, 供截图工具使用
 */
import { computed, provide, ref } from "vue";
import type { ChatMessageNode } from "../../types";
import type {
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../types/session";
import { useMessageLayout } from "../../composables/ui/useMessageLayout";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import ChatMessage from "../message/ChatMessage.vue";
import CompressionMessage from "../message/CompressionMessage.vue";
import ToolCallMessage from "../message/ToolCallMessage.vue";
import MessageExternalAvatar from "../message/MessageExternalAvatar.vue";
import MessageHeader from "../message/MessageHeader.vue";

export type CollapseStrategy =
  | "preserve"
  | "config"
  | "override-expand"
  | "override-collapse";

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
provide("screenshotCollapseStrategy", computed(() => props.collapseStrategy));

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
  getSiblings: (id) => store.getSiblings(id),
  isNodeInActivePath: (id) => store.isNodeInActivePath(id),
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
    :class="['screenshot-mode', `mode-${bubbleLayout.mode}`]"
    :style="{
      ...bubbleLayoutVars,
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
              :hide-avatar="shouldHideHeaderAvatar"
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
              :hide-header-avatar="shouldHideHeaderAvatar"
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
  gap: 12px;
  padding: 0;
  width: 100%;
}

/* mode-card 默认布局透传主列表的样式 (全宽) */
.messages-container.mode-card .message-slot {
  width: 100%;
}

/* 隐藏滚动条 */
:deep(*) {
  scrollbar-width: none !important;
}
:deep(*::-webkit-scrollbar) {
  display: none !important;
}
</style>
