<template>
  <div class="section response-section">
    <h3>响应结果</h3>
    <div class="response-header">
      <span
        class="status-badge"
        :class="getStatusClass(store.lastResponse!.status)"
      >
        {{ store.lastResponse!.status }} {{ store.lastResponse!.statusText }}
      </span>
      <span class="response-time">⏱️ {{ store.lastResponse!.duration }}ms</span>
      <span class="response-timestamp">🕒 {{ formatTimestamp(store.lastResponse!.timestamp) }}</span>
      <button
        class="wrap-toggle"
        @click="wrapText = !wrapText"
        :title="wrapText ? '关闭自动换行' : '开启自动换行'"
      >
        {{ wrapText ? '📄 自动换行' : '📜 不换行' }}
      </button>
    </div>

    <div v-if="store.lastResponse!.error" class="response-error">
      <strong>❌ 错误:</strong> {{ store.lastResponse!.error }}
    </div>

    <div v-else class="response-body">
      <pre :class="{ 'wrap-text': wrapText }"><code>{{ store.lastResponse!.body }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useApiTesterStore } from '../store';

const store = useApiTesterStore();
const wrapText = ref(false);

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-success';
  if (status >= 400 && status < 500) return 'status-client-error';
  if (status >= 500) return 'status-server-error';
  return 'status-unknown';
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN');
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  height: 100%;
  box-sizing: border-box;
}

.section h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: var(--text-color);
}

.response-header {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.status-badge {
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 14px;
}

.status-success { background: #49cc90; color: white; }
.status-client-error { background: #fca130; color: white; }
.status-server-error { background: #f93e3e; color: white; }
.status-unknown { background: #999; color: white; }

.response-time,
.response-timestamp {
  font-size: 14px;
  color: var(--text-color-light);
}

.response-error {
  padding: 12px;
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid var(--error-color);
  border-radius: 4px;
  color: var(--error-color);
}

.response-body {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: auto;
  height: 86%;
  box-sizing: border-box;
}

.response-body pre {
  margin: 0;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-color);
  white-space: pre;
  overflow-x: auto;
}

.response-body pre.wrap-text {
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: hidden;
}

.response-body code {
  font-family: inherit;
  color: inherit;
}

.wrap-toggle {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;
}

.wrap-toggle:hover {
  background: var(--input-bg);
  border-color: var(--primary-color);
}
</style>