<script setup lang="ts">
import { computed } from "vue";
import "./messageRowLayout.css";
import type {
  ChatMessageNode,
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../types";
import type { BubbleLayoutConfig } from "../../types/settings";
import type {
  MessageLayoutInfo,
  MessageSiblingInfo,
} from "../../composables/ui/useMessageLayout";
import type {
  MessagePresentationRow,
  MessagePresentationGroup,
} from "../../utils/messagePresentation";
import { getMessageStatusPresentation } from "../../utils/messageStatus";
import ChatMessage from "./ChatMessage.vue";
import CompressionMessage from "./CompressionMessage.vue";
import ToolCallMessage from "./ToolCallMessage.vue";
import MessageExternalAvatar from "./MessageExternalAvatar.vue";
import MessageHeader from "./MessageHeader.vue";
import MessageGroupFooter from "./MessageGroupFooter.vue";

const props = defineProps<{
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  message: ChatMessageNode;
  messageDepth: number;
  isSending: boolean;
  screenshotMode?: boolean;
  readonly?: boolean;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  bubbleLayout: BubbleLayoutConfig;
  layout: MessageLayoutInfo;
  siblingInfo: MessageSiblingInfo;
  compressed: boolean;
  showAvatar: boolean;
  hideHeaderAvatar: boolean;
  outsideHeader: boolean;
  presentation: MessagePresentationRow;
  group: MessagePresentationGroup;
  characterCounts: Map<string, number>;
  actions?: Record<string, (...args: any[]) => unknown>;
}>();
const compact = computed(() => props.bubbleLayout.mode === "compact");
const hideHeader = computed(
  () => props.outsideHeader || (compact.value && !props.presentation.first)
);
const groupStatusMessage = computed(() =>
  compact.value && props.presentation.grouped && props.presentation.first
    ? props.group.activityNode
    : undefined
);
const localStatus = computed(() =>
  hideHeader.value && !props.outsideHeader
    ? getMessageStatusPresentation(props.message)
    : null
);
const forwardedActions = computed(() => {
  const actions = props.actions ?? {};
  const compression = new Set([
    "toggle-enabled",
    "delete",
    "update-content",
    "update-role",
  ]);
  return Object.fromEntries(
    Object.entries(actions).filter(([name]) =>
      props.message.metadata?.isCompressionNode
        ? compression.has(name)
        : ![
            "update-content",
            "update-role",
            ...(props.message.role === "tool" ? ["reparse-tools"] : []),
          ].includes(name)
    )
  );
});
const common = computed(() => ({
  sessionIndex: props.sessionIndex,
  sessionDetail: props.sessionDetail,
  message: props.message,
  messageDepth: props.messageDepth,
  isSending: props.isSending,
  screenshotMode: props.screenshotMode,
  readonly: props.readonly,
  llmThinkRules: props.llmThinkRules,
  richTextStyleOptions: props.richTextStyleOptions,
}));
</script>
<template>
  <div
    class="message-slot"
    :class="{
      'is-compact': compact,
      'group-start': presentation.first,
      'group-end': presentation.last,
    }"
    :data-message-id="message.id"
    :data-role="layout.role"
    :data-align="layout.align"
    :data-layout-mode="bubbleLayout.mode"
    :data-avatar-placement="bubbleLayout.avatarPlacement"
    :data-header-outside="outsideHeader ? 'true' : 'false'"
  >
    <MessageExternalAvatar
      v-if="
        bubbleLayout.mode === 'bubble' &&
        showAvatar &&
        bubbleLayout.avatarPlacement === 'outside' &&
        layout.align !== 'center'
      "
      :message="message"
      :size="bubbleLayout.avatarSize"
    />
    <div class="message-body" :class="{ 'has-external-header': outsideHeader }">
      <MessageHeader
        v-if="outsideHeader"
        class="external-header"
        :message="message"
        :hide-avatar="hideHeaderAvatar"
        :inline-status="true"
        :screenshot-mode="screenshotMode"
        :readonly="readonly"
      />
      <div
        v-if="localStatus && !screenshotMode"
        class="segment-status"
        :title="localStatus.detail"
        role="status"
      >
        {{ localStatus.label }}
      </div>
      <CompressionMessage
        v-if="message.metadata?.isCompressionNode"
        v-bind="common"
        v-on="forwardedActions"
      />
      <ToolCallMessage
        v-else-if="message.role === 'tool'"
        v-bind="common"
        :siblings="siblingInfo.siblings"
        :current-sibling-index="siblingInfo.currentIndex"
        :hide-statistics="compact && presentation.grouped"
        :compact-actions="compact"
        v-on="forwardedActions"
      />
      <ChatMessage
        v-else
        v-bind="common"
        :siblings="siblingInfo.siblings"
        :current-sibling-index="siblingInfo.currentIndex"
        :is-compressed="compressed"
        :header-status-message="groupStatusMessage"
        :hide-header="hideHeader"
        :hide-header-avatar="hideHeaderAvatar"
        :inline-status="bubbleLayout.mode === 'bubble'"
        :hide-statistics="compact && presentation.grouped"
        :compact-actions="compact"
        v-on="forwardedActions"
      />
      <MessageGroupFooter
        v-if="compact && presentation.grouped && presentation.last"
        :group="group"
        :character-counts="characterCounts"
        :screenshot-mode="screenshotMode"
      />
    </div>
  </div>
</template>
<style scoped>
.message-body {
  min-width: 0;
}
.is-compact {
  position: relative;
  width: 100%;
}
.is-compact.group-start {
  padding-top: 20px;
}
.is-compact:first-child {
  padding-top: 0;
}
.is-compact .message-body {
  width: 100%;
}
.is-compact :deep(.message-surface) {
  padding: 8px 16px;
}
.is-compact :deep(.message-surface::after),
.is-compact :deep(.message-background-container) {
  display: none;
}
.is-compact[data-role="user"] :deep(.message-surface) {
  background: var(--card-bg);
  border-radius: var(--bubble-radius, 8px);
}
.is-compact[data-role="tool"] :deep(.tool-call-message) {
  padding: 10px 14px;
  margin: 4px 16px;
  width: auto;
}
.is-compact:not(.group-end) {
  padding-bottom: 4px;
}
.is-compact:hover,
.is-compact:focus-within {
  z-index: 20;
}
.segment-status {
  padding: 2px 16px;
  font-size: 12px;
  color: var(--text-color-light);
}
</style>
