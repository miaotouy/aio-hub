<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessageBox, ElTooltip } from 'element-plus';
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
  BarChart3,
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
  (e: 'analyze-context'): void;
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
const isPresetDisplay = computed(() => props.message.metadata?.isPresetDisplay === true);

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
const handleDelete = async () => {
  // 硬删除需要二次确认
  try {
    await ElMessageBox.confirm(
      '删除后将无法恢复，且所有分支回复也会被删除。',
      '确定要永久删除这条消息吗？',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );
    // 用户确认后才执行删除
    emit('delete');
  } catch {
    // 用户取消，不做任何操作
  }
};
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
const handleAnalyzeContext = () => {
  console.log('[MessageMenubar] 上下文分析按钮点击', {
    nodeId: props.message.id,
    role: props.message.role
  });
  emit('analyze-context');
};
</script>

<template>
  <div class="message-menubar">
    <!-- Branch control (if applicable) -->
    <div v-if="siblings.length > 1" class="branch-control">
      <el-tooltip content="上一个版本" placement="top">
        <button
          class="menu-btn"
          :disabled="currentSiblingIndex === 0 || isSending"
          @click="emit('switch', 'prev')"
        >
          <ChevronLeft :size="16" />
        </button>
      </el-tooltip>
      <div class="branch-indicator">
        {{ currentSiblingIndex + 1 }} / {{ siblings.length }}
      </div>
      <el-tooltip content="下一个版本" placement="top">
        <button
          class="menu-btn"
          :disabled="currentSiblingIndex === siblings.length - 1 || isSending"
          @click="emit('switch', 'next')"
        >
          <ChevronRight :size="16" />
        </button>
      </el-tooltip>
    </div>
    <div v-if="siblings.length > 1" class="separator"></div>

    <!-- 复制 -->
    <el-tooltip content="复制" placement="top">
      <button
        class="menu-btn"
        :class="{ 'menu-btn-active': copied }"
        @click="copyMessage"
      >
        <Check v-if="copied" :size="16" />
        <Copy v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 上下文分析 -->
    <el-tooltip content="上下文分析" placement="top">
      <button
        class="menu-btn"
        @click="handleAnalyzeContext"
      >
        <BarChart3 :size="16" />
      </button>
    </el-tooltip>

    <!-- 终止生成（仅在生成中显示） -->
    <el-tooltip v-if="isGenerating" content="终止生成" placement="top">
      <button
        class="menu-btn menu-btn-abort"
        @click="handleAbort"
      >
        <XCircle :size="16" />
      </button>
    </el-tooltip>

    <!-- 编辑（用户和助手消息都可以，生成中不可编辑） -->
    <el-tooltip v-if="(isUserMessage || isAssistantMessage) && !isGenerating" content="编辑" placement="top">
      <button
        class="menu-btn"
        @click="handleEdit"
      >
        <Edit :size="16" />
      </button>
    </el-tooltip>

    <!-- 创建分支（用户和助手消息都可以，生成中不可创建，预设消息不可创建分支） -->
    <el-tooltip
      v-if="(isUserMessage || isAssistantMessage) && !isGenerating && !isPresetDisplay"
      content="创建分支"
      placement="top"
    >
      <button
        class="menu-btn"
        @click="handleCreateBranch"
      >
        <GitFork :size="16" />
      </button>
    </el-tooltip>
    
    <!-- 预设消息的提示（需要等预设系统树化后才能支持分支） -->
    <el-tooltip
      v-if="(isUserMessage || isAssistantMessage) && !isGenerating && isPresetDisplay"
      content="预设消息暂不支持创建分支，需等预设系统树化后才能对接"
      placement="top"
    >
      <button
        class="menu-btn menu-btn-disabled"
        disabled
      >
        <GitFork :size="16" />
      </button>
    </el-tooltip>

    <!-- 重新生成（用户和助手消息都可以，不禁用以支持并行生成，预设消息不可重新生成） -->
    <el-tooltip
      v-if="(isUserMessage || isAssistantMessage) && !isPresetDisplay"
      :content="isUserMessage ? '重新生成回复' : '重新生成'"
      placement="top"
    >
      <button
        class="menu-btn"
        @click="handleRegenerate"
      >
        <RefreshCw :size="16" />
      </button>
    </el-tooltip>
    
    <!-- 预设消息的提示（预设内容不参与重试） -->
    <el-tooltip
      v-if="(isUserMessage || isAssistantMessage) && isPresetDisplay"
      content="预设消息不参与重试"
      placement="top"
    >
      <button
        class="menu-btn menu-btn-disabled"
        disabled
      >
        <RefreshCw :size="16" />
      </button>
    </el-tooltip>

    <!-- 启用/禁用（生成中不可切换） -->
    <el-tooltip
      v-if="!isGenerating"
      :content="isDisabled ? '启用此消息' : '禁用此消息'"
      placement="top"
    >
      <button
        class="menu-btn"
        :class="{ 'menu-btn-highlight': isDisabled }"
        @click="handleToggleEnabled"
      >
        <Eye v-if="isDisabled" :size="16" />
        <EyeOff v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 删除（生成中不可删除，预设消息也不可删除） -->
    <el-tooltip
      v-if="!isGenerating && !isPresetDisplay"
      content="删除"
      placement="top"
    >
      <button
        class="menu-btn menu-btn-danger"
        @click="handleDelete"
      >
        <Trash2 :size="16" />
      </button>
    </el-tooltip>
    
    <!-- 预设消息的提示（需要到预设编辑中删除） -->
    <el-tooltip
      v-if="!isGenerating && isPresetDisplay"
      content="预设消息需要在智能体设置中编辑或删除"
      placement="top"
    >
      <button
        class="menu-btn menu-btn-disabled"
        disabled
      >
        <Trash2 :size="16" />
      </button>
    </el-tooltip>
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