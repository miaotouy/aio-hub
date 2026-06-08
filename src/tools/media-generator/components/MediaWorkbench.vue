<script setup lang="ts">
import { watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import ParameterPanel from "./ParameterPanel.vue";
import GenerationStream from "./GenerationStream.vue";
import QuickTaskView from "./QuickTaskView.vue";
import AssetGallery from "./AssetGallery.vue";
import MediaGenerationInput from "./MediaGenerationInput.vue";
import MiniMaxCoverWorkflowPanel from "./MiniMaxCoverWorkflowPanel.vue";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Zap,
  Square,
  Trash2,
  History,
  Layers,
  MessageSquarePlus,
} from "lucide-vue-next";
import SessionManager from "./SessionManager.vue";
import { useLocalStorage } from "@vueuse/core";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";
import { customMessage } from "@/utils/customMessage";
import { ref, computed, nextTick } from "vue";
import { Check, X, Download } from "lucide-vue-next";
import { ElMessageBox as elMessageBox } from "element-plus";

const store = useMediaGenStore();
const taskManager = useMediaTaskManager();
const { buildTask, executeGeneration, abortAll, activeTaskCount } =
  useMediaGenerationManager();

// 工作区模式：session (会话模式) | quick (快速单次模式)
const workbenchMode = useLocalStorage<"session" | "quick">(
  "media-gen-workbench-mode",
  "session"
);

const handleSendQuick = async (options: any, mediaType: any) => {
  try {
    // 1. 构造任务
    const task = buildTask(options, mediaType);

    // 2. 注册到任务池
    taskManager.addTask(task);

    // 3. 执行生成 (不传 contextMessages)
    const config = {
      timeout: store.settings.requestSettings?.timeout,
      maxRetries: store.settings.requestSettings?.maxRetries,
      metadataWrite: store.settings.metadataWrite,
    };

    await executeGeneration(task, undefined, config);
    if (store.settings.autoOpenAsset) {
      await store.openTaskResult(task.id);
    }
  } catch (error) {
    customMessage.error("生成失败");
  }
};

const clearFinished = () => {
  const finishedIds = taskManager.tasks.value
    .filter((t) => ["completed", "error", "cancelled"].includes(t.status))
    .map((t) => t.id);

  if (finishedIds.length === 0) {
    customMessage.info("没有可清理的任务");
    return;
  }

  finishedIds.forEach((id) => store.removeTask(id));
  customMessage.success(`已清理 ${finishedIds.length} 个已完成任务`);
};

const stopAll = () => {
  if (activeTaskCount.value === 0) return;
  abortAll();
  customMessage.info("已停止所有生成任务");
};

// --- 会话标题编辑逻辑 ---
const isEditingName = ref(false);
const editingName = ref("");
const titleInputRef = ref<any>(null);

const currentSessionName = computed(() => {
  return store.currentSession?.name || "生成会话";
});

const startEdit = async () => {
  editingName.value = currentSessionName.value;
  isEditingName.value = true;
  await nextTick();
  titleInputRef.value?.focus();
};

const saveEdit = async () => {
  if (!isEditingName.value) return;
  const newName = editingName.value.trim();
  if (
    newName &&
    newName !== currentSessionName.value &&
    store.currentSessionId
  ) {
    await store.updateSessionName(store.currentSessionId, newName);
  }
  isEditingName.value = false;
};

const cancelEdit = () => {
  isEditingName.value = false;
};

// --- 批量操作逻辑 ---
const handleBatchDelete = async () => {
  const selectedCount = store.selectedMessages.length;
  if (selectedCount === 0) return;

  try {
    await elMessageBox.confirm(
      `确定要删除选中的 ${selectedCount} 条消息吗？`,
      "批量删除",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );

    for (const msg of store.selectedMessages) {
      store.deleteMessage(msg.id);
    }
    store.exitBatchMode();
  } catch {
    // 用户取消
  }
};

const handleBatchDownload = async () => {
  // TODO: 实现批量下载逻辑
  customMessage.info("批量下载功能开发中...");
};

// 使用 localStorage 快速同步 UI 状态，避免异步初始化导致的闪烁
const leftCollapsed = useLocalStorage("media-gen-left-collapsed", false);
const rightCollapsed = useLocalStorage("media-gen-right-collapsed", false);

// 同步到 store (当 store 初始化完成后)
watch(
  () => store.isInitialized,
  (val) => {
    if (val) {
      store.settings.leftCollapsed = leftCollapsed.value;
      store.settings.rightCollapsed = rightCollapsed.value;
    }
  },
  { immediate: true }
);

// 监听 store 变化同步回 localStorage (确保设置页面修改也能同步)
watch(
  () => store.settings.leftCollapsed,
  (val) => {
    leftCollapsed.value = val;
  }
);
watch(
  () => store.settings.rightCollapsed,
  (val) => {
    rightCollapsed.value = val;
  }
);
</script>

<template>
  <div class="media-workbench">
    <!-- 左侧：参数配置面板 -->
    <div class="side-panel left" :class="{ collapsed: leftCollapsed }">
      <div class="panel-container">
        <ParameterPanel />
      </div>
      <div
        class="collapse-trigger"
        @click="
          leftCollapsed = !leftCollapsed;
          store.settings.leftCollapsed = leftCollapsed;
        "
      >
        <el-icon
          ><ChevronLeft v-if="!leftCollapsed" /><ChevronRight v-else
        /></el-icon>
      </div>
    </div>
    <!-- 中间：生成流 (核心对话/任务区) -->
    <div class="main-content">
      <!-- 统一头部 -->
      <div
        class="workbench-header"
        :class="{
          'batch-mode-active': store.isBatchMode && workbenchMode === 'session',
        }"
      >
        <!-- 左侧：模式切换 + 标题 -->
        <div class="header-left-section">
          <div class="mode-selector">
            <div
              class="mode-tab"
              :class="{ active: workbenchMode === 'session' }"
              @click="workbenchMode = 'session'"
            >
              <el-icon><MessageSquare /></el-icon>
              <span class="mode-label">创作会话</span>
            </div>
            <div
              class="mode-tab"
              :class="{ active: workbenchMode === 'quick' }"
              @click="workbenchMode = 'quick'"
            >
              <el-icon><Zap /></el-icon>
              <span class="mode-label">快速生成</span>
            </div>
          </div>

          <el-divider direction="vertical" class="header-divider" />

          <!-- 模式专属标题区 -->
          <div class="header-title-content">
            <!-- 会话模式标题 -->
            <template v-if="workbenchMode === 'session'">
              <div v-if="store.isBatchMode" class="batch-info">
                <span class="selected-count"
                  >已选中 {{ store.selectedMessages.length }} 项</span
                >
              </div>
              <div v-else class="session-title-area">
                <div v-if="isEditingName" class="title-edit-wrapper">
                  <el-input
                    ref="titleInputRef"
                    v-model="editingName"
                    size="small"
                    class="title-input"
                    placeholder="输入会话名称..."
                    @keyup.enter="saveEdit"
                    @keyup.esc="cancelEdit"
                  />
                  <div class="edit-actions">
                    <el-button
                      link
                      size="small"
                      type="primary"
                      @click="saveEdit"
                    >
                      <el-icon><Check /></el-icon>
                    </el-button>
                    <el-button link size="small" @click="cancelEdit">
                      <el-icon><X /></el-icon>
                    </el-button>
                  </div>
                </div>
                <span v-else class="session-display-name" @click="startEdit">{{
                  currentSessionName
                }}</span>
              </div>
            </template>

            <!-- 单次模式标题 -->
            <template v-else>
              <span class="mode-status-text"
                >当前任务队列 ({{ taskManager.tasks.value.length }})</span
              >
            </template>
          </div>
        </div>

        <!-- 右侧：模式专属操作 -->
        <div class="header-right-section">
          <!-- 会话模式操作 -->
          <template v-if="workbenchMode === 'session'">
            <div v-if="store.isBatchMode" class="batch-actions">
              <el-button
                type="primary"
                plain
                size="small"
                :disabled="store.selectedMessages.length === 0"
                @click="handleBatchDownload"
              >
                <el-icon><Download /></el-icon>
                <span>下载</span>
              </el-button>
              <el-button
                type="danger"
                plain
                size="small"
                :disabled="store.selectedMessages.length === 0"
                @click="handleBatchDelete"
              >
                <el-icon><Trash2 /></el-icon>
                <span>删除</span>
              </el-button>
              <el-divider direction="vertical" />
              <el-button size="small" @click="store.exitBatchMode"
                >取消</el-button
              >
            </div>

            <div v-else class="session-actions">
              <el-tooltip content="批量操作" placement="bottom">
                <el-button
                  link
                  class="action-btn"
                  @click="store.enterBatchMode"
                >
                  <el-icon><Layers /></el-icon>
                </el-button>
              </el-tooltip>

              <el-tooltip content="开启新会话" placement="bottom">
                <el-button
                  link
                  class="action-btn"
                  @click="store.createNewSession()"
                >
                  <el-icon><MessageSquarePlus /></el-icon>
                </el-button>
              </el-tooltip>

              <el-popover
                placement="bottom-end"
                :width="360"
                trigger="click"
                popper-class="session-popover"
              >
                <template #reference>
                  <el-button link class="history-btn">
                    <span style="padding-right: 4px">切换会话</span>
                    <el-icon><History /></el-icon>
                  </el-button>
                </template>
                <SessionManager />
              </el-popover>
            </div>
          </template>

          <!-- 单次模式操作 -->
          <template v-else>
            <div class="quick-actions">
              <el-button
                v-if="activeTaskCount > 0"
                :icon="Square"
                type="danger"
                plain
                size="small"
                @click="stopAll"
              >
                停止全部 ({{ activeTaskCount }})
              </el-button>
              <el-button
                :icon="Trash2"
                plain
                size="small"
                @click="clearFinished"
              >
                清理已完成
              </el-button>
            </div>
          </template>
        </div>
      </div>

      <div class="content-body">
        <KeepAlive>
          <component
            :is="workbenchMode === 'session' ? GenerationStream : QuickTaskView"
          />
        </KeepAlive>
      </div>

      <div class="workbench-footer">
        <MiniMaxCoverWorkflowPanel />
        <MediaGenerationInput :mode="workbenchMode" @send="handleSendQuick" />
      </div>
    </div>

    <!-- 右侧：资产画廊 -->
    <div class="side-panel right" :class="{ collapsed: rightCollapsed }">
      <div class="panel-container">
        <AssetGallery />
      </div>
      <div
        class="collapse-trigger"
        @click="
          rightCollapsed = !rightCollapsed;
          store.settings.rightCollapsed = rightCollapsed;
        "
      >
        <el-icon
          ><ChevronRight v-if="!rightCollapsed" /><ChevronLeft v-else
        /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-workbench {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.media-workbench * {
  box-sizing: border-box;
}

.side-panel {
  position: relative;
  height: 100%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.panel-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.side-panel.left {
  width: 320px;
  border-right: var(--border-width) solid var(--border-color);
}

.side-panel.right {
  width: 300px;
  border-right: none;
  border-left: var(--border-width) solid var(--border-color);
}

.side-panel.collapsed {
  width: 0;
  border: none;
}

.side-panel.collapsed .panel-container {
  display: none;
}

.main-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.workbench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  z-index: 20;
  height: 48px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.workbench-header.batch-mode-active {
  background-color: color-mix(
    in srgb,
    var(--el-color-primary),
    transparent 92%
  );
  border-bottom: 1px solid
    color-mix(in srgb, var(--el-color-primary), transparent 80%);
  backdrop-filter: blur(var(--ui-blur));
}

.header-left-section {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.header-right-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.mode-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
}

.mode-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-regular);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.mode-tab:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

.mode-tab.active {
  background-color: var(--card-bg);
  color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  font-weight: 600;
}

.mode-label {
  white-space: nowrap;
}

.header-divider {
  margin: 0 4px;
  height: 16px;
}

.header-title-content {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
}

.mode-status-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.session-title-area {
  min-width: 0;
  flex: 1;
}

.session-display-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.session-display-name:hover {
  background-color: var(--el-fill-color-light);
}

.title-edit-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 300px;
}

.edit-actions {
  display: flex;
  align-items: center;
}

.batch-info {
  display: flex;
  align-items: center;
}

.selected-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.session-actions,
.batch-actions,
.quick-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn,
.history-btn {
  height: 32px;
  padding: 0 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  transition: all 0.2s;
}

.action-btn:hover,
.history-btn:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

.content-body {
  flex: 1;
  min-height: 0;
  position: relative;
}

.workbench-footer {
  padding: 0 24px 24px;
  z-index: 10;
}

.collapse-trigger {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 48px;
  background-color: var(--sidebar-bg);
  border: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;
}

.side-panel.left .collapse-trigger {
  right: -16px;
  border-left: none;
  border-radius: 0 4px 4px 0;
}

.side-panel.right .collapse-trigger {
  left: -16px;
  border-right: none;
  border-radius: 4px 0 0 4px;
}

.collapse-trigger:hover {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}
</style>
