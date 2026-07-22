<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ExternalLink, X } from "lucide-vue-next";
import { getIntegerOverrideBounds } from "../core/retrievalPresetCapabilities";
import { useRetrievalPipelineRun } from "../composables/useRetrievalPipelineRun";
import type { RecallPresetId, RecallPresetSummary } from "../types/pipeline";
import type { RecallResult } from "../types/search";

const props = defineProps<{
  selectedRecallIds: string[];
  canRemove: boolean;
  sharedResultIds: Set<string>;
  presetSummaries: RecallPresetSummary[];
  queryText: string;
  initialPresetId?: RecallPresetId;
  initialLimit?: number;
}>();

const emit = defineEmits<{
  (event: "remove"): void;
  (event: "select", result: RecallResult): void;
  (event: "results-updated", results: RecallResult[]): void;
  (
    event: "update:config",
    value: { presetId: RecallPresetId; limit: number }
  ): void;
}>();

const controller = useRetrievalPipelineRun();
const presetId = ref<RecallPresetId>(props.initialPresetId ?? "algorithmic");
const limit = ref(props.initialLimit ?? 6);
const lastQuery = ref("");
const selectedSummary = computed(() =>
  props.presetSummaries.find((summary) => summary.id === presetId.value)
);
const limitBounds = computed(
  () =>
    getIntegerOverrideBounds(selectedSummary.value, "limit") ?? {
      minimum: 1,
      maximum: 100,
      defaultValue: 6,
    }
);
const stateLabel = computed(
  () =>
    ({
      idle: "待运行",
      compiling: "编译中",
      blocked: "已阻塞",
      ready: "已编译",
      preparing: "准备资产",
      running: "运行中",
      success: "成功",
      empty: "空结果",
      fallback: "已降级",
      failed: "失败",
      cancelled: "已取消",
    })[controller.state.value]
);
const stateType = computed(() => {
  if (controller.state.value === "success") return "success";
  if (controller.state.value === "fallback") return "warning";
  if (["blocked", "failed"].includes(controller.state.value)) return "danger";
  return "info";
});
const traceText = computed(() =>
  controller.snapshot.value?.trace
    ? JSON.stringify(controller.snapshot.value.trace, null, 2)
    : ""
);

watch([presetId, limit], () => {
  controller.reset();
  emit("results-updated", []);
  emit("update:config", { presetId: presetId.value, limit: limit.value });
});

async function search(query: string) {
  lastQuery.value = query;
  const snapshot = await controller.run({
    query,
    recallIds: props.selectedRecallIds,
    presetId: presetId.value,
    limit: limit.value,
  });
  if (snapshot) emit("results-updated", snapshot.results);
  return snapshot;
}

defineExpose({ search });
</script>

<template>
  <section class="search-slot">
    <header class="slot-header">
      <el-select
        v-model="presetId"
        class="preset-select"
        data-testid="recall-search-preset"
      >
        <el-option
          v-for="summary in presetSummaries"
          :key="summary.id"
          :label="summary.displayName"
          :value="summary.id"
        />
      </el-select>
      <el-tag size="small" :type="stateType">{{ stateLabel }}</el-tag>
      <el-button
        v-if="canRemove"
        circle
        plain
        type="danger"
        title="移除配置"
        @click="emit('remove')"
      >
        <X :size="14" />
      </el-button>
    </header>

    <div class="slot-config">
      <div class="preset-copy">
        <strong>{{ selectedSummary?.displayName || presetId }}</strong>
        <span>{{ selectedSummary?.description }}</span>
      </div>
      <label class="limit-control">
        <span>结果上限</span>
        <el-input-number
          v-model="limit"
          :min="limitBounds.minimum"
          :max="limitBounds.maximum"
          controls-position="right"
        />
      </label>
    </div>

    <div
      class="slot-body"
      :data-search-state="controller.state.value"
      :data-last-query="lastQuery || undefined"
      :data-result-count="controller.results.value.length"
    >
      <div v-if="controller.compilation.value" class="compile-stages">
        <span
          v-for="stage in controller.compilation.value.stages"
          :key="stage.phase"
          class="stage-chip"
        >
          {{ stage.phase }} · {{ stage.nodeIds.length }}
        </span>
      </div>

      <div v-if="controller.error.value" class="run-error">
        {{ controller.error.value.message }}
      </div>
      <div
        v-for="issue in controller.compilation.value?.issues || []"
        :key="`${issue.code}:${issue.fieldPath || ''}`"
        class="run-error"
      >
        {{ issue.message }}
      </div>

      <div v-loading="controller.loading.value" class="results-list">
        <button
          v-for="(result, index) in controller.results.value"
          :key="`${result.recallId}:${result.entry.id}`"
          class="result-row"
          :class="{ shared: sharedResultIds.has(result.entry.id) }"
          @click="emit('select', result)"
        >
          <span class="rank">#{{ index + 1 }}</span>
          <span class="result-main">
            <strong>{{ result.entry.key }}</strong>
            <small>{{ result.entry.content.slice(0, 110) }}</small>
          </span>
          <span class="score">{{ result.score.toFixed(3) }}</span>
          <ExternalLink :size="13" />
        </button>
        <el-empty
          v-if="
            !controller.loading.value && controller.results.value.length === 0
          "
          :description="
            controller.state.value === 'empty' ? '空结果' : '暂无结果'
          "
          :image-size="54"
        />
      </div>

      <el-collapse v-if="traceText" class="trace-panel">
        <el-collapse-item title="运行 trace" name="trace">
          <pre>{{ traceText }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>
  </section>
</template>

<style scoped>
.search-slot {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  border-left: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.search-slot:first-child {
  border-left: 0;
}

.slot-header,
.slot-config,
.limit-control,
.result-row,
.preset-copy,
.result-main {
  display: flex;
}

.slot-header {
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 10px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.preset-select {
  min-width: 0;
  flex: 1;
}

.slot-config {
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--el-fill-color-lighter);
}

.preset-copy,
.result-main {
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.preset-copy strong,
.result-main strong {
  font-size: 13px;
}

.preset-copy span,
.result-main small {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.limit-control {
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.limit-control :deep(.el-input-number) {
  width: 108px;
}

.slot-body {
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
}

.compile-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.stage-chip {
  padding: 2px 6px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
}

.run-error {
  margin-bottom: 8px;
  color: var(--el-color-danger);
  font-size: 12px;
}

.results-list {
  min-height: 120px;
}

.result-row {
  width: 100%;
  align-items: center;
  gap: 9px;
  padding: 9px 0;
  border: 0;
  border-bottom: var(--border-width) solid var(--border-color);
  color: var(--el-text-color-primary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.result-row:hover {
  background: var(--el-fill-color-light);
}

.result-row.shared {
  box-shadow: inset 3px 0 var(--el-color-warning);
  padding-left: 8px;
}

.rank,
.score {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-mono);
  font-size: 11px;
}

.result-main {
  flex: 1;
}

.trace-panel {
  margin-top: 12px;
}

.trace-panel pre {
  max-height: 320px;
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-regular);
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
