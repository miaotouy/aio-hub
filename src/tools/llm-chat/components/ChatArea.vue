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
import {
  ref,
  computed,
  toRef,
  onMounted,
  watch,
  shallowRef,
  defineAsyncComponent,
} from "vue";
import { useElementSize } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessageNode } from "../types";
import type { Asset } from "@/types/asset-management";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowResize } from "@/composables/useWindowResize";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ChatAreaHeader from "./ChatAreaHeader.vue";
import MessageList from "./message/MessageList.vue";
import MessageInput from "./message-input/MessageInput.vue";
import ToolCallingApprovalBar from "./message-input/ToolCallingApprovalBar.vue";
import MessageNavigator from "./message/MessageNavigator.vue";
import EditUserProfileDialog from "@/tools/user-profile-manager/components/user-profile/EditUserProfileDialog.vue";
import EditAgentDialog from "@/tools/agent-manager/components/management/EditAgentDialog.vue";
import ChatSettingsDialog from "./settings/ChatSettingsDialog.vue";
import FlowTreeGraph from "./conversation-tree-graph/flow/FlowTreeGraph.vue";
import ChatSearchPanel from "./search/ChatSearchPanel.vue";
import ShareScreenshotDialog from "./screenshot/ShareScreenshotDialog.vue";
// 获取智能体和模型信息
import { useChatSettings } from "../composables/settings/useChatSettings";
import { useLlmChatUiState } from "../composables/ui/useLlmChatUiState";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { mergeStyleOptions } from "@/tools/rich-text-renderer/utils/styleUtils";
import { isEqual } from "lodash-es";
import { initAgentAssetCache } from "../utils/agentAssetUtils";
import { provideChatAreaContext } from "../composables/useChatAreaContext";

const QuickActionManagerDialog = defineAsyncComponent(
  () => import("./quick-action/QuickActionManagerDialog.vue")
);

const logger = createModuleLogger("ChatArea");
const errorHandler = createModuleErrorHandler("ChatArea");

interface Props {
  messages?: ChatMessageNode[];
  isSending?: boolean;
  disabled?: boolean;
  isDetached?: boolean; // 是否在悬浮窗中
  currentAgentId?: string; // 当前智能体 ID
  currentModelId?: string; // 当前模型 ID
}

interface Emits {
  (
    e: "send",
    payload: {
      content: string;
      attachments?: Asset[];
      temporaryModel?: any; // 保持与 LlmChat.vue 一致
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
}

const props = withDefaults(defineProps<Props>(), {
  messages: () => [],
  isSending: false,
  disabled: true,
  isDetached: false,
});
const emit = defineEmits<Emits>();

const containerRef = ref<HTMLDivElement>();
const { width: containerWidth } = useElementSize(containerRef);
const chatAreaHeaderRef = ref<InstanceType<typeof ChatAreaHeader>>();
const messageListRef = ref<InstanceType<typeof MessageList>>();

// 截图分享弹窗状态
const screenshotDialogVisible = ref(false);
const screenshotFocusMessageId = ref<string | undefined>(undefined);
const handleScreenshot = (messageId: string) => {
  screenshotFocusMessageId.value = messageId;
  screenshotDialogVisible.value = true;
};

// 暴露消息区当前宽度给截图对话框, 用于 auto 模式快照 (采样时拿, 不维护响应式引用)
const getMessageAreaWidth = (): number => {
  return messageListRef.value?.getMessageAreaWidth() ?? 0;
};

const bus = useWindowSyncBus();
const { viewMode } = useLlmChatUiState();
const llmChatStore = useLlmChatStore();
const { loadSettings, settings } = useChatSettings();

// ----- 消息事件处理 -----
// ChatArea 现在是一个纯粹的视图组件，只负责接收 props 和发出 emits
// 所有分离逻辑都由 DetachedComponentContainer 通过适配器注入
const finalMessages = toRef(props, "messages");
const finalIsSending = toRef(props, "isSending");
const screenshotDefaultFileName = computed(() => {
  const session = llmChatStore.currentSession;
  const baseTitle = (session?.name ?? "").trim() || "AIO-Hub-Chat";
  return `${baseTitle}-分享.png`;
});
const finalDisabled = toRef(props, "disabled");
const finalCurrentAgentId = toRef(props, "currentAgentId");
const finalCurrentModelId = toRef(props, "currentModelId");

const chatAreaContext = provideChatAreaContext({
  currentAgentId: finalCurrentAgentId,
  currentModelId: finalCurrentModelId,
});
const {
  currentAgent,
  currentModel,
  effectiveUserProfile,
  showEditAgentDialog,
  initialEditTab,
  initialEditSection,
  showEditProfileDialog,
  showQuickActionManager,
  showChatSettings,
  showSearchPanel,
  handleEditAgent,
  handleSaveAgent,
  handleSaveUserProfile,
} = chatAreaContext;

// 计算用户消息的样式配置
const userRichTextStyleOptions = computed(() => {
  const profile = effectiveUserProfile.value;
  // 如果用户档案设置为自定义样式，则使用档案中的配置（合并全局样式）
  if (profile && profile.richTextStyleBehavior === "custom") {
    const globalStyle = settings.value.uiPreferences.markdownStyle;
    const userStyle = profile.richTextStyleOptions;
    return mergeStyleOptions(globalStyle, userStyle);
  }
  // 否则返回 undefined，MessageList 会自动回退到智能体样式
  return undefined;
});

// 计算最终的消息样式配置（合并全局设置和 Agent 设置）
const finalMessageStyleOptions = computed(() => {
  const globalStyle = settings.value.uiPreferences.markdownStyle;
  const agentStyle = currentAgent.value?.richTextStyleOptions;
  return mergeStyleOptions(globalStyle, agentStyle);
});

// ----- 拖拽与分离功能 -----
const { detachedComponents } = useDetachedManager();
const { startDetaching } = useDetachable();
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler("SouthEast");

const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const headerRef = chatAreaHeaderRef.value?.headerRef;
  if (headerRef) {
    const config = headerRef.getDetachableConfig(e);
    // 覆盖容器尺寸，因为 ComponentHeader 只知道自己的尺寸，不知道整体容器尺寸
    const rect = containerRef.value?.getBoundingClientRect();
    if (rect) {
      config.width = rect.width;
      config.height = rect.height;

      // 重新计算手柄偏移量，使其相对于整体容器
      const headerEl = headerRef.$el as HTMLElement;
      const headerRect = headerEl.getBoundingClientRect();
      config.handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
      config.handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;
    }

    // 应用开发者设置：强制允许原生缩放
    if (settings.value.developer.forceNativeResize) {
      config.disableNativeResize = false;
    }

    startDetaching(config);
  }
};

const handleSearchSelect = (messageId: string) => {
  messageListRef.value?.scrollToMessageId(messageId);
};

// 滚动阻断：防止任何意外的滚动位移（如内部 scrollIntoView 穿透）导致容器偏移
const handleContainerScroll = (e: Event) => {
  const el = e.currentTarget as HTMLElement;
  if (el.scrollTop !== 0) el.scrollTop = 0;
  if (el.scrollLeft !== 0) el.scrollLeft = 0;
};

const isInputVisible = computed(() => {
  // 只要输入框被独立分离出去，无论 ChatArea 在主窗口还是悬浮窗，都应隐藏内部的输入框。
  const isInputDetached = detachedComponents.value.includes(
    "llm-chat:chat-input"
  );
  logger.info("MessageInput 分离状态检查", {
    isInputDetached,
    isChatAreaDetached: props.isDetached,
    allDetached: detachedComponents.value,
  });
  return !isInputDetached;
});

// 处理从菜单打开悬浮窗
const handleDetach = async () => {
  const headerRef = chatAreaHeaderRef.value?.headerRef;
  if (!headerRef) return;

  const config = headerRef.getDetachableConfig();

  // 应用开发者设置：强制允许原生缩放
  if (settings.value.developer.forceNativeResize) {
    config.disableNativeResize = false;
  }

  // 覆盖容器尺寸
  const rect = containerRef.value?.getBoundingClientRect();
  if (rect) {
    config.width = rect.width;
    config.height = rect.height;

    // 重新计算手柄偏移量
    const headerEl = headerRef.$el as HTMLElement;
    const headerRect = headerEl.getBoundingClientRect();
    config.handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
    config.handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;

    // 更新坐标为中心点
    config.mouseX = window.screenX + rect.left + rect.width / 2;
    config.mouseY = window.screenY + rect.top + rect.height / 2;
  }

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
      errorHandler.error(
        new Error("Session ID is null"),
        "开始分离会话失败，未返回会话 ID"
      );
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败");
  }
};

// ----- 渲染配置引用稳定化 -----
// 防止切换智能体/保存配置时，即使内容未变也因引用变化触发全量重渲染
const stableLlmThinkRules = shallowRef(currentAgent.value?.llmThinkRules);
watch(
  () => currentAgent.value?.llmThinkRules,
  (newRules) => {
    if (!isEqual(newRules, stableLlmThinkRules.value)) {
      stableLlmThinkRules.value = newRules;
    }
  },
  { immediate: true }
);

const stableMessageStyleOptions = shallowRef(finalMessageStyleOptions.value);
watch(finalMessageStyleOptions, (newOptions) => {
  if (!isEqual(newOptions, stableMessageStyleOptions.value)) {
    stableMessageStyleOptions.value = newOptions;
  }
});

const stableUserRichTextStyleOptions = shallowRef(
  userRichTextStyleOptions.value
);
watch(userRichTextStyleOptions, (newOptions) => {
  if (!isEqual(newOptions, stableUserRichTextStyleOptions.value)) {
    stableUserRichTextStyleOptions.value = newOptions;
  }
});

const handleSendMessage = (payload: {
  content: string;
  attachments?: Asset[];
  temporaryModel?: any;
  disableMacroParsing?: boolean;
}) => emit("send", payload);
const handleAbort = () => emit("abort");
const handleCompleteInput = (
  content: string,
  options?: { modelId?: string; profileId?: string }
) => emit("complete-input", content, options);

// ----- 内容宽度限制样式 -----
const contentWidthStyle = computed(() => {
  if (!settings.value.uiPreferences.enableContentWidthLimit) {
    return {};
  }
  const maxWidth = settings.value.uiPreferences.contentMaxWidth ?? 800;
  return {
    width: "100%",
    maxWidth: `${maxWidth}px`,
    alignSelf: "center",
  };
});

// ----- MessageNavigator 相关 -----
// 获取滚动容器引用
const scrollElement = computed(() => {
  return messageListRef.value?.getScrollElement() ?? null;
});

// 追踪是否有新消息
const hasNewMessages = ref(false);
const previousMessageCount = ref(props.messages?.length ?? 0);

// 监听消息变化以更新新消息标记
watch(
  () => props.messages?.length ?? 0,
  (newCount) => {
    if (newCount > previousMessageCount.value) {
      // 检查是否在底部附近
      const element = scrollElement.value;
      if (element) {
        const { scrollTop, scrollHeight, clientHeight } = element;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        if (!isNearBottom) {
          hasNewMessages.value = true;
        }
      }
    }
    previousMessageCount.value = newCount;
  }
);

// 导航器事件处理
const handleScrollToTop = () => {
  hasNewMessages.value = false;
  messageListRef.value?.scrollToTop();
};

const handleScrollToBottom = () => {
  hasNewMessages.value = false;
  messageListRef.value?.scrollToEnd();
};

const handleScrollToNext = () => {
  messageListRef.value?.scrollToNext();
};

const handleScrollToPrev = () => {
  messageListRef.value?.scrollToPrev();
};

const isReady = ref(false);

// ----- 键盘导航 -----
const handleKeyDown = (e: KeyboardEvent) => {
  // 处理 Ctrl+F 搜索快捷键 (无论焦点在哪里，只要在 ChatArea 内)
  // 但如果焦点在 CodeMirror 编辑器内，则让编辑器自己处理搜索
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    const target = e.target as HTMLElement;
    const isInCodeMirror = target.closest(".cm-editor");
    if (!isInCodeMirror) {
      e.preventDefault();
      showSearchPanel.value = !showSearchPanel.value;
      return;
    }
    // 焦点在 CodeMirror 内，不拦截，让编辑器自己的搜索面板处理
    return;
  }

  // 检查焦点是否在输入框或其他可编辑元素上
  const target = e.target as HTMLElement;
  const isEditableElement =
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable;

  // 如果焦点在可编辑元素上，不拦截键盘事件
  if (isEditableElement) {
    return;
  }

  // 只处理上下箭头键
  if (e.key === "ArrowUp") {
    e.preventDefault(); // 阻止默认的缓慢滚动
    handleScrollToPrev();
  } else if (e.key === "ArrowDown") {
    e.preventDefault(); // 阻止默认的缓慢滚动
    handleScrollToNext();
  }
};

onMounted(async () => {
  // 1. 初始化智能体资产缓存 (必须在渲染内容前完成，以支持同步解析)
  try {
    await initAgentAssetCache();
    logger.info("智能体资产缓存已初始化");
  } catch (error) {
    errorHandler.error(error, "初始化智能体资产缓存失败");
  }

  // 2. 加载聊天设置
  await loadSettings();
  logger.info("聊天设置已加载");

  isReady.value = true;

  // 注册来自同步总线的 UI 请求处理器 (使用独立的 llm-chat-ui 命名空间，避免覆盖核心逻辑)
  // 无论在什么类型的窗口，只要 ChatArea 存在，就应该响应这些 UI 操作请求
  bus.onActionRequest("llm-chat-ui", async (action, data) => {
    if (action === "select-continuation-model") {
      logger.info("收到续写模型选择 UI 请求");
      emit("select-continuation-model");
      return true;
    } else if (action === "open-agent-settings") {
      logger.info("收到打开智能体设置 UI 请求", data);
      handleEditAgent(data?.tab, data?.section);
      return true;
    } else if (action === "open-quick-action-manager") {
      logger.info("收到打开快捷操作管理 UI 请求");
      showQuickActionManager.value = true;
      return true;
    }
    return null;
  });

  logger.info("ChatArea mounted", {
    props: {
      messagesCount: props.messages?.length,
      isSending: props.isSending,
      disabled: props.disabled,
      isDetached: props.isDetached,
      currentAgentId: props.currentAgentId,
      currentModelId: props.currentModelId,
    },
    agent: currentAgent.value?.name,
    model: currentModel.value?.name,
  });

  // 监视 props.messages 的数量变化，用于调试
  watch(
    () => props.messages?.length,
    (newCount) => {
      logger.debug("ChatArea props.messages 数量更新", {
        newCount,
        // 只打印第一条消息的内容以避免日志过长
        firstMessageContent:
          props.messages && props.messages.length > 0
            ? props.messages[0].content
            : "N/A",
      });
    },
    { immediate: true }
  );
});
</script>

<template>
  <div
    v-if="isReady"
    ref="containerRef"
    :class="['chat-area-container', { 'detached-mode': isDetached }]"
    tabindex="0"
    @keydown="handleKeyDown"
    @scroll="handleContainerScroll"
  >
    <!-- 分离模式下的壁纸层 -->
    <div
      v-if="isDetached && settings.uiPreferences.showWallpaperInDetachedMode"
      class="detached-wallpaper"
    ></div>

    <ChatAreaHeader
      ref="chatAreaHeaderRef"
      :container-width="containerWidth"
      :is-detached="props.isDetached"
      @drag-start="handleDragStart"
      @detach="handleDetach"
    />

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 对话内容区 -->
      <div class="chat-content">
        <!-- 消息列表容器 - 用于弹性布局 -->
        <div class="message-list-wrapper">
          <!-- 根据 viewMode 动态渲染不同的视图 -->
          <template v-if="viewMode === 'linear'">
            <!-- 消息列表 -->
            <MessageList
              ref="messageListRef"
              :session-index="llmChatStore.currentSession"
              :session-detail="llmChatStore.currentSessionDetail"
              :messages="finalMessages"
              :is-sending="finalIsSending"
              :llm-think-rules="stableLlmThinkRules"
              :rich-text-style-options="stableMessageStyleOptions"
              :user-rich-text-style-options="stableUserRichTextStyleOptions"
              :style="contentWidthStyle"
              @screenshot="handleScreenshot"
            />

            <!-- 消息导航器 -->
            <MessageNavigator
              v-if="settings.uiPreferences.showMessageNavigator"
              :scroll-element="scrollElement"
              :message-count="finalMessages.length"
              :current-index="messageListRef?.currentVisibleIndex"
              :has-new-messages="hasNewMessages"
              @seen-new-messages="hasNewMessages = false"
              @scroll-to-top="handleScrollToTop"
              @scroll-to-bottom="handleScrollToBottom"
              @scroll-to-next="handleScrollToNext"
              @scroll-to-prev="handleScrollToPrev"
            />
          </template>

          <!-- V2 树图视图 (力导向布局) -->
          <template v-else-if="viewMode === 'force-graph'">
            <div class="force-graph-container conversation-tree-graph-box">
              <FlowTreeGraph
                :session="llmChatStore.currentSessionDetail"
                @screenshot="handleScreenshot"
              />
            </div>
          </template>
        </div>

        <!-- 工具调用确认栏 -->
        <ToolCallingApprovalBar
          v-if="isInputVisible"
          :style="contentWidthStyle"
        />

        <!-- 输入框 -->
        <MessageInput
          v-if="isInputVisible"
          class="chat-message-input"
          :disabled="finalDisabled"
          :is-sending="finalIsSending"
          @send="handleSendMessage"
          @abort="handleAbort"
          @complete-input="handleCompleteInput"
          @select-continuation-model="emit('select-continuation-model')"
          @clear-continuation-model="emit('clear-continuation-model')"
          @open-agent-settings="handleEditAgent"
          :style="contentWidthStyle"
        />
      </div>
    </div>

    <!-- 编辑智能体对话框 -->
    <EditAgentDialog
      :visible="showEditAgentDialog"
      mode="edit"
      :agent="currentAgent"
      :initial-tab="initialEditTab"
      :initial-section="initialEditSection"
      sync-to-chat
      @update:visible="showEditAgentDialog = $event"
      @save="handleSaveAgent"
    />

    <!-- 编辑用户档案对话框 -->
    <EditUserProfileDialog
      :visible="showEditProfileDialog"
      :profile="effectiveUserProfile || null"
      @update:visible="showEditProfileDialog = $event"
      @save="handleSaveUserProfile"
    />

    <!-- 聊天设置对话框 -->
    <ChatSettingsDialog
      :visible="showChatSettings"
      @update:visible="showChatSettings = $event"
    />

    <!-- 搜索面板 -->
    <ChatSearchPanel
      v-if="showSearchPanel"
      :messages="finalMessages"
      @select="handleSearchSelect"
      @close="showSearchPanel = false"
    />

    <!-- 快捷操作管理弹窗 -->
    <QuickActionManagerDialog v-model:visible="showQuickActionManager" />

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="window-resize-indicator"
      title="拖拽调整窗口大小"
      @mousedown="handleResizeStart"
    >
      <div class="indicator-border"></div>
      <div class="indicator-handle"></div>
    </div>
    <!-- 消息截图分享弹窗 -->
    <ShareScreenshotDialog
      v-model:visible="screenshotDialogVisible"
      :messages="finalMessages"
      :session-index="llmChatStore.currentSession"
      :session-detail="llmChatStore.currentSessionDetail"
      :is-sending="finalIsSending"
      :initial-focus-message-id="screenshotFocusMessageId"
      :llm-think-rules="stableLlmThinkRules"
      :rich-text-style-options="stableMessageStyleOptions"
      :user-rich-text-style-options="stableUserRichTextStyleOptions"
      :default-file-name="screenshotDefaultFileName"
      :get-message-area-width="getMessageAreaWidth"
    />
  </div>
</template>

<style scoped>
.chat-area-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  border: var(--border-width) solid var(--border-color);
  overflow: hidden;
  /* 彻底阻断滚动链，并开启渲染隔离 */
  overscroll-behavior: none;
  contain: size layout style;
}

/* 分离模式下添加更强的阴影和圆角 */
.chat-area-container.detached-mode {
  position: absolute;
  inset: 32px;
  height: auto;
  border-radius: 16px;
  box-shadow:
    0 8px 16px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15);
  /* 分离模式下使用专用的底层背景，提供遮罩能力 */
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
  border-radius: inherit; /* 继承容器圆角 */
}

/* flex 容器通用样式 */
.main-content,
.chat-content {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  /* 提升层级，确保在壁纸之上 */
  position: relative;
  z-index: 1;
  background-color: var(--card-bg);
}

/* 分离模式下，如果启用了壁纸，可以让内容背景稍微透明一点，或者保持 card-bg (本身就是半透明的) */
/* 这里我们不做特殊处理，直接依赖 card-bg 的透明度 */

/* 消息列表容器 - 弹性增长，占据所有剩余空间 */
.message-list-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 0%; /* 强制 flex-basis 为 0 */
  min-height: 0;
  height: 0; /* 确保在 flex 布局中高度被严格限制 */
  overflow: hidden; /* 防止内容溢出 */
  /* 布局隔离：防止内部滚动传播到上层容器 */
  overscroll-behavior: contain;
  contain: size layout style;
}

/* 使用伪元素叠加层实现顶部渐隐，避免 mask 与 backdrop-filter 冲突 */
.message-list-wrapper::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px; /* 渐变的高度 */
  /* 关键：从 var(--card-bg) 开始渐变，它本身就包含了UI透明度 */
  background: linear-gradient(to bottom, var(--card-bg) 20%, transparent 100%);
  pointer-events: none; /* 允许鼠标事件穿透 */
  z-index: 2; /* 确保在消息列表内容之上 */
}

.chat-content {
  flex-direction: column;
  padding: 0 12px 12px; /* 左右和底部保留边距 */
  /* overflow: hidden; */ /* 解除限制，让 MessageList 可以滚动 */
}

/* MessageInput 两侧边距，增强层次感 */
.chat-message-input {
  margin-left: 8px;
  margin-right: 8px;
  padding-left: 8px;
  padding-right: 8px;
  flex-shrink: 0; /* 关键：防止输入框被压缩 */
}

.conversation-tree-graph-box {
  padding: 0 30px;
  box-sizing: border-box;
}

.force-graph-container {
  height: 100%;
  width: 100%;
}

/* 右下角调整大小手柄 - 仅在分离模式下显示 */
.window-resize-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 100;
}

.indicator-border {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  left: 6px;
  border: 1px solid var(--primary-color);
  border-radius: 10px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.indicator-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  pointer-events: auto;
  cursor: se-resize;
  border-radius: 0 0 10px 0;
  overflow: hidden;
}

.indicator-handle::before {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 100%;
  height: 100%;
  border: 2px solid var(--primary-color);
  border-radius: 0 0 10px 0;
  border-top: none;
  border-left: none;
  opacity: 0.4;
  transition: opacity 0.2s;
}

.indicator-handle:hover::before {
  opacity: 0.8;
  border-color: var(--primary-hover-color, var(--primary-color));
}

.indicator-handle:hover ~ .indicator-border {
  opacity: 0.3;
}

.indicator-handle:active::before {
  opacity: 1;
}

.indicator-handle:active ~ .indicator-border {
  opacity: 0.5;
}
</style>
