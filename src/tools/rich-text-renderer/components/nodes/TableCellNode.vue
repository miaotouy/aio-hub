<template>
  <component 
    :is="tag" 
    :class="['markdown-table-cell', alignClass]"
  >
    {{ content }}
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  nodeId: string;
  content: string;
  align?: 'left' | 'center' | 'right';
  isHeader?: boolean;
}>();

const tag = computed(() => props.isHeader ? 'th' : 'td');

const alignClass = computed(() => {
  if (!props.align) return '';
  return `align-${props.align}`;
});
</script>

<style scoped>
.markdown-table-cell {
  color: var(--text-color);
}

.align-left {
  text-align: left;
}

.align-center {
  text-align: center;
}

.align-right {
  text-align: right;
}
</style>