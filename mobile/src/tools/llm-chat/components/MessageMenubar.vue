<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeft, ChevronRight, Copy, RotateCcw, Trash2, Edit3 } from 'lucide-vue-next';
import { Snackbar } from '@varlet/ui';
import type { ChatMessageNode, ChatSession } from '../types';
import { BranchNavigator } from '../utils/BranchNavigator';
import { useBranchManager } from '../composables/useBranchManager';

const props = defineProps<{
  session: ChatSession | null;
  message: ChatMessageNode;
}>();

const emit = defineEmits<{
  (e: 'copy'): void;
  (e: 'edit'): void;
  (e: 'regenerate'): void;
  (e: 'delete'): void;
  (e: 'close'): void;
}>();

const branchManager = useBranchManager();

// 分支信息
const branchInfo = computed(() => {
  if (!props.session) return { index: 0, total: 0 };
  return BranchNavigator.getSiblingIndex(props.session, props.message.id);
});

const hasSiblings = computed(() => branchInfo.value.total > 1);

// 切换分支
const handleSwitchBranch = (direction: 'prev' | 'next') => {
  if (!props.session) return;
  const newLeafId = BranchNavigator.switchToSibling(props.session, props.message.id, direction);
  props.session.activeLeafId = newLeafId;
};

// 操作处理
const handleCopy = () => {
  navigator.clipboard.writeText(props.message.content);
  Snackbar.success('已复制内容');
  emit('copy');
  emit('close');
};

const handleDelete = () => {
  if (props.session) {
    branchManager.deleteMessage(props.session, props.message.id);
    emit('delete');
  }
};

const handleEdit = () => {
  emit('edit');
  emit('close');
};

const handleRegenerate = () => {
  emit('regenerate');
  emit('close');
};
</script>

<template>
  <div class="message-menubar" @click.stop>
    <!-- 分支切换 (左侧) -->
    <div v-if="hasSiblings" class="branch-control">
      <var-button text round size="mini" class="menu-btn" @click="handleSwitchBranch('prev')">
        <ChevronLeft :size="14" />
      </var-button>
      <span class="branch-indicator">{{ branchInfo.index + 1 }} / {{ branchInfo.total }}</span>
      <var-button text round size="mini" class="menu-btn" @click="handleSwitchBranch('next')">
        <ChevronRight :size="14" />
      </var-button>
      <div class="separator"></div>
    </div>

    <!-- 操作按钮 (右侧) -->
    <div class="action-buttons">
      <var-button text round size="mini" class="menu-btn" @click="handleCopy">
        <Copy :size="14" />
      </var-button>
      <var-button text round size="mini" class="menu-btn" @click="handleEdit">
        <Edit3 :size="14" />
      </var-button>
      <var-button 
        v-if="message.role === 'assistant'" 
        text round size="mini" class="menu-btn" 
        @click="handleRegenerate"
      >
        <RotateCcw :size="14" />
      </var-button>
      <var-button text round size="mini" class="menu-btn danger" @click="handleDelete">
        <Trash2 :size="14" />
      </var-button>
    </div>
  </div>
</template>

<style scoped>
.message-menubar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.branch-control {
  display: flex;
  align-items: center;
  gap: 2px;
}

.branch-indicator {
  font-size: 0.7rem;
  padding: 0 4px;
  color: var(--el-text-color-secondary);
  min-width: 32px;
  text-align: center;
}

.separator {
  width: 1px;
  height: 12px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 2px;
}

.menu-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  color: var(--el-text-color-secondary) !important;
}

.menu-btn.danger {
  color: var(--el-color-danger) !important;
}
</style>