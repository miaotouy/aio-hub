<script setup lang="ts">
import { computed } from "vue";
import { useDownloadStore } from "@/stores/downloadStore";
import { useFileDownload } from "@/composables/useFileDownload";
import { formatBytes } from "@/utils/fileUtils";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { customMessage } from "@/utils/customMessage";
import { FolderOpen, Trash2, CheckCircle2, XCircle, Loader2, Inbox } from "lucide-vue-next";

const downloadStore = useDownloadStore();
const { openDownloadFolder } = useFileDownload();

const recentDownloads = computed(() => downloadStore.getRecent(10));
const hasHistory = computed(() => recentDownloads.value.length > 0);

/**
 * 打开文件所在目录
 */
const handleOpenFile = async (path: string) => {
  await openDownloadFolder(path);
};

/**
 * 删除单条记录
 */
const handleRemove = async (id: string) => {
  await downloadStore.removeDownload(id);
  customMessage.success("已移除下载记录");
};

/**
 * 格式化时间
 */
const formatTime = (timestamp: number) => {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: zhCN });
};
</script>

<template>
  <div class="download-manager-container">
    <el-scrollbar max-height="400px">
      <div v-if="!hasHistory" class="empty-state">
        <el-icon :size="48" class="empty-icon">
          <Inbox />
        </el-icon>
        <p>暂无下载记录</p>
      </div>

      <div v-else class="download-list">
        <div v-for="item in recentDownloads" :key="item.id" class="download-item">
          <div class="item-icon">
            <CheckCircle2 v-if="item.status === 'success'" class="status-success" :size="20" />
            <XCircle v-else-if="item.status === 'failed'" class="status-failed" :size="20" />
            <Loader2 v-else class="status-pending spinning" :size="20" />
          </div>

          <div class="item-content">
            <div class="item-name" :title="item.filename">
              {{ item.filename }}
            </div>
            <div class="item-meta">
              <span>{{ formatBytes(item.size) }}</span>
              <span class="dot">·</span>
              <span>{{ formatTime(item.timestamp) }}</span>
            </div>
            <div v-if="item.status === 'failed' && item.error" class="item-error">
              {{ item.error }}
            </div>
          </div>

          <div class="item-actions">
            <el-tooltip content="打开文件夹" placement="top" :show-after="500">
              <el-button
                circle
                size="small"
                @click="handleOpenFile(item.filepath)"
                :disabled="item.status !== 'success'"
              >
                <el-icon><FolderOpen /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="移除记录" placement="top" :show-after="500">
              <el-button circle size="small" type="danger" plain @click="handleRemove(item.id)">
                <el-icon><Trash2 /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.download-manager-container {
  display: flex;
  flex-direction: column;
  color: var(--el-text-color-primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--el-text-color-secondary);
}

.empty-icon {
  margin-bottom: 12px;
  opacity: 0.5;
}

.download-list {
  display: flex;
  flex-direction: column;
  padding: 4px;
}

.download-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  transition: all 0.2s ease;
  margin-bottom: 4px;
  background-color: transparent;
}

.download-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.item-icon {
  margin-right: 12px;
  display: flex;
  align-items: center;
}

.status-success {
  color: var(--el-color-success);
}

.status-failed {
  color: var(--el-color-danger);
}

.status-pending {
  color: var(--el-color-primary);
}

.spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.item-content {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.item-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}

.dot {
  margin: 0 6px;
}

.item-error {
  font-size: 11px;
  color: var(--el-color-danger);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.download-item:hover .item-actions {
  opacity: 1;
}

:deep(.download-manager-popper) {
  padding: 0 !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  background-color: var(--card-bg) !important;
  backdrop-filter: blur(var(--ui-blur)) !important;
  border: var(--border-width) solid var(--border-color) !important;
  box-shadow: var(--el-box-shadow-light) !important;
}
</style>
