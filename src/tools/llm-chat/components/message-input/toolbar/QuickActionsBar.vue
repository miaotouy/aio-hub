<script setup lang="ts">
import type { QuickAction, QuickActionSet } from "../../../types/quick-action";

const props = defineProps<{
  activeActionSets: QuickActionSet[];
  groupQuickActionsBySet: boolean;
}>();

const emit = defineEmits<{
  (e: "execute-quick-action", action: QuickAction): void;
}>();
</script>

<template>
  <div
    class="quick-actions-bar"
    :class="{ 'is-grouped': props.groupQuickActionsBySet }"
  >
    <template v-for="(set, index) in props.activeActionSets" :key="set.id">
      <div
        v-if="!props.groupQuickActionsBySet && index > 0"
        class="qa-set-divider"
      ></div>
      <div class="qa-set-group">
        <button
          v-for="action in set.actions.filter((a) => a.isEnabled !== false)"
          :key="action.id"
          class="qa-action-btn"
          @click="emit('execute-quick-action', action)"
          :title="action.description || action.label"
        >
          <span class="qa-btn-label">{{ action.label }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.quick-actions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: rgba(var(--el-fill-color-light-rgb), 0.3);
  min-height: 32px;
  align-items: center;
}

.quick-actions-bar.is-grouped {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 6px 8px;
}

.qa-set-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.qa-set-divider {
  width: 1px;
  height: 14px;
  background-color: var(--border-color);
  margin: 0 4px;
  opacity: 0.6;
}

.quick-actions-bar.is-grouped .qa-set-group {
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--border-color);
}

.quick-actions-bar.is-grouped .qa-set-group:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.qa-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  height: 22px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-color-secondary);
  font-size: 11px;
}

.qa-action-btn:hover {
  background: var(--el-fill-color-light);
  border-color: var(--primary-color);
  color: var(--primary-color);
  transform: translateY(-1px);
}
</style>
