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

          <div v-if="(record.response && record.response.body) || isStreamingActive" class="subsection">
            <div class="subsection-header">
              <h5>响应体</h5>
              <div class="response-controls">
                <span v-if="isStreamingResponse" class="stream-badge" :class="{ active: isStreamingActive }">
                  {{ isStreamingActive ? '🔴 实时接收中' : '🔄 流式响应' }}
                </span>

                <!-- 显示模式切换 -->
                <div class="view-mode-toggle">
                  <button @click="viewMode = 'raw'" class="mode-btn" :class="{ active: viewMode === 'raw' }"
                    title="原始格式">
                    原始
                  </button>
                  <button @click="viewMode = 'text'" class="mode-btn" :class="{ active: viewMode === 'text' }"
                    title="正文模式" v-if="canShowTextMode">
                    正文
                  </button>
                </div>

                <button @click="copyResponseBody" class="btn-copy-small" title="复制响应体">
                  📋
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
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { listen } from '@tauri-apps/api/event';

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

interface StreamUpdate {
  id: string;
  chunk: string;
  is_complete: boolean;
}

// Props
const props = defineProps<{
  record: CombinedRecord | null;
  maskApiKeys?: boolean;
}>();

// Emits
defineEmits<{
  'close': [];
}>();

// 响应式状态
const viewMode = ref<'raw' | 'text'>('raw');
const streamingBuffer = ref<Map<string, string>>(new Map());
const isStreamingActive = ref(false);
const activeStreamId = ref<string | null>(null);

// 事件监听器
let unlistenStreamUpdate: (() => void) | null = null;

// 计算属性：检查是否是流式响应
const isStreamingResponse = computed(() => {
  // 如果正在流式传输，认为是流式响应
  if (isStreamingActive.value) return true;

  // 检查响应头
  if (!props.record?.response?.headers) return false;
  const contentType = props.record.response.headers['content-type'] ||
    props.record.response.headers['Content-Type'] || '';
  return contentType.includes('text/event-stream');
});

// 计算属性：显示的响应体内容
const displayResponseBody = computed(() => {
  if (!props.record) return '';

  // 如果有流式缓冲内容，优先显示
  const bufferedContent = streamingBuffer.value.get(props.record.id);
  if (bufferedContent) {
    return isStreamingResponse.value
      ? formatStreamingResponse(bufferedContent)
      : isJson(bufferedContent)
        ? formatJson(bufferedContent)
        : bufferedContent;
  }

  // 否则显示原始响应体
  const body = props.record.response?.body || '';
  return isStreamingResponse.value
    ? formatStreamingResponse(body)
    : isJson(body)
      ? formatJson(body)
      : body;
});

// 计算属性：是否可以显示正文模式
const canShowTextMode = computed(() => {
  // 如果正在流式传输，始终允许显示正文模式
  if (isStreamingActive.value) return true;

  if (!props.record?.response?.body && !streamingBuffer.value.get(props.record?.id || '')) {
    return false;
  }

  // 检查是否是流式响应或JSON响应
  return isStreamingResponse.value || isJson(props.record?.response?.body || '');
});

// 计算属性：提取的正文内容
const extractedContent = computed(() => {
  if (!props.record) return '';

  const body = streamingBuffer.value.get(props.record.id) || props.record.response?.body || '';

  // 如果是流式响应，提取content字段
  if (isStreamingResponse.value) {
    const contents: string[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);

            // OpenAI格式
            if (parsed.choices?.[0]?.delta?.content) {
              contents.push(parsed.choices[0].delta.content);
            }
            // Claude格式
            else if (parsed.delta?.text) {
              contents.push(parsed.delta.text);
            }
            // 通用格式
            else if (parsed.content) {
              contents.push(parsed.content);
            }
            // Gemini格式
            else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
              contents.push(parsed.candidates[0].content.parts[0].text);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return contents.join('');
  }

  // 如果是JSON响应，尝试提取message或content字段
  if (isJson(body)) {
    try {
      const parsed = JSON.parse(body);

      // OpenAI格式
      if (parsed.choices?.[0]?.message?.content) {
        return parsed.choices[0].message.content;
      }
      // Claude格式
      if (parsed.content?.[0]?.text) {
        return parsed.content[0].text;
      }
      // 通用格式
      if (parsed.message) {
        return parsed.message;
      }
      if (parsed.content && typeof parsed.content === 'string') {
        return parsed.content;
      }
      // Gemini格式
      if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
        return parsed.candidates[0].content.parts[0].text;
      }
    } catch {
      // 忽略解析错误
    }
  }

  return body;
});

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

// 格式化流式响应（SSE格式）
function formatStreamingResponse(str: string): string {
  if (!str) return '';

  // 分割SSE事件
  const events = str.split(/\n\n/);
  let formatted = '';

  events.forEach((event, index) => {
    if (!event.trim()) return;

    const lines = event.split('\n');
    let eventData = '';

    lines.forEach(line => {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);

        // 尝试格式化JSON数据
        if (data.trim() && data.trim() !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            eventData += `data: ${JSON.stringify(parsed, null, 2)}\n`;
          } catch {
            eventData += `${line}\n`;
          }
        } else {
          eventData += `${line}\n`;
        }
      } else {
        eventData += `${line}\n`;
      }
    });

    if (eventData) {
      formatted += eventData;
      if (index < events.length - 1) {
        formatted += '\n';
      }
    }
  });

  return formatted || str;
}

// API Key 打码功能
function maskSensitiveData(text: string): string {
  if (!props.maskApiKeys) return text;

  // 常见的 API Key 模式
  const patterns = [
    // Authorization header: Bearer token, API Key, etc.
    /(?<=Authorization:\s*)(Bearer\s+)?[\w-]{20,}/gi,
    /(?<=X-API-Key:\s*)[\w-]{20,}/gi,
    /(?<=API-Key:\s*)[\w-]{20,}/gi,
    /(?<=x-api-key:\s*)[\w-]{20,}/gi,

    // OpenAI API Key
    /(?<=api[_-]?key["']?\s*[:=]\s*["']?)sk-[\w-]{40,}/gi,
    /\bsk-[\w-]{40,}\b/g,

    // Anthropic API Key
    /(?<=x-api-key:\s*)sk-ant-[\w-]{40,}/gi,
    /\bsk-ant-[\w-]{40,}\b/g,

    // Google/Gemini API Key
    /(?<=key[\"']?\s*[:=]\s*[\"']?)AIza[\w-]{35}/gi,
    /\bAIza[\w-]{35}\b/g,

    // Generic API keys in JSON
    /(?<="api[_-]?key"\s*:\s*")[^"]{20,}(?=")/gi,
    /(?<='api[_-]?key'\s*:\s*')[^']{20,}(?=')/gi,
  ];

  let maskedText = text;
  patterns.forEach(pattern => {
    maskedText = maskedText.replace(pattern, (match) => {
      // 保留前6个字符，其余用星号替换
      if (match.length <= 10) return match;
      const prefix = match.substring(0, 6);
      const suffix = match.length > 15 ? match.substring(match.length - 4) : '';
      const stars = '*'.repeat(Math.min(20, match.length - prefix.length - suffix.length));
      return `${prefix}${stars}${suffix}`;
    });
  });

  return maskedText;
}

// 复制功能
async function copyToClipboard(text: string, message: string = '已复制到剪贴板') {
  try {
    const textToCopy = maskSensitiveData(text);
    await navigator.clipboard.writeText(textToCopy);
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
  copyToClipboard(headers, props.maskApiKeys ? '请求头已复制（API Key已打码）' : '请求头已复制');
}

function copyRequestBody() {
  if (!props.record?.request.body) return;
  const body = isJson(props.record.request.body)
    ? formatJson(props.record.request.body)
    : props.record.request.body;
  copyToClipboard(body, props.maskApiKeys ? '请求体已复制（API Key已打码）' : '请求体已复制');
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

    const responseBody = streamingBuffer.value.get(props.record.id) || props.record.response.body;
    if (responseBody) {
      fullText += '--- 响应体 ---\n';
      fullText += isJson(responseBody)
        ? formatJson(responseBody)
        : responseBody;
    }
  }

  copyToClipboard(fullText, props.maskApiKeys ? '完整信息已复制（API Key已打码）' : '完整信息已复制');
}

// 监听记录变化，重置视图模式
watch(() => props.record?.id, (newId, oldId) => {
  if (newId !== oldId) {
    viewMode.value = 'raw';

    // 检查是否是正在流式传输的记录
    if (newId && newId === activeStreamId.value) {
      isStreamingActive.value = true;
    } else {
      isStreamingActive.value = false;
    }
  }
});

// 设置流式更新监听器
async function setupStreamListener() {
  try {
    unlistenStreamUpdate = await listen('proxy-stream-update', (event) => {
      const update = event.payload as StreamUpdate;

      console.log('收到流式更新事件:', update.id, '当前记录:', props.record?.id, '完成状态:', update.is_complete);

      // 更新缓冲区
      if (update.chunk) {
        const currentContent = streamingBuffer.value.get(update.id) || '';
        streamingBuffer.value.set(update.id, currentContent + update.chunk);
      }

      // 如果当前显示的就是这个记录，更新状态
      if (props.record?.id === update.id) {
        console.log('更新流式状态 - ID匹配:', update.id);
        isStreamingActive.value = !update.is_complete;
        if (!update.is_complete) {
          activeStreamId.value = update.id;
        } else if (activeStreamId.value === update.id) {
          activeStreamId.value = null;
          console.log('流式传输完成:', update.id);
        }
      }

      // 跟踪活动的流式ID
      if (!update.is_complete) {
        activeStreamId.value = update.id;
        // 如果这是一个新的流式响应，且是当前记录，立即激活流式状态
        if (props.record?.id === update.id && !isStreamingActive.value) {
          isStreamingActive.value = true;
          console.log('激活流式状态 for:', update.id);
        }
      }

      // 如果传输完成，将缓冲内容更新到记录中
      if (update.is_complete && props.record?.id === update.id && props.record.response) {
        props.record.response.body = streamingBuffer.value.get(update.id) || props.record.response.body;
      }
    });
  } catch (error) {
    console.error('设置流式监听器失败:', error);
  }
}

// 生命周期
onMounted(() => {
  setupStreamListener();
});

onUnmounted(() => {
  if (unlistenStreamUpdate) {
    unlistenStreamUpdate();
    unlistenStreamUpdate = null;
  }
});
</script>

<style scoped>
.detail-panel {
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

  0%,
  100% {
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

  0%,
  100% {
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