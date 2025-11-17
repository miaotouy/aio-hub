<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { useDraggable } from '@vueuse/core';
import type { ChatMessageNode, ChatSession } from '../../../../types';
import ChatMessage from '../../../message/ChatMessage.vue';
import type { LlmThinkRule } from '@/tools/rich-text-renderer/types';

interface Props {
  session: ChatSession;
  message: ChatMessageNode | null;
  llmThinkRules?: LlmThinkRule[];
  visible: boolean;
  initialPosition?: { x: number; y: number };
}

interface Emits {
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const handleClose = () => {
  emit('close');
};

// --- Dragging Logic ---
const popupRef = ref<HTMLElement | null>(null);
const headerRef = ref<HTMLElement | null>(null);
const { x, y, isDragging } = useDraggable(popupRef, {
  handle: headerRef,
  initialValue: props.initialPosition,
});

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible && !isDragging.value && props.initialPosition) {
      x.value = props.initialPosition.x;
      y.value = props.initialPosition.y;
    }
  }
);
// --------------------

// 为 ChatMessage 组件准备 props
const chatMessageProps = computed(() => {
  if (!props.message || !props.session) {
    return null;
  }
  return {
    session: props.session,
    message: props.message,
    isSending: false, // 在详情弹窗中，消息永远不是正在发送状态
    siblings: [props.message], // 传自身组成的数组，禁用分支切换
    currentSiblingIndex: 0, // 索引为0
    llmThinkRules: props.llmThinkRules,
  };
});
</script>

<template>
  <div
    ref="popupRef"
    class="graph-node-detail-popup-wrapper"
    v-show="visible"
    :style="{ top: `${y}px`, left: `${x}px` }"
  >
    <div class="graph-node-detail-popup">
      <div ref="headerRef" class="popup-header">
        <span class="title">节点详情</span>
        <button class="close-btn" @click="handleClose">
          <X :size="16" />
        </button>
      </div>
      <div class="detail-popup-content">
        <ChatMessage v-if="chatMessageProps" v-bind="chatMessageProps" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-node-detail-popup-wrapper {
  position: fixed;
  min-width: 400px; /* 增加最小宽度 */
  max-width: 60vw; /* 增加最大宽度 */
  z-index: 2500; /* Higher than el-popover's default z-index */
}

.graph-node-detail-popup {
  display: flex;
  flex-direction: column;
  width: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden; /* Ensures content respects border-radius */
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  cursor: move;
  user-select: none;
}

.popup-header .title {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.close-btn {
  background: none;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background-color: var(--el-color-info-light-7);
  color: var(--el-text-color-primary);
}

.detail-popup-content {
  max-height: 70vh;
  overflow-y: auto;
  padding: 16px;
}

/* 覆盖内部 ChatMessage 的样式，使其与弹窗融合 */
.detail-popup-content :deep(.chat-message) {
  padding: 0;
  border: none;
  background-color: transparent;
  backdrop-filter: none;
  box-shadow: none;
}

/* 移除悬浮时的高亮效果 */
.detail-popup-content :deep(.chat-message:hover) {
  border-color: transparent;
}
</style>