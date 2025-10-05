<template>
  <div v-if="record" class="detail-panel">
    <div class="detail-header">
      <h3>请求详情</h3>
      <button @click="$emit('close')" class="btn-close">×</button>
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
          <h5>请求头</h5>
          <div class="headers-list">
            <div v-for="(value, key) in record.request.headers" :key="key" class="header-item">
              <span class="header-key">{{ key }}:</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </div>
        
        <div v-if="record.request.body" class="subsection">
          <h5>请求体</h5>
          <div class="body-content">
            <pre v-if="isJson(record.request.body)">{{ formatJson(record.request.body) }}</pre>
            <pre v-else>{{ record.request.body }}</pre>
          </div>
        </div>
      </div>

      <!-- 响应信息 -->
      <div v-if="record.response" class="section">
        <h4>响应信息</h4>
        <div class="info-grid">
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
        
        <div class="subsection">
          <h5>响应头</h5>
          <div class="headers-list">
            <div v-for="(value, key) in record.response.headers" :key="key" class="header-item">
              <span class="header-key">{{ key }}:</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </div>
        
        <div v-if="record.response.body" class="subsection">
          <h5>响应体</h5>
          <div class="body-content">
            <pre v-if="isJson(record.response.body)">{{ formatJson(record.response.body) }}</pre>
            <pre v-else>{{ record.response.body }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 类型定义
interface RequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  request_size: number;
}

interface ResponseRecord {
  id: string;
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body?: string;
  response_size: number;
  duration_ms: number;
}

interface CombinedRecord {
  id: string;
  request: RequestRecord;
  response?: ResponseRecord;
}

// Props
defineProps<{
  record: CombinedRecord | null;
}>();

// Emits
defineEmits<{
  'close': [];
}>();

// 工具函数
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusClass(status?: number): string {
  if (!status) return '';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return '';
}

function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
</script>

<style scoped>
.detail-panel {
  background: var(--vscode-editor-background, #1e1e1e);
  border: 1px solid var(--vscode-panel-border, #2b2b2b);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  padding: 15px;
  border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header h3 {
  margin: 0;
  color: var(--vscode-foreground, #cccccc);
}

.btn-close {
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  color: var(--vscode-foreground, #cccccc);
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
  background: var(--vscode-toolbar-hoverBackground, #5a5d5e);
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
  color: var(--vscode-foreground, #cccccc);
  border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
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
  color: var(--vscode-descriptionForeground, #8b8b8b);
}

.info-item span {
  color: var(--vscode-foreground, #cccccc);
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
  background: #28a745;
  color: white;
}

.status-badge.client-error {
  background: #ffc107;
  color: #333;
}

.status-badge.server-error {
  background: #dc3545;
  color: white;
}

.subsection {
  margin-top: 20px;
}

.subsection h5 {
  margin: 0 0 10px 0;
  color: var(--vscode-foreground, #cccccc);
  font-size: 14px;
}

.headers-list {
  background: var(--vscode-textCodeBlock-background, #0a0a0a);
  border: 1px solid var(--vscode-panel-border, #2b2b2b);
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
  color: var(--vscode-symbolIcon-variableForeground, #75beff);
  font-weight: bold;
}

.header-value {
  color: var(--vscode-foreground, #cccccc);
  word-break: break-all;
}

.body-content {
  background: var(--vscode-textCodeBlock-background, #0a0a0a);
  border: 1px solid var(--vscode-panel-border, #2b2b2b);
  border-radius: 4px;
  padding: 15px;
  max-height: 400px;
  overflow: auto;
}

.body-content pre {
  margin: 0;
  color: var(--vscode-foreground, #cccccc);
  font-family: 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>