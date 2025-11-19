<template>
  <p class="markdown-paragraph">
    <slot />
  </p>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-paragraph {
  margin: 0;
  line-height: 1.6;
  color: var(--md-paragraph-color, var(--text-color));
  white-space: pre-wrap;
  word-wrap: break-word;

  /* 动态样式 */
  font-weight: var(--md-paragraph-font-weight, inherit);
  font-style: var(--md-paragraph-font-style, inherit);
  text-decoration: var(--md-paragraph-text-decoration, none);
  text-shadow: var(--md-paragraph-text-shadow, none);
  background-color: var(--md-paragraph-bg-color, transparent);
  border-color: var(--md-paragraph-border-color, transparent);
  border-radius: var(--md-paragraph-border-radius, 0);
  box-shadow: var(--md-paragraph-box-shadow, none);
}

.markdown-paragraph:first-child {
  margin-top: 0;
}

.markdown-paragraph:last-child {
  margin-bottom: 0;
}
</style>