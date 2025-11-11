<template>
  <div class="detail-panel">
    <!-- 无记录时的空状态 -->
    <div v-if="!record" class="empty-state">
      <div class="empty-icon">📋</div>
      <div class="empty-text">选择一条记录查看详情</div>
      <div class="empty-hint">点击左侧列表中的任意请求记录</div>
    </div>

    <!-- 有记录时显示详情 -->
    <template v-else>
      <div class="detail-header">
        <h3>请求详情</h3>
        <div class="header-actions">
          <button @click="copyAll" class="btn-copy" :title="maskApiKeys ? '复制全部（API Key将被打码）' : '复制全部'">
            📋 复制全部
            <span v-if="maskApiKeys" class="mask-indicator">🔒</span>
          </button>
          <button @click="$emit('close')" class="btn-close">×</button>
        </div>
      </div>

      <div class="detail-content">
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
              <button @click="copyRequestHeaders" class="btn-copy-small" title="复制请求头">📋</button>
            </div>
            <div class="headers-list">
              <div v-for="(value, key) in record.request.headers" :key="key" class="header-item">
                <span class="header-key">{{ key }}:</span>
                <span class="header-value">{{ value }}</span>
              </div>
            </div>
          </div>

          <div v-if="record.request.body" class="subsection">
            <div class="subsection-header">
              <h5>请求体</h5>
              <button @click="copyRequestBody" class="btn-copy-small" title="复制请求体">📋</button>
            </div>
            <div class="body-content">
              <pre v-if="isJson(record.request.body)">{{ formatJson(record.request.body) }}</pre>
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
              <span :class="['status-badge', getStatusClass(record.response.status)]">
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
              <span class="streaming-status">⏳ 接收中...</span>
            </div>
          </div>

          <div class="subsection" v-if="record.response">
            <div class="subsection-header">
              <h5>响应头</h5>
              <button @click="copyResponseHeaders" class="btn-copy-small" title="复制响应头">📋</button>
            </div>
            <div class="headers-list">
              <div v-for="(value, key) in record.response.headers" :key="key" class="header-item">
                <span class="header-key">{{ key }}:</span>
                <span class="header-value">{{ value }}</span>
              </div>
            </div>
          </div>

          <div v-if="(record.response && record.response.body) || isStreamingActive" class="subsection">
            <div class="subsection-header">
              <h5>响应体</h5>
              <div class="response-controls">
                <span v-if="isStreamingResponse" class="stream-badge" :class="{ active: isStreamingActive }">
                  {{ isStreamingActive ? '🔴 实时接收中' : '🔄 流式响应' }}
                </span>

                <!-- 显示模式切换 -->
                <div class="view-mode-toggle">
                  <button @click="viewMode = 'raw'" class="mode-btn" :class="{ active: viewMode === 'raw' }" title="原始格式">
                    原始
                  </button>
                  <button @click="viewMode = 'text'" class="mode-btn" :class="{ active: viewMode === 'text' }" title="正文模式" v-if="canShowTextMode">
                    正文
                  </button>
                </div>

                <button @click="copyResponseBody" class="btn-copy-small" title="复制响应体">📋</button>
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
                <div v-else class="no-content">
                  无法提取正文内容
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useRecordDetail } from '../composables/useRecordDetail';
import type { CombinedRecord } from '../types';

// Props
const props = defineProps<{
  record: CombinedRecord | null;
  maskApiKeys?: boolean;
}>();

// Emits
defineEmits<{
  'close': [];
}>();

// 使用详情管理器
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
  copyAll,
  formatSize,
  getStatusClass,
  isJson,
  formatJson,
} = useRecordDetail(props);
</script>

<style scoped>
.detail-panel {
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.detail-header {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header h3 {
  margin: 0;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-copy {
  padding: 6px 12px;
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background 0.2s;
}

.btn-copy:hover {
  background: var(--container-bg);
  border-color: var(--border-color-light);
}

.mask-indicator {
  font-size: 10px;
  margin-left: 2px;
}

.btn-close {
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  color: var(--text-color);
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-close:hover {
  background: var(--card-bg);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.section {
  margin-bottom: 30px;
}

.section h4 {
  margin: 0 0 15px 0;
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
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
  background: var(--primary-color);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
}

.stream-badge.active {
  background: var(--error-color);
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
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
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.7;
  transition: all 0.2s;
}

.btn-copy-small:hover {
  background: var(--card-bg);
  opacity: 1;
}

.headers-list {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.header-item {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
  font-family: 'Courier New', monospace;
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
  color: var(--el-color-warning, #e6a23c);
  font-weight: bold;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.body-content {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
  max-height: 400px;
  overflow: auto;
}

.body-content pre {
  margin: 0;
  color: var(--text-color);
  font-family: 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.body-content.text-mode {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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

/* 空状态样式 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  padding: 40px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-color-light);
}
</style>