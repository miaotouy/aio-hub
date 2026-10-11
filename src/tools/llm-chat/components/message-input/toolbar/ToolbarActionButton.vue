<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<script setup lang="ts">
import { ElTooltip } from "element-plus";
import { LoaderCircle } from "lucide-vue-next";
import type { ToolbarAction } from "./inputToolbarActions";
defineProps<{ action: ToolbarAction }>();
const emit = defineEmits<{
  execute: [action: ToolbarAction, anchor: HTMLElement];
}>();
</script>
<template>
  <el-tooltip
    :content="action.tooltip || action.label"
    placement="top"
    :show-after="500"
  >
    <button
      type="button"
      class="toolbar-action"
      :class="{ active: action.active, busy: action.busy }"
      :disabled="action.disabled"
      :aria-label="action.label"
      :aria-pressed="action.kind === 'toggle' ? action.active : undefined"
      :aria-haspopup="action.kind === 'panel' ? 'dialog' : undefined"
      :aria-expanded="action.kind === 'panel' ? action.expanded : undefined"
      :data-action-id="action.id"
      :data-testid="action.testId"
      @click="emit('execute', action, $event.currentTarget as HTMLElement)"
    >
      <LoaderCircle v-if="action.busy" :size="16" class="spinner" />
      <component :is="action.icon" v-else :size="16" />
      <span v-if="action.id === 'knowledge' && action.badge" class="count">{{
        action.badge
      }}</span>
    </button>
  </el-tooltip>
</template>
<style scoped>
.toolbar-action {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.toolbar-action:hover:not(:disabled),
.toolbar-action.active {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}
.toolbar-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toolbar-action:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}
.count {
  position: absolute;
  right: 0;
  top: 0;
  font-size: 9px;
  color: var(--primary-color);
}
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
