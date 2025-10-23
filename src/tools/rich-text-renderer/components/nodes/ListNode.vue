<template>
  <component :is="tag" class="markdown-list">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  nodeId: string;
  ordered: boolean;
  start?: number;
}>();

const tag = computed(() => props.ordered ? 'ol' : 'ul');
</script>

<style scoped>
.markdown-list {
  margin: 8px 0;
  padding-left: 2em;
  color: var(--text-color);
}
</style>