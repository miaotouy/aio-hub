<template>
  <div class="raw-tab">
    <!-- 请求体 -->
    <section v-if="record.request.body" class="raw-section">
      <header class="section-header">
        <div class="section-title">
          <ArrowUpFromLine :size="14" />
          <span>请求体</span>
        </div>
        <button
          @click="copyRequestBody"
          class="btn-copy-small"
          title="复制请求体"
        >
          <Copy :size="14" />
        </button>
      </header>
      <div class="body-content">
        <pre v-if="isJson(record.request.body)">{{
          formatJson(record.request.body)
        }}</pre>
        <pre v-else>{{ record.request.body }}</pre>
      </div>
    </section>

    <section
      v-else-if="record.request.method !== 'GET'"
      class="raw-section empty-section"
    >
      <div class="section-title">
        <ArrowUpFromLine :size="14" />
        <span>请求体</span>
      </div>
      <div class="empty-hint">
        <Info :size="13" />
        <span>该请求未携带请求体</span>
      </div>
    </section>

    <!-- 响应体 -->
    <section
      v-if="(record.response && record.response.body) || isStreamingActive"
      class="raw-section"
    >
      <header class="section-header">
        <div class="section-title">
          <ArrowDownToLine :size="14" />
          <span>响应体</span>
        </div>
        <div class="header-controls">
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
              v-if="canShowTextMode"
              @click="viewMode = 'text'"
              class="mode-btn"
              :class="{ active: viewMode === 'text' }"
              title="正文模式"
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
      </header>
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
    </section>

    <section v-else-if="!record.response" class="raw-section empty-section">
      <div class="section-title">
        <ArrowDownToLine :size="14" />
        <span>响应体</span>
      </div>
      <div class="empty-hint">
        <LoaderCircle :size="13" class="spin-icon" />
        <span>等待响应到达...</span>
      </div>
    </section>

    <section v-else class="raw-section empty-section">
      <div class="section-title">
        <ArrowDownToLine :size="14" />
        <span>响应体</span>
      </div>
      <div class="empty-hint">
        <Info :size="13" />
        <span>该响应无内容（如 204 No Content）</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Circle,
  Copy,
  Info,
  LoaderCircle,
} from "lucide-vue-next";
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
  copyRequestBody,
  copyResponseBody,
  isJson,
  formatJson,
} = useRecordDetail(props);
</script>

<style scoped>
.raw-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === Sections === */
.raw-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* === 流式徽章 === */
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

/* === 视图模式切换 === */
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

/* === 复制按钮 === */
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

/* === Body 内容 === */
.body-content {
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
  max-height: 500px;
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

/* === 空状态 === */
.empty-section .empty-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) dashed
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 13px;
}
</style>
