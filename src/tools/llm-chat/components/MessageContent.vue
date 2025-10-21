<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, ChevronDown } from 'lucide-vue-next';
import type { ChatMessageNode } from '../types';

interface Props {
  message: ChatMessageNode;
  isEditing?: boolean;
}

interface Emits {
  (e: 'save-edit', newContent: string): void;
  (e: 'cancel-edit'): void;
}

const props = withDefaults(defineProps<Props>(), {
  isEditing: false,
});
const emit = defineEmits<Emits>();

// 推理内容展开状态
const isReasoningExpanded = ref(false);

// 编辑状态
const editingContent = ref('');

// 推理内容切换
const toggleReasoning = () => {
  isReasoningExpanded.value = !isReasoningExpanded.value;
};

// 当进入编辑模式时，初始化编辑内容
const initEditMode = () => {
  editingContent.value = props.message.content;
};

// 保存编辑
const saveEdit = () => {
  if (editingContent.value.trim()) {
    emit('save-edit', editingContent.value);
  }
};

// 取消编辑
const cancelEdit = () => {
  editingContent.value = '';
  emit('cancel-edit');
};

// 监听编辑模式变化
import { watch } from 'vue';
watch(() => props.isEditing, (newVal) => {
  if (newVal) {
    initEditMode();
  }
});
</script>

<template>
  <div class="message-content">
    <!-- 推理内容（DeepSeek reasoning） -->
    <div v-if="message.metadata?.reasoningContent" class="reasoning-section">
      <button
        @click="toggleReasoning"
        class="reasoning-toggle"
        :class="{ expanded: isReasoningExpanded }"
      >
        <ChevronRight v-if="!isReasoningExpanded" :size="14" class="toggle-icon" />
        <ChevronDown v-else :size="14" class="toggle-icon" />
        <span class="toggle-text">思维链推理过程</span>
        <span class="reasoning-badge">Reasoning</span>
      </button>
      <div v-if="isReasoningExpanded" class="reasoning-content">
        <pre class="reasoning-text">{{ message.metadata.reasoningContent }}</pre>
      </div>
    </div>

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
  </div>
</template>

<style scoped>
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
  color: var(--text-color-light);
  flex-shrink: 0;
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