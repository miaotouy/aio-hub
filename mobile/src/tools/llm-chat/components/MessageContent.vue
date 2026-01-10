<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next';
import type { ChatMessageNode } from '../types';

defineProps<{
  message: ChatMessageNode;
}>();
</script>

<template>
  <div class="message-content">
    <div v-if="message.status === 'generating' && !message.content" class="loading-dots">
      <span>.</span><span>.</span><span>.</span>
    </div>
    <div class="text-content">{{ message.content }}</div>
    
    <div v-if="message.status === 'error'" class="error-info">
      <AlertCircle :size="14" />
      <div class="error-text">
        <div class="error-title">发送失败</div>
        <div v-if="message.metadata?.error" class="error-detail">{{ message.metadata.error }}</div>
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
  white-space: pre-wrap;
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

.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0% { opacity: 0.2; }
  20% { opacity: 1; }
  100% { opacity: 0.2; }
}
</style>