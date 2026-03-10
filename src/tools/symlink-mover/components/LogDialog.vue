<script setup lang="ts">
import { InfoFilled } from "@element-plus/icons-vue";
import BaseDialog from "@components/common/BaseDialog.vue";
import { useSymlinkMoverLogic } from "../composables/useSymlinkMover";
import type { OperationLog } from "../types";

interface Props {
  modelValue: boolean;
  logs: OperationLog[];
}

defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const logic = useSymlinkMoverLogic();
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="操作历史记录"
    width="70%"
    height="600px"
  >
    <template #content>
      <div v-if="logs.length === 0" class="empty-logs">
        <el-icon>
          <InfoFilled />
        </el-icon>
        <p>暂无操作记录</p>
      </div>
      <div v-else class="logs-list">
        <div v-for="(log, index) in logs" :key="index" class="log-item">
          <div class="log-item-header">
            <div class="log-item-title">
              <el-tag :type="log.errorCount > 0 ? 'warning' : 'success'" size="small">
                {{ logic.getOperationTypeLabel(log.operationType) }}
              </el-tag>
              <span class="log-item-time">{{ logic.formatTimestamp(log.timestamp) }}</span>
            </div>
            <div class="log-item-meta">
              <span>{{ logic.getLinkTypeLabel(log.linkType) }}</span>
              <span>耗时: {{ logic.formatDuration(log.durationMs) }}</span>
            </div>
          </div>
          <div class="log-item-stats">
            <span>处理: {{ log.sourceCount }} 个</span>
            <span class="success-text">成功: {{ log.successCount }}</span>
            <span v-if="log.errorCount > 0" class="error-text">失败: {{ log.errorCount }}</span>
            <span>大小: {{ logic.formatBytes(log.totalSize) }}</span>
          </div>
          <div class="log-item-details">
            <div class="detail-item">
              <span class="detail-label">目标目录:</span>
              <span class="detail-value" :title="log.targetDirectory">{{ log.targetDirectory }}</span>
            </div>
            <div v-if="log.processedFiles && log.processedFiles.length > 0" class="detail-item">
              <span class="detail-label">成功文件:</span>
              <span class="detail-value">{{ log.processedFiles.join(", ") }}</span>
            </div>
          </div>
          <div v-if="log.errors.length > 0" class="log-item-errors">
            <div class="error-title">错误详情:</div>
            <div v-for="(error, errIdx) in log.errors" :key="errIdx" class="error-message">
              {{ error }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-color-light);
}

.empty-logs .el-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-item {
  padding: 16px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}

.log-item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.log-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-item-time {
  font-size: 13px;
  color: var(--text-color);
}

.log-item-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-color-light);
}

.log-item-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 8px;
}

.success-text {
  color: var(--el-color-success);
}

.error-text {
  color: var(--el-color-error);
}

.log-item-errors {
  margin-top: 12px;
  padding: 12px;
  background-color: rgba(var(--el-color-error-rgb), calc(var(--card-opacity) * 0.1));
  border-radius: 4px;
  border-left: 3px solid var(--el-color-error);
}

.error-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-color-error);
  margin-bottom: 8px;
}

.error-message {
  font-size: 12px;
  color: var(--text-color);
  line-height: 1.6;
  padding-left: 12px;
  position: relative;
}

.error-message::before {
  content: "•";
  position: absolute;
  left: 0;
  color: var(--el-color-error);
}

.log-item-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.detail-label {
  color: var(--text-color-light);
  flex-shrink: 0;
  min-width: 70px;
}

.detail-value {
  color: var(--text-color);
  word-break: break-all;
  flex: 1;
}
</style>
