<script setup lang="ts">
import { computed } from "vue";
import { Copy, Ban, RotateCcw, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import type { AsyncTaskMetadata, TaskStatus } from "../core/async-task/types";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { customMessage } from "@/utils/customMessage";

interface Props {
  visible: boolean;
  task: AsyncTaskMetadata | null;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "cancel", taskId: string): void;
  (e: "retry", taskId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

// 格式化参数为 JSON
const formattedArgs = computed(() => {
  if (!props.task) return "";
  return JSON.stringify(props.task.args, null, 2);
});

// 格式化结果
const formattedResult = computed(() => {
  if (!props.task?.result) return "";
  try {
    const parsed = JSON.parse(props.task.result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return props.task.result;
  }
});

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

// 格式化时间
function formatTime(timestamp?: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("zh-CN");
}

// 格式化相对时间
function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "-";
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
function copyTaskId() {
  if (!props.task) return;
  navigator.clipboard.writeText(props.task.taskId);
  customMessage.success("任务ID已复制");
}

// 复制结果
function copyResult() {
  if (!props.task?.result) return;
  navigator.clipboard.writeText(props.task.result);
  customMessage.success("结果已复制");
}

// 操作按钮可见性
const canCancel = computed(() => {
  if (!props.task) return false;
  return props.task.status === "pending" || props.task.status === "running";
});

const canRetry = computed(() => {
  if (!props.task) return false;
  return props.task.status === "failed" || props.task.status === "interrupted";
});

// 处理操作
function handleCancel() {
  if (!props.task) return;
  emit("cancel", props.task.taskId);
}

function handleRetry() {
  if (!props.task) return;
  emit("retry", props.task.taskId);
  dialogVisible.value = false;
}
</script>

<template>
  <BaseDialog
    v-model="dialogVisible"
    title="任务详情"
    width="900px"
    height="80vh"
    :show-close-button="true"
    :close-on-backdrop-click="true"
  >
    <div v-if="task" class="task-detail">
      <!-- 基本信息 -->
      <div class="section">
        <div class="section-title">基本信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">任务ID:</span>
            <div class="value">
              <span class="task-id">{{ task.taskId }}</span>
              <el-button :icon="Copy" size="small" text @click="copyTaskId" />
            </div>
          </div>
          <div class="info-item">
            <span class="label">工具方法:</span>
            <span class="value">{{ task.toolName }}</span>
          </div>
          <div class="info-item">
            <span class="label">状态:</span>
            <el-tag :type="getStatusType(task.status)" size="large">
              {{ getStatusText(task.status) }}
            </el-tag>
          </div>
          <div v-if="task.status === 'running' && task.progress !== undefined" class="info-item full-width">
            <span class="label">进度:</span>
            <div class="value progress-value">
              <el-progress :percentage="task.progress" :stroke-width="8" />
              <span v-if="task.progressMessage" class="progress-message">
                {{ task.progressMessage }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 时间线 -->
      <div class="section">
        <div class="section-title">时间线</div>
        <div class="timeline">
          <div class="timeline-item">
            <component :is="Clock" :size="16" class="timeline-icon" />
            <div class="timeline-content">
              <div class="timeline-label">创建时间</div>
              <div class="timeline-value">{{ formatTime(task.createdAt) }}</div>
              <div class="timeline-relative">{{ formatRelativeTime(task.createdAt) }}</div>
            </div>
          </div>
          <div v-if="task.startedAt" class="timeline-item">
            <component :is="Clock" :size="16" class="timeline-icon" />
            <div class="timeline-content">
              <div class="timeline-label">开始时间</div>
              <div class="timeline-value">{{ formatTime(task.startedAt) }}</div>
              <div class="timeline-relative">{{ formatRelativeTime(task.startedAt) }}</div>
            </div>
          </div>
          <div v-if="task.completedAt" class="timeline-item">
            <component
              :is="task.status === 'completed' ? CheckCircle : task.status === 'failed' ? XCircle : AlertTriangle"
              :size="16"
              class="timeline-icon"
            />
            <div class="timeline-content">
              <div class="timeline-label">完成时间</div>
              <div class="timeline-value">{{ formatTime(task.completedAt) }}</div>
              <div class="timeline-relative">{{ formatRelativeTime(task.completedAt) }}</div>
            </div>
          </div>
          <div v-if="task.startedAt" class="timeline-item">
            <component :is="Clock" :size="16" class="timeline-icon" />
            <div class="timeline-content">
              <div class="timeline-label">总耗时</div>
              <div class="timeline-value">{{ calculateDuration(task) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 请求参数 -->
      <div class="section">
        <div class="section-title">请求参数</div>
        <div class="code-container">
          <RichCodeEditor :model-value="formattedArgs" language="json" :readonly="true" :height="200" />
        </div>
      </div>

      <!-- 执行结果 -->
      <div v-if="task.result" class="section">
        <div class="section-title">
          执行结果
          <el-button :icon="Copy" size="small" text @click="copyResult">复制</el-button>
        </div>
        <div class="code-container">
          <RichCodeEditor
            :model-value="formattedResult"
            :language="formattedResult.startsWith('{') || formattedResult.startsWith('[') ? 'json' : 'text'"
            :readonly="true"
            :height="300"
          />
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="task.error" class="section">
        <div class="section-title">错误信息</div>
        <el-alert type="error" :closable="false" show-icon>
          <pre class="error-text">{{ task.error }}</pre>
        </el-alert>
      </div>

      <!-- 进度日志 -->
      <div v-if="task.progressLogs && task.progressLogs.length > 0" class="section">
        <div class="section-title">进度日志</div>
        <div class="progress-logs">
          <div v-for="(log, index) in task.progressLogs" :key="index" class="log-item">
            <span class="log-time">{{ formatTime(log.timestamp) }}</span>
            <span class="log-percent">{{ log.percent }}%</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="canCancel" :icon="Ban" type="warning" @click="handleCancel"> 取消任务 </el-button>
        <el-button v-if="canRetry" :icon="RotateCcw" type="primary" @click="handleRetry"> 重试任务 </el-button>
        <el-button @click="dialogVisible = false">关闭</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-item .label {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  min-width: 80px;
}

.info-item .value {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-id {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  word-break: break-all;
}

.progress-value {
  flex-direction: column;
  align-items: stretch !important;
  gap: 8px !important;
}

.progress-message {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 8px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.timeline-icon {
  color: var(--el-color-primary);
  margin-top: 2px;
  flex-shrink: 0;
}

.timeline-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.timeline-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.timeline-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.timeline-relative {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.code-container {
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.error-text {
  margin: 0;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.progress-logs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 4px;
  border: var(--border-width) solid var(--border-color);
}

.log-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}

.log-time {
  color: var(--el-text-color-secondary);
  font-family: "Consolas", "Monaco", monospace;
  min-width: 180px;
}

.log-percent {
  color: var(--el-color-primary);
  font-weight: 600;
  min-width: 40px;
  text-align: right;
}

.log-message {
  color: var(--el-text-color-primary);
  flex: 1;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
