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
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { ref, toRef, computed, onMounted, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDetachable } from "@/composables/useDetachable";
import { useWindowResize } from "@/composables/useWindowResize";
import { useChatFileInteraction } from "@/composables/useFileInteraction";
import { useChatInputManager } from "@/tools/llm-chat/composables/input/useChatInputManager";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useChatSettings } from "@/tools/llm-chat/composables/settings/useChatSettings";
import { useMessageInputStore } from "../../stores/messageInputStore";
import type { Asset } from "@/types/asset-management";
import type { ModelIdentifier } from "@/tools/llm-chat/types";
import { customMessage } from "@/utils/customMessage";
import { useTranscriptionManager } from "@/tools/llm-chat/composables/features/useTranscriptionManager";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ComponentHeader from "@/components/ComponentHeader.vue";
import MessageInputToolbar from "./MessageInputToolbar.vue";
import ChatCodeMirrorEditor from "./ChatCodeMirrorEditor.vue";
import ChatTextareaEditor from "./ChatTextareaEditor.vue";
import MessageInputAttachments from "./MessageInputAttachments.vue";

// Composables
import { useMessageInputResize } from "../../composables/input/useMessageInputResize";
import { provideChatContext } from "../../composables/chat/useChatContext";

const logger = createModuleLogger("MessageInput");
const errorHandler = createModuleErrorHandler("MessageInput");
// 获取聊天 store 以访问流式输出开关
const chatStore = useLlmChatStore();
const {
  settings,
  updateSettings,
  isLoaded: settingsLoaded,
  loadSettings,
} = useChatSettings();
const transcriptionManager = useTranscriptionManager();

// 计算流式输出状态，在设置加载前默认为 false（非流式）
const isStreamingEnabled = computed(() => {
  return settingsLoaded.value
    ? settings.value.uiPreferences.isStreaming
    : false;
});

const inputStore = useMessageInputStore();
// 计算当前分支是否正在生成
const isCurrentBranchGenerating = computed(() => {
  const detail = chatStore.currentSessionDetail;
  if (!detail || !detail.activeLeafId) return false;
  return chatStore.isNodeGenerating(detail.activeLeafId);
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
  isDetached?: boolean; // 是否在悬浮窗中
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
  (
    e: "complete-input",
    content: string,
    options?: { modelId?: string; profileId?: string }
  ): void;
  (e: "select-continuation-model"): void;
  (e: "clear-continuation-model"): void;
  (e: "open-agent-settings", tab?: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const textareaRef = ref<
  | InstanceType<typeof ChatCodeMirrorEditor>
  | InstanceType<typeof ChatTextareaEditor>
>();
const containerRef = ref<HTMLDivElement>();
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const attachmentsContainerRef = ref<HTMLDivElement>();
const { height: attachmentsHeight } = useElementSize(attachmentsContainerRef);
const { height: containerHeight } = useElementSize(containerRef);

// 状态
const isExpanded = ref(false);
const isUpdatingSize = ref(false); // 锁，防止并发调整大小导致抖动

// 使用全局输入管理器
const inputManager = useChatInputManager();
const inputText = inputManager.inputText;

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
const {
  editorHeight,
  editorMaxHeight,
  isCustomHeightLocked,
  handleInputResizeStart,
  handleResizeDoubleClick,
  resetCustomHeight,
} = useMessageInputResize({
  isDetached: props.isDetached || false,
  textareaRef,
  extraHeight: attachmentsHeight,
  isExpanded,
  onResizeStart: () => {
    isExpanded.value = false;
  },
});

const { currentAgentId } = useLlmChatUiState();

/**
 * 检查附件是否会使用转写
 */
const agentStore = useAgentStore();
const getWillUseTranscription = (asset: Asset): boolean => {
  let modelId = "";
  let profileId = "";
  const temporaryModel = inputStore.temporaryModel;
  if (temporaryModel) {
    modelId = temporaryModel.modelId;
    profileId = temporaryModel.profileId;
  } else if (currentAgentId.value) {
    const agent = agentStore.getAgentById(currentAgentId.value);
    if (agent) {
      modelId = agent.modelId;
      profileId = agent.profileId;
    }
  }
  return transcriptionManager.computeWillUseTranscription(
    asset,
    modelId,
    profileId,
    undefined
  );
};
// 统一的文件交互处理
const { isDraggingOver } = useChatFileInteraction({
  element: containerRef,
  onPaths: async (paths) => {
    logger.info("文件拖拽触发", { paths, disabled: props.disabled });
    const beforeIds = new Set(inputManager.attachments.value.map((a) => a.id));
    await inputManager.addAttachments(paths);

    const newAssets = inputManager.attachments.value.filter(
      (a) => !beforeIds.has(a.id)
    );
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

const handleOpenAgentSettings = (tab?: string) => {
  emit("open-agent-settings", tab);
};

// 计算 placeholder 文本
const placeholderText = computed(() => {
  // 只有在真正没有会话时才显示“请创建”
  if (!chatStore.currentSessionId) return "请先创建或选择一个对话";

  const sendKey = settings.value.shortcuts.send;
  const sendHint =
    sendKey === "ctrl+enter"
      ? "Ctrl/Cmd + Enter 发送"
      : "Enter 发送, Shift + Enter 换行";
  return `输入消息、拖入或粘贴文件... (${sendHint})`;
});

// 监听聚焦请求
watch(inputManager.focusRequest, () => {
  textareaRef.value?.focus();
});

/**
 * 动态调整分离窗口高度以适应菜单显示或内容变化
 * @param expanding 是否强制展开高度（用于菜单显示）
 */
const updateDetachedWindowSize = async (
  expanding: boolean = inputStore.anyMenuOpen
) => {
  if (!props.isDetached || isUpdatingSize.value) return;
  isUpdatingSize.value = true;
  try {
    const scale = window.devicePixelRatio || 1;

    // 获取当前容器的实际像素高度
    // 这里的计算需要考虑到 DetachedComponentContainer.vue 中的 padding (32px * 2)
    // 以及组件自身的 top: 12px 定位和底部留出的缓冲空间
    const currentContentHeight = Math.ceil(
      (containerHeight.value + 12 + 64 + 16) * scale
    );

    let targetHeight;
    if (expanding) {
      // 展开菜单时，窗口高度至少为 650，但不能小于内容高度
      targetHeight = Math.max(currentContentHeight, 650 * scale);
    } else {
      // 关闭菜单时，精确收缩到内容高度
      targetHeight = currentContentHeight;
    }

    // 使用全局尺寸处理方法，指定 anchor 为 top 以实现“向下增长”，避免抖动
    await animateWindowSize({
      height: targetHeight,
      anchor: "top",
      threshold: 2,
    });
  } catch (e) {
    logger.warn("动态调整分离窗口大小失败", e);
  } finally {
    isUpdatingSize.value = false;
  }
};
// 监听菜单状态变化
watch(
  () => inputStore.anyMenuOpen,
  (val) => {
    updateDetachedWindowSize(val);
  }
);

// 监听容器内容高度变化 (如输入多行、添加附件、手动拖拽高度)
watch(containerHeight, () => {
  if (props.isDetached) {
    updateDetachedWindowSize();
  }
});

// Provide context for child components (MessageInputToolbar)
provideChatContext({
  state: {
    isSending: toRef(props, "isSending"),
    disabled: toRef(props, "disabled"),
  },
  actions: {
    send: async () => {
      await inputStore.handleSend();
    },
    abort: inputStore.handleAbort,
    triggerAttachment: async () => {
      const newAssets = await inputStore.handleTriggerAttachment(
        props.disabled
      );
      if (newAssets && newAssets.length > 0) {
        inputManager.handleAssetsAddition(
          newAssets,
          textareaRef.value,
          settings.value.transcription.autoInsertPlaceholder
        );
      }
    },
  },
});

// 初始加载
onMounted(async () => {
  inputStore.isDetached = props.isDetached ?? false;

  // 注册编辑器到 inputManager，以便执行精准的文本替换
  if (textareaRef.value) {
    inputManager.registerEditor(textareaRef.value);
  }
  // 注册回调到 Store
  inputStore.registerTextareaRef(textareaRef);
  inputStore.registerSendCallback((payload: any) => {
    isExpanded.value = false;
    emit("send", payload);
  });
  inputStore.registerAbortCallback(() => {
    emit("abort");
  });
  inputStore.registerCompleteInputCallback((content: string, options: any) => {
    emit("complete-input", content, options);
  });

  if (inputManager.attachments.value.length > 0) {
    inputManager.attachments.value.forEach((asset) => {
      transcriptionManager.markAsProcessed(asset.id);
    });
  }
  transcriptionManager.init();
  if (!settingsLoaded.value) {
    await loadSettings();
    if (props.isDetached) {
      // 初始状态下收缩窗口到输入框实际大小
      setTimeout(() => updateDetachedWindowSize(false), 300);
    }
  }
});

/**
 * 获取分离窗口的配置
 */
const getDetachConfig = (e?: MouseEvent) => {
  if (!headerRef.value) return null;

  const config = headerRef.value.getDetachableConfig(e);

  // 应用开发者设置：强制允许原生缩放
  if (settings.value.developer.forceNativeResize) {
    config.disableNativeResize = false;
  }

  const rect = containerRef.value?.getBoundingClientRect();
  if (rect) {
    config.width = rect.width + 80;
    config.height = rect.height + 80;

    // 重新计算手柄偏移量
    const headerEl = headerRef.value.$el as HTMLElement;
    const headerRect = headerEl.getBoundingClientRect();
    config.handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    config.handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;

    if (!e) {
      // 菜单点击模式，使用中心点
      config.mouseX = window.screenX + rect.left + rect.width / 2;
      config.mouseY = window.screenY + rect.top + rect.height / 2;
    }
  }

  return config;
};

// 处理从菜单打开悬浮窗
const handleDetach = async () => {
  const config = getDetachConfig();
  if (!config) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸");
    return;
  }

  try {
    const sessionId = await invoke<string>("begin_detach_session", { config });
    if (sessionId) {
      await invoke("finalize_detach_session", {
        sessionId,
        shouldDetach: true,
      });
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败");
  }
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler, animateWindowSize } = useWindowResize();
const handleResizeEast = createResizeHandler("East");
const handleResizeWest = createResizeHandler("West");
// ===== 拖拽与分离功能 =====
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  // 排除掉具有交互性的元素，只允许在背景区域触发拖拽
  const target = e.target as HTMLElement;

  // 0. 排除交互性元素（按钮、输入框等），防止拦截它们的点击事件
  if (
    target.closest("button") ||
    target.closest("input") ||
    target.closest("textarea") ||
    target.closest(".el-dropdown")
  ) {
    return;
  }

  // 1. 检查是否点击了手柄区域 (ComponentHeader 或显式标记的手柄)
  const isHandle = target.closest(".detachable-handle");

  // 2. 检查是否点击在非交互的背景区域
  const isBackground =
    target === containerRef.value ||
    target.classList.contains("main-content") ||
    target.classList.contains("input-content") ||
    target.classList.contains("input-wrapper") ||
    target.classList.contains("detached-wallpaper");

  if (props.isDetached) {
    // 分离模式下：手柄或背景区域均可触发原生窗口拖拽
    if (isHandle || isBackground) {
      getCurrentWindow().startDragging();
    }
    return;
  }

  // 非分离模式下：只有点击手柄区域才允许触发分离拖拽
  if (!isHandle) return;

  const config = getDetachConfig(e);
  if (!config) {
    errorHandler.error(
      new Error("Container rect is null"),
      "无法获取容器尺寸，无法开始拖拽"
    );
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
    @mousedown="handleDragStart"
  >
    <!-- 分离模式下的壁纸层 -->
    <div
      v-if="isDetached && settings.uiPreferences.showWallpaperInDetachedMode"
      class="detached-wallpaper"
    ></div>

    <!-- 调整高度手柄 - 非悬浮模式下在顶部 -->
    <div
      v-if="!isDetached"
      class="resize-handle"
      @mousedown="handleInputResizeStart"
      @dblclick="handleResizeDoubleClick"
      title="拖拽调整高度（双击重置）"
    ></div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 悬浮窗手柄：非悬浮模式用于触发分离，悬浮模式用于拖动窗口 -->
      <ComponentHeader
        v-if="isDetached || settings.uiPreferences.enableDetachableHandle"
        ref="headerRef"
        id="llm-chat:chat-input"
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
        <div
          v-if="attachmentManager.hasAttachments.value"
          ref="attachmentsContainerRef"
        >
          <MessageInputAttachments
            :attachments="attachmentManager.attachments.value"
            :count="attachmentManager.count.value"
            :max-count="attachmentManager.maxAttachmentCount"
            :get-will-use-transcription="getWillUseTranscription"
            @remove="attachmentManager.removeAttachment"
            @clear="attachmentManager.clearAttachments"
            @transcribe-all="inputStore.handleTranscribeAll"
            @smart-transcribe-all="
              inputStore.handleSmartTranscribeAll(getWillUseTranscription)
            "
            @force-transcribe-all="inputStore.handleForceTranscribeAll"
            @stop-all="inputStore.handleStopAllTranscriptions"
          />
        </div>
        <div class="input-wrapper">
          <ChatCodeMirrorEditor
            v-if="!settings.uiPreferences.useNativeTextarea"
            ref="textareaRef"
            v-model:value="inputText"
            :disabled="disabled"
            :placeholder="placeholderText"
            :height="editorHeight"
            :max-height="editorMaxHeight"
            :send-key="settings.shortcuts.send"
            @submit="inputStore.handleSend()"
            @paste="inputStore.handlePaste"
          />
          <ChatTextareaEditor
            v-else
            ref="textareaRef"
            v-model:value="inputText"
            :disabled="disabled"
            :placeholder="placeholderText"
            :height="editorHeight"
            :max-height="editorMaxHeight"
            :send-key="settings.shortcuts.send"
            @submit="inputStore.handleSend()"
            @paste="inputStore.handlePaste"
          />
          <MessageInputToolbar
            :is-detached="props.isDetached"
            :is-expanded="isExpanded"
            :is-streaming-enabled="isStreamingEnabled"
            :context-stats="chatStore.contextStats"
            :input-text="inputText"
            :is-processing-attachments="attachmentManager.isProcessing.value"
            :has-attachments="attachmentManager.hasAttachments.value"
            :translation-enabled="settings.translation.enabled"
            :is-compressing="inputStore.isCompressing"
            :is-input-height-locked="isCustomHeightLocked"
            @toggle-streaming="toggleStreaming"
            @toggle-expand="toggleExpand"
            @unlock-input-height="resetCustomHeight"
            @open-agent-settings="handleOpenAgentSettings"
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
  border: var(--border-width) solid var(--border-color);
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
  /* 移除原本的沉底逻辑，改为绝对定位在顶部，向下生长 */
  position: absolute;
  top: 32px;
  left: 32px;
  right: 32px;
  bottom: auto;
  height: auto;
  margin: 0;
  border-bottom: var(--border-width) solid var(--border-color);
  border-bottom-left-radius: 24px; /* 恢复圆角 */
  border-bottom-right-radius: 24px;
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.3),
    0 2px 4px rgba(0, 0, 0, 0.1);
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
  /* MessageInput 的手柄是侧边的，补上边框和背景以保持可见性 */
  border: var(--border-width) solid var(--border-color);
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
  justify-content: flex-start; /* 分离模式下顶部对齐 */
}

.message-input-container.detached-mode .input-wrapper {
  flex: 1; /* 允许占据剩余空间 */
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
  width: 24px; /* 扩展的热区宽度 */
  cursor: w-resize;
  z-index: 20;
}

/* 右侧调整宽度手柄 - 扩展的透明热区 */
.resize-handle-right {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -8px; /* 热区超出容器边界 8px，更容易触发 */
  width: 16px; /* 扩展的热区宽度 */
  cursor: e-resize;
  z-index: 20;
}

/* 当左侧手柄被 hover 时，给容器添加左侧描边 */
.message-input-container.detached-mode:has(.resize-handle-left:hover) {
  border-left: 2px solid var(--primary-color);
}

/* 当右侧手柄被 hover 时，给容器添加右侧描边 */
.message-input-container.detached-mode:has(.resize-handle-right:hover) {
  border-right: 2px solid var(--primary-color);
}

/* 当手柄被激活（拖拽中）时，描边 */
.message-input-container.detached-mode:has(.resize-handle-left:active) {
  border-left: 2px solid var(--primary-color);
  box-shadow: -2px 0 8px rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}

.message-input-container.detached-mode:has(.resize-handle-right:active) {
  border-right: 2px solid var(--primary-color);
  box-shadow: 2px 0 8px rgba(var(--primary-color-rgb, 64, 158, 255), 0.3);
}
</style>
