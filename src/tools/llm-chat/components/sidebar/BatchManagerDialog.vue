<template>
  <BaseDialog
    v-model="localVisible"
    title="批量管理会话"
    width="1000px"
    height="80vh"
    max-width="94vw"
    :close-on-backdrop-click="true"
    content-class="session-batch-dialog-content"
  >
    <template #content>
      <div class="batch-manager">
        <div class="batch-toolbar">
          <el-input
            v-model="searchQuery"
            :prefix-icon="Search"
            clearable
            placeholder="搜索会话"
            class="toolbar-search"
          />

          <el-select
            v-model="folderFilter"
            placeholder="收藏夹"
            class="toolbar-select"
          >
            <el-option label="全部收藏状态" value="__all" />
            <el-option label="未收藏" value="__not_favorite" />
            <el-option label="未分类收藏" value="__uncategorized" />
            <el-option
              v-for="folder in llmChatStore.favoriteFolders"
              :key="folder.id"
              :label="folder.name"
              :value="folder.id"
            />
          </el-select>

          <el-select
            v-model="agentFilter"
            placeholder="智能体"
            class="toolbar-select"
            filterable
          >
            <el-option label="全部智能体" value="__all" />
            <el-option label="未关联智能体" value="__none" />
            <el-option
              v-for="agent in agentStore.agents"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            />
          </el-select>

          <el-button :icon="Upload" @click="handleImport" :loading="importing">
            导入
          </el-button>
        </div>

        <div class="sessions-table" role="table" aria-label="批量管理会话列表">
          <div class="sessions-table-header" role="row">
            <div class="selection-cell">
              <el-checkbox
                :model-value="isAllFilteredSelected"
                :indeterminate="isSomeFilteredSelected"
                :disabled="filteredSessions.length === 0"
                @change="toggleAllFiltered"
              />
            </div>
            <div class="name-cell">会话名称</div>
            <div class="agent-column">关联智能体</div>
            <div class="count-column">消息数</div>
            <div class="folder-column">收藏夹</div>
            <div class="date-column">更新时间</div>
          </div>

          <div v-if="filteredSessions.length === 0" class="empty-state">
            未找到匹配的会话
          </div>

          <div v-else ref="listRef" class="sessions-virtual-list">
            <div
              :style="{
                height: `${totalSize}px`,
                width: '100%',
                position: 'relative',
              }"
            >
              <div
                v-for="virtualItem in virtualItems"
                :key="filteredSessions[virtualItem.index].id"
                :data-index="virtualItem.index"
                :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
                class="session-row"
                role="row"
                :style="{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }"
              >
                <div class="selection-cell">
                  <el-checkbox
                    :model-value="
                      selectedSessionIds.has(
                        filteredSessions[virtualItem.index].id
                      )
                    "
                    @change="
                      (checked: string | number | boolean) =>
                        toggleSessionSelection(
                          filteredSessions[virtualItem.index],
                          checked
                        )
                    "
                  />
                </div>
                <button
                  class="session-link name-cell"
                  @click="openSession(filteredSessions[virtualItem.index].id)"
                >
                  {{
                    filteredSessions[virtualItem.index].name || "未命名会话"
                  }}
                </button>
                <div class="agent-cell agent-column">
                  <span class="agent-avatar">{{
                    getAgentInitial(filteredSessions[virtualItem.index])
                  }}</span>
                  <span class="cell-ellipsis">{{
                    getAgentName(filteredSessions[virtualItem.index])
                  }}</span>
                </div>
                <div class="count-column">
                  {{ filteredSessions[virtualItem.index].messageCount ?? 0 }}
                </div>
                <div class="folder-column cell-ellipsis">
                  {{ getFolderName(filteredSessions[virtualItem.index]) }}
                </div>
                <div class="date-column">
                  {{ formatDate(filteredSessions[virtualItem.index].updatedAt) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="batch-footer">
        <span class="selection-count">
          已选择 {{ selectedSessions.length }} 项 · 当前筛选
          {{ filteredSessions.length }} 项
        </span>
        <div class="footer-actions">
          <el-select
            v-model="moveTargetFolderId"
            class="move-select"
            :disabled="selectedSessions.length === 0"
          >
            <el-option label="未分类收藏" value="__uncategorized" />
            <el-option
              v-for="folder in llmChatStore.favoriteFolders"
              :key="folder.id"
              :label="folder.name"
              :value="folder.id"
            />
          </el-select>
          <el-button
            :icon="FolderOpened"
            :disabled="selectedSessions.length === 0"
            @click="handleBatchMove"
          >
            移动
          </el-button>
          <el-button
            :icon="Download"
            :disabled="selectedSessions.length === 0"
            :loading="exporting"
            @click="handleExport"
          >
            导出
          </el-button>
          <el-button
            type="danger"
            :icon="Delete"
            :disabled="selectedSessions.length === 0"
            :loading="deleting"
            @click="handleBatchDelete"
          >
            删除
          </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { useVirtualizer } from "@tanstack/vue-virtual";
import {
  Delete,
  Download,
  FolderOpened,
  Search,
  Upload,
} from "@element-plus/icons-vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { formatDateTime } from "@/utils/time";
import type { ChatSessionIndex } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import {
  exportSessionsAsZip,
  parseImportFile,
  type ExportableChatSession,
  type SessionImportConflictStrategy,
} from "../../services/sessionImportExportService";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "switch", sessionId: string): void;
}>();

const localVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const llmChatStore = useLlmChatStore();
const agentStore = useAgentStore();
const errorHandler = createModuleErrorHandler("llm-chat/BatchManagerDialog");

const listRef = ref<HTMLElement | null>(null);
const searchQuery = ref("");
const folderFilter = ref("__all");
const agentFilter = ref("__all");
const moveTargetFolderId = ref("__uncategorized");
const selectedSessionIds = ref<Set<string>>(new Set());
const exporting = ref(false);
const importing = ref(false);
const deleting = ref(false);

const filteredSessions = computed(() => {
  if (!localVisible.value) return [];

  const query = searchQuery.value.trim().toLowerCase();
  return [...llmChatStore.sessions]
    .filter((session) => {
      if (!query) return true;
      return session.name.toLowerCase().includes(query);
    })
    .filter((session) => {
      if (folderFilter.value === "__all") return true;
      if (folderFilter.value === "__not_favorite") return !session.isFavorite;
      if (folderFilter.value === "__uncategorized") {
        return session.isFavorite && !session.favoriteFolderId;
      }
      return session.favoriteFolderId === folderFilter.value;
    })
    .filter((session) => {
      if (agentFilter.value === "__all") return true;
      if (agentFilter.value === "__none") return !session.displayAgentId;
      return session.displayAgentId === agentFilter.value;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
});

const virtualizer = useVirtualizer({
  get count() {
    return filteredSessions.value.length;
  },
  getScrollElement: () => listRef.value,
  estimateSize: () => 46,
  overscan: 12,
});

const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

const selectedSessions = computed(() => {
  const selectedIds = selectedSessionIds.value;
  return llmChatStore.sessions.filter((session) => selectedIds.has(session.id));
});

const filteredSelectedCount = computed(() => {
  const selectedIds = selectedSessionIds.value;
  return filteredSessions.value.reduce(
    (count, session) => count + (selectedIds.has(session.id) ? 1 : 0),
    0
  );
});

const isAllFilteredSelected = computed(
  () =>
    filteredSessions.value.length > 0 &&
    filteredSelectedCount.value === filteredSessions.value.length
);

const isSomeFilteredSelected = computed(
  () =>
    filteredSelectedCount.value > 0 &&
    filteredSelectedCount.value < filteredSessions.value.length
);

watch(
  () => [
    localVisible.value,
    searchQuery.value,
    folderFilter.value,
    agentFilter.value,
  ],
  async () => {
    await nextTick();
    if (!localVisible.value) return;
    virtualizer.value.scrollToOffset(0);
    virtualizer.value.measure();
  }
);

watch(
  () => llmChatStore.sessions.map((session) => session.id).join(","),
  () => {
    const existingIds = new Set(
      llmChatStore.sessions.map((session) => session.id)
    );
    selectedSessionIds.value = new Set(
      [...selectedSessionIds.value].filter((id) => existingIds.has(id))
    );
  }
);

const formatDate = (value?: string) => {
  if (!value) return "未知";
  return new Date(value).toLocaleString("zh-CN");
};

const getAgentName = (session: ChatSessionIndex) => {
  if (!session.displayAgentId) return "未关联";
  return agentStore.getAgentById(session.displayAgentId)?.name || "未知智能体";
};

const getAgentInitial = (session: ChatSessionIndex) => {
  const name = getAgentName(session);
  return name.slice(0, 1).toUpperCase();
};

const getFolderName = (session: ChatSessionIndex) => {
  if (!session.isFavorite) return "未收藏";
  if (!session.favoriteFolderId) return "未分类收藏";
  return (
    llmChatStore.favoriteFolders.find(
      (folder) => folder.id === session.favoriteFolderId
    )?.name || "未知收藏夹"
  );
};

const toggleSessionSelection = (
  session: ChatSessionIndex,
  checked: string | number | boolean
) => {
  const next = new Set(selectedSessionIds.value);
  if (checked === true) {
    next.add(session.id);
  } else {
    next.delete(session.id);
  }
  selectedSessionIds.value = next;
};

const toggleAllFiltered = (checked: string | number | boolean) => {
  const next = new Set(selectedSessionIds.value);
  filteredSessions.value.forEach((session) => {
    if (checked === true) {
      next.add(session.id);
    } else {
      next.delete(session.id);
    }
  });
  selectedSessionIds.value = next;
};

const openSession = (sessionId: string) => {
  localVisible.value = false;
  emit("switch", sessionId);
};

const loadExportableSession = async (
  index: ChatSessionIndex
): Promise<ExportableChatSession | null> => {
  let detail = llmChatStore.sessionDetailMap.get(index.id);
  if (!detail) {
    const { useChatStorageSeparated } =
      await import("../../composables/storage/useChatStorageSeparated");
    const storage = useChatStorageSeparated();
    const fullSession = await storage.loadSession(index.id);
    detail = fullSession?.detail || undefined;
  }

  if (!detail) return null;
  return { index, detail };
};

const handleExport = async () => {
  if (selectedSessions.value.length === 0) return;

  let loading: { close: () => void } | null = null;
  try {
    exporting.value = true;
    loading = customMessage.info({
      message: "正在准备会话导出包...",
      duration: 0,
    });

    const sessions = (
      await Promise.all(selectedSessions.value.map(loadExportableSession))
    ).filter((session): session is ExportableChatSession => !!session);

    if (sessions.length === 0) {
      customMessage.warning("没有可导出的会话详情");
      return;
    }

    const zipContent = await exportSessionsAsZip(sessions);
    const dateStr = formatDateTime(new Date(), "yyyyMMdd");
    const savePath = await save({
      defaultPath: `aiohub-chat-backup-${dateStr}.zip`,
      filters: [{ name: "AIO Hub Chat Backup", extensions: ["zip"] }],
    });

    if (savePath) {
      await writeFile(savePath, zipContent);
      customMessage.success(`成功导出 ${sessions.length} 个会话`);
    }
  } catch (error) {
    errorHandler.error(error, "批量导出会话失败");
  } finally {
    loading?.close();
    exporting.value = false;
  }
};

const askConflictStrategy =
  async (): Promise<SessionImportConflictStrategy> => {
    const { value } = await ElMessageBox.prompt(
      "导入 ID 与本地会话冲突时如何处理？可输入 keep、overwrite 或 skip。",
      "导入冲突策略",
      {
        inputValue: "keep",
        inputPlaceholder: "keep / overwrite / skip",
        confirmButtonText: "继续导入",
        cancelButtonText: "取消",
        lockScroll: false,
        inputValidator: (value: string) =>
          ["keep", "overwrite", "skip"].includes(value.trim()) ||
          "请输入 keep、overwrite 或 skip",
      }
    );
    return value.trim() as SessionImportConflictStrategy;
  };

const handleImport = async () => {
  try {
    importing.value = true;
    const selected = await open({
      multiple: false,
      filters: [{ name: "AIO Hub Chat Backup", extensions: ["zip"] }],
    });
    if (!selected || Array.isArray(selected)) return;

    const strategy = await askConflictStrategy();
    const bytes = await readFile(selected);
    const parsed = await parseImportFile(bytes);
    const result = await llmChatStore.importSessions(parsed.sessions, strategy);

    if (result.importedCount === 0) {
      customMessage.warning("没有导入任何会话");
      return;
    }

    customMessage.success(
      `成功导入 ${result.importedCount} 个会话${
        result.skippedCount > 0 ? `，跳过 ${result.skippedCount} 个` : ""
      }`
    );
  } catch (error) {
    const reason =
      typeof error === "string" ? error : (error as Error)?.message;
    if (reason === "cancel" || reason === "close") return;
    errorHandler.error(error, "批量导入会话失败");
  } finally {
    importing.value = false;
  }
};

const handleBatchMove = async () => {
  if (selectedSessions.value.length === 0) return;
  await llmChatStore.batchMoveSessionsToFolder(
    selectedSessions.value.map((session) => session.id),
    moveTargetFolderId.value === "__uncategorized"
      ? null
      : moveTargetFolderId.value
  );
  customMessage.success(`已移动 ${selectedSessions.value.length} 个会话`);
};

const handleBatchDelete = async () => {
  if (selectedSessions.value.length === 0) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedSessions.value.length} 个会话吗？此操作不可撤销。`,
      "批量删除会话",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        lockScroll: false,
      }
    );

    deleting.value = true;
    await llmChatStore.batchDeleteSessions(
      selectedSessions.value.map((session) => session.id)
    );
    selectedSessionIds.value = new Set();
    customMessage.success("批量删除成功");
  } catch (error) {
    const reason =
      typeof error === "string" ? error : (error as Error)?.message;
    if (reason === "cancel" || reason === "close") return;
    errorHandler.error(error, "批量删除会话失败");
  } finally {
    deleting.value = false;
  }
};
</script>

<style scoped>
:global(.session-batch-dialog-content) {
  padding: 16px;
  overflow: hidden;
}

.batch-manager {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.toolbar-search {
  min-width: 220px;
  flex: 1;
}

.toolbar-select {
  width: 170px;
}

.sessions-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
}

.sessions-table-header,
.session-row {
  display: grid;
  grid-template-columns:
    44px minmax(220px, 1.6fr) minmax(150px, 1fr) 82px
    minmax(130px, 0.9fr) 170px;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
}

.sessions-table-header {
  height: 42px;
  padding: 0 12px;
  flex-shrink: 0;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--sidebar-bg);
  color: var(--text-color-light);
  font-size: 12px;
  font-weight: 600;
}

.sessions-virtual-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.session-row {
  min-height: 46px;
  padding: 0 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--text-color);
  font-size: 13px;
}

.session-row:hover {
  background-color: var(--hover-bg);
}

.selection-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.name-cell,
.agent-column,
.folder-column,
.date-column {
  min-width: 0;
}

.count-column,
.date-column {
  color: var(--text-color-light);
}

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 13px;
}

.session-link {
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.agent-avatar {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-size: 12px;
  flex-shrink: 0;
}

.batch-footer {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.selection-count {
  color: var(--text-color-light);
  font-size: 13px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.move-select {
  width: 160px;
}
</style>
