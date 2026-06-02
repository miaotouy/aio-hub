<template>
  <div class="records-panel">
    <div class="records-header">
      <ListChecks :size="14" class="header-icon" />
      <h3 class="header-title">捕获记录</h3>
      <span class="record-count">{{ records.length }}</span>
      <span v-if="hasActiveFilter" class="filter-badge" title="存在筛选条件">
        <Filter :size="11" />
      </span>
    </div>

    <!-- 搜索与过滤栏 -->
    <div class="filter-bar">
      <el-input
        :model-value="searchQuery"
        @update:model-value="(val: string) => $emit('update:searchQuery', val)"
        placeholder="搜索 URL 或内容..."
        size="small"
        clearable
        class="search-input"
      >
        <template #prefix>
          <Search :size="13" />
        </template>
      </el-input>

      <el-select
        :model-value="filterStatus"
        @update:model-value="(val: string) => $emit('update:filterStatus', val)"
        class="filter-select"
        size="small"
        placeholder="状态过滤"
      >
        <el-option label="全部状态" value="" />
        <el-option label="2xx 成功" value="2xx" />
        <el-option label="4xx 客户端错误" value="4xx" />
        <el-option label="5xx 服务器错误" value="5xx" />
      </el-select>
    </div>

    <div class="records-list">
      <div
        v-for="record in filteredRecords"
        :key="record.id"
        :class="['record-item', { selected: selectedRecord?.id === record.id }]"
        @click="$emit('select', record)"
      >
        <div class="record-header">
          <!-- 来源徽章（F3）：internal 显示工具名，external 显示「代理」 -->
          <span
            class="source-badge"
            :class="getSourceClass(record)"
            :title="getSourceTooltip(record)"
          >
            <Zap
              v-if="record.source === 'internal'"
              :size="9"
              fill="currentColor"
            />
            <Globe v-else :size="9" />
            <span class="source-text">{{ getSourceLabel(record) }}</span>
          </span>
          <span :class="['method', record.request.method.toLowerCase()]">
            {{ record.request.method }}
          </span>
          <span class="url">{{ formatUrl(record.request.url) }}</span>
          <span :class="['status', getStatusClass(record.response?.status)]">
            {{ record.response?.status || "Pending" }}
          </span>
        </div>
        <div class="record-meta">
          <span class="timestamp">{{
            formatTime(record.request.timestamp)
          }}</span>
          <span class="duration" v-if="record.response">
            {{ record.response.duration_ms }}ms
          </span>
          <span class="size">
            ↑ {{ formatSize(record.request.request_size) }}
            <template v-if="record.response">
              ↓ {{ formatSize(record.response.response_size) }}
            </template>
          </span>
          <!-- 用途标签（仅 internal 有 purpose 时显示） -->
          <span
            v-if="record.inspectorMetadata?.purpose"
            class="purpose-tag"
            :title="`用途: ${record.inspectorMetadata.purpose}`"
          >
            {{ record.inspectorMetadata.purpose }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ListChecks, Filter, Search, Globe, Zap } from "lucide-vue-next";
import type { CombinedRecord } from "../types";

// 属性
const props = defineProps<{
  records: CombinedRecord[];
  selectedRecord: CombinedRecord | null;
  searchQuery: string;
  filterStatus: string;
}>();

// 事件
defineEmits<{
  select: [record: CombinedRecord];
  "update:searchQuery": [value: string];
  "update:filterStatus": [value: string];
}>();

// 计算属性
const hasActiveFilter = computed(
  () => Boolean(props.searchQuery) || Boolean(props.filterStatus)
);

const filteredRecords = computed(() => {
  let filtered = props.records;

  // 按搜索词过滤
  if (props.searchQuery) {
    const query = props.searchQuery.toLowerCase();
    filtered = filtered.filter((record) => {
      return (
        record.request.url.toLowerCase().includes(query) ||
        record.request.body?.toLowerCase().includes(query) ||
        record.response?.body?.toLowerCase().includes(query)
      );
    });
  }

  // 按状态码过滤
  if (props.filterStatus) {
    filtered = filtered.filter((record) => {
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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getStatusClass(status?: number): string {
  if (!status) return "";
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "client-error";
  if (status >= 500) return "server-error";
  return "";
}

// === 来源徽章（F3） ===
function getSourceClass(record: CombinedRecord): string {
  return record.source === "internal" ? "source-internal" : "source-external";
}

function getSourceLabel(record: CombinedRecord): string {
  if (record.source === "internal") {
    return record.inspectorMetadata?.toolName ?? "内部";
  }
  return "代理";
}

function getSourceTooltip(record: CombinedRecord): string {
  if (record.source === "internal") {
    const meta = record.inspectorMetadata;
    const parts: string[] = ["来自前端钩子（内部监控）"];
    if (meta?.toolName) parts.push(`工具: ${meta.toolName}`);
    if (meta?.purpose) parts.push(`用途: ${meta.purpose}`);
    if (meta?.modelId) parts.push(`模型: ${meta.modelId}`);
    return parts.join("\n");
  }
  return "来自外部 HTTP 代理";
}
</script>

<style scoped>
.records-panel {
  background: var(--container-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.records-header {
  padding: 10px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: rgba(0, 0, 0, 0.02);
}

.search-input {
  flex: 1;
}

.search-input :deep(.el-input__wrapper) {
  background: var(--input-bg);
  border-radius: 6px;
  box-shadow: none !important;
  border: var(--border-width) solid var(--border-color);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: var(--primary-color);
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--primary-color);
  box-shadow: none !important;
}

.filter-select {
  width: 110px;
  flex-shrink: 0;
}

.filter-select :deep(.el-select__wrapper) {
  background: var(--input-bg);
  border-radius: 6px;
  min-height: 24px;
  box-shadow: none !important;
  border: var(--border-width) solid var(--border-color);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.filter-select :deep(.el-select__wrapper:hover) {
  border-color: var(--primary-color);
}

.filter-select :deep(.el-select__wrapper.is-focused) {
  border-color: var(--primary-color);
  box-shadow: none !important;
}

.header-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.header-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 0 1 auto;
}

.record-count {
  font-size: 12px;
  color: var(--text-color-light);
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  flex-shrink: 0;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.2)
  );
  color: var(--el-color-warning, #e6a23c);
  flex-shrink: 0;
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
  align-items: center;
  font-size: 12px;
  color: var(--text-color-light);
  flex-wrap: wrap;
}

/* === 来源徽章（F3） === */
.source-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: help;
}

.source-internal {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--primary-color);
  border: 1px solid rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.3));
}

.source-external {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-info, #909399);
  border: 1px solid
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.25));
}

.source-text {
  font-family: "Courier New", monospace;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* === 用途标签 === */
.purpose-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-family: "Courier New", monospace;
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-warning, #e6a23c);
  cursor: help;
}
</style>
