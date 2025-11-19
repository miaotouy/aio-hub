<template>
  <strong class="markdown-strong">
    <slot />
  </strong>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-strong {
  font-weight: var(--md-strong-font-weight, 600);
  color: var(--md-strong-color, inherit);
  background-color: var(--md-strong-bg-color, transparent);
  text-shadow: var(--md-strong-text-shadow, none);
  text-decoration: var(--md-strong-text-decoration, none);
}
</style>