<script setup lang="ts">
import { CheckCircle2, Circle, Loader2, XCircle, Files, Layers, Clock } from "lucide-vue-next";
import type { IndexPayload } from "../../types/monitor";

defineProps<{
  payload: IndexPayload;
}>();

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "running":
      return Loader2;
    case "failed":
      return XCircle;
    default:
      return Circle;
  }
};

const getStatusClass = (status: string) => {
  return `status-${status}`;
};

const formattedDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};
</script>

<template>
  <div class="index-trace-content">
    <!-- 进度统计 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <Files :size="14" />
          <span>文件进度</span>
        </div>
        <div class="stat-body">
          <span class="main-val">{{ payload.stats.processedFiles }}</span>
          <span class="total-val">/ {{ payload.stats.totalFiles }}</span>
        </div>
        <el-progress
          :percentage="
            payload.stats.totalFiles > 0
              ? (payload.stats.processedFiles / payload.stats.totalFiles) * 100
              : 0
          "
          :show-text="false"
          :stroke-width="4"
        />
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <Layers :size="14" />
          <span>切片向量化</span>
        </div>
        <div class="stat-body">
          <span class="main-val">{{ payload.stats.vectorizedChunks }}</span>
          <span class="total-val">/ {{ payload.stats.totalChunks }}</span>
        </div>
        <el-progress
          :percentage="
            payload.stats.totalChunks > 0
              ? (payload.stats.vectorizedChunks / payload.stats.totalChunks) * 100
              : 0
          "
          :show-text="false"
          :stroke-width="4"
          color="#67c23a"
        />
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <Clock :size="14" />
          <span>耗时</span>
        </div>
        <div class="stat-body">
          <span class="main-val">{{ formattedDuration(payload.stats.duration) }}</span>
        </div>
      </div>
    </div>

    <!-- 步骤列表 -->
    <div class="trace-section">
      <div class="section-title">索引步骤</div>
      <div class="steps-timeline">
        <div
          v-for="(step, index) in payload.steps"
          :key="index"
          class="step-row"
          :class="getStatusClass(step.status)"
        >
          <component
            :is="getStatusIcon(step.status)"
            :size="14"
            class="step-icon"
            :class="{ 'is-spinning': step.status === 'running' }"
          />
          <span class="step-name">{{ step.name }}</span>
          <span class="step-duration">{{ formattedDuration(step.duration) }}</span>
          <span v-if="step.details" class="step-details">- {{ step.details }}</span>
        </div>
      </div>
    </div>

    <!-- 元数据 -->
    <div v-if="payload.metadata" class="metadata-footer">
      <el-tag size="small" type="info">KB: {{ payload.metadata.kbId }}</el-tag>
      <el-tag size="small" type="info">Model: {{ payload.metadata.modelId }}</el-tag>
    </div>
  </div>
</template>

<style scoped>
.index-trace-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
  box-sizing: border-box;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.stat-card {
  padding: 10px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.stat-body {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.main-val {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.total-val {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.trace-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
}

.steps-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.step-icon {
  flex-shrink: 0;
}

.status-completed .step-icon {
  color: var(--el-color-success);
}
.status-running .step-icon {
  color: var(--el-color-primary);
}
.status-failed .step-icon {
  color: var(--el-color-danger);
}
.status-pending .step-icon {
  color: var(--el-text-color-placeholder);
}

.is-spinning {
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

.step-name {
  font-weight: 500;
}

.step-duration {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
}

.step-details {
  font-size: 12px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metadata-footer {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
