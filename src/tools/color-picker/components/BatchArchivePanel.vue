<template>
  <aside class="batch-archive-panel">
    <!-- 归档配置 -->
    <section class="panel-section">
      <h3 class="section-title">归档设置</h3>

      <div class="selection-summary">
        <div class="summary-number">{{ selectedCount }}</div>
        <div class="summary-label">张图片待归档</div>
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
            <el-button @click="$emit('choose-directory')">选择</el-button>
          </template>
        </el-input>
      </div>

      <div class="config-item">
        <label class="config-label">归档方式</label>
        <el-radio-group
          :model-value="archiveMode"
          size="small"
          style="width: 100%"
          @update:model-value="$emit('update:archiveMode', $event)"
        >
          <el-radio-button label="copy" style="flex: 1">
            <el-icon><DocumentCopy /></el-icon>
            复制
          </el-radio-button>
          <el-radio-button label="symlink" style="flex: 1">
            <el-icon><Link /></el-icon>
            链接
          </el-radio-button>
        </el-radio-group>
      </div>

      <!-- 预检结果 -->
      <div v-if="preflight.loading || preflight.error || hasPreflightResult" class="preflight-box">
        <el-icon v-if="preflight.loading" class="is-loading"><Loading /></el-icon>
        <div v-else-if="preflight.error" class="preflight-message error">
          <el-icon><WarnTriangleFilled /></el-icon>
          <span>{{ preflight.error }}</span>
        </div>
        <div v-else-if="archiveMode === 'copy'" class="preflight-message" :class="preflightStatus">
          <el-icon><Coin /></el-icon>
          <div>
            <div>需要 {{ formatBytes(preflight.required ?? 0) }}</div>
            <div class="preflight-detail">可用 {{ formatBytes(preflight.available ?? 0) }}</div>
          </div>
        </div>
        <div v-else class="preflight-message" :class="preflightStatus">
          <el-icon><Key /></el-icon>
          <span>{{ preflight.symlinkAllowed ? '符号链接权限正常' : '需要管理员权限' }}</span>
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

    <!-- 归档结果 -->
    <section v-if="archiveResult" class="panel-section">
      <h3 class="section-title">归档结果</h3>

      <div class="result-stats-grid">
        <div class="result-stat success">
          <div class="stat-number">{{ archiveResult.successCount }}</div>
          <div class="stat-label">成功</div>
        </div>
        <div class="result-stat renamed">
          <div class="stat-number">{{ archiveResult.renamedCount }}</div>
          <div class="stat-label">重命名</div>
        </div>
        <div class="result-stat failed">
          <div class="stat-number">{{ archiveResult.failedCount }}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="result-stat missing">
          <div class="stat-number">{{ archiveResult.sourceNotFoundCount }}</div>
          <div class="stat-label">丢失</div>
        </div>
      </div>

      <div class="result-actions">
        <el-button size="small" @click="$emit('show-details')">查看详情</el-button>
        <el-button v-if="targetDirectory" size="small" @click="$emit('open-directory')">
          <el-icon><FolderOpened /></el-icon>
          打开目录
        </el-button>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  DocumentCopy,
  Link,
  Loading,
  WarnTriangleFilled,
  Coin,
  Key,
  FolderOpened,
} from "@element-plus/icons-vue";
import type { BatchArchiveMode } from "../batchColorOrganizer";

interface ArchiveResult {
  successCount: number;
  renamedCount: number;
  failedCount: number;
  sourceNotFoundCount: number;
}

interface PreflightState {
  loading: boolean;
  error: string;
  available?: number;
  required?: number;
  diskSufficient?: boolean;
  symlinkAllowed?: boolean;
}

interface Props {
  selectedCount: number;
  targetDirectory: string;
  archiveMode: BatchArchiveMode;
  preflight: PreflightState;
  organizing: boolean;
  archiveResult: ArchiveResult | null;
}

const props = defineProps<Props>();

defineEmits<{
  (e: "update:targetDirectory", value: string): void;
  (e: "update:archiveMode", value: BatchArchiveMode): void;
  (e: "choose-directory"): void;
  (e: "organize"): void;
  (e: "show-details"): void;
  (e: "open-directory"): void;
}>();

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
</script>

<style scoped>
.batch-archive-panel {
  width: 320px;
  background: var(--el-bg-color);
  border-left: 1px solid var(--border-color);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.panel-section {
  padding: 8px 0;
}

.panel-section + .panel-section {
  border-top: 1px solid var(--border-color);
  margin-top: 16px;
  padding-top: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-color);
}

.selection-summary {
  text-align: center;
  padding: 20px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  margin-bottom: 16px;
}

.summary-number {
  font-size: 36px;
  font-weight: 700;
  color: var(--el-color-primary);
  line-height: 1;
}

.summary-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.config-item {
  margin-bottom: 16px;
}

.config-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-color);
}

.preflight-box {
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.preflight-message {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  width: 100%;
}

.preflight-message.success {
  color: var(--el-color-success);
}

.preflight-message.error {
  color: var(--el-color-danger);
}

.preflight-detail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.result-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.result-stat {
  text-align: center;
  padding: 12px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.result-stat.success {
  background: rgba(103, 194, 58, 0.1);
}

.result-stat.renamed {
  background: rgba(230, 162, 60, 0.1);
}

.result-stat.failed,
.result-stat.missing {
  background: rgba(245, 108, 108, 0.1);
}

.stat-number {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.result-stat.success .stat-number {
  color: var(--el-color-success);
}

.result-stat.renamed .stat-number {
  color: var(--el-color-warning);
}

.result-stat.failed .stat-number,
.result-stat.missing .stat-number {
  color: var(--el-color-danger);
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
