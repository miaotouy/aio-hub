<template>
  <div class="monitor-container">
    <!-- 统计概览 -->
    <div class="monitor-stats">
      <div class="stat-card">
        <div class="stat-value">{{ store.tasks.length }}</div>
        <div class="stat-label">总任务</div>
      </div>
      <div class="stat-card processing">
        <div class="stat-value">{{ store.activeTasks.length }}</div>
        <div class="stat-label">正在处理</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-value">{{ stats.completed }}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">{{ stats.failed }}</div>
        <div class="stat-label">失败</div>
      </div>
    </div>

    <!-- 列表控制栏 -->
    <div class="monitor-header">
      <div class="header-left">
        <el-icon><ListFilter /></el-icon>
        <span class="title">任务监控列表</span>
      </div>
      <div class="header-right">
        <el-button :icon="Trash2" link @click="store.clearCompletedTasks">
          清理已完成任务
        </el-button>
      </div>
    </div>

    <!-- 任务表格 -->
    <div class="monitor-content">
      <el-table
        :data="sortedTasks"
        style="width: 100%"
        height="100%"
        class="custom-table"
        row-key="id"
      >
        <el-table-column label="任务名称" min-width="200">
          <template #default="{ row }">
            <div class="task-cell">
              <el-icon class="task-icon"><Video /></el-icon>
              <div class="task-info">
                <span class="task-name" :title="row.name">{{ row.name }}</span>
                <span class="task-id">{{ row.id }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <div class="status-cell">
              <div class="status-wrapper">
                <el-tag :type="statusType(row.status)" size="small" class="status-tag">
                  <el-icon :class="{ 'is-loading': row.status === 'processing' }">
                    <component :is="statusIcon(row.status)" />
                  </el-icon>
                  <span>{{ statusText(row.status) }}</span>
                  <span
                    v-if="row.status === 'processing' && row.progress.percent > 0"
                    class="percent-text"
                  >
                    {{ row.progress.percent.toFixed(1) }}%
                  </span>
                </el-tag>
              </div>
              <div v-if="row.status === 'processing'" class="mini-progress">
                <el-progress
                  :percentage="row.progress.percent"
                  :show-text="false"
                  :stroke-width="3"
                />
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="处理详情" min-width="180">
          <template #default="{ row }">
            <div
              v-if="row.status === 'processing' || row.status === 'completed'"
              class="progress-details"
            >
              <div class="detail-item">
                <el-icon><Zap /></el-icon>
                <span>{{ row.progress.speed }}</span>
              </div>
              <div class="detail-item">
                <el-icon><Activity /></el-icon>
                <span>{{ row.progress.bitrate }}</span>
              </div>
              <div class="detail-item">
                <el-icon><Timer /></el-icon>
                <span>{{ formatTime(row.progress.currentTime) }}</span>
              </div>
            </div>
            <div v-else-if="row.error" class="error-text" :title="row.error">
              {{ row.error }}
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-cell">
              <el-tooltip v-if="row.status === 'processing'" content="停止任务" placement="top">
                <el-button
                  :icon="StopCircle"
                  circle
                  size="small"
                  type="danger"
                  plain
                  @click="killProcess(row.id)"
                />
              </el-tooltip>

              <template v-if="row.status === 'completed'">
                <el-tooltip content="媒体详情" placement="top">
                  <el-button
                    :icon="Info"
                    circle
                    size="small"
                    type="info"
                    plain
                    @click="showMediaInfo(row.outputPath, row.name)"
                  />
                </el-tooltip>

                <el-tooltip content="定位文件" placement="top">
                  <el-button
                    :icon="FolderOpen"
                    circle
                    size="small"
                    @click="openFolder(row.outputPath)"
                  />
                </el-tooltip>

                <el-dropdown
                  trigger="click"
                  @command="(cmd: string) => handleIntegration(cmd, row)"
                >
                  <el-button :icon="Send" circle size="small" type="primary" plain />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="chat">LLM Chat</el-dropdown-item>
                      <el-dropdown-item command="transcription">转写工具</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>

              <el-tooltip content="删除记录" placement="top">
                <el-button :icon="Trash" circle size="small" @click="store.removeTask(row.id)" />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 媒体详情弹窗 -->
    <MediaInfoDialog ref="mediaInfoDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useFFmpegStore } from "../ffmpegStore";
import { useFFmpegCore } from "../composables/useFFmpegCore";
import { useFFmpegIntegration } from "../composables/useFFmpegIntegration";
import { invoke } from "@tauri-apps/api/core";
import {
  Trash,
  FolderOpen,
  Send,
  StopCircle,
  Video,
  ListFilter,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  XCircle,
  Play,
  Zap,
  Activity,
  Timer,
  Info,
} from "lucide-vue-next";
import MediaInfoDialog from "./MediaInfoDialog.vue";

const store = useFFmpegStore();
const { killProcess } = useFFmpegCore();
const { sendToChat, sendToTranscription } = useFFmpegIntegration();

const mediaInfoDialogRef = ref();

// 任务排序：处理中优先，其次按创建时间倒序
const sortedTasks = computed(() => {
  return [...store.tasks].sort((a, b) => {
    // 1. 处理中的任务排在最前面
    if (a.status === "processing" && b.status !== "processing") return -1;
    if (a.status !== "processing" && b.status === "processing") return 1;

    // 2. 其次按创建时间倒序（最新的在上面）
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
});

const stats = computed(() => ({
  completed: store.tasks.filter((t) => t.status === "completed").length,
  failed: store.tasks.filter((t) => t.status === "failed").length,
}));

const statusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "primary";
    case "failed":
      return "danger";
    case "cancelled":
      return "info";
    default:
      return "info";
  }
};

const statusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "processing":
      return Loader2;
    case "failed":
      return AlertCircle;
    case "cancelled":
      return XCircle;
    default:
      return Play;
  }
};

const statusText = (status: string) => {
  switch (status) {
    case "pending":
      return "等待中";
    case "processing":
      return "处理中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
};

const formatTime = (seconds: number) => {
  if (!seconds) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const openFolder = async (path: string) => {
  await invoke("open_file_directory", { path });
};

const showMediaInfo = (path: string, name: string) => {
  mediaInfoDialogRef.value?.show(path, name);
};

const handleIntegration = async (command: string, task: any) => {
  if (command === "chat") {
    await sendToChat(task.outputPath);
  } else if (command === "transcription") {
    await sendToTranscription(task.outputPath);
  }
};
</script>

<style scoped>
.monitor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 统计卡片 */
.monitor-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.stat-card.processing .stat-value {
  color: var(--el-color-primary);
}
.stat-card.completed .stat-value {
  color: var(--el-color-success);
}
.stat-card.failed .stat-value {
  color: var(--el-color-danger);
}

/* 头部 */
.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

/* 表格内容 */
.monitor-content {
  flex: 1;
  min-height: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.task-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.task-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary);
}

.task-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.task-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-id {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.percent-text {
  font-size: 11px;
  font-family: monospace;
  color: var(--el-color-primary);
  font-weight: bold;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 24px;
}

.mini-progress {
  width: 80px;
}

.progress-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.detail-item .el-icon {
  font-size: 12px;
  color: var(--el-color-primary);
}

.error-text {
  font-size: 12px;
  color: var(--el-color-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-cell {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.is-loading {
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

:deep(.custom-table) {
  position: absolute !important;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  --el-table-background-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--sidebar-bg);
  border: none !important;
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}

:deep(.el-table__row:hover) {
  background-color: var(--el-fill-color-light) !important;
}
</style>
