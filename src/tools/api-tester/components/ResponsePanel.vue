<template>
  <div class="section response-section">
    <h3>响应结果</h3>
    <div class="response-header">
      <span class="status-badge" :class="getStatusClass(store.lastResponse!.status)">
        {{ store.lastResponse!.status }} {{ store.lastResponse!.statusText }}
      </span>
      <span v-if="store.lastResponse!.isStreaming" class="streaming-badge">
        {{ store.lastResponse!.isStreamComplete ? "✅ 流式完成" : "📡 流式接收中..." }}
      </span>
      <span class="response-time">⏱️ {{ store.lastResponse!.duration }}ms</span>
      <span class="response-timestamp"
        >🕒 {{ formatTimestamp(store.lastResponse!.timestamp) }}</span
      >
      <el-button
        v-if="store.lastResponse!.isStreaming && !store.lastResponse!.isStreamComplete"
        @click="handleAbort"
        type="danger"
        size="small"
        plain
        title="停止接收"
      >
        ⏹️ 停止
      </el-button>
      <el-button
        class="wrap-toggle"
        @click="wrapText = !wrapText"
        :title="wrapText ? '关闭自动换行' : '开启自动换行'"
        size="small"
      >
        {{ wrapText ? "📄 自动换行" : "📜 不换行" }}
      </el-button>
    </div>

    <div v-if="store.lastResponse!.error" class="response-error">
      <strong>❌ 错误:</strong> {{ store.lastResponse!.error }}
    </div>

    <div v-else class="response-body">
      <div v-if="store.lastResponse!.isStreaming" class="stream-info">
        <span>📦 已接收数据块: {{ store.lastResponse!.streamChunks?.length || 0 }}</span>
        <span>📏 总大小: {{ formatSize(store.lastResponse!.body.length) }}</span>
      </div>
      <pre
        :class="{ 'wrap-text': wrapText }"
        ref="responsePreRef"
      ><code>{{ store.lastResponse!.body }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { ElButton } from "element-plus";
import { useApiTesterStore } from "../stores/store";

const store = useApiTesterStore();
const wrapText = ref(false);
const responsePreRef = ref<HTMLPreElement | null>(null);
const autoScroll = ref(true);

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 400 && status < 500) return "status-client-error";
  if (status >= 500) return "status-server-error";
  return "status-unknown";
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("zh-CN");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function handleAbort() {
  store.abortRequest();
}

// 监听流式响应的body变化，自动滚动到底部
watch(
  () => store.lastResponse?.body,
  async () => {
    if (store.lastResponse?.isStreaming && autoScroll.value && responsePreRef.value) {
      await nextTick();
      const container = responsePreRef.value.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }
);
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
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

.status-success {
  background: #49cc90;
  color: white;
}
.status-client-error {
  background: #fca130;
  color: white;
}
.status-server-error {
  background: #f93e3e;
  color: white;
}
.status-unknown {
  background: #999;
  color: white;
}

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
  flex: 1; /* 让其填充剩余空间 */
  min-height: 0; /* 配合 flex: 1 */
  box-sizing: border-box;
}

.response-body pre {
  margin: 0;
  padding: 16px;
  font-family: "Consolas", "Monaco", monospace;
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
  margin-left: auto;
}

.streaming-badge {
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
  background: rgba(64, 158, 255, 0.15);
  color: var(--primary-color);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.stream-info {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: rgba(64, 158, 255, 0.1);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color-light);
  margin: 12px;
}

.stream-info span {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
