<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { X } from "lucide-vue-next";
import { useDraggable } from "@vueuse/core";
import type { ChatMessageNode, ChatSession } from "../../../../types";
import type { Asset } from "@/types/asset-management";
import ChatMessage from "../../../message/ChatMessage.vue";
import { useLlmChatStore } from "../../../../store";
import type { LlmThinkRule, RichTextRendererStyleOptions } from "@/tools/rich-text-renderer/types";

interface Props {
  session: ChatSession;
  message: ChatMessageNode | null;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;
  visible: boolean;
  initialPosition?: { x: number; y: number };
}

interface Emits {
  (e: "close"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();

const handleClose = () => {
  emit("close");
};

const handleEdit = (newContent: string, attachments?: Asset[]) => {
  if (props.message) {
    store.editMessage(props.message.id, newContent, attachments);
  }
};

const handleRegenerate = () => {
  if (props.message) {
    store.regenerateFromNode(props.message.id);
    handleClose(); // 重新生成通常会跳转到新分支，关闭弹窗体验更好
  }
};

// --- 拖拽逻辑 ---
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
      // 重置为自动高度以适应内容
      height.value = null;
      // 设置初始位置以便渲染和测量
      x.value = props.initialPosition.x;
      y.value = props.initialPosition.y;

      nextTick(() => {
        if (popupRef.value && props.initialPosition) {
          const popupRect = popupRef.value.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;

          // 调整位置
          let newX = props.initialPosition.x;
          let newY = props.initialPosition.y;

          if (newX + popupRect.width > viewportWidth) {
            newX = viewportWidth - popupRect.width - 20;
          }
          newX = Math.max(20, newX);

          if (newY + popupRect.height > viewportHeight) {
            newY = viewportHeight - popupRect.height - 20;
          }
          newY = Math.max(20, newY);

          x.value = newX;
          y.value = newY;

          // 如果内容导致溢出，则明确设置高度以触发滚动条
          const maxHeight = viewportHeight * 0.8;
          if (popupRect.height > maxHeight) {
            height.value = maxHeight;
          }
        }
      });
    }
  }
);

// --- 缩放逻辑 ---
const width = ref(600); // Initial width
const height = ref<number | null>(null); // Initial height is auto

const initResize = (e: MouseEvent) => {
  // 如果高度是自动的，在开始调整大小前捕获当前渲染的高度
  if (height.value === null && popupRef.value) {
    height.value = popupRef.value.offsetHeight;
  }

  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = width.value;
  const startHeight = height.value ?? 500; // Fallback if somehow null

  const doDrag = (moveEvent: MouseEvent) => {
    const newWidth = startWidth + moveEvent.clientX - startX;
    const newHeight = startHeight + moveEvent.clientY - startY;
    // 添加约束
    width.value = Math.max(500, newWidth);
    height.value = Math.max(300, newHeight);
  };

  const stopDrag = () => {
    window.removeEventListener("mousemove", doDrag);
    window.removeEventListener("mouseup", stopDrag);
    document.body.style.cursor = "";
  };

  window.addEventListener("mousemove", doDrag);
  window.addEventListener("mouseup", stopDrag);
  e.preventDefault();
  document.body.style.cursor = "se-resize";
};

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
    richTextStyleOptions: props.richTextStyleOptions,
    // 在节点详情弹窗中，只显示部分功能
    buttonVisibility: {
      copy: true,
      edit: true,
      createBranch: false,
      delete: false,
      regenerate: true,
      toggleEnabled: false,
      abort: false,
      analyzeContext: true,
      exportBranch: true,
      moreMenu: true,
    },
  };
});
</script>

<template>
  <div
    ref="popupRef"
    class="graph-node-detail-popup-wrapper"
    v-show="visible"
    :style="{
      top: `${y}px`,
      left: `${x}px`,
      width: `${width}px`,
      height: height ? `${height}px` : 'auto',
    }"
  >
    <div class="graph-node-detail-popup">
      <div ref="headerRef" class="popup-header">
        <span class="title">节点详情</span>
        <button class="close-btn" @click="handleClose">
          <X :size="16" />
        </button>
      </div>
      <div class="detail-popup-content">
        <ChatMessage
          v-if="chatMessageProps"
          v-bind="chatMessageProps"
          @edit="handleEdit"
          @regenerate="handleRegenerate"
        />
      </div>
      <div class="resize-handle" @mousedown="initResize"></div>
    </div>
  </div>
</template>

<style scoped>
.graph-node-detail-popup-wrapper {
  position: fixed;
  z-index: 2500; /* Higher than el-popover's default z-index */
  max-height: 80vh;
  display: flex; /* Make wrapper a flex container */
  flex-direction: column;
  /* Size is now controlled by JS */
}

.graph-node-detail-popup {
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1; /* Allow this to grow and shrink */
  min-height: 0; /* Crucial for nested flex scrolling */
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
  flex: 1;
  min-height: 0; /* Important for flexbox scrolling */
  overflow-y: auto;
  padding: 16px;
}

/* 覆盖内部 ChatMessage 的样式，使其与弹窗融合 */
.detail-popup-content :deep(.chat-message) {
  /* 在弹窗内，外层容器已提供 padding，故移除组件自身的 padding 以免双重边距 */
  padding: 0;
  border: none;
  box-shadow: none;
}

/* 专门处理背景层，使其透明 */
.detail-popup-content :deep(.message-background) {
  background-color: transparent;
  backdrop-filter: none;
  border-color: transparent;
}

/* 移除悬浮时的高亮效果，现在需要作用在背景层上 */
.detail-popup-content :deep(.chat-message:hover .message-background) {
  border-color: transparent;
}

.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  z-index: 1;
}

.resize-handle::after {
  content: "";
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-bottom: 2px solid var(--el-text-color-placeholder);
  border-right: 2px solid var(--el-text-color-placeholder);
  opacity: 0.7;
  border-bottom-right-radius: 6px;
}
</style>
