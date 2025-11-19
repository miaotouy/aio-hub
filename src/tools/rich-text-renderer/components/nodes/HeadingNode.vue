<template>
  <component :is="tag" :class="['markdown-heading', `heading-${level}`]">
    <span>
      <slot />
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  nodeId: string;
  level: number;
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
  border-bottom: 1px solid var(--md-h1-border-color, var(--border-color));
  padding-bottom: 0.3em;
  color: var(--md-h1-color, var(--text-color));
  background-color: var(--md-h1-bg-color, transparent);
  font-family: var(--md-h1-font-family, inherit);
  text-shadow: var(--md-h1-text-shadow, none);
  border-radius: var(--md-h1-border-radius, 0);
  box-shadow: var(--md-h1-box-shadow, none);
}

.heading-2 {
  font-size: 1.5em;
  border-bottom: 1px solid var(--md-h2-border-color, var(--border-color));
  padding-bottom: 0.3em;
  color: var(--md-h2-color, var(--text-color));
  background-color: var(--md-h2-bg-color, transparent);
  font-family: var(--md-h2-font-family, inherit);
  text-shadow: var(--md-h2-text-shadow, none);
  border-radius: var(--md-h2-border-radius, 0);
  box-shadow: var(--md-h2-box-shadow, none);
}

.heading-3 {
  font-size: 1.25em;
  color: var(--md-h3-color, var(--text-color));
  background-color: var(--md-h3-bg-color, transparent);
  font-family: var(--md-h3-font-family, inherit);
  text-shadow: var(--md-h3-text-shadow, none);
  border-radius: var(--md-h3-border-radius, 0);
  box-shadow: var(--md-h3-box-shadow, none);
  padding: 2px 4px;
}

.heading-4 {
  font-size: 1em;
  color: var(--md-h4-color, var(--text-color));
  background-color: var(--md-h4-bg-color, transparent);
  font-family: var(--md-h4-font-family, inherit);
  text-shadow: var(--md-h4-text-shadow, none);
  border-radius: var(--md-h4-border-radius, 0);
  box-shadow: var(--md-h4-box-shadow, none);
  padding: 2px 4px;
}

.heading-5 {
  font-size: 0.875em;
  color: var(--md-h5-color, var(--text-color));
  background-color: var(--md-h5-bg-color, transparent);
  font-family: var(--md-h5-font-family, inherit);
  text-shadow: var(--md-h5-text-shadow, none);
  border-radius: var(--md-h5-border-radius, 0);
  box-shadow: var(--md-h5-box-shadow, none);
  padding: 2px 4px;
}

.heading-6 {
  font-size: 0.85em;
  color: var(--md-h6-color, var(--text-color-light));
  background-color: var(--md-h6-bg-color, transparent);
  font-family: var(--md-h6-font-family, inherit);
  text-shadow: var(--md-h6-text-shadow, none);
  border-radius: var(--md-h6-border-radius, 0);
  box-shadow: var(--md-h6-box-shadow, none);
  padding: 2px 4px;
}

.markdown-heading:first-child {
  margin-top: 0;
}
</style>