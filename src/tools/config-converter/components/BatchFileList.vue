<template>
  <div class="batch-file-list">
    <div class="list-header">
      <div class="header-left">
        <span class="header-title">待转换文件列表 ({{ items.length }})</span>
        <span class="header-hint">· 拖放文件到此区域可继续添加</span>
      </div>
      <div class="header-actions">
        <el-button type="primary" plain size="small" :icon="Plus" @click="emit('selectFiles')">
          添加文件
        </el-button>
        <el-button plain size="small" :icon="FolderOpen" @click="emit('selectDirectory')">
          添加目录
        </el-button>
        <el-button v-if="items.length > 0" type="danger" plain size="small" :icon="Trash2" @click="emit('clear')">
          清空
        </el-button>
      </div>
    </div>

    <el-table :data="items" style="width: 100%; flex: 1" height="100%" class="file-table">
      <el-table-column prop="name" label="文件名" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="file-name-cell">
            <FileIcon :filename="row.name" :size="16" class="file-icon" />
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="sourceFormat" label="源格式" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="info" effect="plain">
            {{ row.sourceFormat.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="targetFormat" label="目标格式" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="success" effect="plain">
            {{ row.targetFormat.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="size" label="大小" width="100">
        <template #default="{ row }">
          {{ formatSize(row.size) }}
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <div class="status-cell">
            <template v-if="row.status === 'pending'">
              <el-tag size="small" type="info">等待中</el-tag>
            </template>
            <template v-else-if="row.status === 'converting'">
              <el-tag size="small" type="primary" class="is-loading">
                <el-icon class="is-loading-icon"><Loading /></el-icon>
                转换中
              </el-tag>
            </template>
            <template v-else-if="row.status === 'success'">
              <el-tag size="small" type="success">成功</el-tag>
            </template>
            <template v-else-if="row.status === 'error'">
              <el-tooltip :content="row.error" placement="top">
                <el-tag size="small" type="danger" class="clickable-tag">
                  失败 <el-icon><Warning /></el-icon>
                </el-tag>
              </el-tooltip>
            </template>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="120" align="center">
        <template #default="{ row }">
          <div class="actions-cell">
            <el-button
              v-if="row.status === 'success' && row.convertedContent"
              type="primary"
              link
              size="small"
              :icon="Eye"
              @click="previewItem(row)"
            >
              预览
            </el-button>
            <el-button type="danger" link size="small" :icon="X" @click="emit('remove', row.id)"> 移除 </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 预览弹窗 -->
    <BaseDialog v-model="previewVisible" :title="`预览转换结果 - ${previewingItem?.name}`" width="80%" height="80vh">
      <div class="preview-dialog-content">
        <div class="preview-toolbar">
          <el-tag type="success" effect="dark">
            {{ previewingItem?.targetFormat.toUpperCase() }}
          </el-tag>
          <el-button type="primary" size="small" @click="copyPreviewContent"> 复制内容 </el-button>
        </div>
        <div class="editor-wrapper">
          <RichCodeEditor
            v-model="previewContent"
            :language="previewingItem?.targetFormat"
            read-only
            editor-type="codemirror"
          />
        </div>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Trash2, Eye, X, Plus, FolderOpen } from "lucide-vue-next";
import { Loading, Warning } from "@element-plus/icons-vue";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from "@/utils/customMessage";
import FileIcon from "@/components/common/FileIcon.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import type { BatchFileItem } from "../types";

defineProps<{
  items: BatchFileItem[];
}>();

const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "clear"): void;
  (e: "selectFiles"): void;
  (e: "selectDirectory"): void;
}>();

// 预览弹窗状态
const previewVisible = ref(false);
const previewingItem = ref<BatchFileItem | null>(null);
const previewContent = ref("");

/**
 * 格式化文件大小
 */
const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * 预览转换结果
 */
const previewItem = (item: BatchFileItem) => {
  previewingItem.value = item;
  previewContent.value = item.convertedContent || "";
  previewVisible.value = true;
};

/**
 * 复制预览内容
 */
const copyPreviewContent = async () => {
  if (!previewContent.value) return;
  try {
    await writeText(previewContent.value);
    customMessage.success("内容已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
  }
};
</script>

<style scoped>
.batch-file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.02));
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.header-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.file-table {
  background: transparent !important;
  backdrop-filter: none !important;
}

:deep(.el-table) {
  --el-table-background-color: transparent;
  --el-table-tr-bg-color: transparent;
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  flex-shrink: 0;
}

.status-cell {
  display: flex;
  align-items: center;
}

.is-loading-icon {
  margin-right: 4px;
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.clickable-tag {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.actions-cell {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.preview-dialog-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.editor-wrapper {
  flex: 1;
  overflow: hidden;
}
</style>
