<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->

<script setup lang="ts">
import { computed, ref } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
import { RendererVersion } from "@/tools/rich-text-renderer/types";
import type { RetrievalPipelineRunSnapshot } from "../composables/useRetrievalPipelineRun";
import type { RecallSignalType, RecallResult } from "../types/search";

const SIGNAL_LABELS: Record<RecallSignalType, string> = {
  key: "键名",
  keyword: "关键词",
  "content-vector": "内容向量",
  "tag-vector": "标签向量",
  "tag-graph": "标签图",
  lens: "Legacy Lens",
  blender: "Legacy Blender",
  "multi-signal": "多信号",
};

const visible = ref(false);
const result = ref<RecallResult | null>(null);
const pipelineContext = ref<RetrievalPipelineRunSnapshot | null>(null);

const relevanceScore = computed(() =>
  result.value?.signals?.reduce((sum, signal) => sum + signal.score, 0)
);
const fallbackReason = computed(
  () => pipelineContext.value?.trace?.fallbackReason
);
const traceText = computed(() => {
  const trace = pipelineContext.value?.trace ?? result.value?.trace;
  return trace ? JSON.stringify(trace, null, 2) : "";
});

function formatScore(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(4);
}

function show(
  searchResult: RecallResult,
  context: RetrievalPipelineRunSnapshot | null = null
) {
  result.value = searchResult;
  pipelineContext.value = context;
  visible.value = true;
}

defineExpose({ show });
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="result?.entry.key || '条目详情'"
    width="860px"
    height="76vh"
  >
    <div v-if="result" class="detail-content custom-scrollbar">
      <section class="summary-section">
        <div class="score-metrics">
          <div class="score-metric">
            <span>{{ pipelineContext ? "排序分数" : "Legacy 分数" }}</span>
            <strong>{{ formatScore(result.score) }}</strong>
          </div>
          <div v-if="pipelineContext" class="score-metric">
            <span>相关性分数</span>
            <strong>{{ formatScore(relevanceScore) }}</strong>
          </div>
          <div class="score-metric">
            <span>匹配类型</span>
            <strong>{{ result.matchType }}</strong>
          </div>
        </div>
        <p class="score-note">
          {{
            pipelineContext
              ? "相关性分数由归一化信号贡献加权求和；排序分数可能再受 priority 重排影响。两者均为算法分数，不是概率或百分比。"
              : "Legacy 引擎分数的数值域取决于对应算法，不解释为概率或百分比。"
          }}
        </p>

        <dl class="identity-grid">
          <div>
            <dt>思绪集</dt>
            <dd>{{ result.recallName }} ({{ result.recallId }})</dd>
          </div>
          <div>
            <dt>条目 ID</dt>
            <dd>{{ result.entry.id }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="result.signals?.length" class="detail-section">
        <h3>{{ pipelineContext ? "信号贡献" : "Legacy 信号分数" }}</h3>
        <div class="signal-list">
          <div
            v-for="signal in result.signals"
            :key="signal.signalType"
            class="signal-row"
          >
            <span>{{ SIGNAL_LABELS[signal.signalType] }}</span>
            <code>{{ formatScore(signal.score) }}</code>
          </div>
        </div>
      </section>

      <section
        v-if="pipelineContext || result.trace"
        class="detail-section execution-section"
      >
        <h3>执行信息</h3>
        <dl v-if="pipelineContext" class="identity-grid">
          <div>
            <dt>运行结果</dt>
            <dd>{{ pipelineContext.outcome }}</dd>
          </div>
          <div>
            <dt>请求 / 实际预设</dt>
            <dd>
              {{ pipelineContext.requestedPresetId || "-" }} →
              {{ pipelineContext.actualPresetId || "-" }}
            </dd>
          </div>
          <div>
            <dt>Trace / 算法版本</dt>
            <dd>
              {{ pipelineContext.trace?.traceVersion || "-" }} /
              {{ pipelineContext.trace?.algorithmVersion || "-" }}
            </dd>
          </div>
          <div>
            <dt>Run ID</dt>
            <dd>{{ pipelineContext.runId }}</dd>
          </div>
          <div class="wide">
            <dt>Config Hash</dt>
            <dd>{{ pipelineContext.configHash }}</dd>
          </div>
          <div v-if="fallbackReason" class="wide fallback-row">
            <dt>降级原因</dt>
            <dd>{{ fallbackReason }}</dd>
          </div>
        </dl>
        <dl v-else-if="result.trace" class="identity-grid">
          <div>
            <dt>Legacy 算法版本</dt>
            <dd>{{ result.trace.algorithmVersion }}</dd>
          </div>
          <div>
            <dt>Legacy 引擎</dt>
            <dd>{{ result.trace.engineId }}</dd>
          </div>
          <div>
            <dt>候选 / 融合分数</dt>
            <dd>
              {{ formatScore(result.trace.candidateScore) }} /
              {{ formatScore(result.trace.fusionScore) }}
            </dd>
          </div>
          <div>
            <dt>最终排名</dt>
            <dd>#{{ result.trace.rank }}</dd>
          </div>
        </dl>
        <el-collapse v-if="traceText" class="raw-trace">
          <el-collapse-item title="完整版本化 trace" name="trace">
            <pre>{{ traceText }}</pre>
          </el-collapse-item>
        </el-collapse>
      </section>

      <section
        v-if="result.entry.tags && result.entry.tags.length > 0"
        class="detail-section"
      >
        <h3>标签</h3>
        <div class="tags-row">
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
      </section>

      <section class="detail-section content-body">
        <h3>条目内容</h3>
        <RichTextRenderer
          :content="result.entry.content"
          :version="RendererVersion.V2_CUSTOM_PARSER"
        />
      </section>
    </div>
  </BaseDialog>
</template>

<style scoped>
.detail-content {
  height: 100%;
  padding: 0 18px 18px;
  overflow-y: auto;
  box-sizing: border-box;
}

.summary-section,
.detail-section {
  padding: 14px 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.detail-section:last-child {
  border-bottom: 0;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.score-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--border-color);
}

.score-metric {
  display: flex;
  min-width: 0;
  padding: 10px 12px;
  flex-direction: column;
  gap: 4px;
  background: var(--card-bg);
}

.score-metric span,
.identity-grid dt {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.score-metric strong,
.identity-grid dd,
.signal-row code,
.raw-trace pre {
  font-family: var(--el-font-family-mono);
}

.score-metric strong {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-note {
  margin: 9px 0 14px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 20px;
  margin: 0;
}

.identity-grid > div {
  min-width: 0;
}

.identity-grid .wide {
  grid-column: 1 / -1;
}

.identity-grid dt {
  margin-bottom: 3px;
}

.identity-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--el-text-color-regular);
  font-size: 12px;
}

.fallback-row dd {
  color: var(--el-color-warning);
}

.signal-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
}

.signal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border-color);
  font-size: 12px;
}

.signal-row code {
  color: var(--el-color-primary);
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
  margin-left: 2px;
  opacity: 0.6;
  font-size: 10px;
}

.raw-trace {
  margin-top: 12px;
}

.raw-trace pre {
  max-height: 260px;
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-regular);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.content-body {
  min-height: 180px;
  line-height: 1.6;
}

@media (max-width: 700px) {
  .score-metrics,
  .identity-grid,
  .signal-list {
    grid-template-columns: 1fr;
  }

  .identity-grid .wide {
    grid-column: auto;
  }
}
</style>
