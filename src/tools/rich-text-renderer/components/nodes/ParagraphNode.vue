<template>
  <p class="markdown-paragraph">
    <span class="markdown-paragraph-content">
      <slot />
    </span>
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
  white-space: pre-wrap;
  word-wrap: break-word;
}

.markdown-paragraph-content {
  color: var(--md-paragraph-color, var(--text-color));

  /* 动态样式 */
  font-weight: var(--md-paragraph-font-weight, inherit);
  font-style: var(--md-paragraph-font-style, inherit);
  text-decoration: var(--md-paragraph-text-decoration, none);
  text-shadow: var(--md-paragraph-text-shadow, none);
  background-color: var(--md-paragraph-bg-color, transparent);
  border: 1px solid var(--md-paragraph-border-color, transparent);
  border-radius: var(--md-paragraph-border-radius, 0);
  box-shadow: var(--md-paragraph-box-shadow, none);
  padding: 2px 4px;

  /* 优化多行文本的背景渲染 */
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.markdown-paragraph:first-child {
  margin-top: 0;
}

.markdown-paragraph:last-child {
  margin-bottom: 0;
}
</style>