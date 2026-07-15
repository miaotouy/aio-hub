<script setup lang="ts">
import { ref } from "vue";
import { AlertCircle, ChevronDown, ChevronRight, Brain } from "lucide-vue-next";
import type { ChatMessageNode } from "../types";
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";

defineProps<{
  message: ChatMessageNode;
}>();

const isReasoningExpanded = ref(true);
</script>

<template>
  <div class="message-content">
    <!-- 思考过程折叠框 -->
    <div v-if="message.metadata?.reasoningContent" class="reasoning-container">
      <div
        class="reasoning-header"
        @click="isReasoningExpanded = !isReasoningExpanded"
      >
        <div class="reasoning-title">
          <Brain :size="14" class="brain-icon" />
          <span>AI 思考过程</span>
        </div>
        <ChevronDown v-if="isReasoningExpanded" :size="16" />
        <ChevronRight v-else :size="16" />
      </div>
      <div v-show="isReasoningExpanded" class="reasoning-content">
        <RichTextRenderer :content="message.metadata.reasoningContent" />
      </div>
    </div>

    <div
      v-if="
        message.status === 'generating' &&
        !message.content &&
        !message.metadata?.reasoningContent
      "
      class="loading-dots"
    >
      <span>.</span><span>.</span><span>.</span>
    </div>

    <div v-if="message.content" class="text-content">
      <RichTextRenderer
        :content="message.content"
        :is-streaming="message.status === 'generating'"
      />
    </div>

    <div v-if="message.status === 'error'" class="error-info">
      <AlertCircle :size="14" />
      <div class="error-text">
        <div class="error-title">发送失败</div>
        <div v-if="message.metadata?.error" class="error-detail">
          {{ message.metadata.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-content {
  font-size: 0.95rem;
  line-height: 1.5;
  word-break: break-word;
}

.text-content {
  margin-top: 4px;
}

.reasoning-container {
  margin-bottom: 12px;
  border-left: 3px solid var(--el-border-color-darker);
  background: var(--el-fill-color-lighter);
  border-radius: 0 8px 8px 0;
  overflow: hidden;
}

.reasoning-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
}

.reasoning-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.brain-icon {
  color: var(--el-color-primary);
}

.reasoning-content {
  padding: 0 12px 12px 12px;
  font-size: 0.85rem;
  color: var(--el-text-color-regular);
  opacity: 0.85;
}

.error-info {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--el-color-danger);
  font-size: 0.8rem;
  margin-top: 8px;
  padding: 8px;
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
}

.error-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-title {
  font-weight: bold;
}

.error-detail {
  opacity: 0.8;
  font-size: 0.75rem;
  word-break: break-all;
}

.loading-dots {
  display: flex;
  gap: 2px;
}

.loading-dots span {
  animation: blink 1.4s infinite both;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0% {
    opacity: 0.2;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}
</style>
