<script setup lang="ts">
import { ref } from "vue";
import { useComponentDragging } from "@/composables/useComponentDragging";
import { useWindowResize } from "@/composables/useWindowResize";
import { createModuleLogger } from "@utils/logger";
import ComponentHeader from "@/components/ComponentHeader.vue";

const logger = createModuleLogger("MessageInput");

interface Props {
  disabled: boolean;
  isSending: boolean;
  isDetached?: boolean; // 是否在独立窗口中
}

interface Emits {
  (e: "send", content: string): void;
  (e: "abort"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const inputText = ref("");
const textareaRef = ref<HTMLTextAreaElement>();
const containerRef = ref<HTMLDivElement>();

// 处理发送
const handleSend = () => {
  const content = inputText.value.trim();
  if (!content || props.disabled) return;

  emit("send", content);
  inputText.value = "";

  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
};

// 处理键盘事件
const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl/Cmd + Enter 发送
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    handleSend();
  }
};

// 自动调整文本框高度
const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
    textareaRef.value.style.height = textareaRef.value.scrollHeight + "px";
  }
};

// ===== 拖拽功能 =====
const { startDrag } = useComponentDragging(
  {
    threshold: 10,
    finalizeThreshold: 100,
    enableThrottle: true,
  },
  {
    onCreatePreview: (e) => {
      const rect = containerRef.value?.getBoundingClientRect();
      if (!rect) {
        logger.error("无法获取容器尺寸");
        return null;
      }

      return {
        componentId: "chat-input",
        displayName: "聊天输入框",
        width: rect.width + 80,
        height: rect.height + 80,
        mouseX: e.screenX,
        mouseY: e.screenY,
      };
    },
  }
);

// 处理拖拽开始
const handleDragStart = (e: MouseEvent) => {
  // 如果已经分离，则不执行任何操作，让Tauri的窗口拖拽接管
  if (props.isDetached) {
    return;
  }
  startDrag(e);
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler("SouthEast");
</script>
<template>
  <div ref="containerRef" :class="['message-input-container', { 'detached-mode': isDetached }]">
    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 拖拽手柄：非分离模式用于触发分离，分离模式用于拖动窗口 -->
      <ComponentHeader
        position="left"
        :drag-mode="isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
      />

      <!-- 输入内容区 -->
      <div class="input-content">
        <div class="input-wrapper">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            :disabled="disabled"
            :placeholder="
              disabled ? '请先创建或选择一个对话' : '输入消息... (Ctrl/Cmd + Enter 发送)'
            "
            class="message-textarea"
            rows="1"
            @keydown="handleKeydown"
            @input="autoResize"
          />
          <div class="input-bottom-bar">
            <div class="tool-actions">
              <!-- TODO: Add tool buttons here -->
            </div>
            <div class="input-actions">
              <button
                v-if="!isSending"
                @click="handleSend"
                :disabled="disabled || !inputText.trim()"
                class="btn-send"
                title="发送 (Ctrl/Cmd + Enter)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </button>
              <button v-else @click="emit('abort')" class="btn-abort" title="停止生成">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="isDetached"
      class="resize-handle"
      @mousedown="handleResizeStart"
      title="拖拽调整窗口大小"
    />
  </div>
</template>

<style scoped>
.message-input-container {
  position: relative; /* For resize handle */
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
}

/* 分离模式下组件完全一致，只是添加更强的阴影 */
.message-input-container.detached-mode {
  height: 90vh;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
}

.main-content {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: stretch;
  min-width: 0;
  background: transparent; /* Ensure it doesn't have its own background */
}

/* 分离手柄的特定样式 */
.detachable-handle {
  flex-shrink: 0;
  width: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: move;
  border-radius: 8px 0 0 8px;
}

/* 分离模式下，手柄也可以用于拖动窗口 */
.message-input-container.detached-mode .detachable-handle {
  cursor: move;
}

.input-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px; /* Slightly smaller radius for nesting */
  border: 1px solid var(--border-color);
  background: var(--bg-color); /* A slightly different background */
  transition: border-color 0.2s;
  overflow: hidden;
}

.input-wrapper:focus-within {
  border-color: var(--primary-color);
}
.message-textarea {
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  border: none;
  background-color: transparent;
  color: var(--text-color);
  resize: none;
  max-height: 250px; /* Capped height */
  overflow-y: auto;
  font-family: inherit;
}



.message-textarea:focus {
  outline: none;
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-textarea::placeholder {
  color: var(--text-color-light);
}

.input-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px 4px 12px;
}

.tool-actions {
  display: flex;
  gap: 4px;
  color: var(--text-color-light);
  /* TODO: Style for tool buttons */
}

.input-actions {
  display: flex;
}

.btn-send,
.btn-abort {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send {
  background-color: var(--primary-color);
  color: white;
}

.btn-send:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  background-color: var(--error-color);
  color: white;
}

.btn-abort:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* .input-hint has been removed */

/* 自定义滚动条 */
.message-textarea::-webkit-scrollbar {
  width: 6px;
}

.message-textarea::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}

/* 右下角调整大小手柄 */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  /* 创建一个三角形视觉效果 */
  background: linear-gradient(135deg, transparent 50%, var(--primary-color) 50%);
  border-radius: 0 0 8px 0;
  opacity: 0.5;
  transition: opacity 0.2s;
  z-index: 10;
}

.resize-handle:hover {
  opacity: 1;
  background: linear-gradient(135deg, transparent 50%, var(--primary-hover-color) 50%);
}

.resize-handle:active {
  opacity: 1;
  background: linear-gradient(135deg, transparent 50%, var(--primary-color) 50%);
}
</style>
