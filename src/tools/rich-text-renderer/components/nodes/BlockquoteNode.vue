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
  border-left: 4px solid var(--primary-color);
  background-color: var(--hover-bg);
  color: var(--text-color-light);
}
</style>