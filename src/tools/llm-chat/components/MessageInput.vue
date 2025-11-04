<script setup lang="ts">
import { ref, toRef, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { ElTooltip } from "element-plus";
import { useDetachable } from "@/composables/useDetachable";
import { useWindowResize } from "@/composables/useWindowResize";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { useChatInputManager } from "@/tools/llm-chat/composables/useChatInputManager";
import { useLlmChatStore } from "@/tools/llm-chat/store";
import { useAgentStore } from "@/tools/llm-chat/agentStore";
import { useChatSettings } from "@/tools/llm-chat/composables/useChatSettings";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.service";
import type { Asset } from "@/types/asset-management";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import ComponentHeader from "@/components/ComponentHeader.vue";
import AttachmentCard from "./AttachmentCard.vue";

const logger = createModuleLogger("MessageInput");

// 获取聊天 store 以访问流式输出开关
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
const { settings } = useChatSettings();

// Token 计数相关
const tokenCount = ref<number>(0);
const isCalculatingTokens = ref(false);
const tokenEstimated = ref(false);

// 切换流式输出模式
const toggleStreaming = () => {
  if (!props.isSending) {
    chatStore.isStreaming = !chatStore.isStreaming;
  }
};

interface Props {
  disabled: boolean;
  isSending: boolean;
  isDetached?: boolean; // 是否在独立窗口中
}

interface Emits {
  (e: "send", content: string, attachments?: Asset[]): void;
  (e: "abort"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const textareaRef = ref<HTMLTextAreaElement>();
const containerRef = ref<HTMLDivElement>();
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const inputAreaRef = ref<HTMLDivElement>();

// 使用全局输入管理器（替代本地状态）
const inputManager = useChatInputManager();
const inputText = inputManager.inputText; // 全局响应式状态
const attachmentManager = {
  attachments: inputManager.attachments,
  isProcessing: inputManager.isProcessingAttachments,
  hasAttachments: inputManager.hasAttachments,
  count: inputManager.attachmentCount,
  isFull: inputManager.isAttachmentsFull,
  addAttachments: inputManager.addAttachments,
  addAsset: inputManager.addAsset,
  removeAttachment: (asset: Asset) => inputManager.removeAttachment(asset.id),
  clearAttachments: inputManager.clearAttachments,
};

// 统一的文件交互处理（拖放 + 粘贴）
const { isDraggingOver } = useChatFileInteraction({
  element: containerRef,
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths, disabled: props.disabled });
    await inputManager.addAttachments(paths);
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    let successCount = 0;
    for (const asset of assets) {
      if (inputManager.addAsset(asset)) {
        successCount++;
      }
    }
    if (successCount > 0) {
      const message =
        successCount === 1 ? `已粘贴文件: ${assets[0].name}` : `已粘贴 ${successCount} 个文件`;
      customMessage.success(message);
    }
  },
  disabled: toRef(props, "disabled"),
});

// 处理发送
const handleSend = () => {
  const content = inputText.value.trim();
  if (!content || props.disabled) {
    logger.info("发送被阻止", {
      hasContent: !!content,
      disabled: props.disabled,
      isDetached: props.isDetached,
    });
    return;
  }

  logger.info("发送消息", {
    contentLength: content.length,
    attachmentCount: inputManager.attachmentCount.value,
    isDetached: props.isDetached,
  });

  // 发送消息和附件
  const attachments =
    inputManager.attachmentCount.value > 0 ? [...inputManager.attachments.value] : undefined;

  emit("send", content, attachments);

  // 清空输入框和附件（使用全局管理器）
  inputManager.clear();

  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
};

// 处理中止
const handleAbort = () => {
  emit("abort");
};
// 处理键盘事件（根据设置动态处理）
const handleKeydown = (e: KeyboardEvent) => {
  const sendKey = settings.value.shortcuts.send;
  
  // 检查是否按下发送快捷键
  if (sendKey === 'ctrl+enter') {
    // Ctrl/Cmd + Enter 发送
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  } else if (sendKey === 'enter') {
    // 单独 Enter 发送，Shift + Enter 换行
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
};

// 计算 placeholder 文本（根据快捷键设置动态显示）
const placeholderText = computed(() => {
  if (props.disabled) {
    return '请先创建或选择一个对话';
  }
  
  const sendKey = settings.value.shortcuts.send;
  const sendHint = sendKey === 'ctrl+enter' ? 'Ctrl/Cmd + Enter 发送' : 'Enter 发送, Shift + Enter 换行';
  return `输入消息、拖入或粘贴文件... (${sendHint})`;
});

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
    handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;

    logger.info("拖拽手柄偏移量计算", {
      mouseX: e.screenX,
      mouseY: e.screenY,
      handleOffsetX,
      handleOffsetY,
      headerWidth: headerRect.width,
      headerHeight: headerRect.height,
    });
  }

  startDetaching({
    id: "chat-input",
    displayName: "聊天输入框",
    type: "component",
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

// 计算当前输入的 token 数量
const calculateInputTokens = async () => {
  // 如果没有文本且没有附件，重置 token 计数
  if (!inputText.value.trim() && inputManager.attachmentCount.value === 0) {
    tokenCount.value = 0;
    tokenEstimated.value = false;
    return;
  }

  // 获取当前会话的模型 ID
  const session = chatStore.currentSession;
  if (!session) {
    tokenCount.value = 0;
    return;
  }

  // 查找当前会话使用的模型 ID
  let modelId: string | undefined;

  // 尝试从活动路径的助手消息中获取模型 ID
  let currentId: string | null = session.activeLeafId;
  while (currentId !== null) {
    const node: ChatMessageNode | undefined = session.nodes[currentId];
    if (node?.role === 'assistant' && node.metadata?.modelId) {
      modelId = node.metadata.modelId;
      break;
    }
    currentId = node?.parentId ?? null;
  }

  // 如果活动路径上没有，查找整个会话中的任意助手消息
  if (!modelId) {
    for (const node of Object.values(session.nodes)) {
      if (node.role === 'assistant' && node.metadata?.modelId) {
        modelId = node.metadata.modelId;
        break;
      }
    }
  }

  // 如果还是没有模型 ID，尝试使用会话的 displayAgentId
  if (!modelId && session.displayAgentId) {
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent?.modelId) {
      modelId = agent.modelId;
    }
  }

  // 最后尝试使用当前选中的智能体
  if (!modelId && agentStore.currentAgentId) {
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    if (agent?.modelId) {
      modelId = agent.modelId;
    }
  }

  if (!modelId) {
    logger.warn("无法确定模型 ID，无法计算 token");
    tokenCount.value = 0;
    return;
  }

  isCalculatingTokens.value = true;
  try {
    const result = await tokenCalculatorService.calculateMessageTokens(
      inputText.value,
      modelId,
      inputManager.attachmentCount.value > 0 ? [...inputManager.attachments.value] : undefined
    );
    tokenCount.value = result.count;
    tokenEstimated.value = result.isEstimated ?? false;
  } catch (error) {
    logger.error("计算 token 失败", error);
    tokenCount.value = 0;
    tokenEstimated.value = false;
  } finally {
    isCalculatingTokens.value = false;
  }
};

// 防抖计算 token
let tokenCalcTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedCalculateTokens = () => {
  if (tokenCalcTimer) {
    clearTimeout(tokenCalcTimer);
  }
  tokenCalcTimer = setTimeout(() => {
    calculateInputTokens();
  }, 300);
};

// 监听输入文本变化
watch(inputText, () => {
  debouncedCalculateTokens();
});

// 监听附件变化
watch(
  () => inputManager.attachments.value,
  () => {
    debouncedCalculateTokens();
  },
  { deep: true }
);

// 监听当前会话变化（切换会话时重新计算）
watch(
  () => chatStore.currentSessionId,
  () => {
    debouncedCalculateTokens();
  }
);

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
    handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;
  }

  const config = {
    id: "chat-input",
    displayName: "聊天输入框",
    type: "component" as const,
    width: rect.width + 80,
    height: rect.height + 80,
    mouseX: window.screenX + rect.left + rect.width / 2,
    mouseY: window.screenY + rect.top + rect.height / 2,
    handleOffsetX,
    handleOffsetY,
  };

  logger.info("通过菜单请求分离窗口", { config });

  try {
    const sessionId = await invoke<string>("begin_detach_session", { config });
    if (sessionId) {
      await invoke("finalize_detach_session", {
        sessionId,
        shouldDetach: true,
      });
      logger.info("通过菜单分离窗口成功", { sessionId });
    } else {
      logger.error("开始分离会话失败，未返回会话 ID");
    }
  } catch (error) {
    logger.error("通过菜单分离窗口失败", { error });
  }
};
</script>
<template>
  <div
    ref="containerRef"
    :class="[
      'message-input-container',
      { 'detached-mode': isDetached, 'dragging-over': isDraggingOver },
    ]"
  >
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
      <div ref="inputAreaRef" class="input-content">
        <!-- 附件展示区 -->
        <div v-if="attachmentManager.hasAttachments.value" class="attachments-area">
          <div class="attachments-list">
            <AttachmentCard
              v-for="asset in attachmentManager.attachments.value"
              :key="asset.id"
              :asset="asset"
              :all-assets="attachmentManager.attachments.value"
              :removable="true"
              size="small"
              @remove="attachmentManager.removeAttachment"
            />
          </div>
          <!-- 附件数量浮动显示 -->
          <div class="attachments-info">
            <span class="attachment-count"> {{ attachmentManager.count.value }} / {{ 20 }} </span>
          </div>
        </div>

        <div class="input-wrapper">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            :disabled="disabled"
            :placeholder="placeholderText"
            class="message-textarea"
            rows="1"
            @keydown="handleKeydown"
            @input="autoResize"
          />
          <div class="input-bottom-bar">
            <div class="tool-actions">
              <span v-if="attachmentManager.isProcessing.value" class="processing-hint">
                正在处理文件...
              </span>
              <!-- Token 计数显示 -->
              <el-tooltip
                v-if="tokenCount > 0 || isCalculatingTokens"
                :content="tokenEstimated ? 'Token 数量（估算值）' : 'Token 数量'"
                placement="top"
              >
                <span class="token-count">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style="margin-right: 4px"
                  >
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                  <span v-if="isCalculatingTokens">计算中...</span>
                  <span v-else>
                    {{ tokenCount.toLocaleString() }}{{ tokenEstimated ? '~' : '' }}
                  </span>
                </span>
              </el-tooltip>
              <el-tooltip
                :content="
                  chatStore.isStreaming ? '流式输出：实时显示生成内容' : '非流式输出：等待完整响应'
                "
                placement="top"
              >
                <button
                  class="streaming-icon-button"
                  :class="{ active: chatStore.isStreaming }"
                  :disabled="isSending"
                  @click="toggleStreaming"
                >
                  <span class="typewriter-icon">A_</span>
                </button>
              </el-tooltip>
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
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.message-input-container.dragging-over {
  background-color: var(--primary-color-alpha, rgba(64, 158, 255, 0.1));
  border-color: var(--primary-color);
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
  gap: 12px;
  min-width: 0;
}
.attachments-area {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 8px;
  border-radius: 8px;
  background: var(--container-bg);
  border: 1px dashed var(--border-color);
}

.attachments-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachments-info {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  pointer-events: none;
  z-index: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.attachment-count {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.processing-hint {
  font-size: 12px;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 4px;
}

.token-count {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.token-count svg {
  flex-shrink: 0;
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
  gap: 8px;
  align-items: center;
  color: var(--text-color-light);
}

/* 流式输出图标按钮 */
.streaming-icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.streaming-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 打字机图标 "A_" */
.typewriter-icon {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans",
    "Droid Sans", "Helvetica Neue", sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -2px;
  color: var(--text-color-secondary);
  transition: all 0.3s ease;
  position: relative;
  display: inline-block;
}

/* 非激活状态：暗淡灰色 */
.streaming-icon-button:not(.active) .typewriter-icon {
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.streaming-icon-button:not(.active):hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

.streaming-icon-button:not(.active):hover:not(:disabled) .typewriter-icon {
  opacity: 0.8;
}

/* 激活状态：主题色 + 辉光效果 */
.streaming-icon-button.active .typewriter-icon {
  color: var(--primary-color);
  opacity: 1;
}

.streaming-icon-button.active:hover:not(:disabled) {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.15);
}

/* 辉光效果 */
.streaming-icon-button.active .typewriter-icon {
  text-shadow:
    0 0 4px rgba(var(--primary-color-rgb, 64, 158, 255), 0.5),
    0 0 6px rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

/* 光标闪烁动画（仅在激活时） - 半透明轻微闪烁 */
@keyframes cursor-blink {
  0%,
  49% {
    opacity: 0.5;
  }
  50%,
  100% {
    opacity: 0.2;
  }
}

.streaming-icon-button.active .typewriter-icon::after {
  content: "";
  display: inline-block;
  width: 2px;
  height: 12px;
  background-color: var(--primary-color);
  margin-left: 0px;
  animation: cursor-blink 1s infinite;
  vertical-align: baseline;
  position: relative;
  bottom: -1px;
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
