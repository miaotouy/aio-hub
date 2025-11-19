<template>
  <span class="markdown-quote">
    <span class="quote-marker">{{ startMarker }}</span>
    <slot />
    <span class="quote-marker">{{ endMarker }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  startMarker: string;
  endMarker: string;
}>();
</script>

<style scoped>
.markdown-quote {
  font-weight: var(--md-quote-font-weight, inherit);
  color: var(--md-quote-color, inherit);
  background-color: var(--md-quote-bg-color, transparent);
  text-shadow: var(--md-quote-text-shadow, none);
  text-decoration: var(--md-quote-text-decoration, none);
  border-radius: var(--md-quote-border-radius, 0);
  border: var(--md-quote-border-color, none);
  box-shadow: var(--md-quote-box-shadow, none);
}
</style>