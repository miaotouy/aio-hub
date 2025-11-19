<template>
  <em class="markdown-em">
    <slot />
  </em>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-em {
  font-style: var(--md-em-font-style, italic);
  color: var(--md-em-color, inherit);
  background-color: var(--md-em-bg-color, transparent);
  text-shadow: var(--md-em-text-shadow, none);
  text-decoration: var(--md-em-text-decoration, none);
}
</style>