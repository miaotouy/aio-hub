<script lang="ts">
export interface SegmentedTab {
  id: string;
  label: string;
}
</script>

<script setup lang="ts">
defineProps<{
  tabs: SegmentedTab[];
  modelValue: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <div class="segmented-tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      class="segmented-tab"
      :class="{ active: tab.id === modelValue }"
      :aria-selected="tab.id === modelValue"
      :data-testid="`segmented-tab-${tab.id}`"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: 999px;
  background: var(--input-bg);
}

.segmented-tab {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 var(--space-2);
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.segmented-tab:active {
  background: var(--card-bg);
}

.segmented-tab.active {
  background: var(--card-bg);
  color: var(--primary-color);
}
</style>
