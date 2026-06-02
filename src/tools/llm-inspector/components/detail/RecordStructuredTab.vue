<template>
  <div class="structured-tab">
    <!-- 顶部信息条：格式 / 模型 / 流式 / 响应模型 / 停止原因 -->
    <div class="info-bar">
      <span class="info-chip">
        <Code2 :size="12" />
        <span class="info-label">格式：</span>
        <span class="info-value">{{ apiFormat }}</span>
      </span>
      <span v-if="requestParseResult.model" class="info-chip">
        <Cpu :size="12" />
        <span class="info-label">请求模型：</span>
        <span class="info-value">{{ requestParseResult.model }}</span>
      </span>
      <span
        v-if="
          responseParseResult?.model &&
          responseParseResult.model !== requestParseResult.model
        "
        class="info-chip"
      >
        <Cpu :size="12" />
        <span class="info-label">响应模型：</span>
        <span class="info-value">{{ responseParseResult.model }}</span>
      </span>
      <span v-if="requestParseResult.stream !== undefined" class="info-chip">
        <Zap :size="12" />
        <span class="info-label">Stream：</span>
        <span class="info-value">{{
          requestParseResult.stream ? "true" : "false"
        }}</span>
      </span>
      <span v-if="responseParseResult?.stopReason" class="info-chip">
        <Flag :size="12" />
        <span class="info-label">停止原因：</span>
        <span class="info-value">{{ responseParseResult.stopReason }}</span>
      </span>
    </div>

    <!-- 请求消息 -->
    <section class="structured-section">
      <div class="section-title">
        <ArrowUpFromLine :size="14" />
        <span>请求消息</span>
      </div>
      <StructuredMessagesView
        :messages="requestParseResult.messages"
        :errors="requestParseResult.errors"
        badge-kind="real"
      />
    </section>

    <!-- 响应消息（仅在响应到达后渲染） -->
    <section v-if="hasResponseBody" class="structured-section">
      <div class="section-title">
        <ArrowDownToLine :size="14" />
        <span>响应消息</span>
      </div>
      <div v-if="!responseParseResult" class="response-placeholder">
        <Hourglass :size="14" />
        <span>响应体尚未到达</span>
      </div>
      <div
        v-else-if="
          responseParseResult.messages.length === 0 &&
          responseParseResult.errors.length > 0
        "
        class="response-note"
      >
        <Info :size="13" />
        <span>
          {{ responseParseResult.errors.join(" · ") }}
          <em v-if="isStreamingLike" class="hint">
            （流式响应建议切换到「流式」Tab 查看实时累积内容，E4 待开）
          </em>
        </span>
      </div>
      <StructuredMessagesView
        v-else
        :messages="responseParseResult.messages"
        :errors="responseParseResult.errors"
        badge-kind="real"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Code2,
  Cpu,
  Flag,
  Hourglass,
  Info,
  Zap,
} from "lucide-vue-next";
import StructuredMessagesView from "./StructuredMessagesView.vue";
import {
  parseRequestMessages,
  parseResponseMessages,
} from "../../core/messageParser";
import { detectApiFormat } from "../../core/utils";
import type {
  CombinedRecord,
  RequestParseResult,
  ResponseParseResult,
} from "../../types";

const props = defineProps<{
  record: CombinedRecord;
}>();

// 自动检测 API 格式
const apiFormat = computed(() => detectApiFormat(props.record.request.url));

// 请求解析
const requestParseResult = computed<RequestParseResult>(() => {
  return parseRequestMessages(props.record.request.body, apiFormat.value);
});

// 响应是否存在响应体
const hasResponseBody = computed(() => {
  return Boolean(props.record.response?.body);
});

// 是否疑似流式响应（响应头声明 SSE）
const isStreamingLike = computed(() => {
  const headers = props.record.response?.headers ?? {};
  const contentType = headers["content-type"] || headers["Content-Type"] || "";
  return contentType.includes("text/event-stream");
});

// 响应解析（仅在响应体存在时执行）
const responseParseResult = computed<ResponseParseResult | null>(() => {
  if (!hasResponseBody.value) return null;
  return parseResponseMessages(props.record.response?.body, apiFormat.value);
});
</script>

<style scoped>
.structured-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 顶部信息条 === */
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

/* === 各 Section === */
.structured-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  padding-bottom: 6px;
  border-bottom: var(--border-width) solid var(--border-color);
}

/* 响应占位 / 提示 */
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

.response-note .hint {
  margin-left: 6px;
  color: var(--text-color-light);
  font-style: italic;
  font-size: 12px;
}
</style>
