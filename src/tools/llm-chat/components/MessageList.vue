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

// 推理内容展开状态
const expandedReasoning = ref<Set<string>>(new Set());

// 切换推理内容展开/折叠
const toggleReasoning = (messageId: string) => {
  if (expandedReasoning.value.has(messageId)) {
    expandedReasoning.value.delete(messageId);
  } else {
    expandedReasoning.value.add(messageId);
  }
};

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

      <!-- 推理内容（DeepSeek reasoning） -->
      <div v-if="message.metadata?.reasoningContent" class="reasoning-section">
        <button
          @click="toggleReasoning(message.id)"
          class="reasoning-toggle"
          :class="{ expanded: expandedReasoning.has(message.id) }"
        >
          <span class="toggle-icon">{{ expandedReasoning.has(message.id) ? '▼' : '▶' }}</span>
          <span class="toggle-text">思维链推理过程</span>
          <span class="reasoning-badge">Reasoning</span>
        </button>
        <div v-if="expandedReasoning.has(message.id)" class="reasoning-content">
          <pre class="reasoning-text">{{ message.metadata.reasoningContent }}</pre>
        </div>
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
  overflow-y: scroll; /* 始终显示滚动条区域以防止布局抖动 */
  padding: 84px 12px 20px 20px; /* 右边距减去滚动条宽度以保持对称 */
  display: flex;
  flex-direction: column;
  gap: 16px;
  clip-path: inset(0); /* 优化滚动渲染 */
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
  transition: all 0.2s;
}

.message-item:hover {
  border-color: var(--primary-color);
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
  background: transparent;
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease;
}

.message-list:hover::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
}

/* 推理内容样式 */
.reasoning-section {
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--container-bg);
}

.reasoning-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  font-size: 13px;
  transition: background-color 0.2s;
}

.reasoning-toggle:hover {
  background-color: var(--hover-bg);
}

.reasoning-toggle.expanded {
  border-bottom: 1px solid var(--border-color);
}

.toggle-icon {
  font-size: 10px;
  color: var(--text-color-light);
  transition: transform 0.2s;
}

.toggle-text {
  flex: 1;
  text-align: left;
  font-weight: 500;
}

.reasoning-badge {
  padding: 2px 8px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.reasoning-content {
  padding: 12px;
  background-color: var(--bg-color);
  border-top: 1px solid var(--border-color);
}

.reasoning-text {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color-light);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.85;
}
</style>