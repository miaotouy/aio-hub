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
  background-color: var(--md-inline-code-bg-color, rgba(150, 150, 150, 0.1));
  border-radius: var(--md-inline-code-border-radius, 3px);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  color: var(--md-inline-code-color, var(--primary-color));
  border: 1px solid var(--md-inline-code-border-color, transparent);
  box-shadow: var(--md-inline-code-box-shadow, none);
  text-shadow: var(--md-inline-code-text-shadow, none);
}
</style>