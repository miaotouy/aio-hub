<template>
  <div
    class="audit-log-panel card-glass"
    :class="{ 'is-collapsed': isCollapsed }"
  >
    <div class="panel-header flex-between">
      <h3 v-show="!isCollapsed">
        <el-icon><Memo /></el-icon> 操作审计日志
      </h3>
      <div class="header-actions">
        <el-button
          v-show="!isCollapsed"
          type="danger"
          plain
          size="small"
          :icon="Delete"
          @click="clearLogs"
          :disabled="logs.length === 0"
        >
          清空日志
        </el-button>
        <el-tooltip :content="isCollapsed ? '展开日志' : '折叠日志'">
          <el-button
            type="info"
            link
            :icon="isCollapsed ? Expand : Fold"
            @click="toggleCollapse"
            class="toggle-btn"
          />
        </el-tooltip>
      </div>
    </div>
    <div v-show="!isCollapsed" class="panel-body log-container">
      <el-empty v-if="logs.length === 0" description="暂无 AI 操作记录" />
      <div v-else class="log-list">
        <div
          v-for="(log, index) in sortedLogs"
          :key="index"
          class="log-item"
          :class="{ error: !log.result.success }"
        >
          <div class="log-meta">
            <span class="time">{{ formatTime(log.timestamp) }}</span>
            <span class="method-badge">{{ log.method }}</span>
            <el-tag
              :type="log.result.success ? 'success' : 'danger'"
              size="small"
            >
              {{ log.result.success ? "成功" : "失败" }}
            </el-tag>
          </div>
          <div class="log-details">
            <div class="detail-row">
              <span class="detail-label">参数:</span>
              <code class="detail-value">{{ JSON.stringify(log.params) }}</code>
            </div>
            <div class="detail-row">
              <span class="detail-label">结果:</span>
              <span
                class="detail-value"
                :class="{ 'text-danger': !log.result.success }"
              >
                {{ log.result.message }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 折叠时的侧边栏文字 -->
    <div v-show="isCollapsed" class="collapsed-sidebar" @click="toggleCollapse">
      <el-icon><Memo /></el-icon>
      <span class="vertical-text">操作审计日志</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Delete, Memo, Fold, Expand } from "@element-plus/icons-vue";
import type { OperationLogEntry } from "../types";

const props = defineProps<{
  logs: OperationLogEntry[];
  sortedLogs: OperationLogEntry[];
  isCollapsed: boolean;
}>();

const emit = defineEmits(["clear-logs", "update:isCollapsed"]);

function clearLogs() {
  emit("clear-logs");
}

function toggleCollapse() {
  emit("update:isCollapsed", !props.isCollapsed);
}

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}
</script>

<style scoped>
.audit-log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.audit-log-panel.is-collapsed {
  width: 40px !important;
  min-width: 40px !important;
  cursor: pointer;
}

.panel-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(255, 255, 255, 0.01);
  height: 48px;
  box-sizing: border-box;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.toggle-btn {
  font-size: 16px;
  padding: 0;
}

.panel-body {
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.log-container {
  background-color: transparent;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background-color 0.2s;
}

.log-item:hover {
  background-color: rgba(255, 255, 255, 0.01);
}

.log-item.error {
  border-left: 3px solid var(--el-color-danger);
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.method-badge {
  font-size: 11px;
  font-weight: 600;
  font-family: monospace;
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

.log-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: rgba(0, 0, 0, 0.02);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.detail-row {
  display: flex;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
}

.detail-label {
  color: var(--el-text-color-secondary);
  font-weight: 500;
  width: 35px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--el-text-color-regular);
  word-break: break-all;
  font-family: monospace;
}

.text-danger {
  color: var(--el-color-danger);
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 折叠侧边栏样式 */
.collapsed-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 16px;
  height: 100%;
  color: var(--el-text-color-secondary);
}

.collapsed-sidebar:hover {
  color: var(--el-color-primary);
}

.vertical-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 12px;
  letter-spacing: 4px;
  font-weight: 500;
}
</style>
