<script setup lang="ts">
import { computed } from "vue";
import { ChevronLeft, Copy, RotateCcw } from "lucide-vue-next";
import type { ChannelProbeResult } from "@aiohub/llm-core";
import { customMessage } from "@/utils/feedback";
import { useScopedT, type SubKeyOf } from "@/i18n";
import type { LlmModelInfo } from "../../types";

const tr = useScopedT("tools.llm-api.ModelProbe");
type ProbeKey = SubKeyOf<"tools.llm-api.ModelProbe">;

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

const phaseLabels: Record<string, ProbeKey> = {
  prepare: "准备检查",
  "build-request": "构建请求",
  transport: "网络传输",
  "response-status": "响应状态",
  decode: "响应解析",
  "semantic-validation": "响应校验",
};

const categoryLabels: Record<string, ProbeKey> = {
  authentication: "认证失败",
  authorization: "权限不足",
  "rate-limit": "请求受限",
  "bad-request": "请求无效",
  "model-unavailable": "模型不可用",
  "unsupported-capability": "能力不支持",
  configuration: "配置错误",
  network: "网络错误",
  proxy: "本地代理错误",
  timeout: "请求超时",
  provider: "上游异常",
  cancelled: "检查已停止",
  unknown: "未知错误",
};

const capabilityLabels: Record<string, ProbeKey> = {
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
  color: var(--text-color);
  background: var(--bg-color);
}

.detail-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: calc(56px + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 8px 0;
  border-bottom: 1px solid var(--border-color, var(--border-color));
  background: var(--container-bg, var(--bg-color));
}

.detail-header h2 {
  overflow: hidden;
  margin: 0;
  font-size: var(--font-size-lg);
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
  font-size: var(--font-size-xl);
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
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.capability-label {
  color: var(--primary-color);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.stale-notice {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 3px solid var(--warning-color);
  color: var(--text-color);
  background: color-mix(in srgb, var(--warning-color) 12%, transparent);
}

.detail-section {
  margin-top: 24px;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
}

.status-summary {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid var(--border-color, var(--border-color));
  border-bottom: 1px solid var(--border-color, var(--border-color));
}

.status-summary strong.success,
.status-summary.success strong {
  color: var(--success-color);
}

.status-summary.failed strong {
  color: var(--danger-color);
}

.status-summary span {
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin: 0;
  border: 1px solid var(--border-color, var(--border-color));
  border-radius: var(--app-radius-md);
  background: var(--border-color, var(--border-color));
}

.metric-grid div {
  min-width: 0;
  padding: 12px;
  background: var(--container-bg, var(--container-bg));
}

.metric-grid dt,
.diagnostic-list dt {
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}

.metric-grid dd {
  margin: 4px 0 0;
  font-size: var(--font-size-sm);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.diagnostic-list {
  margin: 0;
  border-top: 1px solid var(--border-color, var(--border-color));
}

.diagnostic-list > div {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border-color, var(--border-color));
}

.diagnostic-list dd {
  display: grid;
  gap: 3px;
  margin: 0;
  font-size: var(--font-size-sm);
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
  color: var(--primary-color);
  background: transparent;
}

pre {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border-color, var(--border-color));
  border-radius: var(--app-radius-md);
  color: var(--text-color);
  background: var(--input-bg, var(--container-bg));
  font-size: var(--font-size-xs);
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-footer {
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border-color, var(--border-color));
  background: var(--container-bg, var(--bg-color));
  backdrop-filter: blur(var(--ui-blur));
}

.primary-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--primary-color);
  border-radius: var(--app-radius-md);
  color: var(--color-on-primary);
  background: var(--primary-color);
  font-weight: 700;
}
</style>
