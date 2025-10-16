<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { ChatMessageNode } from '../types';

interface Props {
  messages: ChatMessageNode[];
  isSending: boolean;
}

interface Emits {
  (e: 'delete-message', messageId: string): void;
  (e: 'regenerate'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const messagesContainer = ref<HTMLElement>();

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

// 监听消息变化，自动滚动
watch(() => props.messages, scrollToBottom, { deep: true });

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 复制消息内容
const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content);
  } catch (error) {
    console.error('复制失败', error);
  }
};

// 是否可以重新生成（最后一条消息是助手消息）
const canRegenerate = () => {
  if (props.messages.length === 0) return false;
  const lastMessage = props.messages[props.messages.length - 1];
  return lastMessage.role === 'assistant' && lastMessage.status !== 'generating';
};
</script>

<template>
  <div ref="messagesContainer" class="message-list">
    <div v-if="messages.length === 0" class="empty-state">
      <p>👋 开始新的对话吧！</p>
    </div>

    <div
      v-for="message in messages"
      :key="message.id"
      :class="['message-item', `message-${message.role}`]"
    >
      <div class="message-header">
        <span class="message-role">
          {{ message.role === 'user' ? '👤 你' : '🤖 助手' }}
        </span>
        <span class="message-time">{{ formatTime(message.timestamp) }}</span>
      </div>

      <div class="message-content">
        <pre v-if="message.content" class="message-text">{{ message.content }}</pre>
        <div v-if="message.status === 'generating'" class="streaming-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>

      <!-- 元数据 -->
      <div v-if="message.metadata?.usage || message.metadata?.error" class="message-meta">
        <div v-if="message.metadata?.usage" class="usage-info">
          <span>Token: {{ message.metadata.usage.totalTokens }}</span>
          <span class="usage-detail">
            (输入: {{ message.metadata.usage.promptTokens }}, 输出: {{ message.metadata.usage.completionTokens }})
          </span>
        </div>
        <div v-if="message.metadata?.error" class="error-info">
          ⚠️ {{ message.metadata.error }}
        </div>
      </div>

      <!-- 操作按钮 -->
      <div v-if="message.status !== 'generating'" class="message-actions">
        <button
          @click="copyMessage(message.content)"
          class="action-btn"
          title="复制"
        >
          📋
        </button>
        <button
          v-if="message.role === 'assistant' && canRegenerate()"
          @click="emit('regenerate')"
          class="action-btn"
          :disabled="isSending"
          title="重新生成"
        >
          🔄
        </button>
        <button
          @click="emit('delete-message', message.id)"
          class="action-btn action-btn-danger"
          :disabled="isSending"
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  font-size: 16px;
}

.message-item {
  padding: 16px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.message-item:hover {
  border-color: var(--primary-color);
}

.message-user {
  background-color: var(--container-bg);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.message-role {
  font-weight: 600;
  color: var(--text-color);
}

.message-time {
  color: var(--text-color-light);
  font-size: 12px;
}

.message-content {
  margin: 8px 0;
}

.message-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
}

.streaming-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

.streaming-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--primary-color);
  animation: pulse 1.4s infinite ease-in-out;
}

.streaming-indicator .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.streaming-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.message-meta {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
}

.usage-info {
  color: var(--text-color-light);
}

.usage-detail {
  margin-left: 8px;
  opacity: 0.7;
}

.error-info {
  color: var(--error-color);
  margin-top: 4px;
}

.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-item:hover .message-actions {
  opacity: 1;
}

.action-btn {
  padding: 4px 8px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--container-bg);
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn-danger:hover:not(:disabled) {
  background-color: var(--error-color);
  border-color: var(--error-color);
  color: white;
}

/* 自定义滚动条 */
.message-list::-webkit-scrollbar {
  width: 8px;
}

.message-list::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>