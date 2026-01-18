<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
import { useTranscriptionViewer } from "@/composables/useTranscriptionViewer";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { format } from "date-fns";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  XCircle,
  Play,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  ListFilter,
  Timer,
} from "lucide-vue-next";

const store = useTranscriptionStore();

// 用于动态刷新正在处理任务的时间显示
const now = ref(Date.now());
let timer: any = null;

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// 任务列表排序：正在处理优先，其次是按创建时间倒序
const tasks = computed(() => {
  return [...store.tasks].sort((a, b) => {
    if (a.status === "processing" && b.status !== "processing") return -1;
    if (a.status !== "processing" && b.status === "processing") return 1;
    return b.createdAt - a.createdAt;
  });
});

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "processing":
      return Loader2;
    case "error":
      return AlertCircle;
    case "cancelled":
      return XCircle;
    default:
      return Play;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "primary";
    case "error":
      return "danger";
    case "cancelled":
      return "info";
    default:
      return "info";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "已完成";
    case "processing":
      return "处理中";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    case "pending":
      return "队列中";
    default:
      return status;
  }
};

const { retryTask, cancelTask, getTranscriptionText, addTask } = useTranscriptionManager();
const transcriptionViewer = useTranscriptionViewer();

const handleRetry = async (task: any) => {
  const asset = await assetManagerEngine.getAssetById(task.assetId);
  if (asset) {
    retryTask(asset);
  }
};

const handleCancel = (assetId: string) => {
  cancelTask(assetId);
};

const handleViewResult = async (task: any) => {
  const asset = await assetManagerEngine.getAssetById(task.assetId);
  if (asset) {
    const text = await getTranscriptionText(asset);
    transcriptionViewer.show({
      asset,
      initialContent: text || "",
      onSave: (content) => {
        // 更新本地 store 中的 task 缓存
        const t = store.tasks.find((it) => it.assetId === asset.id);
        if (t) {
          t.resultText = content;
        }
        transcriptionViewer.close();
      },
      onRegenerate: ({ modelId, prompt }) => {
        addTask(asset, {
          modelIdentifier: modelId ? `custom:${modelId}` : undefined,
          customPrompt: prompt || undefined,
        });
        transcriptionViewer.close();
      },
    });
  }
};

const clearFinishedTasks = () => {
  const finished = store.tasks.filter(
    (t) => t.status === "completed" || t.status === "cancelled" || t.status === "error"
  );
  finished.forEach((t) => store.removeTask(t.id));
};

const stats = computed(() => {
  return {
    total: store.tasks.length,
    processing: store.processingCount,
    pending: store.tasks.filter((t) => t.status === "pending").length,
    completed: store.tasks.filter((t) => t.status === "completed").length,
    error: store.tasks.filter((t) => t.status === "error").length,
  };
});

/**
 * 格式化耗时
 */
const formatDuration = (ms: number) => {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const getTaskDuration = (task: any) => {
  if (!task.startedAt) return null;
  const end = task.completedAt || now.value;
  return end - task.startedAt;
};
</script>

<template>
  <div class="transcription-queue">
    <!-- 统计概览 -->
    <div class="queue-stats">
      <div class="stat-card">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">总任务</div>
      </div>
      <div class="stat-card processing">
        <div class="stat-value">{{ stats.processing }}</div>
        <div class="stat-label">正在处理</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-value">{{ stats.pending }}</div>
        <div class="stat-label">等待中</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-value">{{ stats.completed }}</div>
        <div class="stat-label">已完成</div>
      </div>
      <div class="stat-card error">
        <div class="stat-value">{{ stats.error }}</div>
        <div class="stat-label">失败</div>
      </div>
    </div>

    <!-- 列表控制栏 -->
    <div class="queue-header">
      <div class="header-left">
        <el-icon><ListFilter /></el-icon>
        <span class="title">任务监控列表</span>
      </div>
      <div class="header-right">
        <el-button :icon="Trash2" link @click="clearFinishedTasks"> 清空已结束任务 </el-button>
      </div>
    </div>

    <!-- 任务表格 -->
    <div class="queue-content">
      <el-table :data="tasks" style="width: 100%" height="100%" class="custom-table">
        <el-table-column label="文件名称" min-width="200">
          <template #default="{ row }">
            <div class="file-cell">
              <el-icon class="file-icon"><FileText /></el-icon>
              <div class="file-info">
                <span class="filename" :title="row.filename">{{ row.filename }}</span>
                <span class="asset-id">{{ row.assetId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small" class="status-tag">
              <el-icon :class="{ 'is-loading': row.status === 'processing' }">
                <component :is="getStatusIcon(row.status)" />
              </el-icon>
              <span>{{ getStatusLabel(row.status) }}</span>
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="耗时" width="100">
          <template #default="{ row }">
            <div v-if="getTaskDuration(row) !== null" class="duration-cell">
              <el-icon><Timer /></el-icon>
              <span>{{ formatDuration(getTaskDuration(row)!) }}</span>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <div class="time-cell">
              <el-icon><Clock /></el-icon>
              <span>{{ format(row.createdAt, "yyyy-MM-dd HH:mm:ss") }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <div class="action-cell">
              <el-tooltip v-if="row.status === 'error'" content="重试任务" placement="top">
                <el-button :icon="RotateCcw" circle size="small" @click="handleRetry(row)" />
              </el-tooltip>
              <el-tooltip
                v-if="row.status === 'processing' || row.status === 'pending'"
                content="取消任务"
                placement="top"
              >
                <el-button
                  :icon="XCircle"
                  circle
                  size="small"
                  type="danger"
                  plain
                  @click="handleCancel(row.assetId)"
                />
              </el-tooltip>
              <el-tooltip v-if="row.status === 'completed'" content="查看结果" placement="top">
                <el-button
                  :icon="FileText"
                  circle
                  size="small"
                  type="success"
                  plain
                  @click="handleViewResult(row)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.transcription-queue {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background-color: transparent;
  box-sizing: border-box;
  overflow: hidden;
}

.queue-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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
.stat-card.pending .stat-value {
  color: var(--el-color-info);
}
.stat-card.completed .stat-value {
  color: var(--el-color-success);
}
.stat-card.error .stat-value {
  color: var(--el-color-danger);
}

.queue-header {
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

.queue-content {
  flex: 1;
  min-height: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
  /* 使用相对定位，让内部表格可以绝对定位填充，彻底解决 flex 高度计算偏差 */
  position: relative;
}

.file-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary);
}

.file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.filename {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-id {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-family: monospace;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 24px;
}

.time-cell,
.duration-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.duration-cell {
  color: var(--el-color-primary);
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
  box-sizing: border-box;
  /* 移除 Element Plus 表格默认的外边框，防止在 100% 高度时溢出 */
  border: none !important;
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}

:deep(.el-table__row:hover) {
  background-color: var(--el-fill-color-light) !important;
}
</style>
