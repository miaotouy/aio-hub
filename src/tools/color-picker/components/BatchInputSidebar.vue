<template>
  <aside class="batch-input-sidebar">
    <!-- 添加目录区 -->
    <section class="sidebar-section">
      <h3 class="section-title">添加目录</h3>
      <DropZone
        variant="input"
        :directory-only="true"
        :multiple="false"
        hide-content
        @drop="handlePathDrop"
      >
        <div class="path-input-group">
          <el-input
            :model-value="directoryPath"
            placeholder="拖拽、输入或选择目录路径"
            @update:model-value="$emit('update:directoryPath', $event)"
            @keyup.enter="$emit('scan-path')"
          />
          <el-button :icon="FolderOpened" @click.stop="$emit('add-directory')">
            选择
          </el-button>
        </div>
      </DropZone>

      <!-- 候选列表统计 -->
      <div v-if="candidateCount > 0" class="candidates-summary">
        <div class="summary-row">
          <span class="summary-label">候选图片</span>
          <span class="summary-value">{{ candidateCount }} 张</span>
        </div>
        <el-button
          size="small"
          text
          type="danger"
          @click="$emit('clear-candidates')"
        >
          清空全部
        </el-button>
      </div>
    </section>

    <el-divider />

    <!-- 分析设置区 -->
    <section class="sidebar-section">
      <h3 class="section-title">分析设置</h3>

      <div class="config-item">
        <label class="config-label">递归深度</label>
        <el-select
          :model-value="maxDepth"
          size="small"
          @update:model-value="$emit('update:maxDepth', $event)"
        >
          <el-option label="仅当前目录" :value="0" />
          <el-option label="递归 1 层" :value="1" />
          <el-option label="递归 2 层" :value="2" />
          <el-option label="递归 3 层" :value="3" />
          <el-option label="无限递归" :value="9999" />
        </el-select>
      </div>

      <div class="config-item">
        <label class="config-label">亮度阈值</label>
        <BrightnessThresholdSlider
          :model-value="thresholds"
          @update:model-value="$emit('update:thresholds', $event)"
        />
      </div>
    </section>

    <el-divider />

    <!-- 分析控制区 -->
    <section class="sidebar-section">
      <el-button
        type="primary"
        size="large"
        :disabled="candidateCount === 0 || analyzing"
        :loading="analyzing"
        style="width: 100%"
        @click="$emit('start-analyze')"
      >
        {{ analyzing ? "分析中..." : `开始分析 (${candidateCount} 张)` }}
      </el-button>

      <!-- 分析进度 -->
      <div v-if="analyzing" class="progress-section">
        <el-progress :percentage="progressPercent" :stroke-width="8" />
        <div class="progress-stats">
          <span class="progress-label">已完成</span>
          <span class="progress-value">{{ completed }} / {{ total }}</span>
        </div>
        <div v-if="etaSeconds !== null" class="progress-stats">
          <span class="progress-label">预计剩余</span>
          <span class="progress-value">{{ formatDuration(etaSeconds) }}</span>
        </div>
        <el-button size="small" text @click="$emit('cancel-analyze')">
          取消分析
        </el-button>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { FolderOpened } from "@element-plus/icons-vue";
import DropZone from "@/components/common/DropZone.vue";
import BrightnessThresholdSlider from "./BrightnessThresholdSlider.vue";

interface Props {
  candidateCount: number;
  directoryPath: string;
  maxDepth: number | null;
  thresholds: [number, number, number, number];
  analyzing: boolean;
  completed: number;
  total: number;
  etaSeconds: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "add-directory"): void;
  (e: "scan-path"): void;
  (e: "clear-candidates"): void;
  (e: "update:directoryPath", value: string): void;
  (e: "update:maxDepth", value: number | null): void;
  (e: "update:thresholds", value: number[]): void;
  (e: "start-analyze"): void;
  (e: "cancel-analyze"): void;
  (e: "drop", paths: string[]): void;
}>();

const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    emit("update:directoryPath", paths[0]);
    emit("drop", [paths[0]]);
  }
};

const progressPercent = computed(() =>
  props.total ? Math.round((props.completed / props.total) * 100) : 0
);

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};
</script>

<style scoped>
.batch-input-sidebar {
  width: 280px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sidebar-section {
  padding: 8px 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-color);
}

.path-input-group {
  display: flex;
  gap: 6px;
}

.path-input-group .el-input {
  min-width: 0;
}

.candidates-summary {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.config-item {
  margin-bottom: 16px;
}

.config-item:last-child {
  margin-bottom: 0;
}

.config-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-color);
}

.threshold-control {
  padding: 8px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}

.threshold-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.progress-section {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.progress-label {
  color: var(--el-text-color-secondary);
}

.progress-value {
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
