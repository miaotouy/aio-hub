<script setup lang="ts">
import { useMediaGenStore } from "../stores/mediaGenStore";
import { createModuleLogger } from "@/utils/logger";
import { Trash2, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-vue-next";
import { format } from "date-fns";

const store = useMediaGenStore();
const logger = createModuleLogger("media-generator/task-list");

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "error":
      return XCircle;
    case "processing":
      return Loader2;
    case "pending":
      return Clock;
    default:
      return Clock;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case "completed":
      return "success";
    case "error":
      return "danger";
    case "processing":
      return "primary";
    case "pending":
      return "info";
    default:
      return "info";
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case "image":
      return "图片";
    case "video":
      return "视频";
    case "audio":
      return "音乐";
    default:
      return type.toUpperCase();
  }
};

const getTypeTagType = (type: string) => {
  switch (type) {
    case "image":
      return "";
    case "video":
      return "warning";
    case "audio":
      return "success";
    default:
      return "info";
  }
};

const handleRemoveTask = (taskId: string) => {
  store.removeTask(taskId);
  logger.info("任务已从列表移除", { taskId });
};
</script>

<template>
  <div class="media-task-list">
    <div v-if="store.tasks.length === 0" class="empty-state">
      <el-empty description="暂无生成任务" />
    </div>

    <div v-else class="task-items">
      <div v-for="task in store.tasks" :key="task.id" class="task-item">
        <div class="task-info">
          <div class="task-header">
            <el-tag
              size="small"
              effect="plain"
              :type="getTypeTagType(task.type)"
              class="task-type-tag"
            >
              {{ getTypeLabel(task.type) }}
            </el-tag>
            <span class="task-time">{{ format(task.createdAt, "yyyy-MM-dd HH:mm:ss") }}</span>
          </div>
          <div class="task-prompt text-ellipsis">{{ task.input.prompt }}</div>
        </div>

        <div class="task-status">
          <el-tag :type="getStatusType(task.status)" size="small" class="status-tag">
            <component
              :is="getStatusIcon(task.status)"
              :size="14"
              :class="{ rotate: task.status === 'processing' }"
            />
            <span class="status-text">{{ task.statusText || task.status }}</span>
          </el-tag>

          <div class="task-actions">
            <el-button link type="danger" @click="handleRemoveTask(task.id)">
              <el-icon><Trash2 /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-task-list {
  box-sizing: border-box;
  height: 100%;
  padding: 16px;
  overflow-y: auto;
}

.media-task-list * {
  box-sizing: border-box;
}

.empty-state {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.task-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-item {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s ease;
}

.task-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: var(--el-box-shadow-light);
}

.task-info {
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.task-type-tag {
  font-size: 10px;
  height: 18px;
  padding: 0 4px;
}

.task-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.task-prompt {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.task-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 90px;
}

.status-text {
  text-transform: capitalize;
}

.task-actions {
  display: flex;
  gap: 4px;
}

.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rotate {
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
</style>
