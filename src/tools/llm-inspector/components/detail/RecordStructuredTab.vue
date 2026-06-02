<template>
  <div class="structured-tab">
    <!-- 顶部信息条：格式 / 模型 / 流式 -->
    <div class="info-bar">
      <span class="info-chip">
        <Code2 :size="12" />
        <span class="info-label">格式：</span>
        <span class="info-value">{{ requestParseResult.format }}</span>
      </span>
      <span v-if="requestParseResult.model" class="info-chip">
        <Cpu :size="12" />
        <span class="info-label">模型：</span>
        <span class="info-value">{{ requestParseResult.model }}</span>
      </span>
      <span v-if="requestParseResult.stream !== undefined" class="info-chip">
        <Zap :size="12" />
        <span class="info-label">Stream：</span>
        <span class="info-value">{{
          requestParseResult.stream ? "true" : "false"
        }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ArrowUpFromLine, Code2, Cpu, Zap } from "lucide-vue-next";
import StructuredMessagesView from "./StructuredMessagesView.vue";
import { parseRequestMessages } from "../../core/messageParser";
import { detectApiFormat } from "../../core/utils";
import type { CombinedRecord, RequestParseResult } from "../../types";

const props = defineProps<{
  record: CombinedRecord;
}>();

// 请求解析（自动检测格式）
const requestParseResult = computed<RequestParseResult>(() => {
  const format = detectApiFormat(props.record.request.url);
  return parseRequestMessages(props.record.request.body, format);
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
</style>
