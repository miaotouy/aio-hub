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

    <div v-if="!hasResponseBody" class="response-placeholder">
      <Hourglass :size="14" />
      <span>响应体尚未到达</span>
    </div>
    <div
      v-else-if="
        responseParseResult &&
        responseParseResult.messages.length === 0 &&
        responseParseResult.errors.length > 0
      "
      class="response-note"
    >
      <Info :size="13" />
      <span>
        {{ responseParseResult.errors.join(" · ") }}
        <em v-if="isStreamingLike" class="hint">
          （流式响应建议切到「原始」查看实时累积内容）
        </em>
      </span>
    </div>
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
import { Code2, Cpu, Flag, Hourglass, Info } from "lucide-vue-next";
import StructuredMessagesView from "../StructuredMessagesView.vue";
import { parseResponseMessages } from "../../../core/messageParser";
import { detectApiFormat } from "../../../core/utils";
import type { CombinedRecord, ResponseParseResult } from "../../../types";

const props = defineProps<{
  record: CombinedRecord;
}>();

const apiFormat = computed(() => detectApiFormat(props.record.request.url));

const hasResponseBody = computed(() => Boolean(props.record.response?.body));

const isStreamingLike = computed(() => {
  const headers = props.record.response?.headers ?? {};
  const contentType = headers["content-type"] || headers["Content-Type"] || "";
  return contentType.includes("text/event-stream");
});

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

.response-note .hint {
  margin-left: 6px;
  color: var(--text-color-light);
  font-style: italic;
  font-size: 12px;
}
</style>
