<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
  Trash2,
  Edit3,
  GitBranch,
} from "lucide-vue-next";
import type { ChatMessageNode, ChatSession } from "../types";
import { BranchNavigator } from "../utils/BranchNavigator";
import BranchSelector from "./BranchSelector.vue";

const props = defineProps<{
  session: ChatSession | null;
  message: ChatMessageNode;
}>();

const emit = defineEmits<{
  (e: "copy"): void;
  (e: "edit"): void;
  (e: "regenerate"): void;
  (e: "delete"): void;
  (e: "close"): void;
  (e: "switch-sibling", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
}>();

const showBranchSelector = ref(false);

const siblings = computed(() => {
  if (!props.session) return [];
  return BranchNavigator.getSiblings(props.session, props.message.id);
});

const branchInfo = computed(() => {
  if (!props.session) return { index: 0, total: 0 };
  return BranchNavigator.getSiblingIndex(props.session, props.message.id);
});

const hasSiblings = computed(() => branchInfo.value.total > 1);

// 切换分支
const handleSwitchBranch = async (direction: "prev" | "next") => {
  if (!props.session) return;
  emit("switch-sibling", direction);
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.message.content);
    emit("copy");
    emit("close");
  } catch {
    emit("close");
  }
};

const handleDelete = () => {
  emit("delete");
  emit("close");
};

const handleEdit = () => {
  emit("edit");
  emit("close");
};

const handleRegenerate = () => {
  emit("regenerate");
  emit("close");
};

const handleSwitchToBranch = (nodeId: string) => {
  emit("switch-branch", nodeId);
  emit("close");
};
</script>

<template>
  <div class="message-menubar" @click.stop>
    <!-- 分支切换 (左侧) -->
    <div v-if="hasSiblings" class="branch-control">
      <var-button
        text
        round
        size="mini"
        class="menu-btn"
        @click="handleSwitchBranch('prev')"
      >
        <ChevronLeft :size="14" />
      </var-button>
      <button class="branch-indicator" @click="showBranchSelector = true">
        <GitBranch :size="12" />
        <span>{{ branchInfo.index + 1 }} / {{ branchInfo.total }}</span>
      </button>
      <var-button
        text
        round
        size="mini"
        class="menu-btn"
        @click="handleSwitchBranch('next')"
      >
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
        text
        round
        size="mini"
        class="menu-btn"
        @click="handleRegenerate"
      >
        <RotateCcw :size="14" />
      </var-button>
      <var-button
        text
        round
        size="mini"
        class="menu-btn danger"
        @click="handleDelete"
      >
        <Trash2 :size="14" />
      </var-button>
    </div>

    <BranchSelector
      v-model:show="showBranchSelector"
      :siblings="siblings"
      :current-sibling-index="branchInfo.index"
      @switch-branch="handleSwitchToBranch"
    />
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
  border: var(--border-width) solid var(--border-color);
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
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 0.7rem;
  padding: 0 4px;
  color: var(--el-text-color-secondary);
  min-width: 42px;
  text-align: center;
  height: 28px;
  border-radius: 6px;
}

.branch-indicator:active {
  background: var(--input-bg);
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
