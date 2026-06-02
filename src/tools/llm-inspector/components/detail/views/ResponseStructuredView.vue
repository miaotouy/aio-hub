<template>
  <div class="response-structured-view">
    <!-- 顶部信息条 -->
    <div class="info-bar">
      <span class="info-chip">
        <Code2 :size="12" />
        <span class="info-label">格式：</span>
        <span class="info-value">{{ apiFormat }}</span>
      </span>
      <span v-if="responseParseResult?.model" class="info-chip">
        <Cpu :size="12" />
        <span class="info-label">模型：</span>
        <span class="info-value">{{ responseParseResult.model }}</span>
      </span>
      <span v-if="responseParseResult?.stopReason" class="info-chip">
        <Flag :size="12" />
        <span class="info-label">停止原因：</span>
        <span class="info-value">{{ responseParseResult.stopReason }}</span>
      </span>
    </div>

    <div v-if="!hasContent" class="response-placeholder">
      <Hourglass :size="14" />
      <span>{{
        isStreamingActive ? "等待流式数据到达…" : "响应体尚未到达"
      }}</span>
    </div>

    <!-- 流式响应：实时渲染累积正文 -->
    <template v-else-if="isStreamingResponse || isStreamingActive">
      <div v-if="isStreamingActive" class="streaming-banner">
        <Circle :size="8" fill="currentColor" class="live-dot" />
        <span>正在实时接收 · {{ extractedContent.length }} 字符</span>
      </div>
      <StructuredMessagesView
        :messages="streamingMessages"
        :errors="[]"
        badge-kind="real"
      />
    </template>

    <!-- 解析失败提示（非流式场景下才显示） -->
    <div
      v-else-if="
        responseParseResult &&
        responseParseResult.messages.length === 0 &&
        responseParseResult.errors.length > 0
      "
      class="response-note"
    >
      <Info :size="13" />
      <span>{{ responseParseResult.errors.join(" · ") }}</span>
    </div>

    <!-- 普通 JSON 响应 -->
    <StructuredMessagesView
      v-else-if="responseParseResult"
      :messages="responseParseResult.messages"
      :errors="responseParseResult.errors"
      badge-kind="real"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Circle, Code2, Cpu, Flag, Hourglass, Info } from "lucide-vue-next";
import StructuredMessagesView from "../StructuredMessagesView.vue";
import { parseResponseMessages } from "../../../core/messageParser";
import { detectApiFormat } from "../../../core/utils";
import { useRecordDetail } from "../../../composables/useRecordDetail";
import type {
  CombinedRecord,
  ParsedMessage,
  ResponseParseResult,
} from "../../../types";

const props = defineProps<{
  record: CombinedRecord;
}>();

const { isStreamingActive, isStreamingResponse, extractedContent } =
  useRecordDetail(props);

const apiFormat = computed(() => detectApiFormat(props.record.request.url));

const hasResponseBody = computed(() => Boolean(props.record.response?.body));

// 凡是有响应体 / 正在流式 / 已经提取出累积文本，就允许结构化视图渲染
const hasContent = computed(() => {
  return (
    hasResponseBody.value ||
    isStreamingActive.value ||
    Boolean(extractedContent.value)
  );
});

// 流式响应：把累积的正文包装为 assistant 消息，让 StructuredMessagesView 实时渲染
const streamingMessages = computed<ParsedMessage[]>(() => {
  const text = extractedContent.value;
  if (!text) return [];
  return [
    {
      role: "assistant",
      blocks: [{ type: "text", text }],
      raw: text,
    },
  ];
});

// 普通 JSON 响应解析
const responseParseResult = computed<ResponseParseResult | null>(() => {
  if (!hasResponseBody.value) return null;
  return parseResponseMessages(props.record.response?.body, apiFormat.value);
});
</script>

<style scoped>
.response-structured-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.06));
  border: var(--border-width) solid
    rgba(var(--primary-rgb), calc(var(--card-opacity) * 0.2));
  border-radius: 6px;
}

.info-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-color);
}

.info-label {
  color: var(--text-color-light);
}

.info-value {
  font-family: "Courier New", monospace;
  font-weight: 600;
  color: var(--primary-color);
}

.response-placeholder,
.response-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.08));
  border: var(--border-width) dashed
    rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 4px;
  color: var(--text-color-light);
  font-size: 13px;
}

/* 流式实时接收提示条 */
.streaming-banner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border: var(--border-width) solid
    rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.3));
  border-radius: 10px;
  color: var(--el-color-danger, #f56c6c);
  font-size: 11px;
  font-weight: 600;
  align-self: flex-start;
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
</style>
