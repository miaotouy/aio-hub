<script setup lang="ts">
import { ref, computed } from "vue";
import { useResizeObserver } from "@vueuse/core";
import type { ChatMessageNode } from "../../types";
import type { Asset } from "@/types/asset-management";
import MessageHeader from "./MessageHeader.vue";
import MessageContent from "./MessageContent.vue";
import MessageMenubar from "./MessageMenubar.vue";

import type { ButtonVisibility } from "../../types";

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
  llmThinkRules?: import("@/tools/rich-text-renderer/types").LlmThinkRule[];
  richTextStyleOptions?: import("@/tools/rich-text-renderer/types").RichTextRendererStyleOptions;
  buttonVisibility?: ButtonVisibility;
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
  (e: "create-branch"): void;
  (e: "analyze-context"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 编辑状态
const isEditing = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);
const isPresetDisplay = computed(() => props.message.metadata?.isPresetDisplay === true);

// ===== 背景分块渲染逻辑 (解决超长消息 backdrop-filter 失效问题) =====
const messageRef = ref<HTMLElement | null>(null);
const messageHeight = ref(0);
const BLOCK_SIZE = 2000; // 每个背景块的高度限制在 2000px 以内

useResizeObserver(messageRef, (entries) => {
  const entry = entries[0];
  const { height } = entry.contentRect;
  messageHeight.value = height;
});

// 计算需要多少个背景块
const backgroundBlocks = computed(() => {
  if (messageHeight.value <= 0) return 1;
  return Math.ceil(messageHeight.value / BLOCK_SIZE);
});

// 开始编辑
const startEdit = () => {
  isEditing.value = true;
};

// 保存编辑
const saveEdit = (newContent: string, attachments?: Asset[]) => {
  emit("edit", newContent, attachments);
  isEditing.value = false;
};

// 事件处理函数（避免模板中的隐式 any）
const onRegenerate = (options?: { modelId?: string; profileId?: string }) =>
  emit("regenerate", options);
const onSwitchSibling = (direction: "prev" | "next") => emit("switch-sibling", direction);
const onSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
};

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
  } catch (error) {
    console.error("复制失败", error);
  }
};

// 暴露方法供父组件调用
defineExpose({
  startEdit,
});
</script>

<template>
  <div
    ref="messageRef"
    :class="[
      'chat-message',
      `message-${message.role}`,
      { 'is-disabled': isDisabled, 'is-preset-display': isPresetDisplay },
    ]"
  >
    <!-- 背景层：分块渲染以规避浏览器对大尺寸 backdrop-filter 的限制 -->
    <div class="message-background-container">
      <div
        v-for="i in backgroundBlocks"
        :key="i"
        class="message-background-slice"
        :style="{
          top: `${(i - 1) * BLOCK_SIZE}px`,
          height: i === backgroundBlocks ? 'auto' : `${BLOCK_SIZE}px`,
          bottom: i === backgroundBlocks ? '0' : 'auto',
        }"
      ></div>
    </div>

    <!-- 内容层：提高层级 -->
    <div class="message-inner">
      <MessageHeader :message="message" />

      <MessageContent
        :message="message"
        :is-editing="isEditing"
        :llm-think-rules="llmThinkRules"
        :rich-text-style-options="richTextStyleOptions"
        @save-edit="saveEdit"
        @cancel-edit="cancelEdit"
      />
    </div>

    <!-- 悬浮操作栏（始终显示，除非正在编辑） -->
    <div class="menubar-wrapper" v-if="!isEditing">
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
        @create-branch="emit('create-branch')"
        @analyze-context="emit('analyze-context')"
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
  transition: all 0.2s;
  
  /* 性能优化：允许浏览器跳过视口外消息的渲染工作 */
  content-visibility: auto;
  contain-intrinsic-size: 600px;
}

/* 背景层容器 */
.message-background-container {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  /* 容器本身负责圆角 */
  border-radius: 8px;
  overflow: hidden; /* 确保切片不溢出圆角 */
}

/* 独立的边框层：避免被 overflow: hidden 裁剪圆角 */
.chat-message::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

/* 背景切片 */
.message-background-slice {
  position: absolute;
  left: 0;
  right: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  /* 移除子元素的边框和圆角，由容器统一管理 */
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
