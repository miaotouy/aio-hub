<script setup lang="ts">
import { CheckCircle2, Circle, Loader2, XCircle, FileText, Target, Zap } from "lucide-vue-next";
import type { RagPayload } from "../../types/monitor";

defineProps<{
  payload: RagPayload;
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
  <div class="rag-trace-content">
    <!-- 统计面板 -->
    <div class="stats-row">
      <div class="stat-item">
        <Zap :size="14" class="stat-icon" />
        <span class="stat-label">总耗时:</span>
        <span class="stat-value">{{ formattedDuration(payload.stats.duration) }}</span>
      </div>
      <div class="stat-item" v-if="payload.stats.hitCount !== undefined">
        <Target :size="14" class="stat-icon" />
        <span class="stat-label">命中片段:</span>
        <span class="stat-value">{{ payload.stats.hitCount }}</span>
      </div>
      <div class="stat-item" v-if="payload.stats.tokenCount">
        <FileText :size="14" class="stat-icon" />
        <span class="stat-label">Token:</span>
        <span class="stat-value">{{ payload.stats.tokenCount }}</span>
      </div>
    </div>

    <!-- 步骤时间线 -->
    <div class="trace-section">
      <div class="section-title">执行流程</div>
      <div class="steps-timeline">
        <div
          v-for="(step, index) in payload.steps"
          :key="index"
          class="step-item"
          :class="getStatusClass(step.status)"
        >
          <div class="step-line" v-if="index < payload.steps.length - 1"></div>
          <div class="step-icon-wrapper">
            <component
              :is="getStatusIcon(step.status)"
              :size="14"
              :class="{ 'is-spinning': step.status === 'running' }"
            />
          </div>
          <div class="step-info">
            <div class="step-header">
              <span class="step-name">{{ step.name }}</span>
              <span class="step-duration">{{ formattedDuration(step.duration) }}</span>
            </div>
            <div v-if="step.details" class="step-details">{{ step.details }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 检索结果 -->
    <div v-if="payload.results && payload.results.length > 0" class="trace-section">
      <div class="section-title">召回片段 (Top {{ payload.results.length }})</div>
      <div class="results-list">
        <div v-for="result in payload.results" :key="result.id" class="result-item">
          <div class="result-header">
            <div class="result-source">
              <FileText :size="12" />
              <span>{{ result.source || "未知来源" }}</span>
            </div>
            <div class="result-score" :title="`相似度分数: ${result.score}`">
              <div class="score-bar-bg">
                <div
                  class="score-bar-fill"
                  :style="{ width: `${Math.min(result.score * 100, 100)}%` }"
                ></div>
              </div>
              <span>{{ (result.score * 100).toFixed(1) }}%</span>
            </div>
          </div>
          <div class="result-content">{{ result.content }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rag-trace-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
  box-sizing: border-box;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px;
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-icon {
  color: var(--el-color-primary);
}

.stat-label {
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
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
  letter-spacing: 0.05em;
}

.steps-timeline {
  display: flex;
  flex-direction: column;
}

.step-item {
  display: flex;
  gap: 12px;
  position: relative;
  padding-bottom: 12px;
}

.step-item:last-child {
  padding-bottom: 0;
}

.step-line {
  position: absolute;
  left: 6px;
  top: 14px;
  bottom: -4px;
  width: 2px;
  background-color: var(--border-color);
}

.step-icon-wrapper {
  position: relative;
  z-index: 1;
  background-color: var(--card-bg);
  height: 14px;
  display: flex;
  align-items: center;
}

.status-completed .step-icon-wrapper {
  color: var(--el-color-success);
}
.status-running .step-icon-wrapper {
  color: var(--el-color-primary);
}
.status-failed .step-icon-wrapper {
  color: var(--el-color-danger);
}
.status-pending .step-icon-wrapper {
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

.step-info {
  flex: 1;
  min-width: 0;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.step-name {
  font-size: 13px;
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
  background-color: var(--input-bg);
  padding: 4px 8px;
  border-radius: 4px;
  margin-top: 4px;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.result-item {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.03);
  box-sizing: border-box;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 12px;
}

.result-source {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.result-score {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--el-color-primary);
  font-weight: 600;
  flex-shrink: 0;
}

.score-bar-bg {
  width: 40px;
  height: 4px;
  background-color: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}

.score-bar-fill {
  height: 100%;
  background-color: var(--el-color-primary);
}

.result-content {
  font-size: 12px;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}
</style>
