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
import { ref, computed } from "vue";
import type {
  ChatMessageNode,
  ChatSessionIndex,
  ChatSessionDetail,
} from "../../types";
import type { Asset } from "@/types/asset-management";
import MessageHeader from "./MessageHeader.vue";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";
import MessageKnowledgeReference from "./MessageKnowledgeReference.vue";

import type { ButtonVisibility } from "../../types";
import { useTranslation } from "../../composables/chat/useTranslation";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { customMessage } from "@/utils/customMessage";
import { resolveMessageDisplayStatus } from "../../utils/messageStatus";

interface Props {
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  buttonVisibility?: ButtonVisibility;
  messageDepth?: number;
  isCompressed?: boolean; // 是否因为上下文压缩而视作禁用
  /** 是否隐藏消息头部内的头像（气泡模式外置头像场景使用） */
  hideHeaderAvatar?: boolean;
  /** 是否隐藏整个消息头部（气泡模式外置 header 场景使用） */
  hideHeader?: boolean;
  /** 是否处于截图模式：隐藏 menubar,屏蔽 hover 边框变色 */
  screenshotMode?: boolean;
}

interface Emits {
  (e: "delete"): void;
  (e: "regenerate", options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled"): void;
  (e: "edit", newContent: string, attachments?: Asset[]): void;
  (e: "copy"): void;
  (e: "abort"): void;
  (e: "continue", options?: { modelId?: string; profileId?: string }): void;
  (e: "create-branch"): void;
  (e: "analyze-context"): void;
  (
    e: "reparse-tools",
    options?: { modelId?: string; profileId?: string }
  ): void;
  (e: "save-to-branch", newContent: string, attachments?: Asset[]): void;
  (
    e: "update-translation",
    translation:
      | NonNullable<NonNullable<ChatMessageNode["metadata"]>["translation"]>
      | undefined
  ): void;
  (e: "screenshot"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 翻译相关
const { translateText } = useTranslation();
const { settings } = useChatSettings();
const isTranslating = ref(false);
const translationContent = ref("");

// 编辑状态
const isEditing = ref(false);

// 计算属性
const isDisabled = computed(
  () => props.message.isEnabled === false || props.isCompressed
);
const isPresetDisplay = computed(
  () => props.message.metadata?.isPresetDisplay === true
);
const isLiveGreeting = computed(
  () =>
    props.message.metadata?.isGreeting === true &&
    props.message.metadata?.greetingLive === true
);

const messageDisplayStatus = computed(
  () => resolveMessageDisplayStatus(props.message) || props.message.status
);

// 消息根元素引用，暴露给虚拟列表用于精确测量
const messageRef = ref<HTMLElement | null>(null);

// 开始编辑
const startEdit = () => {
  isEditing.value = true;
};

// 保存编辑
const saveEdit = (newContent: string, attachments?: Asset[]) => {
  emit("edit", newContent, attachments);
  isEditing.value = false;
};

// 保存到分支
const onSaveToBranch = (newContent: string, attachments?: Asset[]) => {
  emit("save-to-branch", newContent, attachments);
  isEditing.value = false; // 保存后同样退出编辑模式
};

// 事件处理函数（避免模板中的隐式 any）
const onRegenerate = (options?: { modelId?: string; profileId?: string }) =>
  emit("regenerate", options);
const onContinue = (options?: { modelId?: string; profileId?: string }) =>
  emit("continue", options);
const onSwitchSibling = (direction: "prev" | "next") =>
  emit("switch-sibling", direction);
const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
};

// 暴露给虚拟列表用于精确测量的 ref
const getElement = () => messageRef.value;

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
  } catch (error) {
    console.error("复制失败", error);
  }
};

// 翻译消息
const handleTranslate = async (targetLang?: string) => {
  if (isTranslating.value) return;

  const content = props.message.content;
  if (!content.trim()) {
    customMessage.warning("消息内容为空，无法翻译");
    return;
  }

  // 确定目标语言
  const lang =
    targetLang || settings.value.translation.messageTargetLang || "Chinese";

  isTranslating.value = true;
  translationContent.value = "";

  try {
    const result = await translateText(
      content,
      (chunk) => {
        translationContent.value += chunk;
      },
      undefined,
      lang // 传递目标语言
    );

    // 翻译完成，发射事件更新消息节点
    const translation = {
      content: result,
      targetLang: lang,
      modelIdentifier: settings.value.translation.modelIdentifier,
      timestamp: Date.now(),
      displayMode: "both" as const, // 默认显示双语
      visible: true, // 翻译完成后默认显示
    };

    emit("update-translation", translation);
    customMessage.success("翻译完成");
  } catch (error) {
    // 错误已在 useTranslation 中处理
  } finally {
    isTranslating.value = false;
  }
};

// 切换翻译模式
const handleChangeTranslationMode = (mode: any) => {
  if (!props.message.metadata?.translation) return;

  const newTranslation = {
    ...props.message.metadata.translation,
    displayMode: mode,
  };

  emit("update-translation", newTranslation);
};

// 切换翻译显示状态
const handleToggleTranslationVisible = () => {
  if (!props.message.metadata?.translation) return;

  const newTranslation = {
    ...props.message.metadata.translation,
    visible: !props.message.metadata.translation.visible,
  };

  emit("update-translation", newTranslation);
};

// 暴露方法供父组件调用
defineExpose({
  startEdit,
  getElement,
});
</script>

<template>
  <div
    ref="messageRef"
    :data-message-id="message.id"
    data-testid="chat-message"
    :data-message-role="message.role"
    :data-message-status="messageDisplayStatus"
    :data-agent-id="message.metadata?.agentId || undefined"
    :class="[
      'chat-message',
      `message-${message.role}`,
      {
        'is-disabled': isDisabled,
        'is-preset-display': isPresetDisplay,
        'is-live-greeting': isLiveGreeting,
        'screenshot-mode': props.screenshotMode,
      },
    ]"
  >
    <!-- 背景层：单一背景，模糊由所属的 .glass-region 区域层统一提供 -->
    <div class="message-background-container"></div>

    <!-- 内容层：提高层级 -->
    <div
      class="message-inner"
      data-testid="chat-message-status"
      :data-message-status="messageDisplayStatus"
    >
      <MessageHeader
        v-if="!hideHeader"
        :message="message"
        :hide-avatar="hideHeaderAvatar"
        :screenshot-mode="props.screenshotMode"
      />

      <MessageKnowledgeReference
        v-if="message.knowledgeReference"
        :reference="message.knowledgeReference"
      />

      <MessageContent
        :session-index="props.sessionIndex"
        :session-detail="props.sessionDetail"
        :message="message"
        :is-editing="isEditing"
        :is-translating="isTranslating"
        :translation-content="translationContent"
        :llm-think-rules="llmThinkRules"
        :rich-text-style-options="richTextStyleOptions"
        :message-depth="messageDepth"
        :screenshot-mode="props.screenshotMode"
        @save-edit="saveEdit"
        @cancel-edit="cancelEdit"
        @save-to-branch="onSaveToBranch"
      />
    </div>

    <!-- 悬浮操作栏（始终显示，除非正在编辑；截图模式完全不渲染） -->
    <div class="menubar-wrapper" v-if="!isEditing && !props.screenshotMode">
      <MessageMenubar
        :message="message"
        :is-sending="isSending"
        :siblings="props.siblings"
        :current-sibling-index="props.currentSiblingIndex"
        :button-visibility="props.buttonVisibility"
        @copy="copyMessage"
        @edit="startEdit"
        @delete="emit('delete')"
        @regenerate="onRegenerate"
        @toggle-enabled="emit('toggle-enabled')"
        @switch="onSwitchSibling"
        @switch-branch="onSwitchBranch"
        @abort="emit('abort')"
        @continue="onContinue"
        @create-branch="emit('create-branch')"
        @analyze-context="emit('analyze-context')"
        @screenshot="emit('screenshot')"
        @reparse-tools="(opts: any) => emit('reparse-tools', opts)"
        @translate="handleTranslate"
        @change-translation-mode="handleChangeTranslationMode"
        @toggle-translation-visible="handleToggleTranslationVisible"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  position: relative;
  display: flow-root; /* 创建 BFC，确保包含内部所有元素且高度计算准确 */
  padding: 16px;
  /* 移除原有的背景和边框样式，移交给 .message-background */
  /* 严禁在虚拟滚动的子项上使用高度相关的 transition，会导致测量偏移 */
}

/* 背景层容器：单一半透明填充，模糊由 .glass-region 提供 */
.message-background-container {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-color: var(--card-bg);
  /* 容器本身负责圆角 */
  border-radius: 8px;
  overflow: hidden; /* 确保背景不溢出圆角 */
}

/* 独立的边框层：避免被 overflow: hidden 裁剪圆角 */
.chat-message::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  transition: border-color 0.2s;
}

/* 内容层样式 */
.message-inner {
  position: relative;
  z-index: 1;
}

/* Hover 效果迁移：hover 父容器，改变独立边框层的颜色 */
.chat-message:hover::after {
  border-color: var(--primary-color);
}

.chat-message.is-live-greeting::after {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 45%,
    var(--border-color)
  );
  border-style: dashed;
}

/* 悬停时显示操作栏 */
.chat-message:hover .menubar-wrapper {
  opacity: 1;
}

.menubar-wrapper {
  position: sticky;
  bottom: 8px;
  display: flex;
  justify-content: flex-end;
  /* 通过负margin覆盖在内容上，消除占位 */
  margin-top: -46px;
  z-index: 10;
  padding-right: 12px;

  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none; /* 避免透明层阻挡点击 */
}

.menubar-wrapper > * {
  pointer-events: auto; /* 恢复按钮点击 */
}

/* 禁用状态样式 */
.chat-message.is-disabled {
  opacity: 0.5;
}

.chat-message.is-disabled :deep(.message-text) {
  color: var(--text-color-light);
}
</style>
