<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Play, Square } from "lucide-vue-next";
import { resolveProbePlan } from "@aiohub/llm-core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { LlmModelInfo } from "@/types/llm-profiles";
import type { ChannelProbeResult } from "../probe/types";

const props = defineProps<{
  modelValue: boolean;
  models: LlmModelInfo[];
  initialModelId?: string;
  results: Record<string, ChannelProbeResult>;
  loading: Record<string, boolean>;
  batchRunning: boolean;
  batchProgress: { completed: number; total: number };
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (
    event: "test",
    model: LlmModelInfo,
    options: { stream: boolean; allowCostlyMedia: boolean }
  ): void;
  (
    event: "batch",
    modelIds: string[],
    options: {
      concurrency: number;
      stream: boolean;
      allowCostlyMedia: boolean;
    }
  ): void;
  (event: "cancel"): void;
}>();

const selectedIds = ref<string[]>([]);
const concurrency = ref(3);
const stream = ref(false);
const allowCostlyMedia = ref(false);

const selectedModels = computed(() => {
  const selected = new Set(selectedIds.value);
  return props.models.filter((model) => selected.has(model.id));
});

const isRunning = computed(
  () =>
    props.batchRunning ||
    selectedIds.value.some((modelId) => props.loading[modelId])
);

const hasChatModel = computed(() =>
  selectedModels.value.some(
    (model) => resolveProbePlan(model).capability === "chat"
  )
);

const hasCostlyMedia = computed(() =>
  selectedModels.value.some((model) =>
    ["image", "audio", "video", "music"].includes(
      resolveProbePlan(model).capability
    )
  )
);

watch(
  () => [props.modelValue, props.initialModelId] as const,
  ([visible]) => {
    if (!visible) return;
    if (
      props.initialModelId &&
      props.models.some((model) => model.id === props.initialModelId)
    ) {
      selectedIds.value = [props.initialModelId];
      return;
    }
    selectedIds.value = props.models.map((model) => model.id);
  },
  { immediate: true }
);

watch(
  () => props.models.map((model) => model.id),
  (modelIds) => {
    const available = new Set(modelIds);
    selectedIds.value = selectedIds.value.filter((id) => available.has(id));
  }
);

function startProbe() {
  if (selectedModels.value.length === 1) {
    emit("test", selectedModels.value[0], {
      stream: stream.value,
      allowCostlyMedia: allowCostlyMedia.value,
    });
    return;
  }
  emit("batch", [...selectedIds.value], {
    concurrency: concurrency.value,
    stream: stream.value,
    allowCostlyMedia: allowCostlyMedia.value,
  });
}

function closeDialog() {
  if (!isRunning.value) emit("update:modelValue", false);
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
  if (result.success) return "检查成功";
  if (result.category === "cancelled") return "已停止";
  return "检查失败";
}

function resultTagType(
  result: ChannelProbeResult
): "success" | "danger" | "info" {
  if (result.success) return "success";
  return result.category === "cancelled" ? "info" : "danger";
}

function formatDuration(value?: number): string {
  if (value === undefined) return "-";
  return value < 1_000
    ? Math.round(value) + " ms"
    : (value / 1_000).toFixed(2) + " s";
}
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="模型检查"
    width="760px"
    max-height="82vh"
    :show-close-button="!isRunning"
    :close-on-backdrop-click="!isRunning"
    @update:model-value="closeDialog"
  >
    <template #content>
      <div class="probe-dialog">
        <div class="probe-controls">
          <div class="model-selector">
            <span class="control-label">检查模型</span>
            <el-select
              v-model="selectedIds"
              multiple
              filterable
              collapse-tags
              :max-collapse-tags="3"
              collapse-tags-tooltip
              placeholder="选择要检查的模型"
              :disabled="isRunning"
            >
              <el-option
                v-for="model in models"
                :key="model.id"
                :label="model.name || model.id"
                :value="model.id"
              >
                <div class="model-option">
                  <span>{{ model.name || model.id }}</span>
                  <small>{{ capabilityLabel(model) }}</small>
                </div>
              </el-option>
            </el-select>
          </div>

          <div class="probe-options">
            <div v-if="selectedIds.length > 1" class="option-item">
              <span>并发数</span>
              <el-input-number
                v-model="concurrency"
                :min="1"
                :max="8"
                controls-position="right"
                :disabled="isRunning"
              />
            </div>
            <el-switch
              v-if="hasChatModel"
              v-model="stream"
              active-text="流式 Chat"
              :disabled="isRunning"
            />
            <el-checkbox
              v-if="hasCostlyMedia"
              v-model="allowCostlyMedia"
              :disabled="isRunning"
            >
              允许付费媒体检查
            </el-checkbox>
          </div>
        </div>

        <div v-if="batchRunning" class="batch-progress" aria-live="polite">
          <span>正在检查模型</span>
          <el-progress
            :percentage="
              batchProgress.total
                ? Math.round(
                    (batchProgress.completed / batchProgress.total) * 100
                  )
                : 0
            "
            :format="() => batchProgress.completed + '/' + batchProgress.total"
          />
        </div>

        <div v-if="selectedModels.length > 0" class="result-list">
          <div
            v-for="model in selectedModels"
            :key="model.id"
            class="result-row"
          >
            <div class="result-heading">
              <div class="result-model">
                <strong>{{ model.name || model.id }}</strong>
                <span>{{ model.id }} · {{ capabilityLabel(model) }}</span>
              </div>
              <el-tag
                v-if="results[model.id]"
                :type="resultTagType(results[model.id])"
                size="small"
              >
                {{ resultLabel(results[model.id]) }}
              </el-tag>
              <span v-else-if="loading[model.id]" class="result-pending">
                检查中
              </span>
              <span v-else class="result-pending">尚未检查</span>
            </div>

            <div v-if="results[model.id]" class="result-metrics">
              <span
                >总耗时 {{ formatDuration(results[model.id].totalMs) }}</span
              >
              <span
                >TTFB {{ formatDuration(results[model.id].firstByteMs) }}</span
              >
              <span>HTTP {{ results[model.id].status || "-" }}</span>
              <span>阶段 {{ results[model.id].phase || "-" }}</span>
              <span v-if="results[model.id].usage">
                {{ results[model.id].usage?.totalTokens }} tokens
              </span>
            </div>

            <p v-if="results[model.id]" class="result-detail">
              {{
                results[model.id].errorDetail ||
                results[model.id].responsePreview ||
                results[model.id].errorMessage ||
                "请求已完成"
              }}
            </p>
          </div>
        </div>
        <div v-else class="empty-selection">请选择至少一个模型。</div>
      </div>
    </template>

    <template #footer>
      <el-button v-if="!isRunning" @click="closeDialog">关闭</el-button>
      <el-button
        v-if="batchRunning"
        type="danger"
        :icon="Square"
        @click="emit('cancel')"
      >
        停止检查
      </el-button>
      <el-button
        v-else
        type="primary"
        :icon="Play"
        :loading="isRunning"
        :disabled="selectedIds.length === 0"
        @click="startProbe"
      >
        {{ selectedIds.length > 1 ? "检查选中模型" : "检查模型" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.probe-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.probe-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.model-selector {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.control-label,
.option-item > span {
  color: var(--text-color-secondary);
  font-size: 13px;
}

.model-option {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.model-option small {
  color: var(--text-color-secondary);
}

.probe-options,
.option-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.probe-options {
  padding-left: 84px;
  flex-wrap: wrap;
}

.option-item :deep(.el-input-number) {
  width: 96px;
}

.batch-progress {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.result-list {
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.result-row {
  padding: 14px 16px;
  background: var(--card-bg);
}

.result-row + .result-row {
  border-top: var(--border-width) solid var(--border-color);
}

.result-heading,
.result-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-heading {
  justify-content: space-between;
}

.result-model {
  min-width: 0;
}

.result-model strong,
.result-model span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-model strong {
  font-size: 13px;
  font-weight: 600;
}

.result-model span,
.result-pending,
.result-metrics {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.result-model span {
  margin-top: 3px;
  font-family: monospace;
}

.result-metrics {
  margin-top: 10px;
  flex-wrap: wrap;
}

.result-detail {
  margin: 8px 0 0;
  color: var(--text-color);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.empty-selection {
  padding: 28px;
  text-align: center;
  color: var(--text-color-secondary);
}

@media (max-width: 640px) {
  .model-selector {
    grid-template-columns: 1fr;
  }

  .probe-options {
    padding-left: 0;
  }
}
</style>
