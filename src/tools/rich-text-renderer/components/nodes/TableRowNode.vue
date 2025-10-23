<template>
  <tr class="markdown-table-row">
    <slot />
  </tr>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  isHeader?: boolean;
}>();
</script>

<style scoped>
.markdown-table-row {
  color: var(--text-color);
}
</style>