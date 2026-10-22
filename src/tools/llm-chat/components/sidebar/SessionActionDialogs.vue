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
import { computed, ref } from "vue";
import { ElMessageBox } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RenameDialog from "./RenameDialog.vue";
import ExportSessionDialog from "../export/ExportSessionDialog.vue";
import { useChatStorageSeparated } from "../../composables/storage/useChatStorageSeparated";
import { useLlmChatStore } from "../../stores/llmChatStore";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types";

const emit = defineEmits<{
  delete: [sessionId: string];
  rename: [data: { sessionId: string; newName: string }];
  "session-updated": [];
}>();
const llmChatStore = useLlmChatStore();
const logger = createModuleLogger("llm-chat/session-actions");
const errorHandler = createModuleErrorHandler("llm-chat/session-actions");

// 重命名相关状态
const renameDialogVisible = ref(false);
const renamingSession = ref<ChatSessionIndex | null>(null);
const newSessionName = ref("");

// 导出会话相关状态
const exportSessionDialogVisible = ref(false);
const sessionToExport = ref<ChatSessionIndex | null>(null);
const sessionToExportDetail = ref<ChatSessionDetail | null>(null);
const moveFavoriteDialogVisible = ref(false);
const movingSession = ref<ChatSessionIndex | null>(null);
const moveTargetFolderId = ref("__uncategorized");

const favoriteFolderOptions = computed(() => llmChatStore.favoriteFolders);

const confirmDelete = (session: ChatSessionIndex) => {
  ElMessageBox.confirm(`确定要删除对话"${session.name}"吗？`, "删除会话", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
    lockScroll: false,
  })
    .then(() => {
      emit("delete", session.id);
    })
    .catch(() => {});
};

const openRenameDialog = (session: ChatSessionIndex) => {
  renamingSession.value = session;
  newSessionName.value = session.name;
  renameDialogVisible.value = true;
};

const handleGenerateName = async (session: ChatSessionIndex) => {
  const originalName = session.name;
  // 手动触发使用 force 模式，跳过 shouldAutoName 检查
  await llmChatStore.generateSessionTopic(session.id, true);
  const result = llmChatStore.sessionIndexMap.get(session.id)?.name;
  if (result && result !== originalName) {
    customMessage.success(`标题已生成：${result}`);
    emit("session-updated");
  } else if (result === originalName) {
    customMessage.warning("标题生成失败或未产生有效标题");
  }
};
// 确认重命名
const confirmRename = (newName: string) => {
  if (!renamingSession.value) return;
  emit("rename", { sessionId: renamingSession.value.id, newName });
  logger.info("重命名会话", { sessionId: renamingSession.value.id });
  renamingSession.value = null;
};
// 打开导出会话对话框
const openExportDialog = async (sessionIndex: ChatSessionIndex) => {
  // 确保详情已加载
  let detail = llmChatStore.sessionDetailMap.get(sessionIndex.id);
  if (!detail) {
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
    errorHandler.handle(error, {
      userMessage: "打开目录失败",
      showToUser: true,
    });
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

defineExpose({ handleMenuCommand, handleToggleFavorite });
</script>

<template>
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
</template>

<style scoped>
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
</style>
