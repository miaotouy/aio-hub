<template>
  <div class="canvas-status-bar">
    <div class="status-left">
      <FileText :size="12" />
      <span class="status-text">{{ currentFile || "No file" }}</span>
    </div>
    <div class="status-center">
      <span class="status-text">Files: {{ fileCount }}</span>
    </div>
    <div class="status-right">
      <div v-if="pendingCount > 0" class="pending-badge">
        <div class="pulse-dot"></div>
        <span>{{ pendingCount }} uncommitted changes</span>
      </div>

      <!-- 运行时错误计数器 -->
      <el-popover v-if="errorCount > 0" placement="top-end" :width="400" trigger="click" popper-class="canvas-error-popover">
        <template #reference>
          <div class="error-badge">
            <AlertCircle :size="12" />
            <span>{{ errorCount }}</span>
          </div>
        </template>

        <div class="error-details">
          <div class="error-header">
            <span>Runtime Errors ({{ errorCount }})</span>
            <el-button link type="primary" size="small" @click="clearErrors">Clear</el-button>
          </div>
          <el-scrollbar max-height="300px">
            <div v-for="err in errors" :key="err.id" class="error-item">
              <div class="error-main">
                <span class="error-level" :class="err.level">{{ err.level.toUpperCase() }}</span>
                <span class="error-msg">{{ err.message }}</span>
              </div>
              <div v-if="err.filename" class="error-location">{{ err.filename }}:{{ err.lineno }}:{{ err.colno }}</div>
              <div class="error-time">{{ new Date(err.timestamp).toLocaleTimeString() }}</div>
            </div>
          </el-scrollbar>
        </div>
      </el-popover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { FileText, AlertCircle } from "lucide-vue-next";
import { useCanvasStore } from "../../stores/canvasStore";

const props = defineProps<{
  canvasId: string;
  currentFile: string;
  fileCount: number;
  pendingCount: number;
}>();

const canvasStore = useCanvasStore();
const errors = computed(() => canvasStore.getActiveRuntimeErrors(props.canvasId));
const errorCount = computed(() => errors.value.length);

function clearErrors() {
  canvasStore.clearRuntimeErrors(props.canvasId);
}
</script>

<style scoped lang="scss">
.canvas-status-bar {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--card-bg);
  border-top: var(--border-width) solid var(--border-color);
  font-size: 11px;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.status-left,
.status-center,
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.pending-badge,
.error-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  cursor: default;
}

.pending-badge {
  color: var(--el-color-warning);
}

.error-badge {
  color: var(--el-color-danger);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(var(--el-color-danger-rgb), 0.1);
  }
}

.error-details {
  .error-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-weight: bold;
    font-size: 13px;
  }

  .error-item {
    padding: 8px;
    border-radius: 4px;
    background: rgba(var(--el-color-danger-rgb), 0.05);
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }

    .error-main {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }

    .error-level {
      font-size: 10px;
      padding: 0 4px;
      border-radius: 2px;
      background: var(--el-color-danger);
      color: white;
      height: 16px;
      line-height: 16px;
    }

    .error-msg {
      font-family: var(--el-font-family-mono);
      font-size: 12px;
      color: var(--el-text-color-primary);
      word-break: break-all;
    }

    .error-location {
      font-size: 11px;
      color: var(--el-text-color-secondary);
      margin-bottom: 2px;
    }

    .error-time {
      font-size: 10px;
      color: var(--el-text-color-placeholder);
      text-align: right;
    }
  }
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: var(--el-color-warning);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--el-color-warning-rgb), 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(var(--el-color-warning-rgb), 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(var(--el-color-warning-rgb), 0);
  }
}
</style>
