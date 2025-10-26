<script setup lang="ts">
import { ref, computed, toRef, withDefaults, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessageNode } from "../types";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowResize } from "@/composables/useWindowResize";
import { createModuleLogger } from "@utils/logger";
import ComponentHeader from "@/components/ComponentHeader.vue";
import MessageList from "./message/MessageList.vue";
import MessageInput from "./MessageInput.vue";

const logger = createModuleLogger("ChatArea");

interface Props {
  messages?: ChatMessageNode[];
  isSending?: boolean;
  disabled?: boolean;
  isDetached?: boolean; // 是否在独立窗口中
  currentAgentId?: string; // 当前智能体 ID
  currentModelId?: string; // 当前模型 ID
}

interface Emits {
  (e: "send", content: string): void;
  (e: "abort"): void;
  (e: "delete-message", messageId: string): void;
  (e: "regenerate", messageId: string): void;
  (e: "switch-sibling", nodeId: string, direction: 'prev' | 'next'): void;
  (e: "toggle-enabled", nodeId: string): void;
  (e: "edit-message", nodeId: string, newContent: string): void;
  (e: "abort-node", nodeId: string): void;
  (e: "create-branch", nodeId: string): void;
  (e: "analyze-context", nodeId: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  messages: () => [],
  isSending: false,
  disabled: true,
  isDetached: false,
});
const emit = defineEmits<Emits>();

const containerRef = ref<HTMLDivElement>();
const headerRef = ref<InstanceType<typeof ComponentHeader>>();

// 获取智能体和模型信息
import { useAgentStore } from "../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import Avatar from '@/components/common/Avatar.vue';
const agentStore = useAgentStore();
const { getProfileById } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

// 当前智能体信息
const currentAgent = computed(() => {
  if (!finalCurrentAgentId.value) return null;
  return agentStore.getAgentById(finalCurrentAgentId.value);
});

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

// ===== 拖拽与分离功能 =====
const { detachedComponents } = useDetachedManager();
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
    id: "chat-area",
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

// ===== 窗口大小调整功能 =====
const { createResizeHandler } = useWindowResize();
const handleResizeStart = createResizeHandler("SouthEast");

const isInputVisible = computed(() => {
  // 只要输入框被独立分离出去，无论 ChatArea 在主窗口还是独立窗口，都应隐藏内部的输入框。
  const isInputDetached = detachedComponents.value.includes("chat-input");
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
    id: "chat-area",
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
      logger.error("开始分离会话失败，未返回会话 ID");
    }
  } catch (error) {
    logger.error("通过菜单分离窗口失败", { error });
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

const handleSendMessage = (content: string) => emit("send", content);
const handleAbort = () => emit("abort");
const handleDeleteMessage = (messageId: string) => emit("delete-message", messageId);
const handleRegenerate = (messageId: string) => emit("regenerate", messageId);
const handleSwitchSibling = (nodeId: string, direction: 'prev' | 'next') => emit("switch-sibling", nodeId, direction);
const handleToggleEnabled = (nodeId: string) => emit("toggle-enabled", nodeId);
const handleEditMessage = (nodeId: string, newContent: string) => emit("edit-message", nodeId, newContent);
const handleAbortNode = (nodeId: string) => emit("abort-node", nodeId);
const handleCreateBranch = (nodeId: string) => emit("create-branch", nodeId);
const handleAnalyzeContext = (nodeId: string) => emit("analyze-context", nodeId);

onMounted(() => {
  logger.info("ChatArea mounted", {
    props: {
      messages: props.messages?.length,
      isSending: props.isSending,
      disabled: props.disabled,
      isDetached: props.isDetached,
      currentAgentId: props.currentAgentId,
      currentModelId: props.currentModelId,
    },
    agent: currentAgent.value,
    model: currentModel.value,
  });
});
</script>

<template>
  <div ref="containerRef" :class="['chat-area-container', { 'detached-mode': isDetached }]">
    <!-- 头部区域 -->
    <div class="chat-header">
      <!-- 拖拽手柄 -->
      <ComponentHeader
        ref="headerRef"
        position="top"
        :drag-mode="props.isDetached ? 'window' : 'detach'"
        show-actions
        :collapsible="false"
        class="detachable-handle"
        @mousedown="handleDragStart"
        @detach="handleDetach"
      />

      <!-- 智能体和模型信息 -->
      <div class="agent-model-info">
        <div v-if="currentAgent" class="agent-info">
          <Avatar
            :src="currentAgent.icon || '🤖'"
            :alt="currentAgent.name"
            :size="28"
            shape="square"
            :radius="6"
          />
          <span class="agent-name">{{ currentAgent.name }}</span>
        </div>
        <div v-if="currentModel" class="model-info">
          <DynamicIcon
            v-if="modelIcon"
            :src="modelIcon"
            class="model-icon"
            :alt="currentModel.name || currentModel.id"
          />
          <span class="model-name">{{ currentModel.name || currentModel.id }}</span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 对话内容区 -->
      <div class="chat-content">
        <!-- 消息列表 -->
        <MessageList
          :messages="finalMessages"
          :is-sending="finalIsSending"
          @delete-message="handleDeleteMessage"
          @regenerate="handleRegenerate"
          @switch-sibling="handleSwitchSibling"
          @toggle-enabled="handleToggleEnabled"
          @edit-message="handleEditMessage"
          @abort-node="handleAbortNode"
          @create-branch="handleCreateBranch"
          @analyze-context="handleAnalyzeContext"
        />

        <!-- 输入框 -->
        <MessageInput
          v-if="isInputVisible"
          class="chat-message-input"
          :disabled="finalDisabled"
          :is-sending="finalIsSending"
          @send="handleSendMessage"
          @abort="handleAbort"
        />
      </div>
    </div>

    <!-- 右下角调整大小手柄，仅在分离模式下显示 -->
    <div
      v-if="props.isDetached"
      class="resize-handle"
      @mousedown="handleResizeStart"
      title="拖拽调整窗口大小"
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
  /* --card-bg-rgb is defined in css-vars.css */
  background-color: rgba(var(--card-bg-rgb), 0.75); /* 半透明背景 */
  backdrop-filter: blur(8px); /* 模糊滤镜 */
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%); /* 底部虚化遮罩 */
  -webkit-mask-image: linear-gradient(
    to bottom,
    black 60%,
    transparent 100%
  );
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

/* 智能体和模型信息 */
.agent-model-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.agent-info,
.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.model-name {
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.main-content {
  display: flex;
  flex: 1;
  /* padding: 12px; */ /* 由 MessageList 和 MessageInput 自己管理 */
  min-width: 0;
  min-height: 0;
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

/* 分离模式下，手柄也可以用于拖动窗口 */
.chat-area-container.detached-mode .detachable-handle {
  cursor: move;
}

.chat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0 12px 12px; /* 左右和底部保留边距 */
  /* overflow: hidden; */ /* 解除限制，让 MessageList 可以滚动 */
}

/* 右下角调整大小手柄 */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, var(--primary-color) 50%);
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

/* MessageInput 两侧边距，增强层次感 */
.chat-message-input {
  margin-left: 8px;
  margin-right: 8px;
}
</style>
