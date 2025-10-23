<template>
  <li class="markdown-list-item">
    <slot />
  </li>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-list-item {
  margin: 4px 0;
  color: var(--text-color);
}
</style>