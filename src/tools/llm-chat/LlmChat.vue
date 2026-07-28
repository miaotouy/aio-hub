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
import { onMounted, computed, ref, watch, defineAsyncComponent } from "vue";
import { useLlmChatStore } from "./stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useUserProfileStore } from "./stores/userProfileStore";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { useLlmChatUiState } from "./composables/ui/useLlmChatUiState";
import { useLlmChatSync } from "./composables/chat/useLlmChatSync";
import { useChatSettings } from "./composables/settings/useChatSettings";
import { useStateSyncEngine } from "@/composables/useStateSyncEngine";
import { CHAT_STATE_KEYS, createChatSyncConfig } from "./types/sync";
import ChatArea from "./components/ChatArea.vue";
import SidebarToggleIcon from "@/components/icons/SidebarToggleIcon.vue";
import LlmChatSkeleton from "./components/LlmChatSkeleton.vue";
const LeftSidebar = defineAsyncComponent(
  () => import("./components/sidebar/LeftSidebar.vue")
);
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
import { useChatInputManager } from "./composables/input/useChatInputManager";
import { useModelSelectDialog } from "@/composables/useModelSelectDialog";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

const logger = createModuleLogger("LlmChat");
const errorHandler = createModuleErrorHandler("LlmChat");
const isLoading = ref(true);
const store = useLlmChatStore();
const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();
const chatSettings = useChatSettings();
const bus = useWindowSyncBus();
const inputManager = useChatInputManager();
const { open: openModelSelectDialog } = useModelSelectDialog();
const isClearingEmptySessions = ref(false);
const isRefreshingSessionIndex = ref(false);
const sessionRecoveryMessage = computed(() => {
  const { status, scannedSessionCount, failedSessionCount } =
    store.sessionRecovery;
  if (status === "recovering") {
    return `已扫描 ${scannedSessionCount} 个会话，发现 ${failedSessionCount} 个损坏文件。`;
  }
  return "会话索引损坏，正在等待恢复或手动重试。";
});

// 检测当前窗口类型
const isInDetachedToolWindow = bus.windowType === "detached-tool";
logger.info("LlmChat 窗口类型", {
  windowType: bus.windowType,
  isInDetachedToolWindow,
});

// 初始化状态同步引擎（智能体、会话、设置等）
// 该 Composable 现在会自动管理其生命周期，无需手动初始化
useLlmChatSync();

import { useResizable } from "@/composables/useResizable";

// UI状态持久化
const {
  isLeftSidebarCollapsed,
  isRightSidebarCollapsed,
  leftSidebarWidth,
  rightSidebarWidth,
  currentAgentId: uiCurrentAgentId,
  loadUiState,
  startWatching,
} = useLlmChatUiState();

// ===== 侧边栏拖拽调整宽度 =====
const { isResizing: isDraggingLeft, startResize: handleLeftDragStart } =
  useResizable({
    size: leftSidebarWidth,
    minSize: 200,
    maxSize: 600,
    direction: "left",
  });

const { isResizing: isDraggingRight, startResize: handleRightDragStart } =
  useResizable({
    size: rightSidebarWidth,
    minSize: 200,
    maxSize: 600,
    direction: "right",
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

      // 确保当前选中的智能体详情被加载
      if (uiCurrentAgentId.value) {
        await agentStore.loadAgentDetails(uiCurrentAgentId.value);
      }

      logger.info("主窗口：核心数据加载完成", {
        sessionCount: store.sessions.length,
        agentCount: agentStore.agents.length,
        profileCount: userProfileStore.profiles.length,
        settingsLoaded: chatSettings.isLoaded.value,
      });

      // 2. 状态同步引擎已由 useLlmChatSync 自动管理
      logger.info("主窗口：状态同步服务已激活");

      // 3. 处理初始会话
      if (
        store.sessions.length === 0 &&
        store.sessionRecovery.status === "ready" &&
        uiCurrentAgentId.value
      ) {
        handleNewSession({ agentId: uiCurrentAgentId.value });
      }
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "主窗口初始化LLM Chat模块失败",
        showToUser: false,
      });
    } finally {
      isLoading.value = false;
    }
  } else {
    // ================== 分离窗口初始化 ==================
    logger.info("分离窗口：开始独立加载核心数据...");
    try {
      // 会话状态由 useLlmChatStateConsumer 经 WindowSyncBus 提供；分离窗口
      // 不得重新读取会话目录或触发任何 llm-chat 持久化路径。
      await Promise.all([
        agentStore.loadAgents(),
        userProfileStore.loadProfiles(),
        chatSettings.loadSettings(),
      ]);

      // 确保当前选中的智能体详情被加载
      if (uiCurrentAgentId.value) {
        await agentStore.loadAgentDetails(uiCurrentAgentId.value);
      }

      logger.info("分离窗口：核心数据加载完成", {
        sessionCount: store.sessions.length,
        agentCount: agentStore.agents.length,
        profileCount: userProfileStore.profiles.length,
        settingsLoaded: chatSettings.isLoaded.value,
      });

      // 2. 状态同步引擎已由 useLlmChatSync 自动管理
      logger.info("分离窗口：状态同步服务已激活（用于跨窗口同步）");
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "分离窗口初始化LLM Chat模块失败",
        showToUser: false,
      });
    } finally {
      isLoading.value = false;
    }
  }
});
// 监听当前选中的智能体ID，自动加载其详情
watch(
  () => uiCurrentAgentId.value,
  async (newId) => {
    if (newId) {
      logger.info("当前智能体变化，开始加载详情...", { agentId: newId });
      await agentStore.loadAgentDetails(newId);
    }
  },
  { immediate: true }
);

// 当前选中的智能体ID（独立于会话）
const currentAgentId = computed(() => uiCurrentAgentId.value || "");

// 动态注入智能体自定义样式（如会话变量样式）
const agentCustomStyles = computed(() => {
  const agent = agentStore.getAgentById(currentAgentId.value);
  if (!agent) return "";
  return agent.variableConfig?.customStyles || "";
});

// 处理发送消息
const handleSendMessage = async (payload: {
  content: string;
  attachments?: any[];
  temporaryModel?: any;
  disableMacroParsing?: boolean;
}) => {
  if (!store.currentSession) {
    logger.warn("发送消息失败：没有活动会话");
    return;
  }
  await store.sendMessage(payload.content, {
    sessionId: store.currentSessionId || undefined,
    attachments: payload.attachments,
    temporaryModel: payload.temporaryModel,
    disableMacroParsing: payload.disableMacroParsing,
  });
};

// 处理中止发送
const handleAbortSending = () => {
  store.abortSending(store.currentSessionId || undefined);
};

// 处理输入补全
const handleCompleteInput = (
  content: string,
  options?: { modelId?: string; profileId?: string }
) => {
  store.completeInput(content, {
    ...options,
    sessionId: store.currentSessionId || undefined,
  });
};

// 处理续写模型选择
const handleSelectContinuationModel = async () => {
  let currentSelection = null;
  const continuationModel = inputManager.continuationModel.value;

  if (continuationModel) {
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(continuationModel.profileId);
    if (profile) {
      const model = profile.models.find(
        (m: any) => m.id === continuationModel.modelId
      );
      if (model) {
        currentSelection = { profile, model };
      }
    }
  }

  const result = await openModelSelectDialog({
    current: currentSelection,
    initialCapabilities: { embedding: false, rerank: false },
  });
  if (result) {
    inputManager.setContinuationModel({
      profileId: result.profile.id,
      modelId: result.model.id,
    });
  }
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

const handleCancelSessionRecovery = () => {
  store.cancelIndexRecovery();
};

async function getSessionPersistenceStorage() {
  const { useChatStorageSeparated } =
    await import("./composables/storage/useChatStorageSeparated");
  return useChatStorageSeparated();
}

const handleOpenCorruptSessionsDirectory = async () => {
  try {
    const storage = await getSessionPersistenceStorage();
    await revealItemInDir(await storage.getCorruptSessionsDir());
  } catch (error) {
    errorHandler.error(error, "打开损坏会话目录失败");
  }
};

const handleExportCorruptionDiagnostics = async () => {
  try {
    const storage = await getSessionPersistenceStorage();
    const path = await save({
      defaultPath: "llm-chat-corruption-diagnostics.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await writeTextFile(path, await storage.exportCorruptionDiagnostics());
    customMessage.success("会话损坏诊断信息已导出");
  } catch (error) {
    errorHandler.error(error, "导出会话损坏诊断信息失败");
  }
};

const handleClearQuarantinedSessionFiles = async () => {
  try {
    await ElMessageBox.confirm(
      "将删除已隔离的损坏会话文件，但保留损坏清单。此操作不可撤销，是否继续？",
      "删除隔离文件",
      { type: "warning", lockScroll: false }
    );
  } catch {
    return;
  }
  try {
    const storage = await getSessionPersistenceStorage();
    const count = await storage.clearQuarantinedSessionFiles();
    customMessage.success(`已删除 ${count} 个隔离文件`);
  } catch (error) {
    errorHandler.error(error, "删除隔离会话文件失败");
  }
};

const handleClearEmptySessions = async (data?: {
  orderedSessionIds?: string[];
}) => {
  if (isClearingEmptySessions.value) return;

  isClearingEmptySessions.value = true;
  customMessage.info("正在清理空会话...");
  try {
    const count = await store.clearEmptySessions({
      preferredOrderIds: data?.orderedSessionIds,
    });
    if (count > 0) {
      customMessage.success(`已清理 ${count} 个空会话`);
    } else {
      customMessage.info("没有可清理的空会话");
    }
  } catch (error) {
    errorHandler.error(error, "清理空会话失败");
  } finally {
    isClearingEmptySessions.value = false;
  }
};

const handleRefreshSessionIndex = async () => {
  if (isRefreshingSessionIndex.value) return;

  isRefreshingSessionIndex.value = true;
  customMessage.info("正在刷新会话列表索引...");
  try {
    const result = await store.refreshSessionsIndex();
    if (result.cancelled) {
      customMessage.warning("会话索引修复已取消");
      return;
    }
    const details = [
      result.repairedCount > 0 ? `修复 ${result.repairedCount} 项` : "无需修复",
      result.failedCount > 0 ? `隔离 ${result.failedCount} 个损坏文件` : null,
    ]
      .filter(Boolean)
      .join("，");
    customMessage.success(`会话列表索引已刷新：${details}`);
  } catch (error) {
    errorHandler.error(error, "刷新会话列表索引失败");
  } finally {
    isRefreshingSessionIndex.value = false;
  }
};

// 处理重命名会话
const handleRenameSession = (data: { sessionId: string; newName: string }) => {
  store.updateSession(data.sessionId, { name: data.newName });
  logger.info("重命名会话", data);
};

// ==================== 状态同步到分离窗口 ====================
// 将关键参数（isSending, disabled）同步到分离的输入框窗口
const parametersToSync = computed(() => ({
  isSending: store.isCurrentSessionGenerating,
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
      <LlmChatSkeleton
        v-if="isLoading"
        :is-left-sidebar-collapsed="isLeftSidebarCollapsed"
        :is-right-sidebar-collapsed="isRightSidebarCollapsed"
        :left-sidebar-width="leftSidebarWidth"
        :right-sidebar-width="rightSidebarWidth"
      />

      <!-- Actual Content -->
      <template v-else>
        <div
          v-if="store.sessionRecovery.status !== 'ready'"
          class="session-recovery-banner"
        >
          <el-alert
            :title="
              store.sessionRecovery.status === 'recovering'
                ? '正在后台恢复会话索引'
                : '会话索引需要恢复'
            "
            type="warning"
            :closable="false"
            show-icon
          >
            <template #default>
              <div class="session-recovery-content">
                <span>{{ sessionRecoveryMessage }}</span>
                <el-button
                  v-if="store.sessionRecovery.status === 'recovering'"
                  text
                  type="warning"
                  @click="handleCancelSessionRecovery"
                >
                  取消恢复
                </el-button>
                <el-button
                  text
                  type="warning"
                  @click="handleOpenCorruptSessionsDirectory"
                >
                  打开目录
                </el-button>
                <el-button
                  text
                  type="warning"
                  @click="handleExportCorruptionDiagnostics"
                >
                  导出诊断
                </el-button>
                <el-button
                  v-if="store.sessionRecovery.failedSessionCount > 0"
                  text
                  type="warning"
                  @click="handleClearQuarantinedSessionFiles"
                >
                  删除隔离文件
                </el-button>
              </div>
            </template>
          </el-alert>
        </div>

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
          <div
            class="collapse-button left-collapse"
            @click="isLeftSidebarCollapsed = true"
          >
            <SidebarToggleIcon class="collapse-icon trapezoid" />
            <svg
              class="arrow-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
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
            <svg
              class="arrow-icon expanded"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
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
            :is-sending="store.isCurrentSessionGenerating"
            :disabled="!store.currentSession"
            :current-agent-id="currentAgentId"
            :current-model-id="
              currentAgentId
                ? agentStore.getAgentById(currentAgentId)?.modelId
                : undefined
            "
            @send="handleSendMessage"
            @abort="handleAbortSending"
            @complete-input="handleCompleteInput"
            @select-continuation-model="handleSelectContinuationModel"
            @clear-continuation-model="inputManager.clearContinuationModel"
          />

          <!-- 分离后的占位提示 -->
          <div v-else class="detached-placeholder">
            <div class="placeholder-content">
              <svg
                class="placeholder-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  stroke-width="2"
                />
                <path d="M9 3v18M3 9h18M3 15h6M15 15h6" stroke-width="2" />
              </svg>
              <h3 class="placeholder-title">对话区域已分离</h3>
              <p class="placeholder-description">对话区域已在悬浮窗中打开</p>
            </div>
          </div>

          <!-- 右侧边栏折叠时的展开按钮 -->
          <div
            v-if="isRightSidebarCollapsed"
            class="expand-button right-expand"
            @click="isRightSidebarCollapsed = false"
          >
            <SidebarToggleIcon class="expand-icon trapezoid" flip />
            <svg
              class="arrow-icon expanded"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
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
          <div
            class="collapse-button right-collapse"
            @click="isRightSidebarCollapsed = true"
          >
            <SidebarToggleIcon class="collapse-icon trapezoid" flip />
            <svg
              class="arrow-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
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
              :is-clearing-empty-sessions="isClearingEmptySessions"
              :is-refreshing-session-index="isRefreshingSessionIndex"
              @switch="handleSwitchSession"
              @delete="handleDeleteSession"
              @clear-empty-sessions="handleClearEmptySessions"
              @refresh-session-index="handleRefreshSessionIndex"
              @new-session="handleNewSession"
              @rename="handleRenameSession"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- 智能体自定义样式注入 -->
    <component
      is="style"
      v-if="agentCustomStyles"
      id="agent-custom-styles"
      type="text/css"
    >
      {{ agentCustomStyles }}
    </component>

    <!-- 上下文分析对话框 -->
    <ContextAnalyzerDialog
      v-model:visible="store.contextAnalyzerVisible"
      :node-id="store.contextAnalyzerNodeId"
      :session-index="store.currentSession"
      :session-detail="store.currentSessionDetail"
    />
  </div>
</template>

<style scoped>
.llm-chat-wrapper {
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.session-recovery-banner {
  position: absolute;
  z-index: 20;
  top: 12px;
  left: 50%;
  width: min(560px, calc(100% - 32px));
  transform: translateX(-50%);
}

.session-recovery-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  border: var(--border-width) solid var(--border-color);
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

/* ===== 骨架屏样式 ===== */
/* 分离后的占位样式 */
.detached-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
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
