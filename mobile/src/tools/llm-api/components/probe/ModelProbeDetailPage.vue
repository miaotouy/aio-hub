<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, Copy, RotateCcw } from "lucide-vue-next";
import type { ChannelProbeResult } from "@aiohub/llm-core";
import { customMessage } from "@/utils/feedback";
import { useI18n } from "@/i18n";
import type { LlmModelInfo } from "../../types";

const { tRaw } = useI18n();
const tr = (key: string, params?: Record<string, unknown>) =>
  tRaw(`tools.llm-api.ModelProbe.${key}`, params);

const props = defineProps<{
  show: boolean;
  model?: LlmModelInfo;
  result?: ChannelProbeResult;
  stale?: boolean;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "retry", modelId: string): void;
}>();

const phaseLabels: Record<string, string> = {
  prepare: "准备检查",
  "build-request": "构建请求",
  transport: "网络传输",
  "response-status": "响应状态",
  decode: "响应解析",
  "semantic-validation": "响应校验",
};

const categoryLabels: Record<string, string> = {
  authentication: "认证失败",
  authorization: "权限不足",
  "rate-limit": "请求受限",
  "bad-request": "请求无效",
  "model-unavailable": "模型不可用",
  "unsupported-capability": "能力不支持",
  configuration: "配置错误",
  network: "网络错误",
  timeout: "请求超时",
  provider: "上游异常",
  cancelled: "检查已停止",
  unknown: "未知错误",
};

const capabilityLabels: Record<string, string> = {
  chat: "Chat",
  embedding: "向量",
  rerank: "重排",
  image: "图片",
  audio: "音频",
  video: "视频",
  music: "音乐",
};

const usageText = computed(() => {
  const usage = props.result?.usage;
  return usage ? String(usage.totalTokens) : "-";
});

async function copyDiagnostic() {
  if (!props.result || !props.model) return;
  const result = props.result;
  const text = [
    `Model: ${props.model.id}`,
    `Capability: ${result.capability ?? "unknown"}`,
    `Tested At: ${new Date(result.testedAt).toISOString()}`,
    `HTTP: ${result.status ?? "unknown"}`,
    `Phase: ${result.phase}`,
    `Category: ${result.category ?? "none"}`,
    `Summary: ${result.responsePreview ?? result.errorMessage ?? "none"}`,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    customMessage(tr("诊断已复制"), "success");
  } catch {
    customMessage(tr("复制失败"), "error");
  }
}
</script>

<template>
  <section
    v-if="show && model && result"
    class="detail-page"
    :aria-label="tr('诊断详情')"
  >
    <header class="detail-header">
      <button
        class="icon-button"
        :aria-label="tr('返回模型检查')"
        @click="emit('close')"
      >
        <ChevronLeft :size="24" />
      </button>
      <h2>{{ tr("诊断详情") }}</h2>
      <button
        class="icon-button"
        :aria-label="tr('复制诊断信息')"
        @click="copyDiagnostic"
      >
        <Copy :size="20" />
      </button>
    </header>

    <div class="detail-content">
      <div class="model-heading">
        <div class="model-name">{{ model.name }}</div>
        <code>{{ model.id }}</code>
        <div class="capability-label">
          {{ tr(capabilityLabels[result.capability ?? "chat"]) }}
        </div>
      </div>

      <div v-if="stale" class="stale-notice">{{ tr("结果过期提示") }}</div>

      <section class="detail-section">
        <h3>{{ tr("状态") }}</h3>
        <div
          class="status-summary"
          :class="result.success ? 'success' : 'failed'"
        >
          <strong>{{
            result.success
              ? tr("检查成功")
              : tr(categoryLabels[result.category ?? "unknown"])
          }}</strong>
          <span>{{
            result.responsePreview ?? result.errorMessage ?? tr("无摘要")
          }}</span>
        </div>
      </section>

      <section class="detail-section">
        <h3>{{ tr("指标") }}</h3>
        <dl class="metric-grid">
          <div>
            <dt>{{ tr("总耗时") }}</dt>
            <dd>{{ Math.round(result.totalMs) }} ms</dd>
          </div>
          <div>
            <dt>TTFB</dt>
            <dd>
              {{
                result.firstByteMs === undefined
                  ? "-"
                  : `${Math.round(result.firstByteMs)} ms`
              }}
            </dd>
          </div>
          <div>
            <dt>HTTP</dt>
            <dd>{{ result.status ?? "-" }}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{{ usageText }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ tr("诊断") }}</h3>
        <dl class="diagnostic-list">
          <div>
            <dt>{{ tr("阶段") }}</dt>
            <dd>
              <span>{{ tr(phaseLabels[result.phase]) }}</span
              ><code>{{ result.phase }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ tr("分类") }}</dt>
            <dd>
              <span>{{ tr(categoryLabels[result.category ?? "unknown"]) }}</span
              ><code>{{ result.category ?? "none" }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ tr("检查时间") }}</dt>
            <dd>{{ new Date(result.testedAt).toLocaleString() }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <div class="section-title-row">
          <h3>{{ result.success ? tr("响应摘要") : tr("错误摘要") }}</h3>
          <button class="copy-button" @click="copyDiagnostic">
            <Copy :size="16" />{{ tr("复制") }}
          </button>
        </div>
        <pre>{{
          result.responsePreview ??
          result.errorDetail ??
          result.errorMessage ??
          tr("无可用摘要")
        }}</pre>
      </section>
    </div>

    <footer class="detail-footer">
      <button class="primary-button" @click="emit('retry', model.id)">
        <RotateCcw :size="18" />
        {{ tr("重试此模型") }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.detail-page {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: var(--color-on-surface);
  background: var(--color-surface);
}

.detail-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 8px 0;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
  background: var(--container-bg, var(--color-surface));
}

.detail-header h2 {
  overflow: hidden;
  margin: 0;
  font-size: 1.05rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: var(--app-radius-md);
  color: inherit;
  background: transparent;
}

.detail-content {
  overflow-y: auto;
  padding: 20px 18px 28px;
}

.model-heading {
  display: grid;
  gap: 5px;
}

.model-name {
  font-size: 1.25rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

code,
pre,
.metric-grid dd {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.model-heading code,
.diagnostic-list code {
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.capability-label {
  color: var(--color-primary);
  font-size: 0.82rem;
  font-weight: 700;
}

.stale-notice {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 3px solid var(--warning-color);
  color: var(--color-on-surface);
  background: color-mix(in srgb, var(--warning-color) 12%, transparent);
}

.detail-section {
  margin-top: 24px;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: 0.88rem;
}

.status-summary {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--border-color, var(--color-outline-variant));
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
}

.status-summary strong.success,
.status-summary.success strong {
  color: var(--success-color);
}

.status-summary.failed strong {
  color: var(--danger-color);
}

.status-summary span {
  color: var(--color-on-surface-variant);
  font-size: 0.86rem;
  line-height: 1.5;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin: 0;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
  background: var(--border-color, var(--color-outline-variant));
}

.metric-grid div {
  min-width: 0;
  padding: 12px;
  background: var(--container-bg, var(--color-surface-container));
}

.metric-grid dt,
.diagnostic-list dt {
  color: var(--color-on-surface-variant);
  font-size: 0.75rem;
}

.metric-grid dd {
  margin: 4px 0 0;
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.diagnostic-list {
  margin: 0;
  border-top: 1px solid var(--border-color, var(--color-outline-variant));
}

.diagnostic-list > div {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border-color, var(--color-outline-variant));
}

.diagnostic-list dd {
  display: grid;
  gap: 3px;
  margin: 0;
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 44px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
}

pre {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border-color, var(--color-outline-variant));
  border-radius: var(--app-radius-md);
  color: var(--color-on-surface);
  background: var(--input-bg, var(--color-surface-container));
  font-size: 0.76rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-footer {
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-color, var(--color-outline-variant));
  background: var(--container-bg, var(--color-surface));
  backdrop-filter: blur(var(--ui-blur));
}

.primary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--color-primary);
  border-radius: var(--app-radius-md);
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-weight: 700;
}
</style>
