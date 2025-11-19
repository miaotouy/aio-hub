<template>
  <blockquote class="markdown-blockquote">
    <slot />
  </blockquote>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--md-blockquote-border-color, var(--primary-color));
  background-color: var(--md-blockquote-bg-color, var(--hover-bg));
  color: var(--md-blockquote-color, var(--text-color-light));
  font-style: var(--md-blockquote-font-style, inherit);
  box-shadow: var(--md-blockquote-box-shadow, none);
  border-radius: var(--md-blockquote-border-radius, 4px);
}
</style>