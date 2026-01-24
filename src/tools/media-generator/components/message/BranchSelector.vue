<script setup lang="ts">
import { ChevronLeft, ChevronRight, GitBranch } from "lucide-vue-next";
import type { MediaMessage } from "../../types";

interface Props {
  message: MediaMessage;
  siblings: MediaMessage[];
  currentSiblingIndex: number;
}

defineProps<Props>();
const emit = defineEmits<{
  (e: "switch", direction: "prev" | "next"): void;
  (e: "switch-branch", nodeId: string): void;
}>();
</script>

<template>
  <div v-if="siblings.length > 1" class="branch-selector">
    <button
      class="nav-btn"
      :disabled="currentSiblingIndex <= 0"
      @click.stop="emit('switch', 'prev')"
    >
      <ChevronLeft :size="12" />
    </button>
    
    <div class="branch-info">
      <GitBranch :size="10" class="branch-icon" />
      <span class="index">{{ currentSiblingIndex + 1 }} / {{ siblings.length }}</span>
    </div>

    <button
      class="nav-btn"
      :disabled="currentSiblingIndex >= siblings.length - 1"
      @click.stop="emit('switch', 'next')"
    >
      <ChevronRight :size="12" />
    </button>
  </div>
</template>

<style scoped>
.branch-selector {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px;
  height: 20px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.2s;
  padding: 0;
}

.nav-btn:hover:not(:disabled) {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.branch-info {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-color-light);
  user-select: none;
}

.branch-icon {
  opacity: 0.7;
}

.index {
  font-variant-numeric: tabular-nums;
}
</style>