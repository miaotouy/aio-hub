<template>
  <a 
    :href="href" 
    :title="title" 
    class="markdown-link"
    target="_blank"
    rel="noopener noreferrer"
  >
    <slot />
  </a>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  href: string;
  title?: string;
}>();
</script>

<style scoped>
.markdown-link {
  color: var(--md-link-color, var(--primary-color));
  text-decoration: var(--md-link-text-decoration, none);
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
  text-shadow: var(--md-link-text-shadow, none);
  font-weight: var(--md-link-font-weight, inherit);
  background-color: var(--md-link-bg-color, transparent);
  border: 1px solid var(--md-link-border-color, transparent);
  border-radius: var(--md-link-border-radius, 0);
  box-shadow: var(--md-link-box-shadow, none);
  padding: 0 2px;
  font-style: var(--md-link-font-style, inherit);
}

.markdown-link:hover {
  border-bottom-color: var(--md-link-color, var(--primary-color));
}
</style>