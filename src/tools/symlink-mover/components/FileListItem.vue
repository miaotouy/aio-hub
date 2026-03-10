<script setup lang="ts">
import { Delete, Document, InfoFilled } from "@element-plus/icons-vue";
import type { FileItem } from "../types";

interface Props {
  file: FileItem;
}

defineProps<Props>();

const emit = defineEmits<{
  remove: [];
}>();
</script>

<template>
  <div class="file-item" :class="{ 'has-warning': file.warning }">
    <el-icon class="file-icon" :class="{ 'warning-icon': file.warning }">
      <Document />
    </el-icon>
    <div class="file-details">
      <div class="file-name" :title="file.name">{{ file.name }}</div>
      <div class="file-path" :title="file.path">{{ file.path }}</div>
      <div v-if="file.warning" class="file-warning">
        <el-icon>
          <InfoFilled />
        </el-icon>
        {{ file.warning }}
      </div>
    </div>
    <el-button @click="emit('remove')" :icon="Delete" text circle size="small" class="remove-btn" />
  </div>
</template>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.file-item:hover {
  background-color: var(--container-bg);
}

.file-item:hover .remove-btn {
  opacity: 1;
}

.file-icon {
  margin-right: 10px;
  color: var(--text-color-light);
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name,
.file-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-name {
  font-size: 14px;
  color: var(--text-color);
}

.file-path {
  font-size: 12px;
  color: var(--text-color-light);
}

.remove-btn {
  margin-left: 10px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.file-item.has-warning {
  border-left: 3px solid var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.1));
}

.file-warning {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-color-warning);
  font-weight: 500;
}

.file-warning .el-icon {
  font-size: 12px;
}

.file-icon.warning-icon {
  color: var(--el-color-warning);
}
</style>
