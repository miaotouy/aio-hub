<template>
  <hr class="markdown-hr" />
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-hr {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--border-color);
}
</style>