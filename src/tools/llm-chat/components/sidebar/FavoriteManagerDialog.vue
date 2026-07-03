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
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { VueDraggableNext } from "vue-draggable-next";
import {
  Delete,
  Edit,
  Folder,
  Plus,
  Rank,
  Search,
  Star,
} from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { formatRelativeTime } from "@/utils/time";
import { useLlmChatStore } from "../../stores/llmChatStore";
import type { ChatSessionIndex } from "../../types";
import type { FavoriteFolder } from "../../composables/storage/useChatStorageSeparated";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useLlmChatStore();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const searchQuery = ref("");
const selectedFolderKey = ref<"all" | "uncategorized" | string>("all");

const favoriteFolders = computed(() => store.favoriteFolders);
const favoriteSessions = computed(() =>
  [...store.favoriteSessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
);

const folderSessionCount = (folderId: string | null) => {
  return favoriteSessions.value.filter(
    (session) => (session.favoriteFolderId ?? null) === folderId
  ).length;
};

const selectedFolderName = computed(() => {
  if (selectedFolderKey.value === "all") return "全部收藏";
  if (selectedFolderKey.value === "uncategorized") return "未分类收藏";
  return (
    favoriteFolders.value.find(
      (folder) => folder.id === selectedFolderKey.value
    )?.name || "收藏夹"
  );
});

const visibleSessions = computed(() => {
  let sessions = favoriteSessions.value;
  if (selectedFolderKey.value === "uncategorized") {
    sessions = sessions.filter((session) => !session.favoriteFolderId);
  } else if (selectedFolderKey.value !== "all") {
    sessions = sessions.filter(
      (session) => session.favoriteFolderId === selectedFolderKey.value
    );
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    sessions = sessions.filter((session) =>
      session.name.toLowerCase().includes(query)
    );
  }

  return sessions;
});

watch(
  () => favoriteFolders.value.map((folder) => folder.id).join(","),
  () => {
    if (
      selectedFolderKey.value !== "all" &&
      selectedFolderKey.value !== "uncategorized" &&
      !favoriteFolders.value.some(
        (folder) => folder.id === selectedFolderKey.value
      )
    ) {
      selectedFolderKey.value = "all";
    }
  }
);

async function promptFolderName(
  title: string,
  initialValue = ""
): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt("收藏夹名称", title, {
      inputValue: initialValue,
      inputPlaceholder: "例如：常用 Prompt",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      lockScroll: false,
      inputValidator: (value: string) =>
        value.trim().length > 0 || "名称不能为空",
    });
    return value.trim();
  } catch {
    return null;
  }
}

async function createFolder() {
  const name = await promptFolderName("新建收藏夹");
  if (!name) return;

  const folderId = await store.createFavoriteFolder(name);
  selectedFolderKey.value = folderId;
  customMessage.success("收藏夹已创建");
}

async function renameFolder(folder: FavoriteFolder) {
  const name = await promptFolderName("重命名收藏夹", folder.name);
  if (!name || name === folder.name) return;

  await store.renameFavoriteFolder(folder.id, name);
  customMessage.success("收藏夹已重命名");
}

async function deleteFolder(folder: FavoriteFolder) {
  try {
    await ElMessageBox.confirm(
      `确定要删除收藏夹"${folder.name}"吗？其中的会话会保留收藏状态并移入未分类。`,
      "删除收藏夹",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    await store.deleteFavoriteFolder(folder.id);
    customMessage.success("收藏夹已删除");
  } catch {}
}

function folderSelectValue(session: ChatSessionIndex) {
  return session.favoriteFolderId || "__uncategorized";
}

async function handleMoveSession(session: ChatSessionIndex, value: string) {
  await store.moveSessionToFolder(
    session.id,
    value === "__uncategorized" ? null : value
  );
}

async function removeFavorite(session: ChatSessionIndex) {
  if (!session.isFavorite) return;
  await store.toggleFavorite(session.id);
}

async function openSession(session: ChatSessionIndex) {
  await store.switchSession(session.id);
  visible.value = false;
}

// 拖拽排序
const draggableFolders = ref<FavoriteFolder[]>([]);

watch(
  () => favoriteFolders.value,
  (folders) => {
    draggableFolders.value = [...folders];
  },
  { immediate: true, deep: true }
);

const orderBeforeDrag = ref<string[]>([]);

const onDragStart = () => {
  orderBeforeDrag.value = draggableFolders.value.map((f) => f.id);
  document.body.style.userSelect = "none";
};

const onDragEnd = () => {
  document.body.style.userSelect = "";
  const newOrder = draggableFolders.value.map((f) => f.id);
  const hasChanged = !orderBeforeDrag.value.every(
    (id, index) => id === newOrder[index]
  );
  if (hasChanged) {
    store.reorderFavoriteFolders(newOrder);
  }
};
</script>

<template>
  <BaseDialog
    v-model="visible"
    title="我的收藏夹"
    width="860px"
    max-width="92vw"
    height="620px"
    content-class="favorite-manager-content"
  >
    <div class="favorite-manager">
      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          :prefix-icon="Search"
          placeholder="搜索收藏会话..."
          clearable
        />
        <el-button type="primary" :icon="Plus" @click="createFolder">
          新建收藏夹
        </el-button>
      </div>

      <div class="manager-body">
        <aside class="folder-list">
          <button
            :class="['folder-row', { active: selectedFolderKey === 'all' }]"
            @click="selectedFolderKey = 'all'"
          >
            <div class="folder-icon-container">
              <el-icon class="folder-icon"><Star /></el-icon>
            </div>
            <span class="folder-name">全部收藏</span>
            <div class="folder-meta-container">
              <em class="folder-count">{{ favoriteSessions.length }}</em>
            </div>
          </button>

          <button
            :class="[
              'folder-row',
              { active: selectedFolderKey === 'uncategorized' },
            ]"
            @click="selectedFolderKey = 'uncategorized'"
          >
            <div class="folder-icon-container">
              <el-icon class="folder-icon"><Folder /></el-icon>
            </div>
            <span class="folder-name">未分类收藏</span>
            <div class="folder-meta-container">
              <em class="folder-count">{{ folderSessionCount(null) }}</em>
            </div>
          </button>
          <div class="folder-divider" />

          <VueDraggableNext
            v-model="draggableFolders"
            item-key="id"
            handle=".folder-drag-handle"
            ghost-class="drag-ghost"
            drag-class="drag-active"
            chosen-class="drag-chosen"
            :force-fallback="true"
            :fallback-tolerance="3"
            :animation="200"
            @start="onDragStart"
            @end="onDragEnd"
            class="draggable-folder-list"
          >
            <div
              v-for="folder in draggableFolders"
              :key="folder.id"
              :class="[
                'folder-row',
                'draggable',
                { active: selectedFolderKey === folder.id },
              ]"
              role="button"
              tabindex="0"
              @click="selectedFolderKey = folder.id"
              @keydown.enter="selectedFolderKey = folder.id"
            >
              <div class="folder-icon-container">
                <span class="folder-drag-handle" @click.stop>
                  <el-icon><Rank /></el-icon>
                </span>
                <span class="folder-icon">{{ folder.icon || "📁" }}</span>
              </div>
              <span class="folder-name">{{ folder.name }}</span>
              <div class="folder-meta-container">
                <em class="folder-count">{{
                  folderSessionCount(folder.id)
                }}</em>
                <span class="folder-actions" @click.stop>
                  <el-button
                    text
                    size="small"
                    :icon="Edit"
                    @click="renameFolder(folder)"
                  />
                  <el-button
                    text
                    size="small"
                    :icon="Delete"
                    @click="deleteFolder(folder)"
                  />
                </span>
              </div>
            </div>
          </VueDraggableNext>
        </aside>

        <section class="session-pane">
          <div class="pane-title">
            <span>{{ selectedFolderName }}</span>
            <small>{{ visibleSessions.length }} 个会话</small>
          </div>

          <div v-if="visibleSessions.length === 0" class="empty-state">
            暂无收藏会话
          </div>

          <div v-else class="favorite-session-list">
            <div
              v-for="session in visibleSessions"
              :key="session.id"
              class="favorite-session-row"
            >
              <button class="session-main" @click="openSession(session)">
                <span class="session-name">{{ session.name }}</span>
                <span class="session-meta">
                  {{ formatRelativeTime(session.updatedAt) }} ·
                  {{ session.messageCount ?? 0 }} 条
                </span>
              </button>

              <div class="session-actions">
                <el-select
                  :model-value="folderSelectValue(session)"
                  size="small"
                  class="folder-select"
                  @change="(value: string) => handleMoveSession(session, value)"
                >
                  <el-option label="未分类收藏" value="__uncategorized" />
                  <el-option
                    v-for="folder in favoriteFolders"
                    :key="folder.id"
                    :label="folder.name"
                    :value="folder.id"
                  />
                </el-select>
                <el-button size="small" text @click="removeFavorite(session)">
                  取消收藏
                </el-button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.favorite-manager {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.manager-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.folder-list {
  min-width: 0;
  padding: 10px;
  overflow-y: auto;
  background-color: var(--sidebar-bg);
  border-right: var(--border-width) solid var(--border-color);
  box-sizing: border-box;
}

.folder-row {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.folder-row:hover {
  background-color: var(--hover-bg);
}

.folder-row.active {
  background-color: rgba(var(--primary-color-rgb), 0.12);
  color: var(--primary-color);
}

.folder-icon-container {
  position: relative;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.folder-icon {
  font-size: 15px;
  line-height: 1;
  transition: opacity 0.15s ease;
}

.folder-drag-handle {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--text-color-light);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  font-size: 14px;
  background-color: transparent;
}

.folder-drag-handle:active {
  cursor: grabbing;
}

.folder-row.draggable:hover .folder-drag-handle {
  opacity: 1;
  pointer-events: auto;
}

.folder-row.draggable:hover .folder-icon {
  opacity: 0;
  pointer-events: none;
}

.folder-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.folder-meta-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 24px;
  height: 100%;
  flex-shrink: 0;
}

.folder-count {
  font-style: normal;
  font-size: 11px;
  color: var(--text-color-light);
  transition: opacity 0.15s ease;
}

.folder-actions {
  position: absolute;
  right: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.folder-row:hover .folder-actions {
  opacity: 1;
  pointer-events: auto;
}

.folder-row:hover .folder-count {
  opacity: 0;
  pointer-events: none;
}

.folder-divider {
  height: 1px;
  margin: 8px 2px;
  background-color: var(--border-color);
}

.draggable-folder-list {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.drag-ghost {
  opacity: 0.5;
  background-color: var(--primary-color-light);
  border-radius: 6px;
}

.drag-ghost > * {
  opacity: 0;
  visibility: hidden;
}

.drag-chosen {
  background-color: rgba(var(--primary-color-rgb), 0.08);
}

.drag-active {
  opacity: 0.95;
  cursor: grabbing;
  background-color: var(--card-bg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: none;
}

.session-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.pane-title {
  height: 46px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: var(--border-width) solid var(--border-color);
}

.pane-title span {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.pane-title small {
  color: var(--text-color-light);
}

.favorite-session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.favorite-session-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 58px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.favorite-session-row:hover {
  background-color: var(--hover-bg);
}

.session-main {
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
}

.session-name,
.session-meta {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-name {
  font-size: 13px;
  font-weight: 500;
}

.session-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-color-light);
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folder-select {
  width: 150px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 13px;
}

@media (max-width: 720px) {
  .toolbar,
  .manager-body,
  .favorite-session-row {
    grid-template-columns: 1fr;
  }

  .folder-list {
    max-height: 180px;
    border-right: none;
    border-bottom: var(--border-width) solid var(--border-color);
  }

  .session-actions {
    justify-content: flex-start;
  }
}
</style>
