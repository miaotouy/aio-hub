<template>
  <em class="markdown-em">
    <slot />
  </em>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-em {
  font-style: italic;
}
</style>