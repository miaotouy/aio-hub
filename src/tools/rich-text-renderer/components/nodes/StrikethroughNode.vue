<template>
  <del class="markdown-strikethrough">
    <slot />
  </del>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-strikethrough {
  text-decoration: line-through;
  color: var(--md-strikethrough-color, inherit);
  background-color: var(--md-strikethrough-bg-color, transparent);
  text-shadow: var(--md-strikethrough-text-shadow, none);
  text-decoration-color: var(--md-strikethrough-text-decoration-color, inherit);
  text-decoration-style: var(--md-strikethrough-text-decoration-style, solid);
}
</style>