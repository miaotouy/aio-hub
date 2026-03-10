<script setup lang="ts">
import { useSymlinkMoverLogic } from "../composables/useSymlinkMover";

interface Props {
  showProgress: boolean;
  currentProgress: number;
  currentFile: string;
  copiedBytes: number;
  totalBytes: number;
  isProcessing: boolean;
}

defineProps<Props>();

const logic = useSymlinkMoverLogic();
</script>

<template>
  <div class="setting-group progress-group">
    <div v-if="showProgress" class="progress-info">
      <div class="progress-file">{{ currentFile }}</div>
      <div class="progress-stats">
        {{ logic.formatBytes(copiedBytes) }} /
        {{ logic.formatBytes(totalBytes) }}
      </div>
    </div>
    <div v-else class="progress-info">
      <div class="progress-file">处理中，请稍候...</div>
    </div>
    <el-progress
      :percentage="showProgress ? currentProgress : 100"
      :status="showProgress ? (isProcessing ? undefined : 'success') : undefined"
      :striped="!showProgress"
      :striped-flow="!showProgress"
      :stroke-width="12"
    />
  </div>
</template>

<style scoped>
.progress-group {
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-file {
  font-size: 13px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.progress-stats {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
}
</style>
