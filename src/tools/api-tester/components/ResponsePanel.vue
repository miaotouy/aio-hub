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
  <div class="section response-section">
    <div class="panel-header">
      <div>
        <h3>响应结果</h3>
        <p class="response-summary">
          {{ formatTimestamp(response.timestamp) }}
        </p>
      </div>
      <div class="header-actions">
        <el-button
          v-if="response.isStreaming && !response.isStreamComplete"
          @click="handleAbort"
          type="danger"
          size="small"
          plain
          :icon="CloseBold"
        >
          停止
        </el-button>
        <el-button
          @click="copyResponseBody"
          size="small"
          :disabled="!response.body"
          :icon="CopyDocument"
        >
          复制 Body
        </el-button>
      </div>
    </div>

    <div class="metrics-row">
      <span class="status-badge" :class="getStatusClass(response.status)">
        {{ response.status }} {{ response.statusText }}
      </span>
      <span class="metric">{{ response.duration }}ms</span>
      <span class="metric">{{
        formatSize(response.size ?? response.body.length)
      }}</span>
      <span v-if="response.isStreaming" class="streaming-badge">
        {{ response.isStreamComplete ? "流式完成" : "流式接收中" }}
      </span>
    </div>

    <div v-if="response.error" class="response-error">
      <strong>错误:</strong> {{ response.error }}
    </div>

    <el-tabs v-else v-model="activeTab" class="response-tabs">
      <el-tab-pane label="Body" name="body">
        <div class="editor-shell">
          <RichCodeEditor
            :model-value="displayBody"
            :language="bodyLanguage"
            :read-only="true"
            editor-type="monaco"
            :options="editorOptions"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="Headers" name="headers">
        <div class="headers-table">
          <div
            v-for="[key, value] in headerEntries"
            :key="key"
            class="header-row"
          >
            <span class="header-key">{{ key }}</span>
            <span class="header-value">{{ value }}</span>
          </div>
          <el-empty
            v-if="headerEntries.length === 0"
            description="没有响应头"
            :image-size="80"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="概览" name="summary">
        <div class="summary-grid">
          <div class="summary-item">
            <span>状态</span>
            <strong>{{ response.status }} {{ response.statusText }}</strong>
          </div>
          <div class="summary-item">
            <span>耗时</span>
            <strong>{{ response.duration }}ms</strong>
          </div>
          <div class="summary-item">
            <span>大小</span>
            <strong>{{
              formatSize(response.size ?? response.body.length)
            }}</strong>
          </div>
          <div class="summary-item">
            <span>Header 数</span>
            <strong>{{ headerEntries.length }}</strong>
          </div>
          <div class="summary-item">
            <span>Content-Type</span>
            <strong>{{ response.headers["content-type"] || "未知" }}</strong>
          </div>
          <div v-if="response.isStreaming" class="summary-item">
            <span>流式块数</span>
            <strong>{{ response.streamChunks?.length || 0 }}</strong>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElEmpty, ElTabPane, ElTabs } from "element-plus";
import { CloseBold, CopyDocument } from "@element-plus/icons-vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@utils/customMessage";
import { useApiTesterStore } from "../stores/store";

const store = useApiTesterStore();
const activeTab = ref("body");

const response = computed(() => store.lastResponse!);
const headerEntries = computed(() => Object.entries(response.value.headers));
const contentType = computed(
  () => response.value.headers["content-type"] || ""
);
const bodyLanguage = computed(() => {
  if (contentType.value.includes("json")) return "json";
  if (contentType.value.includes("xml")) return "xml";
  if (contentType.value.includes("html")) return "html";
  if (contentType.value.includes("yaml")) return "yaml";
  return "text";
});
const displayBody = computed(() => {
  if (bodyLanguage.value !== "json") return response.value.body;

  try {
    return JSON.stringify(JSON.parse(response.value.body), null, 2);
  } catch {
    return response.value.body;
  }
});
const editorOptions = computed(() => ({
  readOnly: true,
  wordWrap: "on" as const,
  minimap: { enabled: false },
}));

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

async function copyResponseBody() {
  try {
    await navigator.clipboard.writeText(response.value.body);
    customMessage.success("响应 Body 已复制");
  } catch {
    customMessage.error("复制失败");
  }
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 16px;
  border: var(--border-width) solid var(--border-color);
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-color);
}

.response-summary {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
}

.header-actions,
.metrics-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.metrics-row {
  margin-bottom: 12px;
}

.status-badge,
.streaming-badge,
.metric {
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.2;
}

.status-badge {
  font-weight: 700;
  color: #fff;
}

.status-success {
  background: #2f9e67;
}

.status-client-error {
  background: #d97706;
}

.status-server-error {
  background: #dc2626;
}

.status-unknown {
  background: #6b7280;
}

.metric {
  color: var(--text-color);
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
}

.streaming-badge {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  border: var(--border-width) solid
    color-mix(in srgb, var(--primary-color) 30%, transparent);
}

.response-error {
  padding: 12px;
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid var(--error-color);
  border-radius: 4px;
  color: var(--error-color);
}

.response-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.response-tabs > .el-tabs__content) {
  flex: 1;
  min-height: 0;
}

:deep(.response-tabs .el-tab-pane) {
  height: 100%;
}

.editor-shell {
  height: 100%;
  min-height: 360px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background: var(--input-bg);
}

.headers-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 100%;
  overflow: auto;
}

.header-row {
  display: grid;
  grid-template-columns: minmax(120px, 220px) 1fr;
  gap: 12px;
  padding: 10px 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.header-key {
  font-weight: 600;
  color: var(--text-color);
  word-break: break-word;
}

.header-value {
  color: var(--text-color-light);
  font-family: "Consolas", "Monaco", monospace;
  word-break: break-all;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.summary-item span {
  color: var(--text-color-light);
  font-size: 12px;
}

.summary-item strong {
  color: var(--text-color);
  font-size: 14px;
  word-break: break-word;
}
</style>
