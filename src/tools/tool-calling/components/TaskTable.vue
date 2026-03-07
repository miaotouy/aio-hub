<script setup lang="ts">
import { computed } from "vue";
import { Terminal, Loader, CheckCircle, XCircle, Ban, AlertTriangle, Copy, RotateCcw, Trash2 } from "lucide-vue-next";
import type { AsyncTaskMetadata, TaskStatus } from "../core/async-task/types";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { customMessage } from "@/utils/customMessage";

interface Props {
  tasks: AsyncTaskMetadata[];
  loading?: boolean;
}

interface Emits {
  (e: "cancel", taskId: string): void;
  (e: "retry", taskId: string): void;
  (e: "delete", taskId: string): void;
  (e: "view-detail", task: AsyncTaskMetadata): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const emptyText = computed(() => {
  return props.loading ? "加载中..." : "暂无任务";
});

// 获取短ID（前8位）
function getShortId(taskId: string): string {
  return taskId.slice(0, 8);
}

// 获取状态类型
function getStatusType(status: TaskStatus): "info" | "primary" | "success" | "danger" | "warning" {
  const typeMap: Record<TaskStatus, "info" | "primary" | "success" | "danger" | "warning"> = {
    pending: "info",
    running: "primary",
    completed: "success",
    failed: "danger",
    cancelled: "warning",
    interrupted: "warning",
  };
  return typeMap[status];
}

// 获取状态文本
function getStatusText(status: TaskStatus): string {
  const textMap: Record<TaskStatus, string> = {
    pending: "等待中",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
  };
  return textMap[status];
}

// 格式化相对时间
function formatRelativeTime(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: zhCN });
}

// 计算耗时
function calculateDuration(task: AsyncTaskMetadata): string {
  if (!task.startedAt) return "-";
  const endTime = task.completedAt || Date.now();
  const durationMs = endTime - task.startedAt;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}分${remainingSeconds}秒`;
}

// 复制任务ID
function copyTaskId(taskId: string) {
  navigator.clipboard.writeText(taskId);
  customMessage.success("任务ID已复制");
}

// 处理行点击
function handleRowClick(task: AsyncTaskMetadata) {
  emit("view-detail", task);
}

// 操作按钮可见性
function canCancel(status: TaskStatus): boolean {
  return status === "pending" || status === "running";
}

function canRetry(status: TaskStatus): boolean {
  return status === "failed" || status === "interrupted";
}
</script>

<template>
  <div class="task-table">
    <el-table
      :data="tasks"
      stripe
      style="width: 100%"
      :empty-text="emptyText"
      @row-click="handleRowClick"
      class="clickable-table"
      v-loading="loading"
    >
      <!-- 任务ID -->
      <el-table-column prop="taskId" label="任务ID" width="120">
        <template #default="{ row }">
          <el-tooltip :content="row.taskId" placement="top">
            <div class="task-id-cell">
              <span class="task-id">{{ getShortId(row.taskId) }}</span>
              <el-button :icon="Copy" size="small" text @click.stop="copyTaskId(row.taskId)" class="copy-btn" />
            </div>
          </el-tooltip>
        </template>
      </el-table-column>

      <!-- 工具方法 -->
      <el-table-column prop="toolName" label="工具方法" min-width="200">
        <template #default="{ row }">
          <div class="tool-method">
            <component :is="Terminal" :size="16" class="method-icon" />
            <span>{{ row.toolName }}</span>
          </div>
        </template>
      </el-table-column>

      <!-- 状态 -->
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" :effect="row.status === 'running' ? 'dark' : 'plain'">
            <div class="status-content">
              <component v-if="row.status === 'running'" :is="Loader" :size="14" class="status-icon spinning" />
              <component v-else-if="row.status === 'completed'" :is="CheckCircle" :size="14" class="status-icon" />
              <component v-else-if="row.status === 'failed'" :is="XCircle" :size="14" class="status-icon" />
              <component v-else-if="row.status === 'cancelled'" :is="Ban" :size="14" class="status-icon" />
              <component v-else-if="row.status === 'interrupted'" :is="AlertTriangle" :size="14" class="status-icon" />
              <span>{{ getStatusText(row.status) }}</span>
            </div>
          </el-tag>
        </template>
      </el-table-column>

      <!-- 进度 -->
      <el-table-column prop="progress" label="进度" width="150">
        <template #default="{ row }">
          <div v-if="row.status === 'running'" class="progress-cell">
            <el-progress :percentage="row.progress || 0" :show-text="true" :stroke-width="6" />
            <div v-if="row.progressMessage" class="progress-message">
              {{ row.progressMessage }}
            </div>
          </div>
          <span v-else>-</span>
        </template>
      </el-table-column>

      <!-- 创建时间 -->
      <el-table-column prop="createdAt" label="创建时间" width="120">
        <template #default="{ row }">
          <el-tooltip :content="new Date(row.createdAt).toLocaleString('zh-CN')" placement="top">
            <span>{{ formatRelativeTime(row.createdAt) }}</span>
          </el-tooltip>
        </template>
      </el-table-column>

      <!-- 耗时 -->
      <el-table-column prop="duration" label="耗时" width="100">
        <template #default="{ row }">
          {{ calculateDuration(row) }}
        </template>
      </el-table-column>

      <!-- 操作 -->
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons" @click.stop>
            <el-button
              v-if="canCancel(row.status)"
              :icon="Ban"
              size="small"
              type="warning"
              @click="emit('cancel', row.taskId)"
            >
              取消
            </el-button>
            <el-button
              v-if="canRetry(row.status)"
              :icon="RotateCcw"
              size="small"
              type="primary"
              @click="emit('retry', row.taskId)"
            >
              重试
            </el-button>
            <el-button :icon="Trash2" size="small" type="danger" @click="emit('delete', row.taskId)"> 删除 </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.task-table {
  height: 100%;
  overflow: auto;
}

.clickable-table :deep(.el-table__row) {
  cursor: pointer;
  transition: background-color 0.2s;
}

.clickable-table :deep(.el-table__row:hover) {
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.task-id-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.task-id {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
}

.copy-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 2px;
  min-height: unset;
}

.task-id-cell:hover .copy-btn {
  opacity: 1;
}

.tool-method {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-icon {
  flex-shrink: 0;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-message {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
