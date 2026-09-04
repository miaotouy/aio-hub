<template>
  <aside class="batch-input-sidebar">
    <!-- 添加图片区 -->
    <section class="sidebar-section">
      <h3 class="section-title">添加图片</h3>
      <div
        class="dropzone"
        :class="{ 'is-dragging': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="handleDrop"
      >
        <el-icon :size="32"><Upload /></el-icon>
        <p class="dropzone-hint">拖放图片或目录</p>
        <div class="dropzone-actions">
          <el-button size="small" @click="$emit('add-files')">
            <el-icon><FolderOpened /></el-icon>
            选择文件
          </el-button>
          <el-button size="small" @click="$emit('add-directory')">
            <el-icon><Folder /></el-icon>
            选择目录
          </el-button>
        </div>
      </div>

      <!-- 候选列表统计 -->
      <div v-if="candidateCount > 0" class="candidates-summary">
        <div class="summary-row">
          <span class="summary-label">候选图片</span>
          <span class="summary-value">{{ candidateCount }} 张</span>
        </div>
        <el-button size="small" text type="danger" @click="$emit('clear-candidates')">
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
        <el-select :model-value="maxDepth" size="small" @update:model-value="$emit('update:maxDepth', $event)">
          <el-option label="仅当前目录" :value="0" />
          <el-option label="递归 1 层" :value="1" />
          <el-option label="递归 2 层" :value="2" />
          <el-option label="递归 3 层" :value="3" />
          <el-option label="无限递归" :value="9999" />
        </el-select>
      </div>

      <div class="config-item">
        <label class="config-label">亮度阈值</label>
        <div class="threshold-control">
          <div class="threshold-labels">
            <span>暗</span>
            <span>中</span>
            <span>亮</span>
          </div>
          <el-slider
            :model-value="thresholds"
            :min="0.01"
            :max="0.99"
            :step="0.01"
            range
            size="small"
            @update:model-value="$emit('update:thresholds', $event)"
          />
        </div>
      </div>

      <div class="config-item">
        <label class="config-label">归档模式</label>
        <el-radio-group
          :model-value="archiveMode"
          size="small"
          @update:model-value="$emit('update:archiveMode', $event)"
        >
          <el-radio-button label="copy">
            <el-icon><DocumentCopy /></el-icon>
            复制
          </el-radio-button>
          <el-radio-button label="symlink">
            <el-icon><Link /></el-icon>
            链接
          </el-radio-button>
        </el-radio-group>
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
        {{ analyzing ? '分析中...' : `开始分析 (${candidateCount} 张)` }}
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

    <el-divider />

    <!-- 归档设置区 -->
    <section class="sidebar-section">
      <h3 class="section-title">归档设置</h3>

      <div class="selection-summary-compact">
        <span class="summary-label">已选</span>
        <span class="summary-value">{{ selectedCount }} 张</span>
      </div>

      <div class="config-item">
        <label class="config-label">目标目录</label>
        <el-input
          :model-value="targetDirectory"
          placeholder="选择目标目录"
          size="small"
          clearable
          @update:model-value="$emit('update:targetDirectory', $event)"
        >
          <template #append>
            <el-button size="small" @click="$emit('choose-directory')">选择</el-button>
          </template>
        </el-input>
      </div>

      <!-- 预检结果 -->
      <div v-if="preflight.loading || preflight.error || hasPreflightResult" class="preflight-box-compact">
        <el-icon v-if="preflight.loading" class="is-loading"><Loading /></el-icon>
        <div v-else-if="preflight.error" class="preflight-message error">
          <el-icon><WarnTriangleFilled /></el-icon>
          <span class="preflight-text">{{ preflight.error }}</span>
        </div>
        <div v-else-if="archiveMode === 'copy'" class="preflight-message" :class="preflightStatus">
          <el-icon><Coin /></el-icon>
          <span class="preflight-text">
            需要 {{ formatBytes(preflight.required ?? 0) }} / 可用 {{ formatBytes(preflight.available ?? 0) }}
          </span>
        </div>
        <div v-else class="preflight-message" :class="preflightStatus">
          <el-icon><Key /></el-icon>
          <span class="preflight-text">{{ preflight.symlinkAllowed ? '权限正常' : '需要管理员权限' }}</span>
        </div>
      </div>

      <el-button
        type="primary"
        size="large"
        :loading="organizing"
        :disabled="!canOrganize"
        style="width: 100%"
        @click="$emit('organize')"
      >
        开始归档
      </el-button>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  Upload,
  FolderOpened,
  Folder,
  DocumentCopy,
  Link,
  Loading,
  WarnTriangleFilled,
  Coin,
  Key,
} from "@element-plus/icons-vue";
import type { BatchArchiveMode } from "../batchColorOrganizer";

interface PreflightState {
  loading: boolean;
  error: string;
  available?: number;
  required?: number;
  diskSufficient?: boolean;
  symlinkAllowed?: boolean;
}

interface Props {
  candidateCount: number;
  maxDepth: number | null;
  thresholds: [number, number, number, number];
  archiveMode: BatchArchiveMode;
  analyzing: boolean;
  completed: number;
  total: number;
  etaSeconds: number | null;
  selectedCount: number;
  targetDirectory: string;
  preflight: PreflightState;
  organizing: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "add-files"): void;
  (e: "add-directory"): void;
  (e: "clear-candidates"): void;
  (e: "update:maxDepth", value: number | null): void;
  (e: "update:thresholds", value: [number, number, number, number]): void;
  (e: "update:archiveMode", value: BatchArchiveMode): void;
  (e: "start-analyze"): void;
  (e: "cancel-analyze"): void;
  (e: "drop", paths: string[]): void;
  (e: "update:targetDirectory", value: string): void;
  (e: "choose-directory"): void;
  (e: "organize"): void;
}>();

const dragging = ref(false);

const progressPercent = computed(() =>
  props.total ? Math.round((props.completed / props.total) * 100) : 0
);

const hasPreflightResult = computed(() => {
  return props.archiveMode === "copy"
    ? props.preflight.diskSufficient !== undefined
    : props.preflight.symlinkAllowed !== undefined;
});

const preflightStatus = computed(() => {
  if (props.archiveMode === "copy") {
    return props.preflight.diskSufficient ? "success" : "error";
  }
  return props.preflight.symlinkAllowed ? "success" : "error";
});

const canOrganize = computed(() => {
  if (props.selectedCount === 0 || !props.targetDirectory || props.preflight.loading || props.preflight.error) {
    return false;
  }
  return props.archiveMode === "copy"
    ? props.preflight.diskSufficient === true
    : props.preflight.symlinkAllowed === true;
});

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
};

const handleDrop = (event: DragEvent) => {
  dragging.value = false;
  const paths = Array.from(event.dataTransfer?.files ?? [])
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => !!path);
  if (paths.length) {
    emit("drop", paths);
  }
};
</script>

<style scoped>
.batch-input-sidebar {
  width: 280px;
  background: var(--el-bg-color);
  border-right: 1px solid var(--border-color);
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

.dropzone {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: var(--el-fill-color-lighter);
  transition: all 0.2s;
}

.dropzone.is-dragging {
  border-color: var(--el-color-primary);
  background: rgba(var(--primary-color-rgb), 0.05);
}

.dropzone-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0;
}

.dropzone-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
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

.selection-summary-compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  margin-bottom: 12px;
}

.selection-summary-compact .summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.selection-summary-compact .summary-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.preflight-box-compact {
  padding: 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.preflight-message {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  width: 100%;
}

.preflight-message.success {
  color: var(--el-color-success);
}

.preflight-message.error {
  color: var(--el-color-danger);
}

.preflight-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
