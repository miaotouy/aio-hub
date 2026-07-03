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
  <div class="section history-section">
    <div class="section-header">
      <h3>请求历史</h3>
      <el-button
        size="small"
        plain
        type="danger"
        :disabled="store.requestHistory.length === 0"
        @click="clearHistory"
      >
        清空
      </el-button>
    </div>

    <el-empty
      v-if="store.requestHistory.length === 0"
      description="发送请求后会出现在这里"
      :image-size="70"
    />

    <div v-else class="history-list">
      <div
        v-for="item in store.requestHistory"
        :key="item.id"
        class="history-item"
        @click="loadHistory(item.id)"
      >
        <div class="history-main">
          <div class="history-title-row">
            <el-tag
              size="small"
              effect="dark"
              :type="getMethodType(item.method)"
            >
              {{ item.method }}
            </el-tag>
            <span class="history-url">{{ item.url }}</span>
          </div>
          <div class="history-meta">
            <span :class="['history-status', getStatusClass(item.status)]">
              {{ item.status || "ERR" }}
            </span>
            <span>{{ item.duration }}ms</span>
            <span>{{ formatTimestamp(item.timestamp) }}</span>
          </div>
          <p v-if="item.responsePreview" class="history-preview">
            {{ item.responsePreview }}
          </p>
        </div>

        <el-button
          :icon="Delete"
          circle
          text
          type="danger"
          size="small"
          title="删除历史"
          @click.stop="deleteHistory(item.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton, ElEmpty, ElTag } from "element-plus";
import { Delete } from "@element-plus/icons-vue";
import { customMessage } from "@utils/customMessage";
import { useApiTesterStore } from "../stores/store";
import type { HttpMethod } from "../types";

const store = useApiTesterStore();

function loadHistory(historyId: string) {
  store.loadHistoryItem(historyId);
  customMessage.success("已恢复历史请求");
}

function deleteHistory(historyId: string) {
  store.deleteHistoryItem(historyId);
}

function clearHistory() {
  store.clearHistory();
  customMessage.success("请求历史已清空");
}

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 400 && status < 500) return "status-client-error";
  if (status >= 500) return "status-server-error";
  return "status-unknown";
}

function getMethodType(method: HttpMethod) {
  if (method === "GET") return "success";
  if (method === "DELETE") return "danger";
  if (method === "PATCH" || method === "PUT") return "warning";
  return "primary";
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 16px;
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  box-sizing: border-box;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-color);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
  padding-right: 4px;
}

.history-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.history-item:hover {
  border-color: var(--primary-color);
  background: var(--card-bg);
}

.history-main {
  flex: 1;
  min-width: 0;
}

.history-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.history-url {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
}

.history-meta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
  color: var(--text-color-light);
  font-size: 12px;
}

.history-status {
  font-weight: 700;
}

.status-success {
  color: #2f9e67;
}

.status-client-error {
  color: #d97706;
}

.status-server-error {
  color: #dc2626;
}

.status-unknown {
  color: var(--text-color-light);
}

.history-preview {
  margin: 8px 0 0;
  color: var(--text-color-light);
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
