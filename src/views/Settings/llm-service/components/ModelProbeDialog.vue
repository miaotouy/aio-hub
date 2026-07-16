<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronDown, ChevronUp, Play, Search, Square } from "lucide-vue-next";
import { resolveProbePlan } from "@aiohub/llm-core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import {
  getConfiguredProbeEndpoint,
  getProbeEndpointDefinition,
  PROBE_ENDPOINT_DEFINITIONS,
} from "../probe/endpoint-options";
import type {
  BatchProbeProgress,
  ChannelProbeResult,
  ProbeEndpointType,
} from "../probe/types";

interface ProbeRunOptions {
  endpointType: ProbeEndpointType;
  stream: boolean;
  allowCostlyMedia: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  profile: LlmProfile;
  initialModelId?: string;
  results: Record<string, ChannelProbeResult>;
  loading: Record<string, boolean>;
  batchRunning: boolean;
  batchProgress: BatchProbeProgress;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "test", model: LlmModelInfo, options: ProbeRunOptions): void;
  (
    event: "batch",
    modelIds: string[],
    options: ProbeRunOptions & { concurrency: number }
  ): void;
  (event: "cancel"): void;
}>();

const tableRef = ref<{ setScrollTop?: (top: number) => void }>();
const selectedIds = ref<string[]>([]);
const expandedIds = ref<string[]>([]);
const searchQuery = ref("");
const endpointType = ref<ProbeEndpointType>("auto");
const concurrency = ref(3);
const stream = ref(false);
const allowCostlyMedia = ref(false);

const models = computed(() => props.profile.models);
const filteredModels = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) return models.value;
  return models.value.filter((model) =>
    [model.id, model.name, capabilityLabel(model)].some((value) =>
      value.toLowerCase().includes(keyword)
    )
  );
});
const endpointOptions = computed(() =>
  PROBE_ENDPOINT_DEFINITIONS.map((definition) => ({
    ...definition,
    endpoint:
      getConfiguredProbeEndpoint(props.profile, definition.value) ??
      definition.defaultPath,
    configured: Boolean(
      getConfiguredProbeEndpoint(props.profile, definition.value)
    ),
  }))
);
const selectedEndpoint = computed(() =>
  getProbeEndpointDefinition(endpointType.value)
);
const isAnyTesting = computed(
  () => props.batchRunning || Object.values(props.loading).some(Boolean)
);
const allFilteredSelected = computed(
  () =>
    filteredModels.value.length > 0 &&
    filteredModels.value.every((model) => selectedIds.value.includes(model.id))
);
const someFilteredSelected = computed(
  () =>
    !allFilteredSelected.value &&
    filteredModels.value.some((model) => selectedIds.value.includes(model.id))
);
const effectiveStream = computed(
  () => selectedEndpoint.value.supportsStream && stream.value
);
const hasCostlyMedia = computed(
  () =>
    selectedEndpoint.value.requiresCostConsent === true ||
    (endpointType.value === "auto" &&
      models.value.some((model) =>
        ["image", "audio"].includes(resolveProbePlan(model).capability)
      ))
);
const batchPercentage = computed(() =>
  props.batchProgress.total
    ? Math.round(
        (props.batchProgress.completed / props.batchProgress.total) * 100
      )
    : 0
);
const checkAllLabel = computed(() =>
  searchQuery.value.trim()
    ? `检查筛选结果 (${filteredModels.value.length})`
    : `检查全部 (${filteredModels.value.length})`
);

watch(
  () => [props.modelValue, props.initialModelId] as const,
  async ([visible]) => {
    if (!visible) {
      resetDialogState();
      return;
    }
    resetDialogState();
    if (
      props.initialModelId &&
      models.value.some((model) => model.id === props.initialModelId)
    ) {
      selectedIds.value = [props.initialModelId];
      await nextTick();
      const index = models.value.findIndex(
        (model) => model.id === props.initialModelId
      );
      tableRef.value?.setScrollTop?.(Math.max(0, index * 64 - 96));
    }
  },
  { immediate: true }
);

watch(
  () => models.value.map((model) => model.id),
  (modelIds) => {
    const available = new Set(modelIds);
    selectedIds.value = selectedIds.value.filter((id) => available.has(id));
    expandedIds.value = expandedIds.value.filter((id) => available.has(id));
  }
);

watch(endpointType, () => {
  if (!selectedEndpoint.value.supportsStream) stream.value = false;
});

function resetDialogState() {
  selectedIds.value = [];
  expandedIds.value = [];
  searchQuery.value = "";
  endpointType.value = "auto";
  concurrency.value = 3;
  stream.value = false;
  allowCostlyMedia.value = false;
}

function toggleModel(modelId: string, checked?: boolean) {
  if (isAnyTesting.value) return;
  const selected = new Set(selectedIds.value);
  const shouldSelect = checked ?? !selected.has(modelId);
  if (shouldSelect) selected.add(modelId);
  else selected.delete(modelId);
  selectedIds.value = models.value
    .map((model) => model.id)
    .filter((id) => selected.has(id));
}

function toggleFilteredSelection(checked: boolean) {
  const selected = new Set(selectedIds.value);
  for (const model of filteredModels.value) {
    if (checked) selected.add(model.id);
    else selected.delete(model.id);
  }
  selectedIds.value = models.value
    .map((model) => model.id)
    .filter((id) => selected.has(id));
}

function rowClassName({ row }: { row: LlmModelInfo }): string {
  return selectedIds.value.includes(row.id) ? "probe-row-selected" : "";
}

function runOptions(): ProbeRunOptions {
  return {
    endpointType: endpointType.value,
    stream: effectiveStream.value,
    allowCostlyMedia: allowCostlyMedia.value,
  };
}

function testSingle(model: LlmModelInfo) {
  emit("test", model, runOptions());
}

function testBatch(modelIds: string[]) {
  if (modelIds.length === 0) return;
  emit("batch", [...modelIds], {
    ...runOptions(),
    concurrency: concurrency.value,
  });
}

function toggleDetails(modelId: string) {
  const expanded = new Set(expandedIds.value);
  if (expanded.has(modelId)) expanded.delete(modelId);
  else expanded.add(modelId);
  expandedIds.value = [...expanded];
}

function closeDialog() {
  if (!isAnyTesting.value) emit("update:modelValue", false);
}

function capabilityLabel(model: LlmModelInfo): string {
  return {
    chat: "Chat",
    embedding: "Embedding",
    rerank: "Rerank",
    image: "图片",
    audio: "音频",
    video: "视频",
    music: "音乐",
  }[resolveProbePlan(model).capability];
}

function resultLabel(result: ChannelProbeResult): string {
  if (result.success) return "成功";
  if (result.category === "cancelled") return "已停止";
  return "失败";
}

function resultTagType(
  result: ChannelProbeResult
): "success" | "danger" | "info" {
  if (result.success) return "success";
  return result.category === "cancelled" ? "info" : "danger";
}

function endpointLabel(value: ProbeEndpointType): string {
  return getProbeEndpointDefinition(value).label;
}

function resultSummary(result: ChannelProbeResult): string {
  return (
    result.responsePreview ||
    result.errorMessage ||
    result.category ||
    "请求已完成"
  );
}

function resultDetail(result: ChannelProbeResult): string {
  return (
    result.errorDetail ||
    result.responsePreview ||
    result.errorMessage ||
    "请求已完成"
  );
}

function formatDuration(value?: number): string {
  if (value === undefined) return "-";
  return value < 1_000
    ? `${Math.round(value)} ms`
    : `${(value / 1_000).toFixed(2)} s`;
}
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="模型检查"
    width="960px"
    max-height="86vh"
    :show-close-button="!isAnyTesting"
    :close-on-backdrop-click="!isAnyTesting"
    @update:model-value="closeDialog"
  >
    <template #content>
      <div class="probe-dialog">
        <section class="probe-settings" aria-label="检查设置">
          <div class="setting-field endpoint-field">
            <label for="probe-endpoint">检查端点</label>
            <el-select
              id="probe-endpoint"
              v-model="endpointType"
              :disabled="isAnyTesting"
              popper-class="probe-endpoint-popper"
            >
              <el-option
                v-for="option in endpointOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              >
                <div class="endpoint-option">
                  <span>{{ option.label }}</span>
                  <small>
                    {{ option.endpoint }}
                    <el-tag
                      v-if="option.configured"
                      size="small"
                      type="info"
                      effect="plain"
                    >
                      渠道配置
                    </el-tag>
                  </small>
                </div>
              </el-option>
            </el-select>
            <span class="setting-hint">
              {{
                getConfiguredProbeEndpoint(profile, endpointType) ||
                selectedEndpoint.defaultPath
              }}
            </span>
          </div>

          <div class="setting-field compact-field">
            <span class="setting-label">流式模式</span>
            <el-switch
              v-model="stream"
              :disabled="isAnyTesting || !selectedEndpoint.supportsStream"
              inline-prompt
              active-text="开"
              inactive-text="关"
            />
            <span class="setting-hint">
              {{
                selectedEndpoint.supportsStream
                  ? "验证流式响应"
                  : "当前端点不支持"
              }}
            </span>
          </div>

          <div class="setting-field compact-field">
            <label for="probe-concurrency">并发数</label>
            <el-input-number
              id="probe-concurrency"
              v-model="concurrency"
              :min="1"
              :max="8"
              controls-position="right"
              :disabled="isAnyTesting"
            />
            <span class="setting-hint">仅批量检查使用</span>
          </div>

          <div v-if="hasCostlyMedia" class="cost-consent">
            <el-checkbox v-model="allowCostlyMedia" :disabled="isAnyTesting">
              允许付费媒体检查
            </el-checkbox>
          </div>
        </section>

        <div v-if="batchRunning" class="batch-progress" aria-live="polite">
          <div class="progress-heading">
            <span>正在批量检查</span>
            <span>
              成功 {{ batchProgress.succeeded }} / 失败
              {{ batchProgress.failed }} / 取消 {{ batchProgress.cancelled }}
            </span>
          </div>
          <el-progress
            :percentage="batchPercentage"
            :format="() => batchProgress.completed + '/' + batchProgress.total"
          />
        </div>

        <section class="model-section" aria-label="渠道模型">
          <div class="model-toolbar">
            <div class="toolbar-actions">
              <el-button
                v-if="batchRunning"
                type="danger"
                plain
                :icon="Square"
                @click="emit('cancel')"
              >
                停止检查
              </el-button>
              <template v-else>
                <el-button
                  type="primary"
                  :icon="Play"
                  :disabled="isAnyTesting || filteredModels.length === 0"
                  @click="testBatch(filteredModels.map((model) => model.id))"
                >
                  {{ checkAllLabel }}
                </el-button>
                <el-button
                  :disabled="isAnyTesting || selectedIds.length === 0"
                  @click="testBatch(selectedIds)"
                >
                  检查选中 ({{ selectedIds.length }})
                </el-button>
              </template>
            </div>
            <el-input
              v-model="searchQuery"
              class="model-search"
              placeholder="搜索模型 ID、名称或能力"
              :prefix-icon="Search"
              clearable
            />
          </div>

          <el-table
            ref="tableRef"
            :data="filteredModels"
            row-key="id"
            height="420px"
            class="model-table"
            :row-class-name="rowClassName"
            @row-click="(row: LlmModelInfo) => toggleModel(row.id)"
          >
            <el-table-column width="46" align="center">
              <template #header>
                <el-checkbox
                  :model-value="allFilteredSelected"
                  :indeterminate="someFilteredSelected"
                  :disabled="isAnyTesting || filteredModels.length === 0"
                  aria-label="选择当前筛选的全部模型"
                  @change="toggleFilteredSelection(Boolean($event))"
                  @click.stop
                />
              </template>
              <template #default="{ row }">
                <el-checkbox
                  :model-value="selectedIds.includes(row.id)"
                  :disabled="isAnyTesting"
                  :aria-label="`选择模型 ${row.name || row.id}`"
                  @change="toggleModel(row.id, Boolean($event))"
                  @click.stop
                />
              </template>
            </el-table-column>

            <el-table-column label="模型" min-width="190">
              <template #default="{ row }">
                <div class="model-cell">
                  <strong>{{ row.name || row.id }}</strong>
                  <span>{{ row.id }}</span>
                </div>
              </template>
            </el-table-column>

            <el-table-column label="能力" width="104">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">
                  {{ capabilityLabel(row) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="状态" width="92">
              <template #default="{ row }">
                <el-tag
                  v-if="results[row.id]"
                  :type="resultTagType(results[row.id])"
                  size="small"
                >
                  {{ resultLabel(results[row.id]) }}
                </el-tag>
                <span v-else-if="loading[row.id]" class="status-pending">
                  检查中
                </span>
                <span v-else class="status-pending">未检查</span>
              </template>
            </el-table-column>

            <el-table-column label="结果" min-width="310">
              <template #default="{ row }">
                <div v-if="results[row.id]" class="result-cell">
                  <div class="result-summary">
                    <span>
                      {{ endpointLabel(results[row.id].endpointType) }} /
                      {{ formatDuration(results[row.id].totalMs) }}
                    </span>
                    <el-tooltip
                      :content="
                        expandedIds.includes(row.id) ? '收起详情' : '展开详情'
                      "
                      placement="top"
                    >
                      <el-button
                        link
                        :icon="
                          expandedIds.includes(row.id) ? ChevronUp : ChevronDown
                        "
                        :aria-label="
                          expandedIds.includes(row.id)
                            ? '收起检查详情'
                            : '展开检查详情'
                        "
                        @click.stop="toggleDetails(row.id)"
                      />
                    </el-tooltip>
                  </div>
                  <p>{{ resultSummary(results[row.id]) }}</p>
                  <div
                    v-if="expandedIds.includes(row.id)"
                    class="result-details"
                    @click.stop
                  >
                    <div class="result-metrics">
                      <span
                        >TTFB
                        {{ formatDuration(results[row.id].firstByteMs) }}</span
                      >
                      <span>HTTP {{ results[row.id].status || "-" }}</span>
                      <span>阶段 {{ results[row.id].phase || "-" }}</span>
                      <span v-if="results[row.id].usage">
                        {{ results[row.id].usage?.totalTokens }} tokens
                      </span>
                    </div>
                    <pre>{{ resultDetail(results[row.id]) }}</pre>
                  </div>
                </div>
                <span v-else class="result-empty">等待检查</span>
              </template>
            </el-table-column>

            <el-table-column
              label="操作"
              width="72"
              fixed="right"
              align="center"
            >
              <template #default="{ row }">
                <el-tooltip content="检查此模型" placement="top">
                  <el-button
                    :icon="Play"
                    circle
                    size="small"
                    :loading="loading[row.id]"
                    :disabled="batchRunning || loading[row.id]"
                    aria-label="检查此模型"
                    @click.stop="testSingle(row)"
                  />
                </el-tooltip>
              </template>
            </el-table-column>

            <template #empty>
              <div class="empty-state">
                {{ models.length ? "没有匹配的模型" : "当前渠道没有配置模型" }}
              </div>
            </template>
          </el-table>
        </section>
      </div>
    </template>

    <template #footer>
      <el-button :disabled="isAnyTesting" @click="closeDialog">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.probe-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.probe-settings {
  display: grid;
  grid-template-columns: minmax(280px, 1.7fr) minmax(130px, 0.7fr) minmax(
      140px,
      0.8fr
    );
  gap: 14px;
  align-items: start;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.setting-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.setting-field label,
.setting-label {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
}

.setting-field :deep(.el-select),
.setting-field :deep(.el-input-number) {
  width: 100%;
}

.setting-hint {
  overflow: hidden;
  color: var(--text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost-consent {
  grid-column: 1 / -1;
  padding: 8px 10px;
  border-radius: 6px;
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.batch-progress {
  padding: 12px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--container-bg);
}

.progress-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.progress-heading span:first-child {
  color: var(--text-color);
  font-weight: 500;
}

.model-section {
  min-width: 0;
}

.model-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.model-search {
  width: 260px;
  flex: 0 1 260px;
}

.model-table {
  width: 100%;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

:deep(.model-table .el-table__row) {
  cursor: pointer;
}

:deep(.model-table .probe-row-selected > .el-table__cell) {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  ) !important;
}

:deep(.model-table .probe-row-selected > .el-table__cell:first-child) {
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}

.model-cell,
.model-cell strong,
.model-cell span {
  min-width: 0;
}

.model-cell strong,
.model-cell span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-cell strong {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.model-cell span {
  margin-top: 3px;
  color: var(--text-color-secondary);
  font-family: monospace;
  font-size: 12px;
}

.status-pending,
.result-empty {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.result-cell {
  min-width: 0;
  padding: 3px 0;
}

.result-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 12px;
}

.result-cell p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-details {
  margin-top: 9px;
  padding: 9px 10px;
  border-radius: 4px;
  background: var(--input-bg);
}

.result-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.result-details pre {
  max-height: 120px;
  margin: 8px 0 0;
  overflow: auto;
  color: var(--text-color);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.empty-state {
  padding: 32px 16px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

@media (max-width: 760px) {
  .probe-settings {
    grid-template-columns: 1fr;
  }

  .cost-consent {
    grid-column: auto;
  }

  .model-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .model-search {
    width: 100%;
    flex-basis: auto;
  }
}
</style>

<style>
.probe-endpoint-popper {
  width: min(520px, calc(100vw - 32px));
}

.probe-endpoint-popper .el-select-dropdown__item {
  height: auto;
  min-height: 48px;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 1.35;
}

.endpoint-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.endpoint-option small {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--text-color-secondary);
  font-family: monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
