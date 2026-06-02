<template>
  <div class="overview-tab">
    <!-- 请求信息 -->
    <div class="section">
      <h4>请求信息</h4>
      <div class="info-grid">
        <div class="info-item">
          <label>方法：</label>
          <span>{{ record.request.method }}</span>
        </div>
        <div class="info-item">
          <label>URL：</label>
          <span class="url-full">{{ record.request.url }}</span>
        </div>
        <div class="info-item">
          <label>时间：</label>
          <span>{{ new Date(record.request.timestamp).toLocaleString() }}</span>
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

      <div v-if="record.request.body" class="subsection">
        <div class="subsection-header">
          <h5>请求体</h5>
          <button
            @click="copyRequestBody"
            class="btn-copy-small"
            title="复制请求体"
          >
            <Copy :size="14" />
          </button>
        </div>
        <div class="body-content">
          <pre v-if="isJson(record.request.body)">{{
            formatJson(record.request.body)
          }}</pre>
          <pre v-else>{{ record.request.body }}</pre>
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

      <div
        v-if="(record.response && record.response.body) || isStreamingActive"
        class="subsection"
      >
        <div class="subsection-header">
          <h5>响应体</h5>
          <div class="response-controls">
            <span
              v-if="isStreamingResponse"
              class="stream-badge"
              :class="{ active: isStreamingActive }"
            >
              <Circle
                v-if="isStreamingActive"
                :size="8"
                fill="currentColor"
                class="live-dot"
              />
              <Activity v-else :size="12" />
              {{ isStreamingActive ? "实时接收中" : "流式响应" }}
            </span>

            <!-- 显示模式切换 -->
            <div class="view-mode-toggle">
              <button
                @click="viewMode = 'raw'"
                class="mode-btn"
                :class="{ active: viewMode === 'raw' }"
                title="原始格式"
              >
                原始
              </button>
              <button
                @click="viewMode = 'text'"
                class="mode-btn"
                :class="{ active: viewMode === 'text' }"
                title="正文模式"
                v-if="canShowTextMode"
              >
                正文
              </button>
            </div>

            <button
              @click="copyResponseBody"
              class="btn-copy-small"
              title="复制响应体"
            >
              <Copy :size="14" />
            </button>
          </div>
        </div>
        <div class="body-content" :class="{ 'text-mode': viewMode === 'text' }">
          <!-- 原始模式 -->
          <pre v-if="viewMode === 'raw'">{{ displayResponseBody }}</pre>

          <!-- 正文模式 -->
          <div v-else-if="viewMode === 'text'" class="text-content">
            <div v-if="extractedContent" class="extracted-text">
              {{ extractedContent }}
            </div>
            <div v-else class="no-content">无法提取正文内容</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, LoaderCircle, Circle, Activity } from "lucide-vue-next";
import { useRecordDetail } from "../../composables/useRecordDetail";
import type { CombinedRecord } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

const {
  viewMode,
  isStreamingActive,
  isStreamingResponse,
  displayResponseBody,
  canShowTextMode,
  extractedContent,
  copyRequestHeaders,
  copyRequestBody,
  copyResponseHeaders,
  copyResponseBody,
  formatSize,
  getStatusClass,
  isJson,
  formatJson,
} = useRecordDetail(props);
</script>

<style scoped>
.overview-tab {
  /* 让子内容继承上层的 padding 与滚动行为 */
}

.section {
  margin-bottom: 30px;
}

.section h4 {
  margin: 0 0 15px 0;
  color: var(--text-color);
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 5px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  gap: 10px;
  align-items: center;
}

.info-item label {
  color: var(--text-color-light);
}

.info-item span {
  color: var(--text-color);
}

.url-full {
  word-break: break-all;
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

.subsection {
  margin-top: 20px;
}

.subsection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}

.response-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.stream-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--primary-color);
  color: #ffffff;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
}

.stream-badge.active {
  background: var(--el-color-danger, #f56c6c);
}

.live-dot {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.spin-icon {
  animation: spin 1.4s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.view-mode-toggle {
  display: flex;
  gap: 2px;
  background: var(--card-bg);
  border-radius: 4px;
  padding: 2px;
}

.mode-btn {
  padding: 4px 10px;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: var(--container-bg);
}

.mode-btn.active {
  background: var(--primary-color);
  color: #ffffff;
}

.subsection h5 {
  margin: 0;
  color: var(--text-color);
  font-size: 14px;
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
  max-height: 200px;
  overflow-y: auto;
}

.header-item {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
  font-family: "Courier New", monospace;
  font-size: 12px;
}

.header-key {
  color: var(--primary-color);
  font-weight: bold;
}

.header-value {
  color: var(--text-color);
  word-break: break-all;
}

.streaming-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-color-warning, #e6a23c);
  font-weight: bold;
}

.body-content {
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
  max-height: 400px;
  overflow: auto;
}

.body-content pre {
  margin: 0;
  color: var(--text-color);
  font-family: "Courier New", monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.body-content.text-mode {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
}

.text-content {
  padding: 5px;
}

.extracted-text {
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.no-content {
  color: var(--text-color-light);
  font-style: italic;
  text-align: center;
  padding: 20px;
}
</style>
