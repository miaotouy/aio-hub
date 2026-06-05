<template>
  <section class="results-panel">
    <div v-if="visibleResults.length === 0" class="empty-state">
      <Languages class="empty-icon" />
      <p class="empty-title">尚未开始翻译</p>
      <p class="empty-hint">输入文本后按 Ctrl + Enter 或点击翻译</p>
    </div>

    <div
      v-else
      class="result-list"
      :class="{ 'single-card': visibleResults.length === 1 }"
    >
      <article
        v-for="result in visibleResults"
        :key="result.channelId"
        class="result-card"
        :class="[`status-${result.status}`]"
      >
        <header class="result-header">
          <div class="channel-info">
            <span class="status-dot" />
            <span class="channel-name">{{ result.channelName }}</span>
            <span class="status-label">{{ statusLabel(result.status) }}</span>
          </div>

          <button
            v-if="result.longTextTask"
            type="button"
            class="split-progress"
            @click="openSplitDetails(result.longTextTask)"
          >
            <ListTree class="split-progress-icon" />
            <span>
              {{ splitCompletedCount(result.longTextTask) }}/{{
                result.longTextTask.chunks.length
              }}
              分片
            </span>
            <el-progress
              class="split-progress-bar"
              :percentage="result.longTextTask.progress"
              :show-text="false"
              :stroke-width="5"
            />
          </button>

          <div class="header-actions">
            <el-tooltip
              v-if="
                result.status === 'streaming' || result.status === 'pending'
              "
              content="停止此渠道"
              placement="top"
            >
              <el-button
                class="icon-button"
                :icon="Square"
                @click="store.abortChannel(result.channelId)"
              />
            </el-tooltip>
            <el-tooltip v-else content="重试此渠道" placement="top">
              <el-button
                class="icon-button"
                :icon="RotateCw"
                :disabled="!canRetry"
                @click="handleRetry(result.channelId)"
              />
            </el-tooltip>
            <el-tooltip content="复制译文" placement="top">
              <el-button
                class="icon-button"
                :icon="Copy"
                :disabled="!result.content"
                @click="copyResult(result.content)"
              />
            </el-tooltip>
          </div>
        </header>

        <div
          :ref="(el) => setContentRef(result.channelId, el)"
          class="result-content"
          @scroll="handleContentScroll(result.channelId, $event)"
        >
          <el-alert
            v-if="result.status === 'failed' && result.error"
            type="error"
            :title="result.error"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="result.status === 'aborted' && !result.content"
            type="info"
            title="已停止"
            description="翻译被手动中断"
            :closable="false"
            show-icon
          />
          <div v-else-if="result.content" class="result-text">
            {{ result.content
            }}<span
              v-if="result.status === 'streaming'"
              class="streaming-cursor"
              aria-hidden="true"
            />
          </div>
          <div v-else-if="result.status === 'pending'" class="placeholder">
            <Loader2 class="spinner" />
            <span>等待响应</span>
          </div>
          <div v-else-if="result.status === 'streaming'" class="placeholder">
            <Loader2 class="spinner" />
            <span>开始接收</span>
          </div>
          <el-empty v-else :image-size="72" description="无内容" />
        </div>

        <footer class="result-footer">
          <div class="footer-left">
            <span
              v-if="result.status === 'streaming'"
              class="footer-tag streaming"
            >
              生成中 · {{ result.content.length }} 字
            </span>
            <span v-else-if="result.status === 'pending'" class="footer-tag">
              排队中
            </span>
            <span
              v-else-if="result.status === 'aborted'"
              class="footer-tag aborted"
            >
              已停止
            </span>
            <template v-else>
              <span v-if="result.duration" class="footer-tag">
                {{ formatDuration(result.duration) }}
              </span>
              <span v-if="result.content" class="footer-tag">
                {{ result.content.length }} 字
              </span>
              <span
                v-if="
                  result.finishReason === 'max_tokens' ||
                  result.finishReason === 'length'
                "
                class="footer-tag warning"
              >
                输出截断 · 上限
                {{ result.appliedMaxTokens?.toLocaleString() ?? "-" }}
              </span>
            </template>
          </div>
          <div class="footer-right">
            <span v-if="result.tokenUsage" class="footer-tag muted">
              ↑{{ result.tokenUsage.promptTokens }} ↓{{
                result.tokenUsage.completionTokens
              }}
            </span>
            <el-tooltip
              v-if="result.modelOutputLimit && result.appliedMaxTokens"
              :content="`本次输出上限：${result.appliedMaxTokens.toLocaleString()} · 模型最大：${result.modelOutputLimit.toLocaleString()}`"
              placement="top"
            >
              <span class="footer-tag muted limit">
                max {{ formatMaxTokens(result.appliedMaxTokens) }}
              </span>
            </el-tooltip>
          </div>
        </footer>
      </article>
    </div>
    <SplitDetailDrawer
      v-model="splitDrawerVisible"
      :task="activeSplitTask"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Copy,
  Languages,
  ListTree,
  Loader2,
  RotateCw,
  Square,
} from "lucide-vue-next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { customMessage } from "@/utils/customMessage";
import { useTranslatorStore } from "../composables/useTranslatorStore";
import SplitDetailDrawer from "./SplitDetailDrawer.vue";
import type { LongTextTask, TranslationResultStatus } from "../types";

const store = useTranslatorStore();

const visibleResults = computed(() => store.results);

const canRetry = computed(
  () => !!store.inputText.trim() && store.activeChannels.length > 0
);

const contentRefs = new Map<string, HTMLElement>();
/** 用户手动滚走的渠道，会暂停自动吸底，直到再次回到底部 */
const userScrolledAway = new Set<string>();
const splitDrawerVisible = ref(false);
const activeSplitChannelId = ref<string | undefined>();
const activeSplitTask = computed(() =>
  visibleResults.value.find(
    (result) => result.channelId === activeSplitChannelId.value
  )?.longTextTask
);

function setContentRef(channelId: string, el: unknown) {
  if (el instanceof HTMLElement) {
    contentRefs.set(channelId, el);
  } else {
    contentRefs.delete(channelId);
  }
}

function isAtBottom(el: HTMLElement, threshold = 24) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function handleContentScroll(channelId: string, event: Event) {
  const el = event.target as HTMLElement;
  if (isAtBottom(el)) {
    userScrolledAway.delete(channelId);
  } else {
    userScrolledAway.add(channelId);
  }
}

function autoScrollStreaming() {
  if (!store.settings.autoScrollResults) return;
  nextTick(() => {
    for (const result of visibleResults.value) {
      if (result.status !== "streaming" && result.status !== "pending") {
        continue;
      }
      if (userScrolledAway.has(result.channelId)) continue;
      const el = contentRefs.get(result.channelId);
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
}

watch(
  () =>
    visibleResults.value
      .map((r) => `${r.channelId}:${r.content.length}:${r.status}`)
      .join("|"),
  autoScrollStreaming
);

/** 渠道完成 / 失败时清掉 userScrolledAway 标记，下次重新流式时恢复吸底 */
watch(
  () =>
    visibleResults.value
      .filter((r) => r.status !== "streaming" && r.status !== "pending")
      .map((r) => r.channelId)
      .join(","),
  (settled) => {
    for (const id of settled.split(",").filter(Boolean)) {
      userScrolledAway.delete(id);
    }
  }
);

function statusLabel(status: TranslationResultStatus) {
  switch (status) {
    case "pending":
      return "排队";
    case "streaming":
      return "生成中";
    case "completed":
      return "完成";
    case "aborted":
      return "已停止";
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

function formatMaxTokens(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return String(value);
}

function splitCompletedCount(task: LongTextTask) {
  return task.chunks.filter((chunk) => chunk.status === "completed").length;
}

function openSplitDetails(task: LongTextTask) {
  activeSplitChannelId.value = task.id;
  splitDrawerVisible.value = true;
}

async function copyResult(content: string) {
  if (!content) return;
  await writeText(content);
  customMessage.success("译文已复制");
}

async function handleRetry(channelId: string) {
  if (!canRetry.value) return;
  await store.retryChannel(channelId);
}
</script>

<style scoped>
.results-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-color);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px;
  color: var(--text-color-secondary);
  text-align: center;
}

.empty-icon {
  width: 52px;
  height: 52px;
  color: var(--primary-color);
  opacity: 0.7;
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.empty-hint {
  margin: 0;
  font-size: 12px;
}

.result-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 14px;
  overflow: auto;
  box-sizing: border-box;
  align-content: start;
}

.result-list.single-card {
  grid-template-columns: 1fr;
}

.result-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 360px;
  max-height: min(720px, 78vh);
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition: border-color 0.18s ease;
}

.result-list.single-card .result-card {
  max-height: 100%;
  height: 100%;
}

.result-card.status-streaming {
  border-color: color-mix(
    in srgb,
    var(--primary-color) 56%,
    var(--border-color)
  );
  box-shadow: 0 0 0 1px
    color-mix(in srgb, var(--primary-color) 20%, transparent) inset;
}

.result-card.status-failed {
  border-color: color-mix(
    in srgb,
    var(--el-color-danger) 55%,
    var(--border-color)
  );
}

.result-card.status-aborted {
  border-color: color-mix(
    in srgb,
    var(--el-color-warning) 50%,
    var(--border-color)
  );
}

.result-card.status-completed {
  border-color: color-mix(
    in srgb,
    var(--el-color-success) 32%,
    var(--border-color)
  );
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}

.channel-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-color-secondary);
  flex-shrink: 0;
}

.status-streaming .status-dot {
  background: var(--primary-color);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

.status-pending .status-dot {
  background: var(--el-color-info);
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.status-failed .status-dot {
  background: var(--el-color-danger);
}

.status-aborted .status-dot {
  background: var(--el-color-warning);
}

.status-completed .status-dot {
  background: var(--el-color-success);
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(1.25);
  }
}

.channel-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.status-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--input-bg);
  flex-shrink: 0;
}

.status-streaming .status-label {
  color: var(--primary-color);
}

.status-failed .status-label {
  color: var(--el-color-danger);
}

.status-aborted .status-label {
  color: var(--el-color-warning);
}

.status-completed .status-label {
  color: var(--el-color-success);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.split-progress {
  appearance: none;
  display: grid;
  grid-template-columns: 14px auto 64px;
  align-items: center;
  gap: 6px;
  min-width: 150px;
  max-width: 220px;
  padding: 4px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.split-progress:hover {
  color: var(--primary-color);
  border-color: color-mix(
    in srgb,
    var(--primary-color) 44%,
    var(--border-color)
  );
}

.split-progress-icon {
  width: 14px;
  height: 14px;
}

.split-progress-bar {
  width: 64px;
}

.icon-button {
  width: 28px;
  height: 28px;
  padding: 0;
}

.result-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  scroll-behavior: smooth;
}

.result-text {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.72;
}

.streaming-cursor {
  display: inline-block;
  width: 8px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--primary-color);
  animation: cursor-blink 1s steps(2, start) infinite;
}

@keyframes cursor-blink {
  to {
    visibility: hidden;
  }
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 16px;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.spinner {
  width: 18px;
  height: 18px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 34px;
  padding: 7px 12px;
  border-top: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.footer-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-color-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.footer-tag.streaming {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, var(--input-bg));
}

.footer-tag.warning {
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 14%, var(--input-bg));
}

.footer-tag.aborted {
  color: var(--el-color-warning);
}

.footer-tag.muted {
  color: var(--text-color-secondary);
  opacity: 0.78;
}

.footer-tag.limit {
  cursor: help;
}

@media (max-width: 860px) {
  .result-list {
    grid-template-columns: 1fr;
  }

  .result-card {
    min-height: 320px;
    max-height: 70vh;
  }
}
</style>
