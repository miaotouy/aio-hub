<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  disabled: boolean;
  isSending: boolean;
}

interface Emits {
  (e: 'send', content: string): void;
  (e: 'abort'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const inputText = ref('');
const textareaRef = ref<HTMLTextAreaElement>();

// 处理发送
const handleSend = () => {
  const content = inputText.value.trim();
  if (!content || props.disabled) return;
  
  emit('send', content);
  inputText.value = '';
  
  // 重置文本框高度
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
};

// 处理键盘事件
const handleKeydown = (e: KeyboardEvent) => {
  // Ctrl/Cmd + Enter 发送
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleSend();
  }
};

// 自动调整文本框高度
const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px';
  }
};
</script>

<template>
  <div class="message-input-container">
    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        :disabled="disabled"
        :placeholder="disabled ? '请先创建或选择一个对话' : '输入消息... (Ctrl/Cmd + Enter 发送)'"
        class="message-textarea"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      />
      
      <div class="input-actions">
        <button
          v-if="!isSending"
          @click="handleSend"
          :disabled="disabled || !inputText.trim()"
          class="btn-send"
          title="发送 (Ctrl/Cmd + Enter)"
        >
          📤 发送
        </button>
        
        <button
          v-else
          @click="emit('abort')"
          class="btn-abort"
          title="停止生成"
        >
          ⏹️ 停止
        </button>
      </div>
    </div>
    
    <div class="input-hint">
      💡 提示：按 Ctrl/Cmd + Enter 快速发送消息 | 这里可能会用来放一些工具快捷栏，但是还没做
    </div>
  </div>
</template>

<style scoped>
.message-input-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.message-textarea {
  flex: 1;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--text-color);
  resize: none;
  max-height: 200px;
  overflow-y: auto;
  font-family: inherit;
  transition: border-color 0.2s;
}

.message-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.message-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-textarea::placeholder {
  color: var(--text-color-light);
}

.input-actions {
  display: flex;
  gap: 8px;
}

.btn-send,
.btn-abort {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-send {
  background-color: var(--primary-color);
  color: white;
}

.btn-send:hover:not(:disabled) {
  background-color: var(--primary-hover-color);
  transform: translateY(-1px);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-abort {
  background-color: var(--error-color);
  color: white;
}

.btn-abort:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.input-hint {
  font-size: 12px;
  color: var(--text-color-light);
  padding-left: 4px;
}

/* 自定义滚动条 */
.message-textarea::-webkit-scrollbar {
  width: 6px;
}

.message-textarea::-webkit-scrollbar-track {
  background: var(--bg-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.message-textarea::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>