<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Copy,
  Edit,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-vue-next';
import type { ChatMessageNode } from '../types';

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: 'copy'): void;
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'regenerate'): void;
  (e: 'toggle-enabled'): void;
  (e: 'switch', direction: 'prev' | 'next'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 复制状态
const copied = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);
const isUserMessage = computed(() => props.message.role === 'user');
const isAssistantMessage = computed(() => props.message.role === 'assistant');

// 复制消息
const copyMessage = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit('copy');
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    console.error('复制失败', error);
  }
};

// 其他操作
const handleEdit = () => emit('edit');
const handleDelete = () => emit('delete');
const handleRegenerate = () => emit('regenerate');
const handleToggleEnabled = () => emit('toggle-enabled');
</script>

<template>
  <div class="message-menubar">
    <!-- Branch control (if applicable) -->
    <div v-if="siblings.length > 1" class="branch-control">
      <button
        class="menu-btn"
        :disabled="currentSiblingIndex === 0 || isSending"
        @click="emit('switch', 'prev')"
        title="上一个版本"
      >
        <ChevronLeft :size="16" />
      </button>
      <div class="branch-indicator">
        {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
      </div>
      <button
        class="menu-btn"
        :disabled="currentSiblingIndex === siblings.length - 1 || isSending"
        @click="emit('switch', 'next')"
        title="下一个版本"
      >
        <ChevronRight :size="16" />
      </button>
    </div>
    <div v-if="siblings.length > 1" class="separator"></div>

    <!-- 复制 -->
    <button
      class="menu-btn"
      :class="{ 'menu-btn-active': copied }"
      @click="copyMessage"
      title="复制"
    >
      <Check v-if="copied" :size="16" />
      <Copy v-else :size="16" />
    </button>

    <!-- 编辑（用户和助手消息都可以） -->
    <button
      v-if="isUserMessage || isAssistantMessage"
      class="menu-btn"
      @click="handleEdit"
      :disabled="isSending"
      title="编辑"
    >
      <Edit :size="16" />
    </button>

    <!-- 重新生成（仅助手消息） -->
    <button
      v-if="isAssistantMessage"
      class="menu-btn"
      @click="handleRegenerate"
      :disabled="isSending"
      title="重新生成"
    >
      <RefreshCw :size="16" />
    </button>

    <!-- 启用/禁用 -->
    <button
      class="menu-btn"
      :class="{ 'menu-btn-highlight': isDisabled }"
      @click="handleToggleEnabled"
      :disabled="isSending"
      :title="isDisabled ? '启用此消息' : '禁用此消息'"
    >
      <Eye v-if="isDisabled" :size="16" />
      <EyeOff v-else :size="16" />
    </button>

    <!-- 删除 -->
    <button
      class="menu-btn menu-btn-danger"
      @click="handleDelete"
      :disabled="isSending"
      title="删除"
    >
      <Trash2 :size="16" />
    </button>
  </div>
</template>

<style scoped>
.message-menubar {
  position: absolute;
  bottom: 8px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--container-bg-light);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.branch-control {
  display: flex;
  align-items: center;
  gap: 2px;
}

.branch-indicator {
  font-size: 12px;
  padding: 0 4px;
  color: var(--text-color-light);
  min-width: 40px;
  text-align: center;
  white-space: nowrap;
}

.separator {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--text-color-light);
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn:hover:not(:disabled) {
  background-color: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--text-color);
}

.menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-btn-active {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.menu-btn-highlight {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.menu-btn-highlight:hover:not(:disabled) {
  opacity: 0.8;
}

.menu-btn-danger:hover:not(:disabled) {
  background-color: var(--error-color);
  border-color: var(--error-color);
  color: white;
}
</style>