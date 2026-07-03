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
  <div class="request-raw-view">
    <!-- 有请求体 -->
    <section v-if="record.request.body" class="raw-section">
      <header class="section-header">
        <div class="section-title">
          <FileCode :size="14" />
          <span>请求体</span>
          <span class="size-hint">{{
            formatSize(record.request.body.length)
          }}</span>
        </div>
        <button
          @click="copyRequestBody"
          class="btn-copy-small"
          title="复制请求体"
        >
          <Copy :size="14" />
        </button>
      </header>
      <div class="editor-shell">
        <RichCodeEditor
          :model-value="formattedBody"
          :language="bodyLanguage"
          :read-only="true"
          editor-type="codemirror"
        />
      </div>
    </section>

    <!-- 无请求体（非 GET） -->
    <section
      v-else-if="record.request.method !== 'GET'"
      class="raw-section empty-section"
    >
      <div class="section-title">
        <FileCode :size="14" />
        <span>请求体</span>
      </div>
      <div class="empty-hint">
        <Info :size="13" />
        <span>该请求未携带请求体</span>
      </div>
    </section>

    <!-- GET 请求（无请求体是正常的） -->
    <section v-else class="raw-section empty-section">
      <div class="section-title">
        <FileCode :size="14" />
        <span>请求体</span>
      </div>
      <div class="empty-hint">
        <Info :size="13" />
        <span>GET 请求通常不携带请求体</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Copy, FileCode, Info } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useRecordDetail } from "../../../composables/useRecordDetail";
import { useFormattedBody } from "../../../composables/useFormattedBody";
import { isJson, formatSize } from "../../../core/utils";
import type { CombinedRecord } from "../../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

const { copyRequestBody } = useRecordDetail(props);
const { getFormattedJson } = useFormattedBody();

// 缓存后的格式化内容
const formattedBody = computed(() => {
  const raw = props.record.request.body;
  if (!raw) return "";
  if (isJson(raw)) {
    return getFormattedJson(`req_${props.record.id}`, raw);
  }
  return raw;
});

// 自动检测语言
const bodyLanguage = computed(() => {
  const raw = props.record.request.body;
  if (!raw) return "text";
  if (isJson(raw)) return "json";
  return "text";
});
</script>

<style scoped>
.request-raw-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

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
</style>
