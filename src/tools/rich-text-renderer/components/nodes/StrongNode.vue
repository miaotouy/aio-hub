<template>
  <strong class="markdown-strong">
    <slot />
  </strong>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>

<style scoped>
.markdown-strong {
  font-weight: 600;
}
</style>