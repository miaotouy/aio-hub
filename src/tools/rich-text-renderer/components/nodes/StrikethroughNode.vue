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
}
</style>