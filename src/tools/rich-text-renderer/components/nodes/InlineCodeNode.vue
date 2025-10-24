<template>
  <code class="markdown-inline-code">{{ content }}</code>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  content: string;
}>();
</script>

<style scoped>
.markdown-inline-code {
  padding: 2px 6px;
  background-color: rgba(150, 150, 150, 0.1);
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  color: var(--primary-color);
}
</style>