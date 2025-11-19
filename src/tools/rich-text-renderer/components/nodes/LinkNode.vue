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
}

.markdown-link:hover {
  border-bottom-color: var(--md-link-color, var(--primary-color));
}
</style>