<template>
  <div class="overview-tab">
    <!-- 请求摘要 -->
    <section class="section">
      <h4>
        <ArrowUpFromLine :size="14" />
        <span>请求摘要</span>
      </h4>
      <div class="info-grid">
        <div class="info-item">
          <label>方法</label>
          <span class="method-badge">{{ record.request.method }}</span>
        </div>
        <div class="info-item">
          <label>大小</label>
          <span>{{ formatSize(record.request.request_size) }}</span>
        </div>
        <div class="info-item full-row">
          <label>URL</label>
          <span class="url-full">{{ record.request.url }}</span>
        </div>
        <div class="info-item full-row">
          <label>时间</label>
          <span>{{ new Date(record.request.timestamp).toLocaleString() }}</span>
        </div>
      </div>

      <div class="subsection">
        <button
          class="collapse-header"
          @click="requestHeadersExpanded = !requestHeadersExpanded"
        >
          <ChevronRight
            :size="14"
            class="collapse-icon"
            :class="{ expanded: requestHeadersExpanded }"
          />
          <span class="collapse-title">
            请求头
            <span class="count-badge">{{ requestHeaderCount }}</span>
          </span>
          <button
            v-if="requestHeadersExpanded"
            @click.stop="copyRequestHeaders"
            class="btn-copy-small"
            title="复制请求头"
          >
            <Copy :size="13" />
          </button>
        </button>
        <div v-if="requestHeadersExpanded" class="headers-list">
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
    </section>

    <!-- 响应摘要 -->
    <section v-if="record.response || isStreamingActive" class="section">
      <h4>
        <ArrowDownToLine :size="14" />
        <span>响应摘要</span>
      </h4>
      <div v-if="record.response" class="info-grid">
        <div class="info-item">
          <label>状态码</label>
          <span
            :class="['status-badge', getStatusClass(record.response.status)]"
          >
            {{ record.response.status }}
          </span>
        </div>
        <div class="info-item">
          <label>耗时</label>
          <span>{{ record.response.duration_ms }}ms</span>
        </div>
        <div class="info-item">
          <label>大小</label>
          <span>{{ formatSize(record.response.response_size) }}</span>
        </div>
        <div class="info-item" v-if="isStreamingResponse">
          <label>流式</label>
          <span class="stream-flag">
            <Activity :size="12" />
            是
          </span>
        </div>
      </div>
      <div v-else-if="isStreamingActive" class="info-grid">
        <div class="info-item">
          <label>状态</label>
          <span class="streaming-status">
            <LoaderCircle :size="13" class="spin-icon" />
            接收中...
          </span>
        </div>
      </div>

      <div class="subsection" v-if="record.response">
        <button
          class="collapse-header"
          @click="responseHeadersExpanded = !responseHeadersExpanded"
        >
          <ChevronRight
            :size="14"
            class="collapse-icon"
            :class="{ expanded: responseHeadersExpanded }"
          />
          <span class="collapse-title">
            响应头
            <span class="count-badge">{{ responseHeaderCount }}</span>
          </span>
          <button
            v-if="responseHeadersExpanded"
            @click.stop="copyResponseHeaders"
            class="btn-copy-small"
            title="复制响应头"
          >
            <Copy :size="13" />
          </button>
        </button>
        <div v-if="responseHeadersExpanded" class="headers-list">
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
    </section>

    <!-- Inspector 元数据（仅 internal 来源） -->
    <section v-if="hasInspectorMetadata" class="section">
      <h4>
        <Sparkles :size="14" />
        <span>Inspector 元数据</span>
        <span class="source-badge" :class="record.source">
          {{ record.source === "internal" ? "内部" : "外部" }}
        </span>
      </h4>
      <div class="info-grid">
        <div v-if="record.inspectorMetadata?.toolName" class="info-item">
          <label>工具</label>
          <span class="meta-value">{{
            record.inspectorMetadata.toolName
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.purpose" class="info-item">
          <label>用途</label>
          <span class="meta-value">{{ record.inspectorMetadata.purpose }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.profileId" class="info-item">
          <label>Profile ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.profileId
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.modelId" class="info-item">
          <label>Model ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.modelId
          }}</span>
        </div>
        <div v-if="record.inspectorMetadata?.sessionId" class="info-item">
          <label>Session ID</label>
          <span class="meta-value mono">{{
            record.inspectorMetadata.sessionId
          }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Copy,
  LoaderCircle,
  Sparkles,
} from "lucide-vue-next";
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

// 折叠状态（默认折叠）
const requestHeadersExpanded = ref(false);
const responseHeadersExpanded = ref(false);

// Header 数量
const requestHeaderCount = computed(
  () => Object.keys(props.record.request.headers || {}).length
);
const responseHeaderCount = computed(
  () => Object.keys(props.record.response?.headers || {}).length
);

// 是否有 Inspector 元数据
const hasInspectorMetadata = computed(() => {
  const meta = props.record.inspectorMetadata;
  if (!meta) return false;
  return Boolean(
    meta.toolName ||
    meta.purpose ||
    meta.profileId ||
    meta.modelId ||
    meta.sessionId
  );
});
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
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 600;
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 6px;
}

.source-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.source-badge.internal {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--primary-color);
  border: var(--border-width) solid
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.3));
}

.source-badge.external {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-info, #909399);
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
  min-width: 60px;
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

.meta-value {
  color: var(--text-color);
}

.meta-value.mono {
  font-family: "Courier New", monospace;
  font-size: 12px;
  word-break: break-all;
}

/* === 折叠头部 === */
.subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color);
  text-align: left;
  transition: all 0.2s;
}

.collapse-header:hover {
  border-color: var(--primary-color);
}

.collapse-icon {
  color: var(--text-color-light);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.collapse-icon.expanded {
  transform: rotate(90deg);
}

.collapse-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.count-badge {
  padding: 0 6px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--primary-color);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  font-family: "Courier New", monospace;
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
  background: var(--container-bg);
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
</style>
