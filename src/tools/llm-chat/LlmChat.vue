<script setup lang="ts">
import { onMounted, computed, ref, onUnmounted } from "vue";
import { useLlmChatStore } from "./store";
import { useAgentStore } from "./agentStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useLlmChatSync } from "./composables/useLlmChatSync";
import ChatArea from "./components/ChatArea.vue";
import SessionsSidebar from "./components/SessionsSidebar.vue";
import LeftSidebar from "./components/LeftSidebar.vue";
import SidebarToggleIcon from "@/components/icons/SidebarToggleIcon.vue";
import { createModuleLogger } from "@utils/logger";

const logger = createModuleLogger("LlmChat");
const store = useLlmChatStore();
const agentStore = useAgentStore();

// 侧边栏折叠状态
const isLeftSidebarCollapsed = ref(false);
const isRightSidebarCollapsed = ref(false);

// 侧边栏宽度
const leftSidebarWidth = ref(320);
const rightSidebarWidth = ref(280);

// 拖拽状态
const isDraggingLeft = ref(false);
const isDraggingRight = ref(false);

// 拖拽初始状态
const dragStartX = ref(0);
const dragStartWidth = ref(0);

// 拖拽处理
const handleLeftDragStart = (e: MouseEvent) => {
  isDraggingLeft.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = leftSidebarWidth.value;
  e.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
};

const handleRightDragStart = (e: MouseEvent) => {
  isDraggingRight.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = rightSidebarWidth.value;
  e.preventDefault();
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDraggingLeft.value) {
    const delta = e.clientX - dragStartX.value;
    const newWidth = dragStartWidth.value + delta;
    if (newWidth >= 200 && newWidth <= 600) {
      leftSidebarWidth.value = newWidth;
    }
  } else if (isDraggingRight.value) {
    const delta = e.clientX - dragStartX.value;
    const newWidth = dragStartWidth.value - delta; // 右侧边栏向左移动时宽度增加
    if (newWidth >= 200 && newWidth <= 600) {
      rightSidebarWidth.value = newWidth;
    }
  }
};

const handleMouseUp = () => {
  isDraggingLeft.value = false;
  isDraggingRight.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};

onMounted(() => {
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
});

// 新的同步逻辑
useLlmChatSync();

// 分离组件管理
const { initialize, isDetached } = useDetachedManager();

// 对话区域是否已分离的状态
const isChatAreaDetached = computed(() => isDetached("chat-area"));

// 组件挂载时加载会话和智能体
onMounted(async () => {
  agentStore.loadAgents();
  store.loadSessions();

  // 初始化统一的分离窗口管理器
  await initialize();

  logger.info("LLM Chat 模块已加载", {
    sessionCount: store.sessions.length,
    agentCount: agentStore.agents.length,
  });

  // 如果没有会话，尝试使用默认智能体创建一个
  if (store.sessions.length === 0) {
    const defaultAgent = agentStore.defaultAgent;
    if (defaultAgent) {
      handleNewSession({ agentId: defaultAgent.id });
    }
  }
});
// 当前会话的智能体ID
const currentAgentId = computed(() => store.currentSession?.currentAgentId || "");

// 处理发送消息
const handleSendMessage = async (content: string) => {
  if (!store.currentSession) {
    logger.warn("发送消息失败：没有活动会话");
    return;
  }

  await store.sendMessage(content);
};

// 处理中止发送
const handleAbortSending = () => {
  store.abortSending();
};

// 处理重新生成
const handleRegenerate = async (messageId: string) => {
  await store.regenerateFromNode(messageId);
};

// 处理删除消息
const handleDeleteMessage = (messageId: string) => {
  store.deleteMessage(messageId);
};

// 处理切换兄弟分支
const handleSwitchSibling = (nodeId: string, direction: 'prev' | 'next') => {
  store.switchToSiblingBranch(nodeId, direction);
};

// 处理切换节点启用状态
const handleToggleEnabled = (nodeId: string) => {
  store.toggleNodeEnabled(nodeId);
};

// 处理编辑消息（使用统一方法）
const handleEditMessage = (nodeId: string, newContent: string) => {
  store.editMessage(nodeId, newContent);
};

// 处理新建会话
const handleNewSession = (data: { agentId: string; name?: string }) => {
  store.createSession(data.agentId, data.name);
  logger.info("创建新会话", data);
};

// 处理切换会话
const handleSwitchSession = (sessionId: string) => {
  store.switchSession(sessionId);
};

// 处理删除会话
const handleDeleteSession = (sessionId: string) => {
  store.deleteSession(sessionId);
};

// 处理切换智能体
const handleChangeAgent = (agentId: string) => {
  if (!store.currentSession) return;

  store.updateSession(store.currentSession.id, {
    currentAgentId: agentId,
  });

  logger.info("切换智能体", { agentId });
};

// 临时存储待更新的值，用于批量更新
const pendingModelUpdate = ref<{ profileId?: string; modelId?: string } | null>(null);
let updateTimer: ReturnType<typeof setTimeout> | null = null;

// 批量更新 Profile 和 Model（避免重复调用 updateAgent）
const commitPendingModelUpdate = () => {
  if (pendingModelUpdate.value && currentAgentId.value) {
    const updates = pendingModelUpdate.value;
    agentStore.updateAgent(currentAgentId.value, updates);
    logger.info("更新智能体模型配置", {
      agentId: currentAgentId.value,
      ...updates,
    });
    pendingModelUpdate.value = null;
  }
};

// 处理 Profile 更新
const handleUpdateProfileId = (profileId: string) => {
  if (!currentAgentId.value) return;

  // 合并到待更新对象
  if (!pendingModelUpdate.value) {
    pendingModelUpdate.value = {};
  }
  pendingModelUpdate.value.profileId = profileId;

  // 延迟批量提交，等待 modelId 一起更新
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(() => {
    commitPendingModelUpdate();
    updateTimer = null;
  }, 10);
};

// 处理 Model 更新
const handleUpdateModelId = (modelId: string) => {
  if (!currentAgentId.value) return;

  // 合并到待更新对象
  if (!pendingModelUpdate.value) {
    pendingModelUpdate.value = {};
  }
  pendingModelUpdate.value.modelId = modelId;

  // 延迟批量提交，等待 profileId 一起更新
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  updateTimer = setTimeout(() => {
    commitPendingModelUpdate();
    updateTimer = null;
  }, 10);
};
</script>

<template>
  <div class="llm-chat-wrapper">
    <div class="llm-chat-container">
      <!-- 左侧边栏 -->
      <div
        v-if="!isLeftSidebarCollapsed"
        class="sidebar left-sidebar"
        :style="{ width: `${leftSidebarWidth}px` }"
      >
        <div class="sidebar-content">
          <LeftSidebar
            v-if="store.currentSession"
            :current-agent-id="currentAgentId"
            @change-agent="handleChangeAgent"
            @update:profile-id="handleUpdateProfileId"
            @update:model-id="handleUpdateModelId"
          />
        </div>

        <!-- 拖拽分隔条 -->
        <div
          class="resize-handle right-handle"
          @mousedown="handleLeftDragStart"
          :class="{ dragging: isDraggingLeft }"
        ></div>

        <!-- 折叠按钮 -->
        <div class="collapse-button left-collapse" @click="isLeftSidebarCollapsed = true">
          <SidebarToggleIcon class="collapse-icon trapezoid" />
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 中间内容区 -->
      <div class="main-content">
        <!-- 左侧边栏折叠时的展开按钮 -->
        <div
          v-if="isLeftSidebarCollapsed"
          class="expand-button left-expand"
          @click="isLeftSidebarCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" />
          <svg class="arrow-icon expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <!-- ChatArea 组件 - 仅在未分离时显示 -->
        <ChatArea
          v-if="!isChatAreaDetached"
          :messages="store.currentActivePath"
          :is-sending="store.isSending"
          :disabled="!store.currentSession"
          :current-agent-id="currentAgentId"
          :current-model-id="
            store.currentSession?.currentAgentId
              ? agentStore.getAgentById(store.currentSession.currentAgentId)?.modelId
              : undefined
          "
          @send="handleSendMessage"
          @abort="handleAbortSending"
          @delete-message="handleDeleteMessage"
          @regenerate="handleRegenerate"
          @switch-sibling="handleSwitchSibling"
          @toggle-enabled="handleToggleEnabled"
          @edit-message="handleEditMessage"
        />

        <!-- 分离后的占位提示 -->
        <div v-else class="detached-placeholder">
          <div class="placeholder-content">
            <svg class="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" />
              <path d="M9 3v18M3 9h18M3 15h6M15 15h6" stroke-width="2" />
            </svg>
            <h3 class="placeholder-title">对话区域已分离</h3>
            <p class="placeholder-description">对话区域已在独立窗口中打开</p>
          </div>
        </div>

        <!-- 右侧边栏折叠时的展开按钮 -->
        <div
          v-if="isRightSidebarCollapsed"
          class="expand-button right-expand"
          @click="isRightSidebarCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" flip />
          <svg class="arrow-icon expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 右侧边栏 -->
      <div
        v-if="!isRightSidebarCollapsed"
        class="sidebar right-sidebar"
        :style="{ width: `${rightSidebarWidth}px` }"
      >
        <!-- 折叠按钮 -->
        <div class="collapse-button right-collapse" @click="isRightSidebarCollapsed = true">
          <SidebarToggleIcon class="collapse-icon trapezoid" flip />
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <!-- 拖拽分隔条 -->
        <div
          class="resize-handle left-handle"
          @mousedown="handleRightDragStart"
          :class="{ dragging: isDraggingRight }"
        ></div>

        <div class="sidebar-content">
          <SessionsSidebar
            :sessions="store.sessions"
            :current-session-id="store.currentSessionId"
            :current-agent-id="currentAgentId"
            @switch="handleSwitchSession"
            @delete="handleDeleteSession"
            @new-session="handleNewSession"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.llm-chat-wrapper {
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.llm-chat-container {
  height: 100%;
  display: flex;
  position: relative;
}

/* 侧边栏 */
.sidebar {
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
  display: flex;
}

.left-sidebar {
  border-right: none;
  border-radius: 8px 0 0 8px;
}

.right-sidebar {
  border-left: none;
  border-radius: 0 8px 8px 0;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 拖拽分隔条 */
.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color 0.2s;
  z-index: 10;
}

.resize-handle:hover,
.resize-handle.dragging {
  background-color: var(--primary-color);
}

.left-handle {
  left: 0;
}

.right-handle {
  right: 0;
}

/* 折叠按钮 */
.collapse-button {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 100;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.collapse-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}

.arrow-icon {
  width: 12px;
  height: 12px;
  position: absolute;
  z-index: 1;
  transition: transform 0.3s;
  color: var(--text-color-light);
  stroke: var(--text-color-light);
}

.left-collapse {
  right: -20px;
}

.right-collapse {
  left: -20px;
}

/* 展开按钮 */
.expand-button {
  position: absolute;
  top: 50%;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 100;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.expand-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}

.left-expand {
  left: -12px;
}

.right-expand {
  right: -12px;
}

/* 中间内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
  min-width: 0;
  position: relative;
}

/* 分离后的占位样式 */
.detached-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
}

.placeholder-content {
  text-align: center;
  padding: 48px 24px;
  max-width: 400px;
}

.placeholder-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.placeholder-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.placeholder-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}
</style>
