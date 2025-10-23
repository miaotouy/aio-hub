<template>
  <component :is="tag" :class="['markdown-heading', `heading-${level}`]">
    <slot />
    <span v-if="content">{{ content }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  nodeId: string;
  level: number;
  content?: string;
}>();

const tag = computed(() => `h${Math.min(Math.max(props.level, 1), 6)}`);
</script>

<style scoped>
.markdown-heading {
  margin: 16px 0 8px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-color);
}

.heading-1 {
  font-size: 2em;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.heading-2 {
  font-size: 1.5em;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.3em;
}

.heading-3 {
  font-size: 1.25em;
}

.heading-4 {
  font-size: 1em;
}

.heading-5 {
  font-size: 0.875em;
}

.heading-6 {
  font-size: 0.85em;
  color: var(--text-color-light);
}

.markdown-heading:first-child {
  margin-top: 0;
}
</style>