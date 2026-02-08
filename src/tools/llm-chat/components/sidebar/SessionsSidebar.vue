<script setup lang="ts">
import { ref, computed } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Plus, Search, Operation, Loading, Position } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import { useChatStorageSeparated } from "../../composables/storage/useChatStorageSeparated";
import { customMessage } from "@/utils/customMessage";
import type { ChatSession } from "../../types";

import SessionItem from "./SessionItem.vue";
import FilterPanel from "./FilterPanel.vue";
import RenameDialog from "./RenameDialog.vue";
import ExportSessionDialog from "../export/ExportSessionDialog.vue";
import { useSessionsSidebarLogic } from "../../composables/sidebar/useSessionsSidebarLogic";

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

interface Emits {
  (e: "switch", sessionId: string): void;
  (e: "delete", sessionId: string): void;
  (e: "new-session", data: { agentId: string; name?: string }): void;
  (e: "rename", data: { sessionId: string; newName: string }): void;
  (e: "session-updated"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const {
  searchQuery,
  showLoadingIndicator,
  displaySessions,
  isInSearchMode,
  sortBy,
  sortOrder,
  filterAgent,
  filterTime,
  renameDialogVisible,
  renamingSession,
  newSessionName,
  availableAgents,
  hasActiveFilters,
  searchMatchesMap,
  isGenerating,
  handleQuickNewSession,
  resetFilters,
  confirmDelete,
  openRenameDialog,
  handleGenerateName,
  getFieldLabel,
  getRoleLabel,
  settings,
  agentStore,
} = useSessionsSidebarLogic({ props, emit });

// 导出会话相关状态
const exportSessionDialogVisible = ref(false);
const sessionToExport = ref<ChatSession | null>(null);

// 虚拟滚动列表
const parentRef = ref<HTMLElement | null>(null);
const virtualizer = useVirtualizer({
  get count() {
    return displaySessions.value.length;
  },
  getScrollElement: () => parentRef.value,
  estimateSize: () => 71,
  overscan: 10,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

// 确认重命名
const confirmRename = (newName: string) => {
  if (!renamingSession.value) return;
  emit("rename", { sessionId: renamingSession.value.id, newName });
  renamingSession.value = null;
};

// 打开导出会话对话框
const openExportDialog = (session: ChatSession) => {
  sessionToExport.value = session;
  exportSessionDialogVisible.value = true;
};

// 打开会话目录并选中文件
const handleOpenDirectory = async (session: ChatSession) => {
  try {
    const { getSessionPath } = useChatStorageSeparated();
    const sessionPath = await getSessionPath(session.id);
    await invoke("open_file_directory", { filePath: sessionPath });
  } catch (error) {
    customMessage.error("打开目录失败");
  }
};

// 处理菜单命令
const handleMenuCommand = (command: string, session: ChatSession) => {
  switch (command) {
    case "delete":
      confirmDelete(session);
      break;
    case "rename":
      openRenameDialog(session);
      break;
    case "generate-name":
      handleGenerateName(session);
      break;
    case "export":
      openExportDialog(session);
      break;
    case "open-directory":
      handleOpenDirectory(session);
      break;
  }
};

// 定位到当前激活的会话
const scrollToCurrentSession = () => {
  if (!props.currentSessionId) return;
  const index = displaySessions.value.findIndex((s) => s.id === props.currentSessionId);
  if (index !== -1) {
    virtualizer.value.scrollToIndex(index, { align: "center" });
  } else {
    customMessage.info("当前会话在当前筛选条件下不可见");
  }
};

// 处理会话点击
const handleSessionClick = (session: ChatSession) => {
  if (settings.value.uiPreferences.autoSwitchAgentOnSessionChange && session.displayAgentId) {
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent) {
      agentStore.selectAgent(session.displayAgentId);
    }
  }
  emit("switch", session.id);
};
</script>

<template>
  <div class="sessions-sidebar">
    <div class="sessions-sidebar-header">
      <div class="header-top">
        <el-input
          v-model="searchQuery"
          placeholder="搜索会话..."
          :prefix-icon="Search"
          clearable
          size="default"
          class="search-input"
        >
          <template #suffix v-if="showLoadingIndicator">
            <el-icon class="is-loading"><Loading /></el-icon>
          </template>
        </el-input>

        <el-tooltip content="新建对话" placement="bottom" :show-after="500">
          <el-button type="primary" :icon="Plus" @click="handleQuickNewSession" circle />
        </el-tooltip>
      </div>

      <div class="header-actions">
        <div class="action-left">
          <el-popover trigger="click" width="320" popper-class="filter-popover">
            <template #reference>
              <div>
                <el-tooltip content="排序与筛选" placement="bottom" :show-after="500">
                  <el-button
                    :icon="Operation"
                    circle
                    size="small"
                    :type="hasActiveFilters ? 'primary' : undefined"
                  />
                </el-tooltip>
              </div>
            </template>

            <FilterPanel
              v-model:sortBy="sortBy"
              v-model:sortOrder="sortOrder"
              v-model:filterTime="filterTime"
              v-model:filterAgent="filterAgent"
              :available-agents="availableAgents"
              :has-active-filters="hasActiveFilters"
              @reset="resetFilters"
            />
          </el-popover>

          <el-tooltip content="定位当前会话" placement="bottom" :show-after="500">
            <el-button
              :icon="Position"
              @click="scrollToCurrentSession"
              circle
              size="small"
              :disabled="!currentSessionId"
            />
          </el-tooltip>
        </div>

        <div class="session-count">{{ displaySessions.length }} / {{ sessions.length }}</div>
      </div>
    </div>

    <div class="sessions-list" ref="parentRef">
      <div v-if="sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
        <p class="hint">点击下方按钮创建新会话</p>
      </div>

      <div v-else-if="displaySessions.length === 0" class="empty-state">
        <p>未找到匹配的会话</p>
        <p class="hint" v-if="isInSearchMode">尝试其他搜索关键词</p>
      </div>

      <div
        v-else
        :style="{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative',
        }"
      >
        <div
          v-for="virtualItem in virtualItems"
          :key="displaySessions[virtualItem.index].id"
          :data-index="virtualItem.index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }"
        >
          <SessionItem
            :session="displaySessions[virtualItem.index]"
            :active="displaySessions[virtualItem.index].id === currentSessionId"
            :is-generating="isGenerating(displaySessions[virtualItem.index].id)"
            :matches="searchMatchesMap.get(displaySessions[virtualItem.index].id)"
            :get-field-label="getFieldLabel"
            :get-role-label="getRoleLabel"
            @click="handleSessionClick"
            @command="handleMenuCommand"
          />
        </div>
      </div>
    </div>

    <RenameDialog
      v-model="renameDialogVisible"
      :initial-name="newSessionName"
      @confirm="confirmRename"
    />

    <ExportSessionDialog v-model:visible="exportSessionDialogVisible" :session="sessionToExport" />
  </div>
</template>

<style scoped>
.sessions-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.sessions-sidebar-header {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.header-top {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.action-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.session-count {
  font-size: 11px;
  color: var(--text-color-light);
  opacity: 0.8;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

/* 滚动条样式 */
.sessions-list::-webkit-scrollbar {
  width: 6px;
}

.sessions-list::-webkit-scrollbar-track {
  background: transparent;
}

.sessions-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.sessions-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>
