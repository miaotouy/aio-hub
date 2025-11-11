<template>
  <div class="records-panel">
    <div class="records-header">
      <h3>捕获记录 ({{ records.length }})</h3>
      <div class="filter-controls">
        <input
          :value="searchQuery"
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          type="text"
          placeholder="搜索URL或内容..."
          class="search-input"
        />
        <select
          :value="filterStatus"
          @change="$emit('update:filterStatus', ($event.target as HTMLSelectElement).value)"
          class="filter-select"
        >
          <option value="">全部状态</option>
          <option value="2xx">成功 (2xx)</option>
          <option value="4xx">客户端错误 (4xx)</option>
          <option value="5xx">服务器错误 (5xx)</option>
        </select>
      </div>
    </div>

    <div class="records-list">
      <div 
        v-for="record in filteredRecords" 
        :key="record.id"
        :class="['record-item', { 'selected': selectedRecord?.id === record.id }]"
        @click="$emit('select', record)"
      >
        <div class="record-header">
          <span :class="['method', record.request.method.toLowerCase()]">
            {{ record.request.method }}
          </span>
          <span class="url">{{ formatUrl(record.request.url) }}</span>
          <span :class="['status', getStatusClass(record.response?.status)]">
            {{ record.response?.status || 'Pending' }}
          </span>
        </div>
        <div class="record-meta">
          <span class="timestamp">{{ formatTime(record.request.timestamp) }}</span>
          <span class="duration" v-if="record.response">
            {{ record.response.duration_ms }}ms
          </span>
          <span class="size">
            ↑ {{ formatSize(record.request.request_size) }} 
            <template v-if="record.response">
              ↓ {{ formatSize(record.response.response_size) }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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
  records: CombinedRecord[];
  selectedRecord: CombinedRecord | null;
  searchQuery: string;
  filterStatus: string;
}>();

// Emits
defineEmits<{
  'update:searchQuery': [value: string];
  'update:filterStatus': [value: string];
  'select': [record: CombinedRecord];
}>();

// 计算属性
const filteredRecords = computed(() => {
  let filtered = props.records;
  
  // 按搜索词过滤
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase();
    filtered = filtered.filter(record => {
      return record.request.url.toLowerCase().includes(query) ||
             record.request.body?.toLowerCase().includes(query) ||
             record.response?.body?.toLowerCase().includes(query);
    });
  }
  
  // 按状态码过滤
  if (props.filterStatus) {
    filtered = filtered.filter(record => {
      if (!record.response) return false;
      const status = record.response.status.toString();
      return status.startsWith(props.filterStatus[0]);
    });
  }
  
  // 按时间倒序排列
  return filtered.sort((a, b) => b.request.timestamp - a.request.timestamp);
});

// 工具函数
function formatUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

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
</script>

<style scoped>
.records-panel {
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.records-header {
  padding: 15px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.records-header h3 {
  margin: 0;
  color: var(--text-color);
}

.filter-controls {
  display: flex;
  gap: 10px;
}

.search-input,
.filter-select {
  padding: 6px 10px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
}

.records-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.record-item {
  background: var(--card-bg);
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.record-item:hover {
  background: var(--container-bg);
  border-color: var(--border-color-light);
}

.record-item.selected {
  background: var(--primary-color);
  background: rgba(64, 158, 255, 0.1);
  border-color: var(--primary-color);
}

.record-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}

.method {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.method.get {
  background: var(--el-color-success, #67c23a);
  color: white;
}

.method.post {
  background: var(--el-color-info, #909399);
  color: white;
}

.method.put {
  background: var(--el-color-warning, #e6a23c);
  color: white;
}

.method.delete {
  background: var(--el-color-danger, #f56c6c);
  color: white;
}

.method.patch {
  background: var(--primary-color);
  color: white;
}

.url {
  flex: 1;
  color: var(--primary-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

.status.success {
  background: var(--el-color-success, #67c23a);
  color: white;
}

.status.client-error {
  background: var(--el-color-warning, #e6a23c);
  color: white;
}

.status.server-error {
  background: var(--el-color-danger, #f56c6c);
  color: white;
}

.record-meta {
  display: flex;
  gap: 15px;
  font-size: 12px;
  color: var(--text-color-light);
}
</style>