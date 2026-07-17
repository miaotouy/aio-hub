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
  <BaseDialog
    v-model="visible"
    :title="result?.entry.key || '条目详情'"
    width="800px"
    height="70vh"
  >
    <div v-if="result" class="detail-content custom-scrollbar">
      <div class="detail-header">
        <div class="meta-info">
          <div class="meta-item">
            <span class="label">匹配分值:</span>
            <span class="value score"
              >{{ (result.score * 100).toFixed(2) }}%</span
            >
          </div>
          <div class="meta-item">
            <span class="label">思绪集:</span>
            <span class="value">{{ result.recallName }} ({{ result.recallId }})</span>
          </div>
          <div class="meta-item">
            <span class="label">条目 ID:</span>
            <span class="value">{{ result.entry.id }}</span>
          </div>
        </div>

        <div
          v-if="result.entry.tags && result.entry.tags.length > 0"
          class="tags-row"
        >
          <el-tag
            v-for="tag in result.entry.tags"
            :key="tag.name"
            size="small"
            effect="plain"
            class="detail-tag"
          >
            {{ tag.name }}
            <span v-if="tag.weight !== 1" class="weight"
              >({{ tag.weight }})</span
            >
          </el-tag>
        </div>
      </div>

      <el-divider />

      <div class="content-body">
        <RichTextRenderer
          :content="result.entry.content"
          :version="RendererVersion.V2_CUSTOM_PARSER"
        />
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import { RecallResult } from "../types/search";

const visible = ref(false);
const result = ref<RecallResult | null>(null);

function show(searchResult: RecallResult) {
  result.value = searchResult;
  visible.value = true;
}

defineExpose({
  show,
});
</script>

<style scoped>
.detail-content {
  padding: 0 16px 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  box-sizing: border-box;
}

.detail-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.meta-info {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  box-sizing: border-box;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  box-sizing: border-box;
}

.meta-item .label {
  color: var(--el-text-color-secondary);
}

.meta-item .value {
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.meta-item .value.score {
  color: var(--el-color-success);
  font-weight: bold;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-tag {
  border-radius: 4px;
}

.weight {
  opacity: 0.6;
  font-size: 10px;
  margin-left: 2px;
}

.content-body {
  flex: 1;
  line-height: 1.6;
}

:deep(.el-divider--horizontal) {
  margin: 16px 0;
}
</style>
