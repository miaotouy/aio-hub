<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ChatMessageNode } from '../types';

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: 'delete'): void;
  (e: 'regenerate'): void;
  (e: 'switch-sibling', direction: 'prev' | 'next'): void;
  (e: 'toggle-enabled'): void;
  (e: 'edit', newContent: string): void;
  (e: 'copy'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 推理内容展开状态
const isReasoningExpanded = ref(false);

// 编辑状态
const isEditing = ref(false);
const editingContent = ref('');

// 计算属性
const hasSiblings = computed(() => props.siblings.length > 1);
const isDisabled = computed(() => props.message.isEnabled === false);

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 推理内容切换
const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value;
};

// 开始编辑
const startEdit = () => {
  editingContent.value = props.message.content;
  isEditing.value = true;
};

// 保存编辑
const saveEdit = () => {
  if (editingContent.value.trim()) {
    emit('edit', editingContent.value);
  }
  cancelEdit();
};

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
  editingContent.value = '';
};

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit('copy');
  } catch (error) {
    console.error('复制失败', error);
  }
};
</script>

<template>
  <div
    :class="[
      'message-item',
      `message-${message.role}`,
      { 'is-disabled': isDisabled }
    ]"
  >
    <div class="message-header">
      <span class="message-role">
        {{ message.role === 'user' ? '👤 你' : '🤖 助手' }}
      </span>
      
      <!-- 分支指示器 -->
      <div v-if="hasSiblings" class="branch-indicator">
        <button
          @click="emit('switch-sibling', 'prev')"
          class="branch-nav-btn"
          title="上一个分支"
          :disabled="isSending"
        >
          ←
        </button>
        <span class="branch-count">
          {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
        </span>
        <button
          @click="emit('switch-sibling', 'next')"
          class="branch-nav-btn"
          title="下一个分支"
          :disabled="isSending"
        >
          →
        </button>
      </div>
      
      <span class="message-time">{{ formatTime(message.timestamp) }}</span>
    </div>

    <!-- 推理内容（DeepSeek reasoning） -->
    <div v-if="message.metadata?.reasoningContent" class="reasoning-section">
      <button
        @click="toggleReasoning"
        class="reasoning-toggle"
        :class="{ expanded: isReasoningExpanded }"
      >
        <span class="toggle-icon">{{ isReasoningExpanded ? '▼' : '▶' }}</span>
        <span class="toggle-text">思维链推理过程</span>
        <span class="reasoning-badge">Reasoning</span>
      </button>
      <div v-if="isReasoningExpanded" class="reasoning-content">
        <pre class="reasoning-text">{{ message.metadata.reasoningContent }}</pre>
      </div>
    </div>

    <div class="message-content">
      <!-- 编辑模式 -->
      <div v-if="isEditing" class="edit-mode">
        <textarea
          v-model="editingContent"
          class="edit-textarea"
          rows="3"
          @keydown.ctrl.enter="saveEdit"
          @keydown.esc="cancelEdit"
        />
        <div class="edit-actions">
          <button @click="saveEdit" class="edit-btn edit-btn-save">
            保存 (Ctrl+Enter)
          </button>
          <button @click="cancelEdit" class="edit-btn edit-btn-cancel">
            取消 (Esc)
          </button>
        </div>
      </div>
      
      <!-- 正常显示模式 -->
      <template v-else>
        <pre v-if="message.content" class="message-text">{{ message.content }}</pre>
        <div v-if="message.status === 'generating'" class="streaming-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </template>
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
    <div v-if="message.status !== 'generating' && !isEditing" class="message-actions">
      <button
        @click="copyMessage"
        class="action-btn"
        title="复制"
      >
        📋
      </button>
      <button
        v-if="message.role === 'user' || message.role === 'assistant'"
        @click="startEdit"
        class="action-btn"
        :disabled="isSending"
        title="编辑"
      >
        ✏️
      </button>
      <button
        v-if="message.role === 'assistant'"
        @click="emit('regenerate')"
        class="action-btn"
        :disabled="isSending"
        title="重新生成"
      >
        🔄
      </button>
      <button
        @click="emit('toggle-enabled')"
        class="action-btn"
        :class="{ 'action-btn-enabled': isDisabled }"
        :disabled="isSending"
        :title="isDisabled ? '启用此消息' : '禁用此消息'"
      >
        {{ isDisabled ? '👁️' : '🚫' }}
      </button>
      <button
        @click="emit('delete')"
        class="action-btn action-btn-danger"
        :disabled="isSending"
        title="删除"
      >
        🗑️
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  padding: 16px;
  border-radius: 8px;
  transition: all 0.2s;
}

.message-item:hover {
  border-color: var(--primary-color);
}

/* 禁用状态样式 */
.message-item.is-disabled {
  opacity: 0.5;
}

.message-item.is-disabled .message-text {
  color: var(--text-color-light);
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

.action-btn-enabled {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.action-btn-enabled:hover:not(:disabled) {
  background-color: var(--primary-color);
  opacity: 0.8;
}

/* 编辑模式样式 */
.edit-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background-color: var(--container-bg);
  color: var(--text-color);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 60px;
}

.edit-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--container-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.edit-btn-save {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.edit-btn-save:hover {
  opacity: 0.9;
}

.edit-btn-cancel:hover {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
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

/* 分支指示器样式 */
.branch-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-left: auto;
  margin-right: 8px;
}

.branch-nav-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: background-color 0.2s;
}

.branch-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.branch-nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.branch-count {
  min-width: 40px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
}
</style>