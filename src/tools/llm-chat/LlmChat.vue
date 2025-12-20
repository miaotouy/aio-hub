<script setup lang="ts">
import { onMounted, computed, ref, onUnmounted, defineAsyncComponent } from "vue";
import { useLlmChatStore } from "./store";
import { useAgentStore } from "./agentStore";
import { useUserProfileStore } from "./userProfileStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useLlmChatUiState } from "./composables/useLlmChatUiState";
import { useLlmChatSync } from "./composables/useLlmChatSync";
import { useChatSettings } from "./composables/useChatSettings";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { CHAT_STATE_KEYS, createChatSyncConfig } from "./types/sync";
import ChatArea from "./components/ChatArea.vue";
import SidebarToggleIcon from "@/components/icons/SidebarToggleIcon.vue";
const LeftSidebar = defineAsyncComponent(() => import("./components/sidebar/LeftSidebar.vue"));
const SessionsSidebar = defineAsyncComponent(
  () => import("./components/sidebar/SessionsSidebar.vue")
);
const ContextAnalyzerDialog = defineAsyncComponent(
  () => import("./components/context-analyzer/ContextAnalyzerDialog.vue")
);
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@utils/errorHandler";
import { initializeMacroEngine } from "./macro-engine";
import { initAgentAssetCache } from "./utils/agentAssetUtils";

const logger = createModuleLogger("LlmChat");
const errorHandler = createModuleErrorHandler("LlmChat");
const isLoading = ref(true);
const store = useLlmChatStore();
const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();
const chatSettings = useChatSettings();
const bus = useWindowSyncBus();

// 检测当前窗口类型
const isInDetachedToolWindow = bus.windowType === "detached-tool";
logger.info("LlmChat 窗口类型", { windowType: bus.windowType, isInDetachedToolWindow });

// 初始化状态同步引擎（智能体、会话、设置等）
// 该 Composable 现在会自动管理其生命周期，无需手动初始化
useLlmChatSync();

// UI状态持久化
const {
  isLeftSidebarCollapsed,
  isRightSidebarCollapsed,
  leftSidebarWidth,
  rightSidebarWidth,
  loadUiState,
  startWatching,
} = useLlmChatUiState();

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

// 分离组件管理
const { isDetached } = useDetachedManager();

// 对话区域是否已分离的状态
const isChatAreaDetached = computed(() => isDetached("llm-chat:chat-area"));
// 组件挂载时的初始化逻辑
onMounted(async () => {
  isLoading.value = true;

  // 初始化宏引擎（全局一次）
  initializeMacroEngine();
  // 初始化 agent 资产缓存（必须在加载智能体数据之前）
  // 这样后续渲染 agent 资产时可以同步解析路径
  await initAgentAssetCache();
  
  // 加载并启动UI状态的持久化
  await loadUiState();
  startWatching();

  // 根据窗口类型执行不同的初始化策略
  if (bus.windowType === "main") {
    // ================== 主窗口初始化 ==================
    logger.info("主窗口：开始加载核心数据...");
    try {
      // 1. 先加载所有核心数据
      await Promise.all([
        agentStore.loadAgents(),
        userProfileStore.loadProfiles(),
        store.loadSessions(),
        chatSettings.loadSettings(),
      ]);

      logger.info("主窗口：核心数据加载完成", {
        sessionCount: store.sessions.length,
        agentCount: agentStore.agents.length,
        profileCount: userProfileStore.profiles.length,
        settingsLoaded: chatSettings.isLoaded.value,
      });

      // 2. 状态同步引擎已由 useLlmChatSync 自动管理
      logger.info("主窗口：状态同步服务已激活");

      // 3. 处理初始会话
      if (store.sessions.length === 0 && agentStore.currentAgentId) {
        handleNewSession({ agentId: agentStore.currentAgentId });
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: "主窗口初始化LLM Chat模块失败", showToUser: false });
    } finally {
      isLoading.value = false;
    }
  } else {
    // ================== 分离窗口初始化 ==================
    logger.info("分离窗口：开始独立加载核心数据...");
    try {
      // 1. 分离窗口独立加载所有核心数据（与主窗口相同）
      await Promise.all([
        agentStore.loadAgents(),
        userProfileStore.loadProfiles(),
        store.loadSessions(),
        chatSettings.loadSettings(),
      ]);

      logger.info("分离窗口：核心数据加载完成", {
        sessionCount: store.sessions.length,
        agentCount: agentStore.agents.length,
        profileCount: userProfileStore.profiles.length,
        settingsLoaded: chatSettings.isLoaded.value,
      });

      // 2. 状态同步引擎已由 useLlmChatSync 自动管理
      logger.info("分离窗口：状态同步服务已激活（用于跨窗口同步）");
    } catch (error) {
      errorHandler.handle(error, { userMessage: "分离窗口初始化LLM Chat模块失败", showToUser: false });
    } finally {
      isLoading.value = false;
    }
  }
});
// 当前选中的智能体ID（独立于会话）
const currentAgentId = computed(() => agentStore.currentAgentId || "");

// 处理发送消息
const handleSendMessage = async (payload: {
  content: string;
  attachments?: any[];
  temporaryModel?: any;
}) => {
  if (!store.currentSession) {
    logger.warn("发送消息失败：没有活动会话");
    return;
  }
  await store.sendMessage(payload.content, {
    attachments: payload.attachments,
    temporaryModel: payload.temporaryModel,
  });
};

// 处理中止发送
const handleAbortSending = () => {
  store.abortSending();
};

// 处理重新生成
const handleRegenerate = async (
  messageId: string,
  options?: { modelId?: string; profileId?: string }
) => {
  await store.regenerateFromNode(messageId, options);
};

// 处理删除消息
const handleDeleteMessage = (messageId: string) => {
  store.deleteMessage(messageId);
};

// 处理切换兄弟分支
const handleSwitchSibling = (nodeId: string, direction: "prev" | "next") => {
  store.switchToSiblingBranch(nodeId, direction);
};

// 处理切换到指定分支
const handleSwitchBranch = (nodeId: string) => {
  store.switchBranch(nodeId);
};

// 处理切换节点启用状态
const handleToggleEnabled = (nodeId: string) => {
  store.toggleNodeEnabled(nodeId);
};

// 处理编辑消息（使用统一方法）
const handleEditMessage = (nodeId: string, newContent: string, attachments?: any[]) => {
  store.editMessage(nodeId, newContent, attachments);
};

// 处理从编辑内容创建新分支
const handleSaveToBranch = (nodeId: string, newContent: string, attachments?: any[]) => {
  store.createBranchFromEdit(nodeId, newContent, attachments);
};

// 处理创建分支
const handleCreateBranch = (nodeId: string) => {
  store.createBranch(nodeId);
};
// 处理中止单个节点的生成
const handleAbortNode = (nodeId: string) => {
  store.abortNodeGeneration(nodeId);
};

// 上下文分析对话框状态
const showContextAnalyzer = ref(false);
const analyzingNodeId = ref<string | null>(null);

// 处理打开上下文分析器
const handleAnalyzeContext = (nodeId: string) => {
  logger.info("打开上下文分析器", { nodeId });
  analyzingNodeId.value = nodeId;
  showContextAnalyzer.value = true;
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
// 处理重命名会话
const handleRenameSession = (data: { sessionId: string; newName: string }) => {
  store.updateSession(data.sessionId, { name: data.newName });
  logger.info("重命名会话", data);
};

// ==================== 状态同步到分离窗口 ====================
// 将关键参数（isSending, disabled）同步到分离的输入框窗口
const parametersToSync = computed(() => ({
  isSending: store.isSending,
  // disabled 状态只取决于有无当前会话
  disabled: !store.currentSession,
}));

useStateSyncEngine(parametersToSync, {
  ...createChatSyncConfig(CHAT_STATE_KEYS.PARAMETERS),
  // 主窗口只推送，不接收
  autoPush: true,
});
</script>

<template>
  <div class="llm-chat-wrapper">
    <div class="llm-chat-container">
      <!-- Skeleton Loader -->
      <template v-if="isLoading">
        <!-- Left Sidebar Skeleton -->
        <div
          v-if="!isLeftSidebarCollapsed"
          class="sidebar left-sidebar skeleton-sidebar"
          :style="{ width: `${leftSidebarWidth}px` }"
        >
          <div class="sidebar-content">
            <el-skeleton :rows="15" animated />
          </div>
        </div>

        <!-- Main Content Skeleton -->
        <div class="main-content">
          <div class="chat-area-container-skeleton">
            <el-skeleton animated>
              <template #template>
                <div class="skeleton-header">
                  <el-skeleton-item
                    variant="circle"
                    style="width: 28px; height: 28px; flex-shrink: 0"
                  />
                  <el-skeleton-item
                    variant="text"
                    style="height: 20px; width: 30%; margin-left: 12px"
                  />
                  <el-skeleton-item
                    variant="text"
                    style="height: 20px; width: 25%; margin-left: 16px"
                  />
                  <el-skeleton-item
                    variant="circle"
                    style="width: 28px; height: 28px; margin-left: auto; flex-shrink: 0"
                  />
                </div>
                <div class="skeleton-body">
                  <el-skeleton-item variant="rect" style="width: 100%; height: 100%" />
                </div>
                <div class="skeleton-input">
                  <el-skeleton-item
                    variant="rect"
                    style="height: 50px; width: 100%; border-radius: 8px"
                  />
                </div>
              </template>
            </el-skeleton>
          </div>
        </div>

        <!-- Right Sidebar Skeleton -->
        <div
          v-if="!isRightSidebarCollapsed"
          class="sidebar right-sidebar skeleton-sidebar"
          :style="{ width: `${rightSidebarWidth}px` }"
        >
          <div class="sidebar-content">
            <el-skeleton :rows="15" animated />
          </div>
        </div>
      </template>

      <!-- Actual Content -->
      <template v-else>
        <!-- 左侧边栏 -->
        <div
          v-if="!isLeftSidebarCollapsed"
          class="sidebar left-sidebar"
          :style="{ width: `${leftSidebarWidth}px` }"
        >
          <div class="sidebar-content">
            <LeftSidebar />
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
            :messages="store.currentActivePathWithPresets"
            :is-sending="store.isSending"
            :disabled="!store.currentSession"
            :current-agent-id="currentAgentId"
            :current-model-id="
              agentStore.currentAgentId
                ? agentStore.getAgentById(agentStore.currentAgentId)?.modelId
                : undefined
            "
            @send="handleSendMessage"
            @abort="handleAbortSending"
            @delete-message="handleDeleteMessage"
            @regenerate="handleRegenerate"
            @switch-sibling="handleSwitchSibling"
            @switch-branch="handleSwitchBranch"
            @toggle-enabled="handleToggleEnabled"
            @edit-message="handleEditMessage"
            @abort-node="handleAbortNode"
            @create-branch="handleCreateBranch"
            @analyze-context="handleAnalyzeContext"
            @save-to-branch="handleSaveToBranch"
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
              @switch="handleSwitchSession"
              @delete="handleDeleteSession"
              @new-session="handleNewSession"
              @rename="handleRenameSession"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- 上下文分析对话框 -->
    <ContextAnalyzerDialog
      v-model:visible="showContextAnalyzer"
      :node-id="analyzingNodeId"
      :session="store.currentSession"
    />
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
