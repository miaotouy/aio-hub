<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useDetachedComponents } from "@/composables/useDetachedComponents";
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

// 拖拽状态
const isDragging = ref(false);
const dragLabel = ref<string | null>(null);
const dragStartPos = ref({ x: 0, y: 0 });
const hasMovedEnough = ref(false); // 新增状态，判断是否移动了足够距离以触发拖拽

// 使用组件分离管理器
const { requestPreviewWindow, updatePreviewPosition, finalizePreviewWindow, cancelPreviewWindow } =
  useDetachedComponents();

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

// ----------------------------------------------------------------
// 新的、简化的拖拽逻辑
// ----------------------------------------------------------------

// 1. 鼠标按下：准备开始拖拽
const handleDragStart = (e: MouseEvent) => {
  e.preventDefault();
  logger.info("准备拖拽");

  dragStartPos.value = { x: e.clientX, y: e.clientY };
  isDragging.value = true;
  hasMovedEnough.value = false;

  // 注册全局的移动和释放事件
  window.addEventListener("mousemove", handleDragMove);
  window.addEventListener("mouseup", handleDragEnd, { once: true });
};

// 2. 鼠标移动：如果移动超过阈值，则正式开始拖拽
const handleDragMove = async (e: MouseEvent) => {
  if (!isDragging.value) return;

  const dx = e.clientX - dragStartPos.value.x;
  const dy = e.clientY - dragStartPos.value.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 移动超过10像素才真正触发预览窗口
  if (distance > 10 && !hasMovedEnough.value) {
    hasMovedEnough.value = true;
    logger.info("达到拖拽阈值，开始创建预览窗口");
    await createPreview(e);
  }

  // 如果预览窗口已创建，则持续更新其位置
  if (hasMovedEnough.value && dragLabel.value) {
    await updatePreviewPosition(dragLabel.value, e.clientX, e.clientY);
  }
};

// 3. 鼠标释放：结束拖拽
const handleDragEnd = async (e: MouseEvent) => {
  // 移除全局事件
  window.removeEventListener("mousemove", handleDragMove);

  if (!isDragging.value) return;

  logger.info("结束拖拽");

  // 如果预览窗口被创建了，则根据最终位置决定是固定还是取消
  if (dragLabel.value && hasMovedEnough.value) {
    // 计算总拖拽距离
    const dx = e.clientX - dragStartPos.value.x;
    const dy = e.clientY - dragStartPos.value.y;
    const totalDistance = Math.sqrt(dx * dx + dy * dy);

    if (totalDistance > 100) { // 拖拽超过100像素则固定
      logger.info("固定预览窗口", { totalDistance });
      await finalizePreviewWindow(dragLabel.value);
    } else {
      logger.info("取消预览窗口", { totalDistance });
      await cancelPreviewWindow(dragLabel.value);
    }
  }

  // 重置所有状态
  isDragging.value = false;
  hasMovedEnough.value = false;
  dragLabel.value = null;
};

// 辅助函数：创建预览窗口
const createPreview = async (e: MouseEvent) => {

// 获取容器尺寸
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    logger.error("无法获取容器尺寸");
    isDragging.value = false; // 确保重置状态
    return;
  }

  try {
// 请求预览窗口
    const label = await requestPreviewWindow({
      componentId: "chat-input",
      displayName: "聊天输入框",
      width: rect.width,
      height: rect.height,
      mouseX: e.clientX,
      mouseY: e.clientY,
    });

    if (label) {
      dragLabel.value = label;
      logger.info("预览窗口已创建", { label });
    } else {
      // 如果创建失败，也需要重置状态
      isDragging.value = false;
      hasMovedEnough.value = false;
    }
  } catch (error) {
    logger.error("创建预览窗口失败", { error });
    isDragging.value = false;
    hasMovedEnough.value = false;
  }
};

// 组件卸载时确保移除监听器，防止内存泄漏
onUnmounted(() => {
  window.removeEventListener("mousemove", handleDragMove);
  window.removeEventListener("mouseup", handleDragEnd);
});
</script>
<template>
  <div ref="containerRef" class="message-input-container">
    <!-- 组件头部（仅在独立模式显示） -->
    <ComponentHeader v-if="isDetached" position="top" title="聊天输入框" />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 拖拽手柄：使用 ComponentHeader 作为分离触发器 -->
      <ComponentHeader
        v-if="!isDetached"
        position="left"
        drag-mode="detach"
        :show-actions="false"
        title="拖拽以分离可在独立窗口打开"
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

          <div class="input-actions">
            <button
              v-if="!isSending"
              @click="handleSend"
              :disabled="disabled || !inputText.trim()"
              class="btn-send"
              title="发送 (Ctrl/Cmd + Enter)"
            >
              📤 发送
            </button>

            <button v-else @click="emit('abort')" class="btn-abort" title="停止生成">
              ⏹️ 停止
            </button>
          </div>
        </div>

        <div class="input-hint">
          💡 提示：按 Ctrl/Cmd + Enter 快速发送消息 | 这里可能会用来放一些工具快捷栏，但是还没做
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.main-content {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

/* 分离手柄的特定样式 */
.detachable-handle {
  flex-shrink: 0;
  width: 16px; /* 设置固定宽度，提供更好的拖拽区域 */
  padding: 0;
  border: none;
  background: transparent;
  cursor: move;
  border-radius: 8px 0 0 8px;
}

.detachable-handle:hover {
  background: rgba(var(--sidebar-bg-rgb), 0.95);
}

.input-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.message-textarea {
  flex: 1;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  resize: none;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;
  transition: border-color 0.2s;
}

.message-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-textarea::placeholder {
  color: var(--text-color-light);
}

.input-actions {
  display: flex;
  gap: 8px;
}

.btn-send,
.btn-abort {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
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

.input-hint {
  font-size: 12px;
  color: var(--text-color-light);
  padding-left: 4px;
}

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
</style>
