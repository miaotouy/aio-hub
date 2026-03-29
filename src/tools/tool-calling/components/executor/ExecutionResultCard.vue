<script setup lang="ts">
import { reactive, computed, onMounted, ref } from "vue";
import { CheckCircle2, XCircle, Clock, Eye, Code, FileJson, Loader2, Ban, RotateCw } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { extractTaskId } from "../../core/utils/task-id-extractor";
import { useAsyncTaskStore } from "../../stores/asyncTaskStore";

const props = defineProps<{
  res: {
    requestId: string;
    status: "success" | "error";
    durationMs: number;
    result: any;
  };
}>();

// 结果查看模式管理
const viewMode = reactive({
  current: "markdown" as "markdown" | "json" | "raw",
});

// 异步任务监控
const asyncTaskStore = useAsyncTaskStore();
const taskId = ref<string | null>(null);

// 实时从 Store 获取任务状态
const task = computed(() => {
  if (!taskId.value) return null;
  return asyncTaskStore.getTask(taskId.value) || null;
});

// 检测是否包含异步任务 ID
onMounted(async () => {
  const resultStr = typeof props.res.result === "string" ? props.res.result : JSON.stringify(props.res.result);
  const extractedTaskId = extractTaskId(resultStr);

  if (extractedTaskId) {
    taskId.value = extractedTaskId;
    // 确保 Store 已初始化以接收实时更新
    if (!asyncTaskStore.isInitialized) {
      await asyncTaskStore.initialize();
    }
  }
});

// 取消任务
async function handleCancelTask() {
  if (!taskId.value) return;
  await asyncTaskStore.cancelTask(taskId.value);
}

// 重试任务
async function handleRetryTask() {
  if (!taskId.value) return;
  try {
    const newTaskId = await asyncTaskStore.retryTask(taskId.value);
    taskId.value = newTaskId;
  } catch (error) {
    console.error("重试任务失败:", error);
  }
}

// 计算属性
const taskStatusIcon = computed(() => {
  if (!task.value) return Clock;
  switch (task.value.status) {
    case "pending":
      return Clock;
    case "running":
      return Loader2;
    case "completed":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "cancelled":
      return Ban;
    case "interrupted":
      return XCircle;
    default:
      return Clock;
  }
});

const taskStatusColor = computed(() => {
  if (!task.value) return "var(--el-color-info)";
  switch (task.value.status) {
    case "pending":
      return "var(--el-color-info)";
    case "running":
      return "var(--el-color-primary)";
    case "completed":
      return "var(--el-color-success)";
    case "failed":
      return "var(--el-color-danger)";
    case "cancelled":
      return "var(--el-color-warning)";
    case "interrupted":
      return "var(--el-color-warning)";
    default:
      return "var(--el-color-info)";
  }
});

const taskStatusText = computed(() => {
  if (!task.value) return "加载中";
  const statusMap = {
    pending: "等待执行",
    running: "执行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
  };
  return statusMap[task.value.status] || task.value.status;
});

const elapsedTime = computed(() => {
  if (!task.value) return "0.0";
  if (task.value.completedAt && task.value.startedAt) {
    return ((task.value.completedAt - task.value.startedAt) / 1000).toFixed(2);
  }
  if (task.value.startedAt) {
    return ((Date.now() - task.value.startedAt) / 1000).toFixed(1);
  }
  return "0.0";
});

const showCancelButton = computed(() => {
  return task.value && ["pending", "running"].includes(task.value.status) && task.value.cancellable;
});

const showRetryButton = computed(() => {
  return task.value && ["failed", "interrupted"].includes(task.value.status);
});

/**
 * 格式化显示结果
 */
const formatDisplayResult = (result: any, mode: "markdown" | "json" | "raw") => {
  if (result === undefined || result === null) return "";

  if (mode === "json") {
    if (typeof result === "string") {
      try {
        // 尝试解析并重新美化，如果是 JSON 字符串的话
        return JSON.stringify(JSON.parse(result), null, 2);
      } catch (e) {
        return result;
      }
    }
    return JSON.stringify(result, null, 2);
  }

  if (typeof result !== "string") {
    return JSON.stringify(result, null, 2);
  }

  return result;
};
</script>

<template>
  <div class="res-card">
    <div class="res-head">
      <div class="res-status" :class="res.status">
        <component :is="res.status === 'success' ? CheckCircle2 : XCircle" :size="14" />
        <span>{{ res.status.toUpperCase() }}</span>
      </div>
      <div class="res-id">{{ res.requestId }}</div>
      <div class="res-meta">
        <span class="meta-item"><Clock :size="12" /> {{ res.durationMs }}ms</span>
        <span class="meta-item debug-tag" :title="res.result">Len: {{ res.result?.length || 0 }}</span>
      </div>
      <div class="res-view-switch">
        <el-radio-group v-model="viewMode.current" size="small">
          <el-radio-button value="markdown">
            <el-tooltip content="Markdown 预览"><Eye :size="12" /></el-tooltip>
          </el-radio-button>
          <el-radio-button value="json">
            <el-tooltip content="JSON 源码"><FileJson :size="12" /></el-tooltip>
          </el-radio-button>
          <el-radio-button value="raw">
            <el-tooltip content="原始文本"><Code :size="12" /></el-tooltip>
          </el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <div class="res-body">
      <template v-if="viewMode.current === 'markdown'">
        <div class="markdown-viewer scrollbar-styled">
          <RichTextRenderer
            :content="typeof res.result === 'string' ? res.result : JSON.stringify(res.result, null, 2)"
            :version="RendererVersion.V2_CUSTOM_PARSER"
          />
        </div>
      </template>
      <template v-else-if="viewMode.current === 'json'">
        <RichCodeEditor :value="formatDisplayResult(res.result, 'json')" language="json" height="300px" readonly />
      </template>
      <div v-else class="raw-preview scrollbar-styled">
        <div class="raw-content">{{ formatDisplayResult(res.result, "raw") }}</div>
        <div v-if="!res.result" class="raw-empty">结果为空字符串</div>
      </div>

      <!-- 异步任务状态面板 -->
      <div v-if="taskId && task" class="async-task-panel">
        <div class="task-panel-header">
          <component
            :is="taskStatusIcon"
            :size="16"
            :class="{ spinning: task.status === 'running' }"
            :style="{ color: taskStatusColor }"
          />
          <span class="task-panel-title">异步任务状态</span>
        </div>
        <div class="task-panel-body">
          <div class="task-info-row">
            <span class="task-label">任务 ID:</span>
            <span class="task-value task-id">{{ taskId.slice(0, 16) }}...</span>
          </div>
          <div class="task-info-row">
            <span class="task-label">状态:</span>
            <el-tag
              :type="
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'failed'
                    ? 'danger'
                    : task.status === 'running'
                      ? 'primary'
                      : 'info'
              "
              size="small"
            >
              {{ taskStatusText }}
            </el-tag>
          </div>
          <div v-if="task.status === 'running' && task.progress !== undefined" class="task-info-row">
            <span class="task-label">进度:</span>
            <div class="task-progress-wrapper">
              <el-progress :percentage="task.progress" :stroke-width="8" :show-text="true" />
            </div>
          </div>
          <div v-if="task.progressMessage" class="task-info-row">
            <span class="task-label">消息:</span>
            <span class="task-value">{{ task.progressMessage }}</span>
          </div>
          <div v-if="task.status === 'running' || task.status === 'completed'" class="task-info-row">
            <span class="task-label">耗时:</span>
            <span class="task-value">{{ elapsedTime }}秒</span>
          </div>
          <div v-if="task.status === 'completed' && task.result" class="task-info-row task-result">
            <span class="task-label">结果:</span>
            <div class="task-result-content scrollbar-styled">
              <pre>{{ task.result }}</pre>
            </div>
          </div>
          <div v-if="task.status === 'failed' && task.error" class="task-info-row task-error">
            <span class="task-label">错误:</span>
            <span class="task-value error-text">{{ task.error }}</span>
          </div>
        </div>
        <div class="task-panel-actions">
          <el-button v-if="showCancelButton" size="small" type="warning" @click="handleCancelTask">
            <Ban :size="14" />
            取消
          </el-button>
          <el-button v-if="showRetryButton" size="small" type="primary" @click="handleRetryTask">
            <RotateCw :size="14" />
            重试
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.res-card {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
}

.res-head {
  padding: 6px 12px;
  background-color: rgba(var(--text-color-rgb), 0.03);
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.res-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 11px;
}

.res-status.success {
  color: var(--el-color-success);
}
.res-status.error {
  color: var(--el-color-danger);
}

.res-id {
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  color: var(--text-color-secondary);
  flex: 1;
}

.res-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.debug-tag {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  padding: 0 4px;
  border-radius: 2px;
  font-family: var(--el-font-family-mono);
  cursor: help;
}

.res-body {
  padding: 8px;
  background-color: var(--vscode-editor-background);
}

.markdown-viewer {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  background-color: var(--card-bg);
  border-radius: 4px;
}

.raw-preview {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.raw-empty {
  color: var(--text-color-secondary);
  opacity: 0.5;
  text-align: center;
  padding: 20px;
  font-style: italic;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

/* 异步任务面板样式 */
.async-task-panel {
  margin-top: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  overflow: hidden;
}

.task-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
  border-bottom: var(--border-width) solid var(--border-color);
  font-weight: 600;
  font-size: 13px;
}

.task-panel-title {
  color: var(--text-color-primary);
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

.task-panel-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-info-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
}

.task-label {
  color: var(--text-color-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.task-value {
  color: var(--text-color-primary);
  flex: 1;
  word-break: break-all;
}

.task-id {
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  background: rgba(var(--el-color-info-rgb), 0.1);
  padding: 2px 6px;
  border-radius: 3px;
}

.task-progress-wrapper {
  flex: 1;
}

.task-result {
  flex-direction: column;
  align-items: stretch;
}

.task-result-content {
  max-height: 200px;
  overflow-y: auto;
  background-color: var(--vscode-editor-background);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
  margin-top: 4px;
}

.task-result-content pre {
  margin: 0;
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.task-error {
  flex-direction: column;
  align-items: stretch;
}

.error-text {
  color: var(--el-color-danger);
  background: rgba(var(--el-color-danger-rgb), 0.1);
  padding: 6px 8px;
  border-radius: 4px;
  margin-top: 4px;
  font-size: 11px;
}

.task-panel-actions {
  padding: 8px 12px;
  border-top: var(--border-width) solid var(--border-color);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  background-color: rgba(var(--text-color-rgb), 0.02);
}

.task-panel-actions .el-button {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
