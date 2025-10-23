<template>
  <p class="markdown-paragraph">
    <slot />
    <span v-if="content">{{ content }}</span>
  </p>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  content?: string;
}>();
</script>

<style scoped>
.markdown-paragraph {
  margin: 8px 0;
  line-height: 1.6;
  color: var(--text-color);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.markdown-paragraph:first-child {
  margin-top: 0;
}

.markdown-paragraph:last-child {
  margin-bottom: 0;
}
</style>