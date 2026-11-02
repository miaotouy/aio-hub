<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageNode } from "../../types";
import { useChatSettings } from "../../composables/settings/useChatSettings";
const props = defineProps<{
  message: ChatMessageNode;
  charCount?: number;
  screenshotMode?: boolean;
}>();
const { settings } = useChatSettings();
const messageMetadata = computed(() => props.message.metadata);
const usageInfo = computed(() => messageMetadata.value?.usage);
const contentTokensValue = computed(() => messageMetadata.value?.contentTokens);
const performanceStats = computed(() => {
  const metadata = messageMetadata.value;
  if (
    props.message.role !== "assistant" ||
    props.message.status !== "complete" ||
    !metadata ||
    !(
      props.screenshotMode ||
      settings.value.uiPreferences.showPerformanceMetrics
    )
  )
    return [];
  const stats: { label: string; value: string }[] = [];
  if (
    metadata.tokensPerSecond !== undefined &&
    Number.isFinite(metadata.tokensPerSecond)
  ) {
    stats.push({
      label: "生成速度",
      value: String(metadata.tokensPerSecond) + " t/s",
    });
  }
  if (
    metadata.requestStartTime !== undefined &&
    metadata.firstTokenTime !== undefined
  ) {
    const latency = Math.max(
      0,
      metadata.firstTokenTime - metadata.requestStartTime
    );
    stats.push({
      label: "首字延迟 (TTFT)",
      value:
        latency >= 1000 ? (latency / 1000).toFixed(2) + "s" : latency + "ms",
    });
  }
  if (
    metadata.requestStartTime !== undefined &&
    metadata.requestEndTime !== undefined
  ) {
    stats.push({
      label: "总耗时",
      value:
        (
          Math.max(0, metadata.requestEndTime - metadata.requestStartTime) /
          1000
        ).toFixed(1) + "s",
    });
  }
  return stats;
});
</script>
<template>
  <div class="message-meta-summary">
    <!-- 字数统计 -->
    <div
      v-if="settings.uiPreferences.showCharCount && (charCount ?? 0) > 0"
      class="usage-info"
      data-meta-type="char"
    >
      <span>字数: {{ (charCount ?? 0).toLocaleString("zh-CN") }}</span>
    </div>
    <!-- API 返回的完整 Usage 信息（助手消息） -->
    <div
      v-if="settings.uiPreferences.showTokenCount && usageInfo"
      class="usage-info"
      data-meta-type="token"
    >
      <span
        >Token:
        {{
          contentTokensValue !== undefined
            ? usageInfo.promptTokens + contentTokensValue
            : usageInfo.totalTokens
        }}</span
      >
      <span class="usage-detail">
        (输入: {{ usageInfo.promptTokens }}, 输出:
        {{ contentTokensValue ?? usageInfo.completionTokens
        }}{{
          usageInfo.promptTokensDetails?.cachedTokens
            ? `, 缓存: ${usageInfo.promptTokensDetails.cachedTokens}`
            : ""
        }})
      </span>
    </div>
    <!-- 本地计算的单条消息 Token（用户消息） -->
    <div
      v-else-if="
        settings.uiPreferences.showTokenCount &&
        contentTokensValue !== undefined
      "
      class="usage-info"
      data-meta-type="token"
    >
      <span
        >本条消息: {{ contentTokensValue.toLocaleString("en-US") }} tokens</span
      >
    </div>
    <div
      v-if="performanceStats.length"
      class="performance-stats"
      data-meta-type="performance"
    >
      <el-tooltip
        v-for="stat in performanceStats"
        :key="stat.label"
        :content="stat.label"
        placement="top"
      >
        <span class="stat-item">{{ stat.value }}</span>
      </el-tooltip>
    </div>
  </div>
</template>
<style scoped>
.message-meta-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
}

.performance-stats {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--text-color-light);
}
.stat-item {
  white-space: nowrap;
}
.stat-item:not(:last-child)::after {
  content: "|";
  margin-left: 6px;
  opacity: 0.3;
}

.usage-info {
  color: var(--text-color-light);
}

.usage-detail {
  margin-left: 8px;
  opacity: 0.7;
}
</style>
