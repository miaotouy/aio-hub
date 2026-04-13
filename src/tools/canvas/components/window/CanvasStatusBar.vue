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
        <span>{{ pendingCount }} pending changes</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileText } from "lucide-vue-next";

defineProps<{
  currentFile: string;
  fileCount: number;
  pendingCount: number;
}>();
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

  .pending-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--el-color-warning);
    font-weight: 500;

    .pulse-dot {
      width: 6px;
      height: 6px;
      background-color: var(--el-color-warning);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
  }
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
