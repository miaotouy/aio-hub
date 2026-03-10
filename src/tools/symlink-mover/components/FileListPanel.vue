<script setup lang="ts">
import { ref } from "vue";
import { Delete, Document, FolderOpened, FolderAdd } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import FileListItem from "./FileListItem.vue";
import type { FileItem } from "../types";

interface Props {
  files: FileItem[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:files": [files: FileItem[]];
  "add-files": [paths: string[]];
  "remove-file": [index: number];
  "select-files": [];
  "select-folders": [];
}>();

const sourcePathInput = ref("");

const addSourcePathFromInput = () => {
  if (!sourcePathInput.value) {
    customMessage.warning("请输入文件或文件夹路径");
    return;
  }
  emit("add-files", [sourcePathInput.value]);
  sourcePathInput.value = "";
};

const handleDrop = (paths: string[]) => {
  emit("add-files", paths);
};

const clearFiles = () => {
  if (props.files.length === 0) return;
  ElMessageBox.confirm("确定要清空所有待处理文件吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("update:files", []);
      customMessage.success("文件列表已清空");
    })
    .catch(() => {});
};
</script>

<template>
  <InfoCard title="待处理文件" class="full-height-card">
    <template #headerExtra>
      <el-button :icon="Delete" text circle @click="clearFiles" :disabled="files.length === 0" />
    </template>
    <div class="source-controls">
      <el-input v-model="sourcePathInput" placeholder="输入文件/文件夹路径" @keyup.enter="addSourcePathFromInput" />
      <el-tooltip content="选择文件" placement="top">
        <el-button @click="emit('select-files')" :icon="Document" circle />
      </el-tooltip>
      <el-tooltip content="选择文件夹" placement="top">
        <el-button @click="emit('select-folders')" :icon="FolderOpened" circle />
      </el-tooltip>
      <el-button @click="addSourcePathFromInput" type="primary">添加</el-button>
    </div>

    <!-- 拖放区域固定在外层，不跟随列表高度 -->
    <div class="file-list-container">
      <DropZone overlay :multiple="true" @drop="handleDrop" show-overlay-on-drag>
        <el-scrollbar class="file-list-scrollbar">
          <div v-if="files.length === 0" class="empty-state">
            <el-icon>
              <FolderAdd />
            </el-icon>
            <p>将要搬家的文件或文件夹拖拽至此</p>
          </div>
          <div v-else class="file-list">
            <FileListItem
              v-for="(file, index) in files"
              :key="file.path"
              :file="file"
              @remove="emit('remove-file', index)"
            />
          </div>
        </el-scrollbar>
      </DropZone>
    </div>
  </InfoCard>
</template>

<style scoped>
.full-height-card {
  flex: 1;
  min-height: 0;
}

:deep(.el-card__body) {
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
}

.source-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.file-list-container {
  flex: 1;
  min-height: 0;
  position: relative;
}

.file-list-scrollbar {
  height: 100%;
}

.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 200px;
  color: var(--text-color-light);
  text-align: center;
  padding: 20px;
}

.empty-state .el-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.file-list {
  padding: 8px;
}
</style>
