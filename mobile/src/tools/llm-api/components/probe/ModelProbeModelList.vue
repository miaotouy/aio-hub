<script setup lang="ts">
import { computed } from "vue";
import {
  Ban,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  LoaderCircle,
  Square,
} from "lucide-vue-next";
import { resolveProbePlan, type ChannelProbeResult } from "@aiohub/llm-core";
import { useI18n } from "@/i18n";
import type { ModelProbeRowStatus } from "../../composables/useModelProbe";
import type { LlmModelInfo } from "../../types";

const { tRaw } = useI18n();
const tr = (key: string, params?: Record<string, unknown>) =>
  tRaw(`tools.llm-api.ModelProbe.${key}`, params);

const props = defineProps<{
  models: LlmModelInfo[];
  selectedIds: string[];
  results: Record<string, ChannelProbeResult>;
  statuses: Record<string, ModelProbeRowStatus>;
  startedAt: Record<string, number>;
  now: number;
  running: boolean;
  stale: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle", modelId: string): void;
  (event: "detail", modelId: string): void;
}>();

const groups = computed(() => {
  const result = new Map<string, LlmModelInfo[]>();
  props.models.forEach((model) => {
    const group = model.group || tr("其他模型");
    result.set(group, [...(result.get(group) ?? []), model]);
  });
  return Array.from(result, ([name, models]) => ({ name, models }));
});

const capabilityLabelKeys: Record<string, string> = {
  chat: "Chat",
  embedding: "向量",
  rerank: "重排",
  image: "图片",
  audio: "音频",
  video: "视频",
  music: "音乐",
};

function plan(model: LlmModelInfo) {
  return resolveProbePlan(model);
}

function statusText(model: LlmModelInfo) {
  const result = props.results[model.id];
  const status = props.statuses[model.id];
  if (props.stale && result) return tr("配置已变化");
  if (status === "queued") return tr("等待中");
  if (status === "running") {
    const elapsed = Math.max(
      0,
      props.now - (props.startedAt[model.id] ?? props.now)
    );
    return tr("检查中N秒", { seconds: (elapsed / 1000).toFixed(1) });
  }
  if (status === "stopped") return result?.errorMessage || tr("已停止");
  if (result?.success)
    return tr("检查成功N毫秒", { ms: Math.round(result.totalMs) });
  if (result) return result.errorMessage || tr("检查失败");
  if (!plan(model).supported) return tr("不支持自动检查");
  if (plan(model).requiresExplicitConsent) return tr("需要付费确认");
  return tr("尚未检查");
}

function statusIcon(model: LlmModelInfo) {
  const result = props.results[model.id];
  const status = props.statuses[model.id];
  if (status === "running") return LoaderCircle;
  if (status === "queued") return Clock;
  if (status === "stopped") return Square;
  if (result?.success) return CircleCheck;
  if (result) return CircleX;
  if (!plan(model).supported) return Ban;
  return Clock;
}

function statusClass(model: LlmModelInfo) {
  const result = props.results[model.id];
  if (props.stale && result) return "warning";
  if (result?.success) return "success";
  if (result && result.category !== "cancelled") return "danger";
  return "muted";
}

function onRowClick(model: LlmModelInfo) {
  if (props.running) return;
  if (props.results[model.id]) emit("detail", model.id);
  else if (plan(model).supported) emit("toggle", model.id);
}
</script>

<template>
  <div class="probe-groups">
    <section v-for="group in groups" :key="group.name" class="probe-group">
      <h3>
        {{ group.name }} <span>{{ group.models.length }}</span>
      </h3>
      <div class="probe-rows">
        <div
          v-for="model in group.models"
          :key="model.id"
          class="probe-row"
          :class="{ unsupported: !plan(model).supported }"
          :aria-disabled="running || !plan(model).supported"
          :tabindex="running ? -1 : 0"
          role="button"
          @click="onRowClick(model)"
          @keydown.enter.prevent="onRowClick(model)"
          @keydown.space.prevent="onRowClick(model)"
        >
          <span
            class="check-target"
            @click.stop="
              !running && plan(model).supported && emit('toggle', model.id)
            "
          >
            <input
              type="checkbox"
              :checked="selectedIds.includes(model.id)"
              :disabled="running || !plan(model).supported"
              :aria-label="tr('选择模型', { name: model.name })"
              tabindex="-1"
            />
          </span>
          <span class="model-copy">
            <span class="model-title-line">
              <strong>{{ model.name }}</strong>
              <span class="capability">{{
                tr(capabilityLabelKeys[plan(model).capability])
              }}</span>
            </span>
            <code>{{ model.id }}</code>
            <span class="row-status" :class="statusClass(model)">
              <component
                :is="statusIcon(model)"
                :size="15"
                :class="{ spinning: statuses[model.id] === 'running' }"
              />
              <span>{{ statusText(model) }}</span>
              <span
                v-if="results[model.id]?.firstByteMs !== undefined"
                class="ttfb"
              >
                TTFB {{ Math.round(results[model.id].firstByteMs!) }} ms
              </span>
            </span>
          </span>
          <ChevronRight
            v-if="results[model.id]"
            :size="18"
            class="detail-chevron"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.probe-groups {
  display: grid;
  gap: 18px;
}

.probe-group h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 0 16px 7px;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
  font-weight: 700;
}

.probe-group h3 span {
  color: var(--color-primary);
}

.probe-rows {
  border-top: 1px solid var(--border-color, var(--color-outline-variant));
}

.probe-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 76px;
  padding: 7px 12px 7px 6px;
  border: 0;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
  color: var(--color-on-surface);
  text-align: left;
  background: transparent;
}

.probe-row:active:not([aria-disabled="true"]) {
  transform: scale(0.995);
  background: var(--color-surface-container);
}

.probe-row.unsupported .model-copy {
  opacity: 0.68;
}

.check-target {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}

.check-target input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-primary);
}

.model-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.model-title-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.model-title-line strong {
  min-width: 0;
  overflow: hidden;
  font-size: 0.92rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability {
  flex: none;
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 700;
}

code {
  overflow: hidden;
  color: var(--color-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-status {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  color: var(--color-on-surface-variant);
  font-size: 0.72rem;
}

.row-status span:not(.ttfb) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-status.success {
  color: var(--success-color);
}

.row-status.danger {
  color: var(--danger-color);
}

.row-status.warning {
  color: var(--warning-color);
}

.ttfb {
  flex: none;
  padding-left: 5px;
  border-left: 1px solid currentColor;
  opacity: 0.8;
}

.detail-chevron {
  margin-left: 8px;
  color: var(--color-on-surface-variant);
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .probe-row {
    transition: none;
  }
}
</style>
