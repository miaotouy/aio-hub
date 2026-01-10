<script setup lang="ts">
import type { ChatMessageNode } from '../types';
import { User, Bot, AlertCircle } from 'lucide-vue-next';

defineProps<{
  message: ChatMessageNode;
}>();
</script>

<template>
  <div class="message-bubble" :class="[message.role, message.status]">
    <div class="avatar">
      <User v-if="message.role === 'user'" :size="20" />
      <Bot v-else-if="message.role === 'assistant'" :size="20" />
    </div>
    
    <div class="content-wrapper">
      <div class="bubble">
        <div v-if="message.status === 'generating' && !message.content" class="loading-dots">
          <span>.</span><span>.</span><span>.</span>
        </div>
        <div class="text-content">{{ message.content }}</div>
        
        <div v-if="message.status === 'error'" class="error-info">
          <AlertCircle :size="14" />
          <span>发送失败</span>
        </div>
      </div>
      
      <div v-if="message.metadata?.modelDisplayName" class="model-info">
        {{ message.metadata.modelDisplayName }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  display: flex;
  gap: 12px;
  padding: 12px;
  max-width: 90%;
}

.message-bubble.user {
  flex-direction: row-reverse;
  align-self: flex-end;
  margin-left: auto;
}

.message-bubble.assistant {
  align-self: flex-start;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.user .avatar {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.95rem;
  line-height: 1.5;
  word-break: break-word;
  position: relative;
}

.user .bubble {
  background: var(--el-color-primary);
  color: white;
  border-top-right-radius: 4px;
}

.assistant .bubble {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--el-text-color-primary);
  border-top-left-radius: 4px;
}

.text-content {
  white-space: pre-wrap;
}

.model-info {
  font-size: 0.75rem;
  color: var(--el-text-color-placeholder);
  padding: 0 4px;
}

.user .model-info {
  text-align: right;
}

.error-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-danger);
  font-size: 0.8rem;
  margin-top: 4px;
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