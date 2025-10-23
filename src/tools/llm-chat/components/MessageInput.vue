<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useDetachable } from "@/composables/useDetachable";
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
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
// 处理发送
const handleSend = () => {
  const content = inputText.value.trim();
  if (!content || props.disabled) {
    logger.info('发送被阻止', {
      hasContent: !!content,
      disabled: props.disabled,
      isDetached: props.isDetached
    });
    return;
  }

  logger.info('发送消息', {
    contentLength: content.length,
    isDetached: props.isDetached
  });
  
  emit("send", content);
  inputText.value = "";
  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
};

// 处理中止
const handleAbort = () => {
  emit("abort");
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

// ===== 拖拽与分离功能 =====
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    logger.error("无法获取容器尺寸，无法开始拖拽");
    return;
  }

  // 获取拖拽手柄的位置
  const headerEl = headerRef.value?.$el as HTMLElement;
  const headerRect = headerEl?.getBoundingClientRect();
  
  // 计算手柄相对于容器的偏移量
  let handleOffsetX = 0;
  let handleOffsetY = 0;
  
  if (headerRect) {
    // 手柄中心相对于容器左上角的偏移量
    handleOffsetX = (headerRect.left - rect.left) + headerRect.width / 2;
    handleOffsetY = (headerRect.top - rect.top) + headerRect.height / 2;
    
    logger.info("拖拽手柄偏移量计算", {
      mouseX: e.screenX,
      mouseY: e.screenY,
      handleOffsetX,
      handleOffsetY,
      headerWidth: headerRect.width,
      headerHeight: headerRect.height
    });
  }

  startDetaching({
    id: 'chat-input',
    displayName: '聊天输入框',
    type: 'component',
    width: rect.width + 80,
    height: rect.height + 80,
    mouseX: e.screenX,
    mouseY: e.screenY,
    handleOffsetX,
    handleOffsetY,
  });
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler("SouthEast");

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    logger.error("无法获取容器尺寸");
    return;
  }

  // 获取手柄位置用于计算偏移量
  const headerEl = headerRef.value?.$el as HTMLElement;
  const headerRect = headerEl?.getBoundingClientRect();
  
  let handleOffsetX = 0;
  let handleOffsetY = 0;
  
  if (headerRect) {
    handleOffsetX = (headerRect.left - rect.left) + headerRect.width / 2;
    handleOffsetY = (headerRect.top - rect.top) + headerRect.height / 2;
  }

  const config = {
    id: 'chat-input',
    displayName: '聊天输入框',
    type: 'component' as const,
    width: rect.width + 80,
    height: rect.height + 80,
    mouseX: window.screenX + rect.left + rect.width / 2,
    mouseY: window.screenY + rect.top + rect.height / 2,
    handleOffsetX,
    handleOffsetY,
  };

  logger.info("通过菜单请求分离窗口", { config });

  try {
    const sessionId = await invoke<string>('begin_detach_session', { config });
    if (sessionId) {
      await invoke('finalize_detach_session', {
        sessionId,
        shouldDetach: true,
      });
      logger.info("通过菜单分离窗口成功", { sessionId });
    } else {
      logger.error('开始分离会话失败，未返回会话 ID');
    }
  } catch (error) {
    logger.error("通过菜单分离窗口失败", { error });
  }
};
</script>
<template>
  <div ref="containerRef" :class="['message-input-container', { 'detached-mode': isDetached }]">
    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 拖拽手柄：非分离模式用于触发分离，分离模式用于拖动窗口 -->
      <ComponentHeader
        ref="headerRef"
        position="left"
        :drag-mode="isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
        @detach="handleDetach"
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
              <button v-else @click="handleAbort" class="btn-abort" title="停止生成">
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
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  transition: border-color 0.2s;
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
  width: 26px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: move;
  border-radius: 8px;
  align-self: flex-start;
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
  overflow: hidden;
}

.message-input-container:focus-within {
  border-color: var(--primary-color);
}
.message-textarea {
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  border: none;
  background-color: transparent;
  color: var(--text-color);
  resize: none;
  overflow-y: auto;
  font-family: inherit;
  min-height: 40px; /* 最小高度约1-2行 */
  max-height: 200px; /* 默认最大高度约8行 */
}

/* 分离模式下取消最大高度限制 */
.message-input-container.detached-mode .message-textarea {
  max-height: 100%;
  flex: 1; /* 分离模式下允许填充可用空间 */
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
  width: 28px;
  height: 28px;
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
