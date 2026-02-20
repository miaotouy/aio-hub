<script setup lang="ts">
import { ref, toRef, computed, onMounted } from "vue";
import { useStorage, useElementSize } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { useDetachable } from "@/composables/useDetachable";
import { useWindowResize } from "@/composables/useWindowResize";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { useChatInputManager } from "@/tools/llm-chat/composables/input/useChatInputManager";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useChatSettings } from "@/tools/llm-chat/composables/settings/useChatSettings";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useChatInputTokenPreview } from "@/tools/llm-chat/composables/input/useChatInputTokenPreview";
import type { Asset } from "@/types/asset-management";
import type { ModelIdentifier } from "@/tools/llm-chat/types";
import { customMessage } from "@/utils/customMessage";
import { useTranscriptionManager } from "@/tools/llm-chat/composables/features/useTranscriptionManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ComponentHeader from "@/components/ComponentHeader.vue";
import MessageInputToolbar, { type InputToolbarSettings } from "./MessageInputToolbar.vue";
import ChatCodeMirrorEditor from "./ChatCodeMirrorEditor.vue";
import MessageInputAttachments from "./MessageInputAttachments.vue";

// Composables
import { useMessageInputResize } from "../../composables/input/useMessageInputResize";
import { useMessageInputActions } from "../../composables/input/useMessageInputActions";

const logger = createModuleLogger("MessageInput");
const errorHandler = createModuleErrorHandler("MessageInput");
const bus = useWindowSyncBus();

// 获取聊天 store 以访问流式输出开关
const chatStore = useLlmChatStore();
const { settings, updateSettings, isLoaded: settingsLoaded, loadSettings } = useChatSettings();
const transcriptionManager = useTranscriptionManager();

// 计算流式输出状态，在设置加载前默认为 false（非流式）
const isStreamingEnabled = computed(() => {
  return settingsLoaded.value ? settings.value.uiPreferences.isStreaming : false;
});

// UI 设置状态 (持久化)
const inputSettings = useStorage<InputToolbarSettings>(
  "chat-input-settings",
  {
    showTokenUsage: true,
    enableMacroParsing: true,
    extractBase64FromPaste: true,
    groupQuickActionsBySet: false,
  },
  localStorage,
  { mergeDefaults: true }
);

// 计算当前分支是否正在生成
const isCurrentBranchGenerating = computed(() => {
  const session = chatStore.currentSession;
  if (!session || !session.activeLeafId) return false;
  return chatStore.isNodeGenerating(session.activeLeafId);
});

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
  (
    e: "send",
    payload: {
      content: string;
      attachments?: Asset[];
      temporaryModel?: ModelIdentifier | null;
      disableMacroParsing?: boolean;
    }
  ): void;
  (e: "abort"): void;
  (e: "complete-input", content: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "select-continuation-model"): void;
  (e: "clear-continuation-model"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const textareaRef = ref<InstanceType<typeof ChatCodeMirrorEditor>>();
const containerRef = ref<HTMLDivElement>();
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const attachmentsContainerRef = ref<HTMLDivElement>();
const { height: attachmentsHeight } = useElementSize(attachmentsContainerRef);

// 状态
const macroSelectorVisible = ref(false);
const isExpanded = ref(false);

// 使用全局输入管理器
const inputManager = useChatInputManager();
const inputText = inputManager.inputText;

// Token 预览逻辑
const {
  tokenCount,
  isCalculatingTokens,
  tokenEstimated,
  triggerCalculation: debouncedCalculateTokens,
} = useChatInputTokenPreview({
  inputText,
  attachments: inputManager.attachments,
  temporaryModel: inputManager.temporaryModel,
});

// 附件管理
const attachmentManager = {
  attachments: inputManager.attachments,
  isProcessing: inputManager.isProcessingAttachments,
  hasAttachments: inputManager.hasAttachments,
  count: inputManager.attachmentCount,
  isFull: inputManager.isAttachmentsFull,
  addAttachments: inputManager.addAttachments,
  addAsset: inputManager.addAsset,
  removeAttachment: (asset: Asset) => {
    inputManager.removeAttachment(asset.id);
    transcriptionManager.cancelTranscription(asset.id);
  },
  clearAttachments: inputManager.clearAttachments,
  maxAttachmentCount: inputManager.maxAttachmentCount,
};

// 1. 高度调整逻辑
const { editorHeight, editorMaxHeight, handleInputResizeStart, handleResizeDoubleClick } =
  useMessageInputResize({
    isDetached: props.isDetached || false,
    textareaRef,
    extraHeight: attachmentsHeight,
    onResizeStart: () => {
      isExpanded.value = false;
    },
  });

// 2. 交互动作逻辑
const {
  isTranslatingInput,
  isCompressing,
  handleSend,
  handleAbort,
  handleQuickAction,
  handleInsertMacro,
  handleTranslateInput,
  handleCompressContext,
  handleSelectTemporaryModel,
  handleSelectContinuationModel,
  handleTriggerAttachment,
  handleKeydown,
  handlePaste,
  handleCompleteInput,
  handleSwitchSession,
  handleNewSession,
  getWillUseTranscription,
} = useMessageInputActions({
  props,
  emit,
  inputManager,
  inputText,
  inputSettings,
  settings,
  bus,
  textareaRef,
  isCurrentBranchGenerating,
  debouncedCalculateTokens,
  onBeforeSend: () => {
    isExpanded.value = false;
  },
});

// 统一的文件交互处理
const { isDraggingOver } = useChatFileInteraction({
  element: containerRef,
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths, disabled: props.disabled });
    const beforeIds = new Set(inputManager.attachments.value.map((a) => a.id));
    await inputManager.addAttachments(paths);

    const newAssets = inputManager.attachments.value.filter((a) => !beforeIds.has(a.id));
    inputManager.handleAssetsAddition(
      newAssets,
      textareaRef.value,
      settings.value.transcription.autoInsertPlaceholder
    );
  },
  onAssets: async (assets) => {
    logger.info("文件粘贴触发", { count: assets.length });
    const addedAssets: Asset[] = [];
    for (const asset of assets) {
      if (inputManager.addAsset(asset)) {
        addedAssets.push(asset);
      }
    }
    if (addedAssets.length > 0) {
      const message =
        addedAssets.length === 1
          ? `已粘贴文件: ${assets[0].name}`
          : `已粘贴 ${addedAssets.length} 个文件`;
      customMessage.success(message);

      inputManager.handleAssetsAddition(
        addedAssets,
        textareaRef.value,
        settings.value.transcription.autoInsertPlaceholder
      );
    }
  },
  disabled: toRef(props, "disabled"),
});

const toggleExpand = () => {
  if (props.isDetached) return;
  isExpanded.value = !isExpanded.value;
};

// 计算 placeholder 文本
const placeholderText = computed(() => {
  if (props.disabled) return "请先创建或选择一个对话";
  const sendKey = settings.value.shortcuts.send;
  const sendHint =
    sendKey === "ctrl+enter" ? "Ctrl/Cmd + Enter 发送" : "Enter 发送, Shift + Enter 换行";
  return `输入消息、拖入或粘贴文件... (${sendHint})`;
});

// 初始加载
onMounted(async () => {
  if (inputManager.attachments.value.length > 0) {
    inputManager.attachments.value.forEach((asset) => {
      transcriptionManager.markAsProcessed(asset.id);
    });
  }
  transcriptionManager.init();
  if (!settingsLoaded.value) {
    await loadSettings();
  }
  if (props.isDetached) {
    setTimeout(async () => {
      try {
        const win = getCurrentWindow();
        const size = await win.innerSize();
        if (size.height < 900) {
          await win.setSize(new PhysicalSize(size.width, 900));
        }
      } catch (e) {
        logger.warn("调整分离窗口大小失败", e);
      }
    }, 100);
  }
});

/**
 * 获取分离窗口的配置
 */
const getDetachConfig = (mouseX?: number, mouseY?: number) => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) return null;

  const headerEl = headerRef.value?.$el as HTMLElement;
  const headerRect = headerEl?.getBoundingClientRect();

  let handleOffsetX = 0;
  let handleOffsetY = 0;

  if (headerRect) {
    handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;
  }

  return {
    id: "llm-chat:chat-input",
    displayName: "聊天输入框",
    type: "component" as const,
    width: rect.width + 80,
    height: Math.max(rect.height + 80, 900),
    mouseX: mouseX ?? window.screenX + rect.left + rect.width / 2,
    mouseY: mouseY ?? window.screenY + rect.top + rect.height / 2,
    handleOffsetX,
    handleOffsetY,
  };
};

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const config = getDetachConfig();
  if (!config) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸");
    return;
  }

  try {
    const sessionId = await invoke<string>("begin_detach_session", { config });
    if (sessionId) {
      await invoke("finalize_detach_session", { sessionId, shouldDetach: true });
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败");
  }
};

// ===== 路径转附件 =====
const handleConvertPaths = async () => {
  try {
    const result = await inputManager.convertPathsToAttachments();
    if (result.totalCount === 0) {
      customMessage.info("未在输入内容中检测到本地文件路径");
      return;
    }
    if (result.successCount > 0) {
      const msg =
        result.failedCount > 0
          ? `已转换 ${result.successCount} 个路径，${result.failedCount} 个失败`
          : `已转换 ${result.successCount} 个路径为附件`;
      customMessage.success(msg);
    } else {
      customMessage.warning(`${result.failedCount} 个路径转换失败，请检查文件是否存在`);
    }
  } catch (error) {
    errorHandler.error(error, "路径转换失败");
  }
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeEast = createResizeHandler("East");
const handleResizeWest = createResizeHandler("West");

// ===== 拖拽与分离功能 =====
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const config = getDetachConfig(e.screenX, e.screenY);
  if (!config) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸，无法开始拖拽");
    return;
  }

  startDetaching(config);
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
    <!-- 分离模式下的壁纸层 -->
    <div
      v-if="isDetached && settings.uiPreferences.showWallpaperInDetachedMode"
      class="detached-wallpaper"
    ></div>

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
        v-if="isDetached || settings.uiPreferences.enableDetachableHandle"
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
        <!-- 附件展示区 -->
        <div v-if="attachmentManager.hasAttachments.value" ref="attachmentsContainerRef">
          <MessageInputAttachments
            :attachments="attachmentManager.attachments.value"
            :count="attachmentManager.count.value"
            :max-count="attachmentManager.maxAttachmentCount"
            :get-will-use-transcription="getWillUseTranscription"
            @remove="attachmentManager.removeAttachment"
          />
        </div>

        <div class="input-wrapper">
          <ChatCodeMirrorEditor
            ref="textareaRef"
            v-model:value="inputText"
            :disabled="disabled"
            :placeholder="placeholderText"
            :height="editorHeight"
            :max-height="editorMaxHeight"
            :send-key="settings.shortcuts.send"
            @keydown="handleKeydown"
            @submit="handleSend"
            @paste="handlePaste"
          />
          <MessageInputToolbar
            :is-sending="isCurrentBranchGenerating"
            :disabled="disabled"
            :is-detached="props.isDetached"
            :is-expanded="isExpanded"
            :is-streaming-enabled="isStreamingEnabled"
            v-model:macro-selector-visible="macroSelectorVisible"
            v-model:settings="inputSettings"
            :context-stats="chatStore.contextStats"
            :token-count="tokenCount"
            :is-calculating-tokens="isCalculatingTokens"
            :token-estimated="tokenEstimated"
            :input-text="inputText"
            :is-processing-attachments="attachmentManager.isProcessing.value"
            :temporary-model="inputManager.temporaryModel.value"
            :has-attachments="attachmentManager.hasAttachments.value"
            :is-translating="isTranslatingInput"
            :translation-enabled="settings.translation.enabled"
            :is-compressing="isCompressing"
            :continuation-model="inputManager.continuationModel.value"
            @toggle-streaming="toggleStreaming"
            @insert="handleInsertMacro"
            @toggle-expand="toggleExpand"
            @execute-quick-action="handleQuickAction"
            @send="handleSend"
            @abort="handleAbort"
            @trigger-attachment="handleTriggerAttachment"
            @select-temporary-model="handleSelectTemporaryModel"
            @clear-temporary-model="inputManager.clearTemporaryModel"
            @translate-input="handleTranslateInput"
            @switch-session="handleSwitchSession"
            @new-session="handleNewSession"
            @compress-context="handleCompressContext"
            @complete-input="handleCompleteInput"
            @select-continuation-model="handleSelectContinuationModel"
            @clear-continuation-model="inputManager.clearContinuationModel"
            @convert-paths="handleConvertPaths"
          />
        </div>
      </div>
    </div>
    <!-- 左侧调整宽度手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="resize-handle-left"
      @mousedown="handleResizeWest"
      title="拖拽调整宽度"
    ></div>
    <!-- 右侧调整宽度手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="resize-handle-right"
      @mousedown="handleResizeEast"
      title="拖拽调整宽度"
    ></div>
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
  /* 移除 height: 100%，改为绝对定位沉底，让出上方空间给气泡 */
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: auto;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
  /* 分离模式下使用专用的底层背景 */
  background-color: var(--detached-base-bg, var(--container-bg));
}

/* 分离模式壁纸层 */
.detached-wallpaper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
  background-image: var(--wallpaper-url);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: var(--wallpaper-opacity);
  pointer-events: none;
  border-radius: inherit;
}

.main-content {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: stretch;
  min-width: 0;
  background: transparent; /* Ensure it doesn't have its own background */
  /* 提升层级，确保在壁纸之上 */
  position: relative;
  z-index: 1;
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

.input-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px; /* Slightly smaller radius for nesting */
}

.message-input-container:focus-within {
  border-color: var(--primary-color);
}

/* 分离模式下输入框沉底 */
.message-input-container.detached-mode .input-content {
  justify-content: flex-end; /* 让输入框在分离窗口中沉底 */
}

.message-input-container.detached-mode .input-wrapper {
  flex: none; /* 让 wrapper 根据内容自适应高度，配合 justify-content: flex-end */
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
  z-index: 10; /* 确保在最上层，高于内容和壁纸 */
  border-radius: 3px;
  transition: background-color 0.2s;
}

.resize-handle:hover {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

.resize-handle:active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}

/* 左侧调整宽度手柄 - 扩展的透明热区 */
.resize-handle-left {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -8px; /* 热区超出容器边界 8px，更容易触发 */
  width: 32px; /* 扩展的热区宽度 */
  cursor: w-resize;
  z-index: 20;
}

/* 右侧调整宽度手柄 - 扩展的透明热区 */
.resize-handle-right {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -8px; /* 热区超出容器边界 8px，更容易触发 */
  width: 32px; /* 扩展的热区宽度 */
  cursor: e-resize;
  z-index: 20;
}

/* 当左侧手柄被 hover 时，给容器添加左侧粗描边 - 描边从容器自己"长出来" */
.message-input-container.detached-mode:has(.resize-handle-left:hover) {
  border-left: 4px solid var(--primary-color);
}

/* 当右侧手柄被 hover 时，给容器添加右侧粗描边 - 描边从容器自己"长出来" */
.message-input-container.detached-mode:has(.resize-handle-right:hover) {
  border-right: 4px solid var(--primary-color);
}

/* 当手柄被激活（拖拽中）时，描边更亮 */
.message-input-container.detached-mode:has(.resize-handle-left:active) {
  border-left: 4px solid var(--primary-color);
  box-shadow: -4px 0 12px rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}

.message-input-container.detached-mode:has(.resize-handle-right:active) {
  border-right: 4px solid var(--primary-color);
  box-shadow: 4px 0 12px rgba(var(--primary-color-rgb, 64, 158, 255), 0.4);
}
</style>
