<script setup lang="ts">
import { ref, computed, toRef, onMounted, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { invoke } from "@tauri-apps/api/core";
import { ElTooltip, ElIcon } from "element-plus";
import type { ChatMessageNode, UserProfile, AgentEditData } from "../types";
import type { Asset } from "@/types/asset-management";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowResize } from "@/composables/useWindowResize";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import ComponentHeader from "@/components/ComponentHeader.vue";
import MessageList from "./message/MessageList.vue";
import MessageInput from "./message-input/MessageInput.vue";
import MessageNavigator from "./message/MessageNavigator.vue";
import EditUserProfileDialog from "./user-profile/EditUserProfileDialog.vue";
import EditAgentDialog from "./agent/EditAgentDialog.vue";
import ChatSettingsDialog from "./settings/ChatSettingsDialog.vue";
import ViewModeSwitcher from "./message/ViewModeSwitcher.vue";
import FlowTreeGraph from "./conversation-tree-graph/flow/FlowTreeGraph.vue";
import ChatSearchPanel from "./search/ChatSearchPanel.vue";
import { Settings2, Search } from "lucide-vue-next";
// import { Setting } from "@element-plus/icons-vue";

const logger = createModuleLogger("ChatArea");
const errorHandler = createModuleErrorHandler("ChatArea");

interface Props {
  messages?: ChatMessageNode[];
  isSending?: boolean;
  disabled?: boolean;
  isDetached?: boolean; // 是否在独立窗口中
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
  (e: "delete-message", messageId: string): void;
  (e: "regenerate", messageId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "switch-sibling", nodeId: string, direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
  (e: "toggle-enabled", nodeId: string): void;
  (e: "edit-message", nodeId: string, newContent: string, attachments?: Asset[]): void;
  (e: "abort-node", nodeId: string): void;
  (e: "continue", nodeId: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "complete-input", content: string, options?: { modelId?: string; profileId?: string }): void;
  (e: "select-continuation-model"): void;
  (e: "clear-continuation-model"): void;
  (e: "create-branch", nodeId: string): void;
  (e: "analyze-context", nodeId: string): void;
  (e: "save-to-branch", nodeId: string, newContent: string, attachments?: Asset[]): void;
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
const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const messageListRef = ref<InstanceType<typeof MessageList>>();

// 获取智能体和模型信息
import { useAgentStore } from "../stores/agentStore";
import { useUserProfileStore } from "../stores/userProfileStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useChatSettings } from "../composables/useChatSettings";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useThemeAppearance, getBlendedBackgroundColor } from "@/composables/useThemeAppearance";
import { useResolvedAvatar } from "../composables/useResolvedAvatar";
import { useLlmChatUiState } from "../composables/useLlmChatUiState";
import { useLlmChatStore } from "../stores/llmChatStore";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { mergeStyleOptions } from "@/tools/rich-text-renderer/utils/styleUtils";

const agentStore = useAgentStore();
const bus = useWindowSyncBus();
const { viewMode } = useLlmChatUiState();
const llmChatStore = useLlmChatStore();
const userProfileStore = useUserProfileStore();
const { getProfileById } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();
const { loadSettings, settings } = useChatSettings();
const { open: openModelSelectDialog } = useModelSelectDialog();
useThemeAppearance(); // 仅调用以确保主题样式被应用

// 当前智能体信息
const currentAgent = computed(() => {
  if (!finalCurrentAgentId.value) return null;
  return agentStore.getAgentById(finalCurrentAgentId.value);
});

const agentAvatarSrc = useResolvedAvatar(currentAgent, "agent");

// 当前模型信息
const currentModel = computed(() => {
  if (!currentAgent.value) return null;
  const profile = getProfileById(currentAgent.value.profileId);
  if (!profile) return null;
  // 在分离模式下，我们可能没有完整的模型列表，所以需要处理
  const modelId = finalCurrentModelId.value || currentAgent.value.modelId;
  return profile.models.find((m) => m.id === modelId);
});

// 模型图标
const modelIcon = computed(() => {
  if (!currentModel.value) return null;
  return getModelIcon(currentModel.value);
});

// 当前生效的用户档案（智能体绑定 > 全局配置）
const effectiveUserProfile = computed(() => {
  if (!currentAgent.value) return null;

  // 优先使用智能体绑定的档案
  if (currentAgent.value.userProfileId) {
    return userProfileStore.getProfileById(currentAgent.value.userProfileId);
  }

  // 否则使用全局档案
  return userProfileStore.globalProfile;
});

const userProfileAvatarSrc = useResolvedAvatar(effectiveUserProfile, "user-profile");

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

// ===== 拖拽与分离功能 =====
const { detachedComponents } = useDetachedManager();
const { startDetaching } = useDetachable();
const handleDragStart = (e: MouseEvent) => {
  if (props.isDetached) return;

  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸，无法开始拖拽");
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
    id: "llm-chat:chat-area",
    displayName: "对话区域",
    type: "component",
    width: rect.width,
    height: rect.height,
    mouseX: e.screenX,
    mouseY: e.screenY,
    handleOffsetX,
    handleOffsetY,
  });
};

// ===== 用户档案编辑 =====
const showEditProfileDialog = ref(false);

// ===== 智能体编辑 =====
const showEditAgentDialog = ref(false);

// ===== 聊天设置 =====
const showChatSettings = ref(false);

// ===== 搜索功能 =====
const showSearchPanel = ref(false);

const handleSearchSelect = (messageId: string) => {
  messageListRef.value?.scrollToMessageId(messageId);
};

const handleEditAgent = () => {
  if (currentAgent.value) {
    logger.info("打开智能体编辑对话框", { agentId: currentAgent.value.id });
    showEditAgentDialog.value = true;
  } else {
    logger.warn("无法编辑智能体：未找到当前智能体");
  }
};

const handleSelectModel = async () => {
  if (!currentAgent.value) {
    logger.warn("无法选择模型：未找到当前智能体");
    return;
  }

  logger.info("打开模型选择弹窗");

  // 构造当前选中的模型信息
  let currentSelection = null;
  if (currentModel.value) {
    const profile = getProfileById(currentAgent.value.profileId);
    if (profile) {
      currentSelection = {
        profile,
        model: currentModel.value,
      };
    }
  }

  const result = await openModelSelectDialog({ current: currentSelection });

  if (result) {
    logger.info("用户选择了新模型", {
      profile: result.profile.name,
      model: result.model.name,
    });

    // 更新智能体的 profileId 和 modelId
    const updates = {
      profileId: result.profile.id,
      modelId: result.model.id,
    };

    if (bus.windowType === "detached-component") {
      try {
        await bus.requestAction("update-agent", {
          agentId: currentAgent.value.id,
          updates,
        });
      } catch (error) {
        errorHandler.error(error, "请求更新智能体失败");
      }
    } else {
      agentStore.updateAgent(currentAgent.value.id, updates);
    }
  } else {
    logger.info("用户取消了模型选择");
  }
};

const handleSaveAgent = async (
  data: AgentEditData,
  options: { silent?: boolean; agentId?: string } = {}
) => {
  const targetId = options.agentId || currentAgent.value?.id;
  if (targetId) {
    logger.info("保存智能体", { agentId: targetId, data, silent: options.silent });

    // 直接使用 data 作为 updates，避免手动枚举字段导致遗漏
    // EditAgentDialog 已经负责清洗数据，确保只传递有效的业务字段
    const updates = data;

    if (bus.windowType === "detached-component") {
      try {
        await bus.requestAction("update-agent", {
          agentId: targetId,
          updates,
        });
      } catch (error) {
        errorHandler.error(error, "请求更新智能体失败");
      }
    } else {
      agentStore.updateAgent(targetId, updates);
    }
  }

  if (!options.silent) {
    showEditAgentDialog.value = false;
  }
};

const handleEditUserProfile = () => {
  if (effectiveUserProfile.value) {
    logger.info("打开用户档案编辑对话框", { profileId: effectiveUserProfile.value.id });
    showEditProfileDialog.value = true;
  } else {
    logger.warn("无法编辑用户档案：未找到有效的用户档案");
  }
};

const handleSaveUserProfile = async (updates: Partial<Omit<UserProfile, "id" | "createdAt">>) => {
  if (effectiveUserProfile.value) {
    logger.info("保存用户档案", { profileId: effectiveUserProfile.value.id, updates });
    if (bus.windowType === "detached-component") {
      try {
        await bus.requestAction("update-user-profile", {
          profileId: effectiveUserProfile.value.id,
          updates,
        });
      } catch (error) {
        errorHandler.error(error, "请求更新用户档案失败");
      }
    } else {
      userProfileStore.updateProfile(effectiveUserProfile.value.id, updates);
    }
  }
  showEditProfileDialog.value = false;
};

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler("SouthEast");

const isInputVisible = computed(() => {
  // 只要输入框被独立分离出去，无论 ChatArea 在主窗口还是独立窗口，都应隐藏内部的输入框。
  const isInputDetached = detachedComponents.value.includes("llm-chat:chat-input");
  logger.info("MessageInput 分离状态检查", {
    isInputDetached,
    isChatAreaDetached: props.isDetached,
    allDetached: detachedComponents.value,
  });
  return !isInputDetached;
});

// 处理从菜单打开独立窗口
const handleDetach = async () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) {
    errorHandler.error(new Error("Container rect is null"), "无法获取容器尺寸");
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
    id: "llm-chat:chat-area",
    displayName: "对话区域",
    type: "component" as const,
    width: rect.width,
    height: rect.height,
    // 对于菜单点击，我们使用组件中心作为起始点（需要转换为屏幕坐标）
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
      errorHandler.error(new Error("Session ID is null"), "开始分离会话失败，未返回会话 ID");
    }
  } catch (error) {
    errorHandler.error(error, "通过菜单分离窗口失败");
  }
};

// ===== 消息事件处理 =====
// ChatArea 现在是一个纯粹的视图组件，只负责接收 props 和发出 emits
// 所有分离逻辑都由 DetachedComponentContainer 通过适配器注入
const finalMessages = toRef(props, "messages");
const finalIsSending = toRef(props, "isSending");
const finalDisabled = toRef(props, "disabled");
const finalCurrentAgentId = toRef(props, "currentAgentId");
const finalCurrentModelId = toRef(props, "currentModelId");

const handleSendMessage = (payload: {
  content: string;
  attachments?: Asset[];
  temporaryModel?: any;
  disableMacroParsing?: boolean;
}) => emit("send", payload);
const handleAbort = () => emit("abort");
const handleDeleteMessage = (messageId: string) => emit("delete-message", messageId);
const handleRegenerate = (messageId: string, options?: { modelId?: string; profileId?: string }) =>
  emit("regenerate", messageId, options);
const handleSwitchSibling = (nodeId: string, direction: "prev" | "next") =>
  emit("switch-sibling", nodeId, direction);
const handleSwitchBranch = (nodeId: string) => emit("switch-branch", nodeId);
const handleToggleEnabled = (nodeId: string) => emit("toggle-enabled", nodeId);
const handleEditMessage = (nodeId: string, newContent: string, attachments?: Asset[]) =>
  emit("edit-message", nodeId, newContent, attachments);
const handleAbortNode = (nodeId: string) => emit("abort-node", nodeId);
const handleContinue = (nodeId: string, options?: { modelId?: string; profileId?: string }) =>
  emit("continue", nodeId, options);
const handleCompleteInput = (content: string, options?: { modelId?: string; profileId?: string }) =>
  emit("complete-input", content, options);
const handleCreateBranch = (nodeId: string) => emit("create-branch", nodeId);
const handleAnalyzeContext = (nodeId: string) => emit("analyze-context", nodeId);
const handleSaveToBranch = (nodeId: string, newContent: string, attachments?: Asset[]) =>
  emit("save-to-branch", nodeId, newContent, attachments);

// ===== 响应式显示控制 =====
// 阈值设定原则：空间不足时优先去掉文字显示，保住图标和关键操作
const showViewModeText = computed(() => containerWidth.value > 700);
const showModelName = computed(() => containerWidth.value > 560);
const showProfileName = computed(() => containerWidth.value > 300);
const showAgentName = computed(() => containerWidth.value > 200);

// ===== 头部样式计算 =====
// 根据聊天设置中的独立配置，动态生成头部的背景色和模糊效果
// 使用 getBlendedBackgroundColor 确保包含颜色混合叠加效果
const chatHeaderStyle = computed(() => {
  const opacity = settings.value.uiPreferences.headerBackgroundOpacity ?? 0.7;
  const blur = settings.value.uiPreferences.headerBlurIntensity ?? 12;

  // 使用全局颜色混合工具函数，确保包含叠加效果
  const backgroundColor = getBlendedBackgroundColor("--card-bg-rgb", opacity);
  const backdropFilter = `blur(${blur}px)`;

  return {
    backgroundColor,
    backdropFilter,
  };
});

// ===== 内容宽度限制样式 =====
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

// ===== MessageNavigator 相关 =====
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
  messageListRef.value?.scrollToBottom();
};

const handleScrollToNext = () => {
  messageListRef.value?.scrollToNext();
};

const handleScrollToPrev = () => {
  messageListRef.value?.scrollToPrev();
};
// ===== 键盘导航 =====
const handleKeyDown = (e: KeyboardEvent) => {
  // 处理 Ctrl+F 搜索快捷键 (无论焦点在哪里，只要在 ChatArea 内)
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    showSearchPanel.value = !showSearchPanel.value;
    return;
  }

  // 检查焦点是否在输入框或其他可编辑元素上
  const target = e.target as HTMLElement;
  const isEditableElement =
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

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
  // 加载聊天设置
  await loadSettings();
  logger.info("聊天设置已加载");

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
          props.messages && props.messages.length > 0 ? props.messages[0].content : "N/A",
      });
    },
    { immediate: true }
  );
});
</script>

<template>
  <div
    ref="containerRef"
    :class="['chat-area-container', { 'detached-mode': isDetached }]"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <!-- 分离模式下的壁纸层 -->
    <div
      v-if="isDetached && settings.uiPreferences.showWallpaperInDetachedMode"
      class="detached-wallpaper"
    ></div>

    <!-- 头部区域 -->
    <div class="chat-header" :style="chatHeaderStyle">
      <!-- 拖拽手柄：非分离模式用于触发分离，分离模式用于拖动窗口 -->
      <!-- 仅在分离模式下总是显示，或在非分离模式且设置允许时显示 -->
      <ComponentHeader
        v-if="props.isDetached || settings.uiPreferences.enableDetachableHandle"
        ref="headerRef"
        position="top"
        :drag-mode="props.isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
        @detach="handleDetach"
      />

      <!-- 左侧：智能体和模型信息 (主要展示区) -->
      <div class="agent-model-info">
        <el-tooltip v-if="currentAgent" content="点击编辑智能体" placement="bottom">
          <div class="agent-info clickable" @click="handleEditAgent">
            <Avatar
              :src="agentAvatarSrc || ''"
              :alt="currentAgent.displayName || currentAgent.name"
              :size="28"
              shape="square"
              :radius="6"
            />
            <span v-if="showAgentName" class="agent-name">{{
              currentAgent.displayName || currentAgent.name
            }}</span>
          </div>
        </el-tooltip>
        <el-tooltip
          v-if="currentModel && settings.uiPreferences.showModelSelector"
          content="点击选择模型"
          placement="bottom"
        >
          <div class="model-info clickable" @click="handleSelectModel">
            <DynamicIcon
              :src="modelIcon || ''"
              class="model-icon"
              :alt="currentModel?.name || currentModel?.id || ''"
            />
            <span v-if="showModelName" class="model-name">{{
              currentModel.name || currentModel.id
            }}</span>
          </div>
        </el-tooltip>
      </div>

      <!-- 右侧：功能操作区 (切换器 + 用户档案 + 设置) -->
      <div class="header-actions">
        <!-- 用户档案信息 -->
        <el-tooltip v-if="effectiveUserProfile" content="点击编辑用户档案" placement="bottom">
          <div class="user-profile-info" @click="handleEditUserProfile">
            <span v-if="showProfileName" class="profile-name">{{
              effectiveUserProfile.displayName || effectiveUserProfile.name
            }}</span>
            <Avatar
              :src="userProfileAvatarSrc || ''"
              :alt="effectiveUserProfile.displayName || effectiveUserProfile.name"
              :size="28"
              shape="square"
              :radius="4"
            />
          </div>
        </el-tooltip>

        <!-- 视图模式切换器 (优先收缩) -->
        <ViewModeSwitcher :show-label="showViewModeText" />

        <!-- 搜索按钮 -->
        <el-tooltip content="搜索聊天记录 (Ctrl+F)" placement="bottom">
          <div class="header-action-button" @click="showSearchPanel = !showSearchPanel">
            <el-icon :size="18">
              <Search />
            </el-icon>
          </div>
        </el-tooltip>

        <!-- 设置按钮 -->
        <el-tooltip content="聊天设置" placement="bottom">
          <div class="header-action-button" @click="showChatSettings = true">
            <el-icon :size="18">
              <Settings2 />
            </el-icon>
          </div>
        </el-tooltip>
      </div>
    </div>

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
              :session="llmChatStore.currentSession"
              :messages="finalMessages"
              :is-sending="finalIsSending"
              :llm-think-rules="currentAgent?.llmThinkRules"
              :rich-text-style-options="finalMessageStyleOptions"
              :user-rich-text-style-options="userRichTextStyleOptions"
              @delete-message="handleDeleteMessage"
              @regenerate="handleRegenerate"
              @switch-sibling="handleSwitchSibling"
              @switch-branch="handleSwitchBranch"
              @toggle-enabled="handleToggleEnabled"
              @edit-message="handleEditMessage"
              @abort-node="handleAbortNode"
              @continue="handleContinue"
              @create-branch="handleCreateBranch"
              @analyze-context="handleAnalyzeContext"
              @save-to-branch="handleSaveToBranch"
              :style="contentWidthStyle"
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
              <FlowTreeGraph :session="llmChatStore.currentSession" />
            </div>
          </template>
        </div>

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
          :style="contentWidthStyle"
        />
      </div>
    </div>

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="window-resize-indicator"
      @mousedown="handleResizeStart"
      title="拖拽调整窗口大小"
    >
      <div class="indicator-border"></div>
      <div class="indicator-handle"></div>
    </div>

    <!-- 编辑智能体对话框 -->
    <EditAgentDialog
      :visible="showEditAgentDialog"
      mode="edit"
      :agent="currentAgent"
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
    <ChatSettingsDialog :visible="showChatSettings" @update:visible="showChatSettings = $event" />

    <!-- 搜索面板 -->
    <ChatSearchPanel
      v-if="showSearchPanel"
      :messages="finalMessages"
      @select="handleSearchSelect"
      @close="showSearchPanel = false"
    />
  </div>
</template>

<style scoped>
.chat-area-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

/* 分离模式下添加更强的阴影和圆角 */
.chat-area-container.detached-mode {
  height: 90vh;
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

/* 头部区域 */
.chat-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 24px; /* 增加底部内边距给遮罩留空间 */
  min-height: 64px; /* 增加高度 */
  /* 背景色和模糊效果由 chatHeaderStyle 计算属性动态提供 */
  /* 不再使用 var(--card-bg) 和 var(--ui-blur)，而是独立配置 */
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%); /* 底部虚化遮罩 */
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

/* 分离模式下，整个头部区域可以拖拽窗口 */
.chat-area-container.detached-mode .chat-header {
  cursor: move;
  -webkit-app-region: drag; /* 允许拖拽窗口 */
}

/* 分离模式下，头部内的可交互元素需要禁用拖拽 */
.chat-area-container.detached-mode .chat-header .detachable-handle,
.chat-area-container.detached-mode .chat-header .agent-model-info {
  -webkit-app-region: no-drag;
}

/* 智能体和模型信息 (占据左侧剩余空间) */
.agent-model-info {
  flex: 4;
  display: flex;
  align-items: center;
  min-width: 120px; /* 保证至少能看清头像和部分文字 */
  overflow: hidden;
}

/* 右侧功能操作区 */
.header-actions {
  flex: 3; /* 允许右侧区域也占据剩余空间并参与分配 */
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  justify-content: flex-end;
}

/* 针对视图切换器的压缩优化 */
.header-actions :deep(.view-mode-switcher) {
  flex-shrink: 10; /* 赋予极高的收缩优先级，让它最先缩 */
  min-width: 0;
  overflow: hidden;
}

/* 信息展示区域通用样式 */
.agent-info,
.model-info,
.user-profile-info {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0; /* 允许内部文本压缩到消失 */
  flex-shrink: 1;
}

/* 可点击的信息区域样式 */
.agent-info.clickable,
.model-info.clickable,
.user-profile-info {
  height: 32px; /* 统一高度 */
  padding: 0 8px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.agent-info.clickable:hover,
.model-info.clickable:hover,
.user-profile-info:hover {
  transform: translateY(-2px);
  border: 1px solid var(--primary-color);
}

.agent-info.clickable:active,
.model-info.clickable:active,
.user-profile-info:active {
  background-color: var(--el-fill-color);
  transform: translateY(0);
}

/* 头部功能按钮通用样式 */
.header-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
  color: var(--text-color-secondary);
  border: 1px solid transparent;
  flex-shrink: 0;
}

.header-action-button:hover {
  background-color: var(--el-fill-color-light);
  color: var(--primary-color);
  border-color: var(--primary-color-light, var(--border-color));
  transform: translateY(-1px);
}

.header-action-button:active {
  background-color: var(--el-fill-color);
  transform: translateY(0);
}

/* 名称文本通用样式 */
.agent-name,
.profile-name {
  flex: 1; /* 允许文本占据剩余空间并收缩 */
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-name {
  flex: 1;
  flex-shrink: 5; /* 提高收缩优先级，使其在空间不足时早于智能体和用户名称收缩 */
  min-width: 0;
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0; /* 禁止图标收缩 */
}

/* 确保头像也不收缩 */
.agent-info :deep(.avatar-container),
.user-profile-info :deep(.avatar-container) {
  flex-shrink: 0;
}

/* 头像悬停放大效果 */
.agent-info .avatar-container,
.user-profile-info .avatar-container {
  transition: transform 0.2s ease-in-out;
}

.agent-info .avatar-container:hover,
.user-profile-info .avatar-container:hover {
  transform: scale(1.6);
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
  flex: 1; /* 关键：弹性增长，占据所有剩余空间 */
  min-height: 0;
  overflow: hidden; /* 防止内容溢出 */
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

/* 分离手柄的特定样式 */
.detachable-handle {
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  cursor: move;
  border-radius: 8px;
}

/* 分离模式下手柄光标样式已统一为 move，无需重复定义 */

.chat-content {
  flex-direction: column;
  padding: 0 12px 12px; /* 左右和底部保留边距 */
  /* overflow: hidden; */ /* 解除限制，让 MessageList 可以滚动 */
}

/* 右下角调整大小手柄 - 仅在分离模式下显示 */
.chat-area-container.detached-mode .window-resize-indicator {
  position: absolute;
  bottom: 0;
  right: 0;
  top: 0;
  left: 0;
  pointer-events: none; /* 整体不接收事件，只有手柄接收 */
  z-index: 10;
}

/* 与容器同步的边框，但小一圈 */
.chat-area-container.detached-mode .indicator-border {
  position: absolute;
  top: 6px;
  right: 6px;
  bottom: 6px;
  left: 6px;
  border: 1px solid var(--primary-color);
  border-radius: 10px; /* 比容器的 16px 小 6px */
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

/* 右下角弧度线段手柄 */
.chat-area-container.detached-mode .indicator-handle {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  pointer-events: auto; /* 只有手柄接收鼠标事件 */
  cursor: se-resize;
  border-radius: 0 0 10px 0; /* 与边框圆角一致 */
  overflow: hidden;
}

/* 弧度线段视觉效果 */
.chat-area-container.detached-mode .indicator-handle::before {
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

/* Hover 效果 */
.chat-area-container.detached-mode .indicator-handle:hover::before {
  opacity: 0.8;
  border-color: var(--primary-hover-color, var(--primary-color));
}

.chat-area-container.detached-mode .indicator-handle:hover ~ .indicator-border {
  opacity: 0.3;
}

/* Active 效果 */
.chat-area-container.detached-mode .indicator-handle:active::before {
  opacity: 1;
}

.chat-area-container.detached-mode .indicator-handle:active ~ .indicator-border {
  opacity: 0.5;
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
</style>
