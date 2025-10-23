<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Copy,
  Edit,
  GitFork,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-vue-next';
import type { ChatMessageNode } from '../../types';
import { useLlmChatStore } from '../../store';

interface Props {
  message: ChatMessageNode;
  isSending: boolean;
  siblings: ChatMessageNode[];
  currentSiblingIndex: number;
}

interface Emits {
  (e: 'copy'): void;
  (e: 'edit'): void;
  (e: 'create-branch'): void;
  (e: 'delete'): void;
  (e: 'regenerate'): void;
  (e: 'toggle-enabled'): void;
  (e: 'switch', direction: 'prev' | 'next'): void;
  (e: 'abort'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const store = useLlmChatStore();

// 复制状态
const copied = ref(false);

// 计算属性
const isDisabled = computed(() => props.message.isEnabled === false);
const isUserMessage = computed(() => props.message.role === 'user');
const isAssistantMessage = computed(() => props.message.role === 'assistant');
const isGenerating = computed(() => store.isNodeGenerating(props.message.id));

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
const handleCreateBranch = () => emit('create-branch');
const handleDelete = () => emit('delete');
const handleRegenerate = () => emit('regenerate');
const handleToggleEnabled = () => emit('toggle-enabled');
const handleAbort = () => {
  console.log('[MessageMenubar] 停止按钮点击', {
    nodeId: props.message.id,
    role: props.message.role,
    isGenerating: isGenerating.value
  });
  emit('abort');
};
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

    <!-- 终止生成（仅在生成中显示） -->
    <button
      v-if="isGenerating"
      class="menu-btn menu-btn-abort"
      @click="handleAbort"
      title="终止生成"
    >
      <XCircle :size="16" />
    </button>

    <!-- 编辑（用户和助手消息都可以，生成中不可编辑） -->
    <button
      v-if="(isUserMessage || isAssistantMessage) && !isGenerating"
      class="menu-btn"
      @click="handleEdit"
      title="编辑"
    >
      <Edit :size="16" />
    </button>

    <!-- 创建分支（用户和助手消息都可以，生成中不可创建） -->
    <button
      v-if="(isUserMessage || isAssistantMessage) && !isGenerating"
      class="menu-btn"
      @click="handleCreateBranch"
      title="创建分支"
    >
      <GitFork :size="16" />
    </button>

    <!-- 重新生成（用户和助手消息都可以，不禁用以支持并行生成） -->
    <button
      v-if="isUserMessage || isAssistantMessage"
      class="menu-btn"
      @click="handleRegenerate"
      :title="isUserMessage ? '重新生成回复' : '重新生成'"
    >
      <RefreshCw :size="16" />
    </button>

    <!-- 启用/禁用（生成中不可切换） -->
    <button
      v-if="!isGenerating"
      class="menu-btn"
      :class="{ 'menu-btn-highlight': isDisabled }"
      @click="handleToggleEnabled"
      :title="isDisabled ? '启用此消息' : '禁用此消息'"
    >
      <Eye v-if="isDisabled" :size="16" />
      <EyeOff v-else :size="16" />
    </button>

    <!-- 删除（生成中不可删除） -->
    <button
      v-if="!isGenerating"
      class="menu-btn menu-btn-danger"
      @click="handleDelete"
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

.menu-btn-abort {
  background-color: var(--error-color);
  color: white;
}

.menu-btn-abort:hover {
  opacity: 0.8;
}
</style>