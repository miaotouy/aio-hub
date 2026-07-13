<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="response-raw-view">
    <!-- 顶部状态条（仅流式响应显示） -->
    <div v-if="isStreamingResponse" class="stream-status-bar">
      <span class="status-indicator" :class="{ active: isStreamingActive }">
        <Circle
          v-if="isStreamingActive"
          :size="8"
          fill="currentColor"
          class="live-dot"
        />
        <CircleCheck v-else :size="13" />
        <span>{{ isStreamingActive ? "实时接收中" : "流式传输已结束" }}</span>
      </span>
      <span class="stream-stats">
        <span class="stat">
          <Hash :size="11" />
          缓冲: <strong>{{ rawContent.length }}</strong> 字符
        </span>
      </span>
    </div>

    <!-- 内容区 -->
    <section v-if="hasContent" class="raw-section">
      <header class="section-header">
        <div class="section-title">
          <FileCode :size="14" />
          <span>响应体</span>
          <span class="size-hint">{{ formatSize(rawContent.length) }}</span>
        </div>
        <div class="header-controls">
          <button
            @click="copyResponseBody"
            class="btn-copy-small"
            title="复制响应体"
          >
            <Copy :size="14" />
          </button>
        </div>
      </header>
      <div class="editor-shell">
        <RichCodeEditor
          :model-value="rawContent"
          :language="bodyLanguage"
          :read-only="true"
          editor-type="codemirror"
        />
      </div>
    </section>

    <!-- 等待响应 -->
    <section v-else-if="!record.response" class="raw-section empty-section">
      <div class="section-title">
        <FileCode :size="14" />
        <span>响应体</span>
      </div>
      <div class="empty-hint">
        <LoaderCircle :size="13" class="spin-icon" />
        <span>等待响应到达...</span>
      </div>
    </section>

    <!-- 空响应 -->
    <section v-else class="raw-section empty-section">
      <div class="section-title">
        <FileCode :size="14" />
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
import { computed } from "vue";
import {
  Circle,
  CircleCheck,
  Copy,
  FileCode,
  Hash,
  Info,
  LoaderCircle,
} from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useRecordDetail } from "../../../composables/useRecordDetail";
import { formatSize, isJson } from "../../../core/utils";
import type { CombinedRecord } from "../../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

const {
  isStreamingActive,
  isStreamingResponse,
  displayResponseBody,
  copyResponseBody,
} = useRecordDetail(props);

// 原始内容（含 SSE 格式化或 JSON 美化）
const rawContent = computed(() => displayResponseBody.value);

const hasContent = computed(() => {
  return Boolean(rawContent.value) || isStreamingActive.value;
});

// 自动检测语言
const bodyLanguage = computed(() => {
  const raw = props.record.response?.body || rawContent.value;
  if (!raw) return "text";
  if (isStreamingResponse.value) return "text"; // SSE 当作普通文本，避免误判
  if (isJson(raw)) return "json";
  return "text";
});
</script>

<style scoped>
.response-raw-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

/* === 流式状态条 === */
.stream-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) solid
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 6px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-light);
}

.status-indicator.active {
  color: var(--el-color-danger, #f56c6c);
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

.stream-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-color-light);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.stat strong {
  color: var(--text-color);
  font-family: "Courier New", monospace;
}

/* === Section === */
.raw-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.size-hint {
  font-size: 11px;
  font-weight: normal;
  color: var(--text-color-light);
  font-family: "Courier New", monospace;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
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

/* === 编辑器壳 === */
.editor-shell {
  flex: 1;
  min-height: 240px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-shell :deep(.rich-code-editor-wrapper) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

/* === 空状态 === */
.empty-section {
  flex: 0 0 auto;
}

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

.spin-icon {
  animation: spin 1.4s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
