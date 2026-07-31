<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
-->

<script setup lang="ts">
import { computed } from "vue";
import {
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  MinusCircle,
  Target,
  XCircle,
  Zap,
} from "lucide-vue-next";
import type { RagPayload, RecallStepStatus } from "../../types/monitor";
import type { RecallSignalType } from "../../types/search";

const props = defineProps<{
  payload: RagPayload;
}>();

const SIGNAL_LABELS: Partial<Record<RecallSignalType, string>> = {
  key: "键名",
  keyword: "关键词",
  "content-vector": "内容向量",
  "tag-vector": "标签向量",
  "tag-graph": "标签图",
  lens: "Legacy Lens",
  blender: "Legacy Blender",
  "multi-signal": "多信号",
};

const isPipeline = computed(
  () =>
    props.payload.metadata?.executionPath === "retrieval-pipeline" ||
    Boolean(props.payload.pipelineTrace)
);
const traceText = computed(() =>
  props.payload.pipelineTrace
    ? JSON.stringify(props.payload.pipelineTrace, null, 2)
    : ""
);

function getStatusIcon(status: RecallStepStatus) {
  if (status === "completed") return CheckCircle2;
  if (status === "running") return Loader2;
  if (status === "skipped") return MinusCircle;
  if (status === "failed") return XCircle;
  return Circle;
}

function formattedDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatScore(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(4);
}
</script>

<template>
  <div class="rag-trace-content">
    <div class="stats-row">
      <div class="stat-item">
        <Zap :size="14" />
        <span>总耗时</span>
        <strong>{{ formattedDuration(payload.stats.duration) }}</strong>
      </div>
      <div v-if="payload.stats.hitCount !== undefined" class="stat-item">
        <Target :size="14" />
        <span>命中</span>
        <strong>{{ payload.stats.hitCount }}</strong>
      </div>
      <div v-if="payload.stats.tokenCount" class="stat-item">
        <FileText :size="14" />
        <span>Token</span>
        <strong>{{ payload.stats.tokenCount }}</strong>
      </div>
    </div>

    <section class="trace-section identity-section">
      <div class="section-title">执行身份</div>
      <dl v-if="isPipeline" class="identity-grid">
        <div>
          <dt>结果</dt>
          <dd>{{ payload.metadata?.outcome || "-" }}</dd>
        </div>
        <div>
          <dt>请求 / 实际预设</dt>
          <dd>
            {{ payload.metadata?.requestedPresetId || "-" }} →
            {{ payload.metadata?.actualPresetId || "-" }}
          </dd>
        </div>
        <div>
          <dt>Trace / 算法版本</dt>
          <dd>
            {{ payload.pipelineTrace?.traceVersion || "-" }} /
            {{ payload.pipelineTrace?.algorithmVersion || "-" }}
          </dd>
        </div>
        <div>
          <dt>Run ID</dt>
          <dd>{{ payload.metadata?.runId || payload.pipelineTrace?.runId }}</dd>
        </div>
        <div class="wide">
          <dt>Config Hash</dt>
          <dd>{{ payload.pipelineTrace?.configHash || "-" }}</dd>
        </div>
        <div v-if="payload.pipelineTrace?.fallbackReason" class="wide fallback">
          <dt>降级原因</dt>
          <dd>{{ payload.pipelineTrace.fallbackReason }}</dd>
        </div>
        <div v-if="payload.pipelineError" class="wide error">
          <dt>运行错误</dt>
          <dd>
            {{ payload.pipelineError.code }} ·
            {{ payload.pipelineError.message }}
          </dd>
        </div>
      </dl>
      <dl v-else class="identity-grid">
        <div>
          <dt>执行路径</dt>
          <dd>Legacy engine</dd>
        </div>
        <div>
          <dt>引擎</dt>
          <dd>{{ payload.metadata?.engineId || "-" }}</dd>
        </div>
        <div class="wide">
          <dt>查询</dt>
          <dd>{{ payload.metadata?.query || "-" }}</dd>
        </div>
      </dl>
    </section>

    <section class="trace-section">
      <div class="section-title">执行流程</div>
      <div class="steps-timeline">
        <div
          v-for="(step, index) in payload.steps"
          :key="`${step.name}:${index}`"
          class="step-item"
          :class="`status-${step.status}`"
        >
          <div v-if="index < payload.steps.length - 1" class="step-line"></div>
          <div class="step-icon-wrapper">
            <component
              :is="getStatusIcon(step.status)"
              :size="14"
              :class="{ 'is-spinning': step.status === 'running' }"
            />
          </div>
          <div class="step-info">
            <div class="step-header">
              <span class="step-name">{{ step.name }}</span>
              <code>{{ formattedDuration(step.duration) }}</code>
            </div>
            <div v-if="step.details" class="step-details">
              {{ step.details }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="payload.results?.length" class="trace-section">
      <div class="section-title">
        召回结果 (Top {{ payload.results.length }})
      </div>
      <div class="results-list">
        <article
          v-for="result in payload.results"
          :key="result.id"
          class="result-item"
        >
          <header>
            <span class="result-source">
              <FileText :size="12" />
              {{ result.source || "未知来源" }}
            </span>
            <span class="result-score">
              {{
                result.metadata?.scoreSemantics === "ranking-score"
                  ? "排序分数"
                  : "Legacy 分数"
              }}
              <code>{{ formatScore(result.score) }}</code>
            </span>
          </header>
          <div
            v-if="result.metadata?.relevanceScore !== undefined"
            class="relevance-row"
          >
            <span>相关性分数</span>
            <code>{{ formatScore(result.metadata.relevanceScore) }}</code>
          </div>
          <div v-if="result.metadata?.signals?.length" class="signal-list">
            <span
              v-for="signal in result.metadata.signals"
              :key="signal.signalType"
            >
              {{ SIGNAL_LABELS[signal.signalType] || signal.signalType }}
              <code>{{ formatScore(signal.score) }}</code>
            </span>
          </div>
          <p>{{ result.content }}</p>
        </article>
      </div>
      <p class="score-note">
        {{
          isPipeline
            ? "相关性分数是信号贡献之和，排序分数可能包含 priority 重排；均不是概率或百分比。"
            : "Legacy 分数域由旧引擎决定，不解释为概率或百分比。"
        }}
      </p>
    </section>

    <el-collapse v-if="traceText" class="raw-trace">
      <el-collapse-item title="完整版本化 trace" name="trace">
        <pre>{{ traceText }}</pre>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.rag-trace-content {
  display: flex;
  padding: 8px 0;
  flex-direction: column;
  gap: 16px;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 9px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-item svg {
  color: var(--el-color-primary);
}

.stat-item span,
.identity-grid dt {
  color: var(--el-text-color-secondary);
}

.stat-item strong,
.identity-grid dd,
.step-header code,
.result-score code,
.relevance-row code,
.signal-list code,
.raw-trace pre {
  font-family: var(--el-font-family-mono);
}

.trace-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 18px;
  margin: 0;
}

.identity-grid > div {
  min-width: 0;
}

.identity-grid .wide {
  grid-column: 1 / -1;
}

.identity-grid dt {
  margin-bottom: 2px;
  font-size: 10px;
}

.identity-grid dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--el-text-color-regular);
  font-size: 11px;
}

.identity-grid .fallback dd {
  color: var(--el-color-warning);
}

.identity-grid .error dd {
  color: var(--el-color-danger);
}

.steps-timeline {
  display: flex;
  flex-direction: column;
}

.step-item {
  position: relative;
  display: flex;
  gap: 11px;
  padding-bottom: 12px;
}

.step-item:last-child {
  padding-bottom: 0;
}

.step-line {
  position: absolute;
  top: 14px;
  bottom: -4px;
  left: 6px;
  width: 2px;
  background: var(--border-color);
}

.step-icon-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  height: 14px;
  align-items: center;
  background: var(--card-bg);
  color: var(--el-text-color-placeholder);
}

.status-completed .step-icon-wrapper {
  color: var(--el-color-success);
}

.status-running .step-icon-wrapper {
  color: var(--el-color-primary);
}

.status-skipped .step-icon-wrapper {
  color: var(--el-color-warning);
}

.status-failed .step-icon-wrapper {
  color: var(--el-color-danger);
}

.step-info {
  min-width: 0;
  flex: 1;
}

.step-header,
.result-item header,
.relevance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.step-name {
  font-size: 12px;
  font-weight: 500;
}

.step-header code,
.result-score,
.relevance-row {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.step-details {
  margin-top: 3px;
  color: var(--el-text-color-regular);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.result-source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-score {
  flex: 0 0 auto;
}

.result-score code,
.relevance-row code,
.signal-list code {
  color: var(--el-color-primary);
}

.relevance-row {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px dashed var(--border-color);
}

.signal-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
}

.result-item p {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  color: var(--el-text-color-regular);
  font-size: 11px;
  line-height: 1.5;
}

.score-note {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1.5;
}

.raw-trace pre {
  max-height: 280px;
  margin: 0;
  overflow: auto;
  color: var(--el-text-color-regular);
  font-size: 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.is-spinning {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 700px) {
  .identity-grid {
    grid-template-columns: 1fr;
  }

  .identity-grid .wide {
    grid-column: auto;
  }
}
</style>
