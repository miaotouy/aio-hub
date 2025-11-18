<template>
  <div class="markdown-table-wrapper">
    <table class="markdown-table">
      <slot />
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  align?: ('left' | 'center' | 'right')[];
}>();
</script>

<style scoped>
.markdown-table-wrapper {
  margin: 12px 0;
  overflow-x: auto;
}

.markdown-table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

.markdown-table :deep(th),
.markdown-table :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
}

.markdown-table :deep(th) {
  background-color: var(--card-bg);
  font-weight: 600;
}
</style>