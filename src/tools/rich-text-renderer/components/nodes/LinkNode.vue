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
  color: var(--primary-color);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

.markdown-link:hover {
  border-bottom-color: var(--primary-color);
}
</style>