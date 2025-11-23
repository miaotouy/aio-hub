<script setup lang="ts">
import { ref, toRef, computed, watch, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDetachable } from "@/composables/useDetachable";
import { useWindowResize } from "@/composables/useWindowResize";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { processInlineData } from "@/composables/useAttachmentProcessor";
import { useChatInputManager } from "@/tools/llm-chat/composables/useChatInputManager";
import { useLlmChatStore } from "@/tools/llm-chat/store";
import { useAgentStore } from "@/tools/llm-chat/agentStore";
import { useChatSettings } from "@/tools/llm-chat/composables/useChatSettings";
import { useChatHandler } from "@/tools/llm-chat/composables/useChatHandler";
import { useMessageBuilder } from "@/tools/llm-chat/composables/useMessageBuilder";
import { tokenCalculatorService } from "@/tools/token-calculator/tokenCalculator.registry";
import type { Asset } from "@/types/asset-management";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { ContextPreviewData } from "@/tools/llm-chat/composables/useChatHandler";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler"; // <-- 插入
import ComponentHeader from "@/components/ComponentHeader.vue";
import AttachmentCard from "../AttachmentCard.vue";
import MessageInputToolbar from "./MessageInputToolbar.vue";
import type { MacroDefinition } from "../../macro-engine";

const logger = createModuleLogger("MessageInput");
const errorHandler = createModuleErrorHandler("MessageInput"); // <-- 插入

// 获取聊天 store 以访问流式输出开关
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();
const { settings, updateSettings, isLoaded: settingsLoaded, loadSettings } = useChatSettings();

// 计算流式输出状态，在设置加载前默认为 false（非流式）
const isStreamingEnabled = computed(() => {
  return settingsLoaded.value ? settings.value.uiPreferences.isStreaming : false;
});

// 计算当前分支是否正在生成
const isCurrentBranchGenerating = computed(() => {
  const session = chatStore.currentSession;
  if (!session || !session.activeLeafId) return false;
  return chatStore.isNodeGenerating(session.activeLeafId);
});

// Token 计数相关
const tokenCount = ref<number>(0);
const isCalculatingTokens = ref(false);
const tokenEstimated = ref(false);

// 历史上下文统计
const contextStats = ref<ContextPreviewData["statistics"] | null>(null);
const isLoadingContextStats = ref(false);

// 切换流式输出模式
const toggleStreaming = () => {
  if (!isCurrentBranchGenerating.value) {
    updateSettings({
      uiPreferences: {
        ...settings.value.uiPreferences,
        isStreaming: !isStreamingEnabled.value,
      },
    });
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

// 宏选择器状态
const macroSelectorVisible = ref(false);
const isExpanded = ref(false);

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
  isExpanded.value = false;

  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = "auto";
  }
};

// 处理中止
const handleAbort = () => {
  const session = chatStore.currentSession;
  if (session && session.activeLeafId && isCurrentBranchGenerating.value) {
    chatStore.abortNodeGeneration(session.activeLeafId);
  } else {
    // 回退：如果没有明确的活动节点，尝试中止所有（虽然这种情况很少见）
    emit("abort");
  }
};

const handleTriggerAttachment = async () => {
  if (props.disabled) return;

  try {
    const selected = await open({
      multiple: true,
      title: "选择附件",
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      await inputManager.addAttachments(paths);
    }
  } catch (error) {
    errorHandler.error(error, "打开文件选择对话框失败"); // <-- 替换
    customMessage.error("选择文件失败");
  }
};

const toggleExpand = () => {
  if (props.isDetached) return;

  isExpanded.value = !isExpanded.value;
  if (textareaRef.value) {
    if (isExpanded.value) {
      // 展开
      textareaRef.value.style.height = "70vh";
    } else {
      // 收起
      textareaRef.value.style.removeProperty("height");
      autoResize();
    }
  }
};

// 处理键盘事件（根据设置动态处理）
const handleKeydown = (e: KeyboardEvent) => {
  const sendKey = settings.value.shortcuts.send;

  // 检查是否按下发送快捷键
  if (sendKey === "ctrl+enter") {
    // Ctrl/Cmd + Enter 发送
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  } else if (sendKey === "enter") {
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
    return "请先创建或选择一个对话";
  }

  const sendKey = settings.value.shortcuts.send;
  const sendHint =
    sendKey === "ctrl+enter" ? "Ctrl/Cmd + Enter 发送" : "Enter 发送, Shift + Enter 换行";
  return `输入消息、拖入或粘贴文件... (${sendHint})`;
});

// 自动调整文本框高度
const autoResize = () => {
  if (isExpanded.value) return;
  if (textareaRef.value) {
    // 重置高度以获取正确的 scrollHeight
    textareaRef.value.style.height = "auto";
    // 设置最小高度为当前内容高度，但不小于最小限制
    const newHeight = Math.max(40, textareaRef.value.scrollHeight);
    textareaRef.value.style.height = newHeight + "px";
  }
};

// 拖拽调整大小相关状态
const isResizing = ref(false);
const startY = ref(0);
const startHeight = ref(0);

// 拖拽开始处理 - 输入框高度调整
const handleInputResizeStart = (e: MouseEvent) => {
  isExpanded.value = false;
  isResizing.value = true;
  startY.value = e.clientY;

  if (textareaRef.value) {
    startHeight.value = textareaRef.value.offsetHeight;
  }

  // 阻止默认行为和文本选择
  e.preventDefault();
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";

  // 添加全局事件监听
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
};

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !textareaRef.value) return;

  // 计算高度差值
  const deltaY = startY.value - e.clientY;
  const newHeight = startHeight.value + deltaY;

  // 限制最小和最大高度
  const minHeight = 40;
  const maxHeight = props.isDetached ? window.innerHeight * 0.8 : window.innerHeight * 0.8;
  const finalHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

  // 直接设置 DOM 样式以获得最佳性能
  textareaRef.value.style.height = finalHeight + "px";
};

// 鼠标释放处理
const handleMouseUp = () => {
  isResizing.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";

  // 移除全局事件监听
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};

// 双击手柄重置高度
const handleResizeDoubleClick = () => {
  isExpanded.value = false;
  autoResize();
};

// 组件卸载时清理事件监听
onUnmounted(() => {
  if (isResizing.value) {
    handleMouseUp();
  }
});
// ===== 拖拽与分离功能 =====
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸，无法开始拖拽"); // <-- 替换
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
const handleWindowResizeStart = createResizeHandler("SouthEast");

// 消息构建器（用于准备 Token 计算的数据）
const { prepareSimpleMessageForTokenCalc } = useMessageBuilder();

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
    if (node?.role === "assistant" && node.metadata?.modelId) {
      modelId = node.metadata.modelId;
      break;
    }
    currentId = node?.parentId ?? null;
  }

  // 如果活动路径上没有，查找整个会话中的任意助手消息
  if (!modelId) {
    for (const node of Object.values(session.nodes)) {
      if (node.role === "assistant" && node.metadata?.modelId) {
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
    // 使用 MessageBuilder 预处理消息，将文本附件合并到文本中
    const attachments =
      inputManager.attachmentCount.value > 0 ? [...inputManager.attachments.value] : undefined;

    const { combinedText, imageAttachments } = await prepareSimpleMessageForTokenCalc(
      inputText.value,
      attachments
    );

    // 使用合并后的文本和图片附件进行 token 计算
    const result = await tokenCalculatorService.calculateMessageTokens(
      combinedText,
      modelId,
      imageAttachments.length > 0 ? imageAttachments : undefined
    );
    tokenCount.value = result.count;
    tokenEstimated.value = result.isEstimated ?? false;
  } catch (error) {
    errorHandler.error(error, "计算 token 失败"); // <-- 替换
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

// 加载历史上下文统计
const loadContextStats = async () => {
  const session = chatStore.currentSession;
  if (!session || !session.activeLeafId) {
    contextStats.value = null;
    return;
  }

  isLoadingContextStats.value = true;
  try {
    const { getLlmContextForPreview } = useChatHandler();
    const previewData = await getLlmContextForPreview(
      session,
      session.activeLeafId,
      agentStore.currentAgentId ?? undefined
    );

    if (previewData) {
      contextStats.value = previewData.statistics;
    }
  } catch (error) {
    logger.warn("获取历史上下文统计失败", error);
    contextStats.value = null;
  } finally {
    isLoadingContextStats.value = false;
  }
};

// 监听当前会话变化（切换会话时重新计算）
watch(
  () => chatStore.currentSessionId,
  () => {
    debouncedCalculateTokens();
    loadContextStats();
  }
);

// 监听活跃叶节点变化
watch(
  () => chatStore.currentSession?.activeLeafId,
  () => {
    loadContextStats();
  }
);

// 监听智能体切换（模型可能改变，需要重新计算 token）
watch(
  () => agentStore.currentAgentId,
  () => {
    debouncedCalculateTokens();
    loadContextStats();
  }
);

// 监听智能体模型变化（用户在智能体内更换模型）
watch(
  () => {
    if (!agentStore.currentAgentId) return null;
    const agent = agentStore.getAgentById(agentStore.currentAgentId);
    return agent?.modelId;
  },
  () => {
    debouncedCalculateTokens();
    loadContextStats();
  }
);

// 监听消息生成完成
let previousGeneratingCount = 0;
watch(
  () => chatStore.generatingNodes.size,
  (newSize) => {
    if (previousGeneratingCount > 0 && newSize === 0) {
      loadContextStats();
    }
    previousGeneratingCount = newSize;
  }
);

// 初始加载
onMounted(async () => {
  // 加载聊天设置（确保 isLoaded 标志被设置）
  if (!settingsLoaded.value) {
    await loadSettings();
    logger.info("MessageInput 聊天设置已加载", {
      isStreaming: settings.value.uiPreferences.isStreaming,
    });
  }

  loadContextStats();
});
/**
 * 插入宏到光标位置
 */
function handleInsertMacro(macro: MacroDefinition) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  // 获取当前光标位置
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  // 要插入的文本
  const insertText = macro.example || `{{${macro.name}}}`;

  // 拼接新内容
  const newContent =
    inputText.value.substring(0, start) + insertText + inputText.value.substring(end);

  // 更新内容
  inputText.value = newContent;

  // 关闭弹窗
  macroSelectorVisible.value = false;

  // 设置新的光标位置
  setTimeout(() => {
    textarea.focus();
    const newCursorPos = start + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }, 0);
}

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸"); // <-- 替换
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
      errorHandler.error(new Error("Session ID is null"), "开始分离会话失败，未返回会话 ID"); // <-- 替换
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败"); // <-- 替换
  }
};

/**
 * 处理粘贴事件，智能提取 Base64 图像
 */
const handlePaste = async (event: ClipboardEvent) => {
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return;

  // 检查是否包含潜在的 Base64 图像数据
  if (!text.includes("data:image") || !text.includes(";base64,")) {
    return; // 不含 Base64 图像，使用默认粘贴行为
  }

  event.preventDefault();
  logger.info("检测到粘贴内容中可能含有 Base64 图像，开始处理...");

  const { processedText, newAssets } = await processInlineData(text, {
    sizeThresholdKB: 100, // 大于 100KB 的图像才转换为附件
    assetImportOptions: {
      sourceModule: "llm-chat-paste",
    },
  });

  if (newAssets.length > 0) {
    inputManager.addAssets(newAssets);
    customMessage.success(`已自动转换 ${newAssets.length} 个粘贴的图像为附件`);
  }

  // 将处理后的文本插入到光标位置
  const textarea = textareaRef.value;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      inputText.value.substring(0, start) + processedText + inputText.value.substring(end);
    inputText.value = newContent;

    // 移动光标到插入文本的末尾
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + processedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
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
    <!-- 拖拽手柄 -->
    <div
      class="resize-handle"
      @mousedown="handleInputResizeStart"
      @dblclick="handleResizeDoubleClick"
      title="拖拽调整高度（双击重置）"
    ></div>

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
            @paste="handlePaste"
          />
          <MessageInputToolbar
            :is-sending="isCurrentBranchGenerating"
            :disabled="disabled"
            :is-detached="props.isDetached"
            :is-expanded="isExpanded"
            :is-streaming-enabled="isStreamingEnabled"
            v-model:macro-selector-visible="macroSelectorVisible"
            :context-stats="contextStats"
            :token-count="tokenCount"
            :is-calculating-tokens="isCalculatingTokens"
            :token-estimated="tokenEstimated"
            :input-text="inputText"
            :is-processing-attachments="attachmentManager.isProcessing.value"
            @toggle-streaming="toggleStreaming"
            @insert="handleInsertMacro"
            @toggle-expand="toggleExpand"
            @send="handleSend"
            @abort="handleAbort"
            @trigger-attachment="handleTriggerAttachment"
          />
        </div>
      </div>
    </div>

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="window-resize-indicator"
      @mousedown="handleWindowResizeStart"
      title="拖拽调整窗口大小"
    >
      <div class="indicator-border"></div>
      <div class="indicator-handle"></div>
    </div>
  </div>
</template>

<style scoped>
.message-input-container {
  position: relative; /* For resize handle */
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  padding-top: 8px; /* 为拖拽手柄留出空间 */
  border-radius: 24px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
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
  box-sizing: border-box; /* 确保 height 属性包含 padding 和 border */
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
  max-height: 70vh; /* 默认最大高度约8行 */
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

/* 拖拽调整大小手柄 - 位于顶部 */
.resize-handle {
  position: absolute;
  top: -3px; /* 向上偏移，与父容器上边框重合 */
  left: 50%;
  transform: translateX(-50%);
  width: 94%;
  height: 6px; /* 创建一个足够灵敏的拖拽热区 */
  cursor: row-resize; /* 提示用户此处可拖拽 */
  z-index: 1; /* 确保在最上层 */
  border-radius: 3px;
  transition: background-color 0.2s;
}

.resize-handle:hover {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

.resize-handle:active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}

/* 右下角调整大小手柄 - 仅在分离模式下显示 */
.message-input-container.detached-mode .window-resize-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  top: 0;
  left: 0;
  pointer-events: none; /* 整体不接收事件，只有手柄接收 */
  z-index: 10;
}

/* 与容器同步的边框，但小一圈 */
.message-input-container.detached-mode .indicator-border {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  left: 6px;
  border: 1px solid var(--primary-color);
  border-radius: 18px; /* 比容器的 24px 小 6px */
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

/* 右下角弧度线段手柄 */
.message-input-container.detached-mode .indicator-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  pointer-events: auto; /* 只有手柄接收鼠标事件 */
  cursor: se-resize;
  border-radius: 0 0 18px 0; /* 与边框圆角一致 */
  overflow: hidden;
}

/* 弧度线段视觉效果 */
.message-input-container.detached-mode .indicator-handle::before {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border: 2px solid var(--primary-color);
  border-radius: 0 0 18px 0;
  border-top: none;
  border-left: none;
  opacity: 0.4;
  transition: opacity 0.2s;
}

/* Hover 效果 */
.message-input-container.detached-mode .indicator-handle:hover::before {
  opacity: 0.8;
  border-color: var(--primary-hover-color, var(--primary-color));
}

.message-input-container.detached-mode .indicator-handle:hover ~ .indicator-border {
  opacity: 0.3;
}

/* Active 效果 */
.message-input-container.detached-mode .indicator-handle:active::before {
  opacity: 1;
}

.message-input-container.detached-mode .indicator-handle:active ~ .indicator-border {
  opacity: 0.5;
}
</style>
