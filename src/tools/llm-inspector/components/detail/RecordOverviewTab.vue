<template>
  <div class="overview-tab">
    <!-- 请求信息 -->
    <div class="section">
      <h4>请求信息</h4>
      <div class="info-grid">
        <div class="info-item">
          <label>方法：</label>
          <span class="method-badge">{{ record.request.method }}</span>
        </div>
        <div class="info-item full-row">
          <label>URL：</label>
          <span class="url-full">{{ record.request.url }}</span>
        </div>
        <div class="info-item">
          <label>时间：</label>
          <span>{{ new Date(record.request.timestamp).toLocaleString() }}</span>
        </div>
        <div class="info-item">
          <label>大小：</label>
          <span>{{ formatSize(record.request.request_size) }}</span>
        </div>
      </div>

      <div class="subsection">
        <div class="subsection-header">
          <h5>请求头</h5>
          <button
            @click="copyRequestHeaders"
            class="btn-copy-small"
            title="复制请求头"
          >
            <Copy :size="14" />
          </button>
        </div>
        <div class="headers-list">
          <div
            v-for="(value, key) in record.request.headers"
            :key="key"
            class="header-item"
          >
            <span class="header-key">{{ key }}:</span>
            <span class="header-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 响应信息 -->
    <div v-if="record.response || isStreamingActive" class="section">
      <h4>响应信息</h4>
      <div class="info-grid" v-if="record.response">
        <div class="info-item">
          <label>状态码：</label>
          <span
            :class="['status-badge', getStatusClass(record.response.status)]"
          >
            {{ record.response.status }}
          </span>
        </div>
        <div class="info-item">
          <label>耗时：</label>
          <span>{{ record.response.duration_ms }}ms</span>
        </div>
        <div class="info-item">
          <label>大小：</label>
          <span>{{ formatSize(record.response.response_size) }}</span>
        </div>
        <div class="info-item" v-if="isStreamingResponse">
          <label>流式：</label>
          <span class="stream-flag">
            <Activity :size="12" />
            是
          </span>
        </div>
      </div>
      <div v-else-if="isStreamingActive" class="info-grid">
        <div class="info-item">
          <label>状态：</label>
          <span class="streaming-status">
            <LoaderCircle :size="13" class="spin-icon" />
            接收中...
          </span>
        </div>
      </div>

      <div class="subsection" v-if="record.response">
        <div class="subsection-header">
          <h5>响应头</h5>
          <button
            @click="copyResponseHeaders"
            class="btn-copy-small"
            title="复制响应头"
          >
            <Copy :size="14" />
          </button>
        </div>
        <div class="headers-list">
          <div
            v-for="(value, key) in record.response.headers"
            :key="key"
            class="header-item"
          >
            <span class="header-key">{{ key }}:</span>
            <span class="header-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 跳转提示 -->
    <div class="tab-hint">
      <Info :size="13" />
      <span>
        请求体 / 响应体 完整内容请查看「<strong>原始</strong>」Tab； LLM
        语义化视图请查看「<strong>结构化</strong>」Tab。
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Activity, Copy, Info, LoaderCircle } from "lucide-vue-next";
import { useRecordDetail } from "../../composables/useRecordDetail";
import type { CombinedRecord } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

const {
  isStreamingActive,
  isStreamingResponse,
  copyRequestHeaders,
  copyResponseHeaders,
  formatSize,
  getStatusClass,
} = useRecordDetail(props);
</script>

<style scoped>
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section h4 {
  margin: 0;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 6px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 16px;
}

.info-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.info-item.full-row {
  grid-column: 1 / -1;
  align-items: flex-start;
}

.info-item label {
  color: var(--text-color-light);
  flex-shrink: 0;
}

.info-item span {
  color: var(--text-color);
}

.method-badge {
  font-family: "Courier New", monospace;
  font-weight: 600;
  color: var(--primary-color);
  padding: 1px 8px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.12));
  border-radius: 3px;
  font-size: 12px;
}

.url-full {
  word-break: break-all;
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge.success {
  background: var(--el-color-success, #67c23a);
  color: white;
}

.status-badge.client-error {
  background: var(--el-color-warning, #e6a23c);
  color: white;
}

.status-badge.server-error {
  background: var(--el-color-danger, #f56c6c);
  color: white;
}

.stream-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--el-color-success, #67c23a);
  font-weight: 600;
}

.streaming-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-warning, #e6a23c);
  font-weight: bold;
}

.spin-icon {
  animation: spin 1.4s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* === Subsection (headers) === */
.subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subsection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.subsection h5 {
  margin: 0;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.btn-copy-small {
  padding: 4px 8px;
  background: transparent;
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: all 0.2s;
}

.btn-copy-small:hover {
  background: var(--card-bg);
  opacity: 1;
}

.headers-list {
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  max-height: 240px;
  overflow-y: auto;
}

.header-item {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.header-item:last-child {
  margin-bottom: 0;
}

.header-key {
  color: var(--primary-color);
  font-weight: bold;
}

.header-value {
  color: var(--text-color);
  word-break: break-all;
}

/* === 跳转提示 === */
.tab-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) dashed
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.25));
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 12px;
  line-height: 1.5;
}

.tab-hint strong {
  color: var(--primary-color);
}
</style>
