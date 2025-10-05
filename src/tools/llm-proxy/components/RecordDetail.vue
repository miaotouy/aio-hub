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
          <button @click="copyAll" class="btn-copy" title="复制全部">
            📋 复制全部
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
            <button @click="copyRequestHeaders" class="btn-copy-small" title="复制请求头">
              📋
            </button>
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
            <button @click="copyRequestBody" class="btn-copy-small" title="复制请求体">
              📋
            </button>
          </div>
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
          <div class="subsection-header">
            <h5>响应头</h5>
            <button @click="copyResponseHeaders" class="btn-copy-small" title="复制响应头">
              📋
            </button>
          </div>
          <div class="headers-list">
            <div v-for="(value, key) in record.response.headers" :key="key" class="header-item">
              <span class="header-key">{{ key }}:</span>
              <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </div>
        
        <div v-if="record.response.body" class="subsection">
          <div class="subsection-header">
            <h5>响应体</h5>
            <button @click="copyResponseBody" class="btn-copy-small" title="复制响应体">
              📋
            </button>
          </div>
          <div class="body-content">
            <pre v-if="isJson(record.response.body)">{{ formatJson(record.response.body) }}</pre>
            <pre v-else>{{ record.response.body }}</pre>
          </div>
        </div>
      </div>
    </div>
    </template>
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
const props = defineProps<{
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

// 复制功能
async function copyToClipboard(text: string, message: string = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    // 简单的提示，可以后续改为更优雅的 toast
    console.log(message);
  } catch (err) {
    console.error('复制失败:', err);
  }
}

function copyRequestHeaders() {
  if (!props.record) return;
  const headers = Object.entries(props.record.request.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  copyToClipboard(headers, '请求头已复制');
}

function copyRequestBody() {
  if (!props.record?.request.body) return;
  const body = isJson(props.record.request.body)
    ? formatJson(props.record.request.body)
    : props.record.request.body;
  copyToClipboard(body, '请求体已复制');
}

function copyResponseHeaders() {
  if (!props.record?.response) return;
  const headers = Object.entries(props.record.response.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  copyToClipboard(headers, '响应头已复制');
}

function copyResponseBody() {
  if (!props.record?.response?.body) return;
  const body = isJson(props.record.response.body)
    ? formatJson(props.record.response.body)
    : props.record.response.body;
  copyToClipboard(body, '响应体已复制');
}

function copyAll() {
  if (!props.record) return;
  
  let fullText = '=== 请求信息 ===\n';
  fullText += `方法: ${props.record.request.method}\n`;
  fullText += `URL: ${props.record.request.url}\n`;
  fullText += `时间: ${new Date(props.record.request.timestamp).toLocaleString()}\n\n`;
  
  fullText += '--- 请求头 ---\n';
  fullText += Object.entries(props.record.request.headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  fullText += '\n\n';
  
  if (props.record.request.body) {
    fullText += '--- 请求体 ---\n';
    fullText += isJson(props.record.request.body)
      ? formatJson(props.record.request.body)
      : props.record.request.body;
    fullText += '\n\n';
  }
  
  if (props.record.response) {
    fullText += '=== 响应信息 ===\n';
    fullText += `状态码: ${props.record.response.status}\n`;
    fullText += `耗时: ${props.record.response.duration_ms}ms\n`;
    fullText += `大小: ${formatSize(props.record.response.response_size)}\n\n`;
    
    fullText += '--- 响应头 ---\n';
    fullText += Object.entries(props.record.response.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    fullText += '\n\n';
    
    if (props.record.response.body) {
      fullText += '--- 响应体 ---\n';
      fullText += isJson(props.record.response.body)
        ? formatJson(props.record.response.body)
        : props.record.response.body;
    }
  }
  
  copyToClipboard(fullText, '完整信息已复制');
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

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-copy {
  padding: 6px 12px;
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #cccccc);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background 0.2s;
}

.btn-copy:hover {
  background: var(--vscode-button-secondaryHoverBackground, #45494e);
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

.subsection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.subsection h5 {
  margin: 0;
  color: var(--vscode-foreground, #cccccc);
  font-size: 14px;
}

.btn-copy-small {
  padding: 4px 8px;
  background: transparent;
  color: var(--vscode-foreground, #cccccc);
  border: 1px solid var(--vscode-panel-border, #2b2b2b);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.7;
  transition: all 0.2s;
}

.btn-copy-small:hover {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  opacity: 1;
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

/* 空状态样式 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--vscode-descriptionForeground, #8b8b8b);
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
  color: var(--vscode-foreground, #cccccc);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--vscode-descriptionForeground, #8b8b8b);
}
</style>