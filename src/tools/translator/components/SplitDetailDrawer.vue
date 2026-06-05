<template>
  <el-drawer
    v-model="visible"
    title="分片详情"
    size="520px"
    append-to-body
    class="translator-split-drawer"
  >
    <div v-if="task" class="split-detail">
      <header class="summary">
        <div>
          <strong>{{ task.channelName }}</strong>
          <span>{{ task.progress }}% · {{ completedCount }}/{{ totalCount }}</span>
        </div>
        <el-progress :percentage="task.progress" :stroke-width="8" />
      </header>

      <div class="chunk-list">
        <section
          v-for="chunk in task.chunks"
          :key="chunk.index"
          class="chunk-item"
          :class="`status-${chunk.status}`"
        >
          <div class="chunk-head">
            <span class="chunk-index">#{{ chunk.index + 1 }}</span>
            <span class="chunk-status">{{ statusLabel(chunk.status) }}</span>
            <span v-if="chunk.duration" class="chunk-meta">
              {{ formatDuration(chunk.duration) }}
            </span>
            <span v-if="chunk.tokenUsage" class="chunk-meta">
              ↑{{ chunk.tokenUsage.promptTokens }} ↓{{
                chunk.tokenUsage.completionTokens
              }}
            </span>
          </div>
          <p v-if="chunk.error" class="chunk-error">{{ chunk.error }}</p>
          <details>
            <summary>原文 · {{ chunk.sourceText.length }} 字</summary>
            <pre>{{ chunk.sourceText }}</pre>
          </details>
          <details :open="chunk.status === 'failed'">
            <summary>译文 · {{ (chunk.translatedText || '').length }} 字</summary>
            <pre>{{ chunk.translatedText || "暂无译文" }}</pre>
          </details>
        </section>
      </div>
    </div>
    <el-empty v-else :image-size="72" description="暂无分片详情" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { LongTextChunkStatus, LongTextTask } from "../types";

const props = defineProps<{
  modelValue: boolean;
  task?: LongTextTask;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const totalCount = computed(() => props.task?.chunks.length || 0);
const completedCount = computed(
  () =>
    props.task?.chunks.filter((chunk) => chunk.status === "completed").length ||
    0
);

function statusLabel(status: LongTextChunkStatus) {
  switch (status) {
    case "waiting":
      return "等待";
    case "translating":
      return "翻译中";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    default:
      return "";
  }
}

function formatDuration(duration: number) {
  if (duration < 1000) return `${duration} ms`;
  return `${(duration / 1000).toFixed(1)} s`;
}
</script>

<style scoped>
.split-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
}

.summary > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-color);
  font-size: 13px;
}

.summary span {
  color: var(--text-color-secondary);
  font-weight: 600;
}

.chunk-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chunk-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
}

.chunk-item.status-translating {
  border-color: color-mix(in srgb, var(--primary-color) 46%, var(--border-color));
}

.chunk-item.status-completed {
  border-color: color-mix(in srgb, var(--el-color-success) 36%, var(--border-color));
}

.chunk-item.status-failed {
  border-color: color-mix(in srgb, var(--el-color-danger) 52%, var(--border-color));
}

.chunk-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chunk-index,
.chunk-status,
.chunk-meta {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 9px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 700;
}

.chunk-status {
  color: var(--primary-color);
}

.chunk-error {
  margin: 0;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.5;
}

details {
  color: var(--text-color-secondary);
  font-size: 12px;
}

summary {
  cursor: pointer;
  font-weight: 700;
}

pre {
  max-height: 180px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 7px;
  background: var(--input-bg);
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  line-height: 1.6;
}
</style>
