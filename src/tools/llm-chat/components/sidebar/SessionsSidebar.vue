<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  Plus,
  Search,
  Operation,
  Loading,
  Position,
  Delete,
  Refresh,
  Star,
} from "@element-plus/icons-vue";
import type { SearchMatchMode } from "../../composables/chat/useLlmSearch";
import { invoke } from "@tauri-apps/api/core";
import { useChatStorageSeparated } from "../../composables/storage/useChatStorageSeparated";
import { customMessage } from "@/utils/customMessage";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types";

import SessionItem from "./SessionItem.vue";
import FilterPanel from "./FilterPanel.vue";
import RenameDialog from "./RenameDialog.vue";
import ExportSessionDialog from "../export/ExportSessionDialog.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import FavoriteManagerDialog from "./FavoriteManagerDialog.vue";
import { useSessionsSidebarLogic } from "../../composables/sidebar/useSessionsSidebarLogic";
import { useLlmChatStore } from "../../stores/llmChatStore";

interface Props {
  sessions: ChatSessionIndex[];
  currentSessionId: string | null;
  isClearingEmptySessions?: boolean;
  isRefreshingSessionIndex?: boolean;
}

interface Emits {
  (e: "switch", sessionId: string): void;
  (e: "delete", sessionId: string): void;
  (e: "clear-empty-sessions", data: { orderedSessionIds: string[] }): void;
  (e: "refresh-session-index"): void;
  (e: "new-session", data: { agentId: string; name?: string }): void;
  (e: "rename", data: { sessionId: string; newName: string }): void;
  (e: "session-updated"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const llmChatStore = useLlmChatStore();

const {
  searchQuery,
  showLoadingIndicator,
  displaySessions,
  isInSearchMode,
  matchMode,
  sortBy,
  sortOrder,
  filterAgent,
  filterTime,
  filterFavorite,
  renameDialogVisible,
  renamingSession,
  newSessionName,
  availableAgents,
  hasActiveFilters,
  emptySessionsCount,
  searchMatchesMap,
  isGenerating,
  search,
  handleQuickNewSession,
  resetFilters,
  confirmDelete,
  confirmClearEmptySessions,
  openRenameDialog,
  handleGenerateName,
  getFieldLabel,
  getRoleLabel,
  settings,
  agentStore,
} = useSessionsSidebarLogic({ props, emit });

// 搜索模式配置
const matchModeOptions: {
  value: SearchMatchMode;
  label: string;
  desc: string;
}[] = [
  { value: "exact", label: "精确", desc: "完整短语匹配" },
  { value: "and", label: "全部", desc: "所有关键词都须出现" },
  { value: "or", label: "任一", desc: "任一关键词出现即可" },
];

const currentModeLabel = computed(
  () =>
    matchModeOptions.find((o) => o.value === matchMode.value)?.label ?? "精确"
);

const handleMatchModeChange = (mode: SearchMatchMode) => {
  matchMode.value = mode;
  if (searchQuery.value.trim().length >= 2) {
    search(searchQuery.value.trim());
  }
};

// 导出会话相关状态
const exportSessionDialogVisible = ref(false);
const sessionToExport = ref<ChatSessionIndex | null>(null);
const sessionToExportDetail = ref<ChatSessionDetail | null>(null);
const favoriteManagerVisible = ref(false);
const moveFavoriteDialogVisible = ref(false);
const movingSession = ref<ChatSessionIndex | null>(null);
const moveTargetFolderId = ref("__uncategorized");

const favoriteFolderOptions = computed(() => llmChatStore.favoriteFolders);

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
const openExportDialog = async (sessionIndex: ChatSessionIndex) => {
  const llmChatStore = (
    await import("../../stores/llmChatStore")
  ).useLlmChatStore();

  // 确保详情已加载
  let detail = llmChatStore.sessionDetailMap.get(sessionIndex.id);
  if (!detail) {
    const { useChatStorageSeparated } =
      await import("../../composables/storage/useChatStorageSeparated");
    const storage = useChatStorageSeparated();
    const fullSession = await storage.loadSession(sessionIndex.id);
    if (fullSession && fullSession.detail.nodes) {
      detail = {
        id: sessionIndex.id,
        nodes: fullSession.detail.nodes,
        rootNodeId: fullSession.detail.rootNodeId!,
        activeLeafId: fullSession.detail.activeLeafId!,
        updatedAt: fullSession.detail.updatedAt || sessionIndex.updatedAt,
        history: fullSession.detail.history || [],
        historyIndex: fullSession.detail.historyIndex || 0,
      };
      llmChatStore.sessionDetailMap.set(sessionIndex.id, detail);
    }
  }

  sessionToExport.value = sessionIndex;
  sessionToExportDetail.value = detail || null;
  exportSessionDialogVisible.value = true;
};

// 打开会话目录并选中文件
const handleOpenDirectory = async (session: ChatSessionIndex) => {
  try {
    const { getSessionPath } = useChatStorageSeparated();
    const sessionPath = await getSessionPath(session.id);
    await invoke("open_file_directory", { filePath: sessionPath });
  } catch (error) {
    customMessage.error("打开目录失败");
  }
};

const handleToggleFavorite = async (session: ChatSessionIndex) => {
  await llmChatStore.toggleFavorite(session.id);
};

const openMoveFavoriteDialog = (session: ChatSessionIndex) => {
  movingSession.value = session;
  moveTargetFolderId.value = session.favoriteFolderId || "__uncategorized";
  moveFavoriteDialogVisible.value = true;
};

const createFavoriteFolderFromMove = async () => {
  try {
    const { value } = await ElMessageBox.prompt("收藏夹名称", "新建收藏夹", {
      inputPlaceholder: "例如：报错排查",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      lockScroll: false,
      inputValidator: (value: string) =>
        value.trim().length > 0 || "名称不能为空",
    });
    const folderId = await llmChatStore.createFavoriteFolder(value.trim());
    moveTargetFolderId.value = folderId;
    customMessage.success("收藏夹已创建");
  } catch {}
};

const confirmMoveFavorite = async () => {
  if (!movingSession.value) return;
  await llmChatStore.moveSessionToFolder(
    movingSession.value.id,
    moveTargetFolderId.value === "__uncategorized"
      ? null
      : moveTargetFolderId.value
  );
  moveFavoriteDialogVisible.value = false;
  customMessage.success("会话已移动到收藏夹");
};

const removeMovingFavorite = async () => {
  if (!movingSession.value?.isFavorite) return;
  await llmChatStore.toggleFavorite(movingSession.value.id);
  moveFavoriteDialogVisible.value = false;
  customMessage.success("已取消收藏");
};

// 处理菜单命令
const handleMenuCommand = (command: string, session: ChatSessionIndex) => {
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
    case "move-to-folder":
      openMoveFavoriteDialog(session);
      break;
    case "open-directory":
      handleOpenDirectory(session);
      break;
  }
};

// 定位到当前激活的会话
const scrollToCurrentSession = () => {
  if (!props.currentSessionId) return;
  const index = displaySessions.value.findIndex(
    (s) => s.id === props.currentSessionId
  );
  if (index !== -1) {
    virtualizer.value.scrollToIndex(index, { align: "center" });
  } else {
    customMessage.info("当前会话在当前筛选条件下不可见");
  }
};

// 处理会话点击
const handleSessionClick = (session: ChatSessionIndex) => {
  if (
    settings.value.uiPreferences.autoSwitchAgentOnSessionChange &&
    session.displayAgentId
  ) {
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent) {
      agentStore.selectAgent(session.displayAgentId, {
        syncCurrentSessionGreetings: false,
      });
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

        <el-dropdown
          trigger="click"
          @command="handleMatchModeChange"
          placement="bottom-end"
        >
          <div>
            <el-tooltip
              :content="`搜索模式: ${matchModeOptions.find((o) => o.value === matchMode)?.desc}`"
              placement="bottom"
              :show-after="400"
            >
              <el-button
                size="default"
                :type="matchMode !== 'exact' ? 'primary' : ''"
                plain
                class="match-mode-btn"
              >
                {{ currentModeLabel }}
              </el-button>
            </el-tooltip>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="opt in matchModeOptions"
                :key="opt.value"
                :command="opt.value"
                :class="{ 'is-active': matchMode === opt.value }"
              >
                <span>{{ opt.label }}</span>
                <span class="mode-desc">{{ opt.desc }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-tooltip content="新建对话" placement="bottom" :show-after="500">
          <el-button
            type="primary"
            :icon="Plus"
            @click="handleQuickNewSession"
            circle
          />
        </el-tooltip>
      </div>

      <div class="header-actions">
        <div class="action-left">
          <el-popover trigger="click" width="320" popper-class="filter-popover">
            <template #reference>
              <div>
                <el-tooltip
                  content="排序与筛选"
                  placement="bottom"
                  :show-after="500"
                >
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
              v-model:filterFavorite="filterFavorite"
              :available-agents="availableAgents"
              :has-active-filters="hasActiveFilters"
              @reset="resetFilters"
            />
          </el-popover>

          <el-tooltip content="我的收藏夹" placement="bottom" :show-after="500">
            <el-button
              :icon="Star"
              @click="favoriteManagerVisible = true"
              circle
              size="small"
            />
          </el-tooltip>

          <el-tooltip
            :content="
              isRefreshingSessionIndex
                ? '正在刷新会话列表索引...'
                : '刷新会话列表索引'
            "
            placement="bottom"
            :show-after="500"
          >
            <el-button
              :icon="Refresh"
              @click="emit('refresh-session-index')"
              circle
              size="small"
              :loading="isRefreshingSessionIndex"
              :disabled="isRefreshingSessionIndex || isClearingEmptySessions"
            />
          </el-tooltip>

          <el-tooltip
            :content="
              isClearingEmptySessions
                ? '正在清理空会话...'
                : `清理空会话${emptySessionsCount > 0 ? ` (${emptySessionsCount})` : ''}`
            "
            placement="bottom"
            :show-after="500"
          >
            <el-button
              :icon="Delete"
              @click="confirmClearEmptySessions"
              circle
              size="small"
              :loading="isClearingEmptySessions"
              :disabled="
                emptySessionsCount === 0 ||
                isClearingEmptySessions ||
                isRefreshingSessionIndex
              "
            />
          </el-tooltip>

          <el-tooltip
            content="定位当前会话"
            placement="bottom"
            :show-after="500"
          >
            <el-button
              :icon="Position"
              @click="scrollToCurrentSession"
              circle
              size="small"
              :disabled="!currentSessionId"
            />
          </el-tooltip>
        </div>

        <div class="session-count">
          {{ displaySessions.length }} / {{ sessions.length }}
        </div>
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
            :matches="
              searchMatchesMap.get(displaySessions[virtualItem.index].id)
            "
            :get-field-label="getFieldLabel"
            :get-role-label="getRoleLabel"
            @click="handleSessionClick"
            @command="handleMenuCommand"
            @toggle-favorite="handleToggleFavorite"
          />
        </div>
      </div>
    </div>

    <RenameDialog
      v-model="renameDialogVisible"
      :initial-name="newSessionName"
      @confirm="confirmRename"
    />

    <ExportSessionDialog
      v-model:visible="exportSessionDialogVisible"
      :session-index="sessionToExport"
      :session-detail="sessionToExportDetail"
    />

    <FavoriteManagerDialog v-model="favoriteManagerVisible" />

    <BaseDialog
      v-model="moveFavoriteDialogVisible"
      title="移动到收藏夹"
      width="420px"
      max-width="92vw"
    >
      <div class="move-favorite-dialog">
        <div class="move-session-name">{{ movingSession?.name }}</div>
        <el-select v-model="moveTargetFolderId" class="move-folder-select">
          <el-option label="未分类收藏" value="__uncategorized" />
          <el-option
            v-for="folder in favoriteFolderOptions"
            :key="folder.id"
            :label="folder.name"
            :value="folder.id"
          />
        </el-select>
        <el-button :icon="Plus" @click="createFavoriteFolderFromMove">
          新建收藏夹
        </el-button>
      </div>

      <template #footer>
        <el-button
          v-if="movingSession?.isFavorite"
          text
          @click="removeMovingFavorite"
        >
          取消收藏
        </el-button>
        <el-button @click="moveFavoriteDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmMoveFavorite">确定</el-button>
      </template>
    </BaseDialog>
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

.match-mode-btn {
  min-width: 40px;
  padding: 0 8px;
  font-size: 12px;
}

.mode-desc {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-color-light);
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

.move-favorite-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.move-session-name {
  color: var(--text-color);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.move-folder-select {
  width: 100%;
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
