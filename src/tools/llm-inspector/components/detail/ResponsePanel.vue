<template>
  <div class="response-panel">
    <!-- Segment Control: 结构化 / 原始 -->
    <div class="segment-control">
      <button
        @click="mode = 'structured'"
        class="segment-btn"
        :class="{ active: mode === 'structured' }"
      >
        <Sparkles :size="13" />
        <span>结构化</span>
      </button>
      <button
        @click="mode = 'raw'"
        class="segment-btn"
        :class="{ active: mode === 'raw' }"
      >
        <Braces :size="13" />
        <span>原始</span>
        <span v-if="isStreamingResponse" class="stream-dot" title="流式响应">
          <Circle
            v-if="isStreamingActive"
            :size="6"
            fill="currentColor"
            class="live-dot"
          />
          <Zap v-else :size="10" />
        </span>
      </button>
    </div>

    <!-- 内容区 -->
    <div class="panel-content">
      <ResponseStructuredView v-if="mode === 'structured'" :record="record" />
      <ResponseRawView v-else :record="record" :mask-api-keys="maskApiKeys" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Braces, Circle, Sparkles, Zap } from "lucide-vue-next";
import ResponseStructuredView from "./views/ResponseStructuredView.vue";
import ResponseRawView from "./views/ResponseRawView.vue";
import { useRecordDetail } from "../../composables/useRecordDetail";
import type { CombinedRecord } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
  maskApiKeys?: boolean;
}>();

type Mode = "structured" | "raw";
const mode = ref<Mode>("structured");

// 借用 useRecordDetail 拿流式状态用于角标（props 已满足签名，无需 as any）
const { isStreamingActive, isStreamingResponse } = useRecordDetail(props);
</script>

<style scoped>
.response-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.segment-control {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  flex-shrink: 0;
  align-self: flex-start;
}

.segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  position: relative;
}

.segment-btn:hover {
  background: var(--container-bg);
}

.segment-btn.active {
  background: var(--primary-color);
  color: #ffffff;
}

.stream-dot {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  color: var(--el-color-danger, #f56c6c);
}

.segment-btn.active .stream-dot {
  color: #ffffff;
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

.panel-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
