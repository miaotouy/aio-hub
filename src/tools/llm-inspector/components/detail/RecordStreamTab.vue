<template>
  <div class="stream-tab">
    <!-- 顶部状态条 -->
    <div class="stream-status-bar">
      <span class="status-indicator" :class="{ active: isStreamingActive }">
        <Circle
          v-if="isStreamingActive"
          :size="8"
          fill="currentColor"
          class="live-dot"
        />
        <CircleCheck v-else :size="13" />
        <span>{{ isStreamingActive ? "实时接收中" : "流式传输已结束" }}</span>
      </span>
      <span class="stream-stats">
        <span class="stat">
          <Hash :size="11" />
          缓冲: <strong>{{ rawContent.length }}</strong> 字符
        </span>
        <span class="stat">
          <FileText :size="11" />
          正文: <strong>{{ extracted.length }}</strong> 字符
        </span>
      </span>
      <div class="status-actions">
        <button
          class="action-btn"
          :class="{ active: autoScroll }"
          @click="autoScroll = !autoScroll"
          :title="autoScroll ? '关闭自动滚动' : '开启自动滚动'"
        >
          <ChevronsDown :size="13" />
          自动滚动
        </button>
        <div class="view-mode-toggle">
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'text' }"
            @click="viewMode = 'text'"
            title="打字机正文模式"
          >
            <Type :size="13" />
            正文
          </button>
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'raw' }"
            @click="viewMode = 'raw'"
            title="原始 SSE 缓冲"
          >
            <Braces :size="13" />
            原始
          </button>
        </div>
        <button
          class="action-btn"
          @click="copyContent"
          title="复制当前视图内容"
        >
          <Copy :size="13" />
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div
      ref="contentRef"
      class="stream-content"
      :class="{ 'text-mode': viewMode === 'text' }"
    >
      <template v-if="viewMode === 'text'">
        <div v-if="extracted" class="typewriter-text">{{ extracted }}</div>
        <div v-else-if="isStreamingActive" class="placeholder">
          <LoaderCircle :size="20" class="spin-icon" />
          <span>等待首个 chunk 到达...</span>
        </div>
        <div v-else class="placeholder">
          <Info :size="20" />
          <span>暂无正文内容</span>
        </div>
      </template>
      <template v-else>
        <pre v-if="rawContent">{{ rawContent }}</pre>
        <div v-else-if="isStreamingActive" class="placeholder">
          <LoaderCircle :size="20" class="spin-icon" />
          <span>等待首个 chunk 到达...</span>
        </div>
        <div v-else class="placeholder">
          <Info :size="20" />
          <span>暂无原始数据</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Braces,
  ChevronsDown,
  Circle,
  CircleCheck,
  Copy,
  FileText,
  Hash,
  Info,
  LoaderCircle,
  Type,
} from "lucide-vue-next";
import { useStreamProcessor } from "../../core/streamProcessor";
import { copyToClipboard, maskSensitiveData } from "../../core/utils";
import type { CombinedRecord } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

const streamProcessor = useStreamProcessor();

// 视图模式（默认 text 打字机）
const viewMode = ref<"text" | "raw">("text");

// 自动滚动到底部
const autoScroll = ref(true);

// 内容容器
const contentRef = ref<HTMLElement | null>(null);

// 当前是否正在流式中（响应式跟踪）
const isStreamingActive = computed(() =>
  streamProcessor.activeStreamIds.value.has(props.record.id)
);

// 原始累积内容（含格式化后的 SSE 文本）
const rawContent = computed(() =>
  streamProcessor.getDisplayResponseBody(
    props.record.id,
    props.record.response?.body,
    true
  )
);

// 提取后的正文（打字机视图用）
const extracted = computed(() =>
  streamProcessor.extractContent(
    props.record.id,
    props.record.response?.body,
    true,
    props.record.request.url
  )
);

// 监听内容变化，自动滚动到底部
watch([rawContent, extracted, viewMode], async () => {
  if (!autoScroll.value) return;
  await nextTick();
  const el = contentRef.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
});

// 切换记录时重置滚动到顶部
watch(
  () => props.record.id,
  async () => {
    await nextTick();
    const el = contentRef.value;
    if (el) {
      el.scrollTop = 0;
    }
  }
);

async function copyContent() {
  const content =
    viewMode.value === "text" ? extracted.value : rawContent.value;
  const text = props.maskApiKeys ? maskSensitiveData(content) : content;
  await copyToClipboard(text, "已复制流式内容");
}
</script>

<style scoped>
.stream-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

/* === 状态条 === */
.stream-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) solid
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 6px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-light);
}

.status-indicator.active {
  color: var(--el-color-danger, #f56c6c);
}

.live-dot {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.stream-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-color-light);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.stat strong {
  color: var(--text-color);
  font-family: "Courier New", monospace;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--card-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.action-btn:hover {
  border-color: var(--primary-color);
}

.action-btn.active {
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.15));
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* === 视图模式切换 === */
.view-mode-toggle {
  display: flex;
  gap: 2px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  padding: 2px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: var(--container-bg);
}

.mode-btn.active {
  background: var(--primary-color);
  color: #ffffff;
}

/* === 内容区 === */
.stream-content {
  flex: 1;
  min-height: 200px;
  background: var(--bg-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 16px;
  overflow: auto;
  scroll-behavior: smooth;
}

.stream-content pre {
  margin: 0;
  color: var(--text-color);
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.stream-content.text-mode {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
}

.typewriter-text {
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-color-light);
  font-size: 13px;
}

.spin-icon {
  animation: spin 1.4s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
