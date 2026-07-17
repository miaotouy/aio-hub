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

<script setup lang="ts">
import { computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  SkipForward,
  XCircle,
} from "lucide-vue-next";
import type { BackupOperationItem } from "../types/backup";

const props = defineProps<{
  modelValue: boolean;
  running: boolean;
  operation: "import" | "export";
  current: number;
  total: number;
  failed: number;
  currentName: string;
  progress: number;
  cancelRequested: boolean;
  items: BackupOperationItem[];
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "cancel"): void;
}>();

const title = computed(() =>
  props.running
    ? props.operation === "import"
      ? "正在导入知识库备份"
      : "正在导出知识库备份"
    : props.operation === "import"
      ? "知识库备份导入报告"
      : "知识库备份导出报告"
);

const successCount = computed(
  () => props.items.filter((item) => item.status === "success").length
);
const skippedCount = computed(
  () => props.items.filter((item) => item.status === "skipped").length
);
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="title"
    width="620px"
    max-height="78vh"
    :show-close-button="!running"
    :close-on-backdrop-click="!running"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="backup-dialog-content">
      <template v-if="running">
        <div class="progress-heading">
          <LoaderCircle :size="18" class="is-spinning" />
          <span class="current-name">{{ currentName || "准备中" }}</span>
          <span class="progress-count">{{ current }} / {{ total }}</span>
        </div>
        <el-progress :percentage="progress" :stroke-width="8" />
        <div class="progress-meta">
          <span>{{ failed }} 个失败</span>
          <span v-if="cancelRequested">将在当前项目完成后停止</span>
        </div>
      </template>

      <template v-else>
        <div class="summary-line">
          <span class="summary-success">成功 {{ successCount }}</span>
          <span>跳过 {{ skippedCount }}</span>
          <span :class="{ 'summary-failed': failed > 0 }"
            >失败 {{ failed }}</span
          >
        </div>

        <div class="result-list">
          <div v-for="item in items" :key="item.key" class="result-row">
            <CheckCircle2
              v-if="item.status === 'success'"
              :size="18"
              class="status-icon success"
            />
            <SkipForward
              v-else-if="item.status === 'skipped'"
              :size="18"
              class="status-icon skipped"
            />
            <XCircle v-else :size="18" class="status-icon failed" />
            <div class="result-main">
              <div class="result-name">{{ item.name }}</div>
              <div class="result-detail">{{ item.detail }}</div>
              <div v-if="item.warnings.length" class="warning-list">
                <div
                  v-for="(warning, index) in item.warnings"
                  :key="`${warning.code}-${index}`"
                  class="warning-row"
                >
                  <AlertTriangle :size="13" />
                  <span>{{ warning.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="scope-note">
          备份包含知识库内容和引用资产，不包含可重建向量与 Agent 配置。
        </div>
      </template>
    </div>

    <template #footer>
      <el-button
        v-if="running"
        :disabled="cancelRequested"
        @click="emit('cancel')"
      >
        {{ cancelRequested ? "正在停止" : "停止后续项目" }}
      </el-button>
      <el-button
        v-else
        type="primary"
        @click="emit('update:modelValue', false)"
      >
        完成
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.backup-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.progress-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.is-spinning {
  flex: 0 0 auto;
  color: var(--el-color-primary);
  animation: spin 1s linear infinite;
}

.current-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.progress-count,
.progress-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.progress-meta,
.summary-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.summary-line {
  justify-content: flex-start;
  padding-bottom: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.summary-success,
.status-icon.success {
  color: var(--el-color-success);
}

.summary-failed,
.status-icon.failed {
  color: var(--el-color-danger);
}

.status-icon.skipped {
  color: var(--el-text-color-secondary);
}

.result-list {
  display: flex;
  flex-direction: column;
  max-height: 42vh;
  overflow-y: auto;
}

.result-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 2px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.status-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.result-main {
  flex: 1;
  min-width: 0;
}

.result-name {
  overflow-wrap: anywhere;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.result-detail {
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.warning-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
}

.warning-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--el-color-warning);
  font-size: 12px;
  line-height: 1.45;
}

.warning-row svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.scope-note {
  padding: 10px 12px;
  border-left: 3px solid var(--el-color-warning);
  background: var(--input-bg);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
