<template>
  <img 
    :src="src" 
    :alt="alt || ''"
    :title="title || undefined"
    class="markdown-image"
    :data-node-id="nodeId"
    :data-node-status="$attrs['data-node-status']"
  />
</template>

<script setup lang="ts">
/**
 * 图片节点渲染组件
 */
defineProps<{
  nodeId: string;
  src: string;
  alt?: string;
  title?: string;
}>();
</script>

<style scoped>
.markdown-image {
  max-width: 100%;
  height: auto;
  display: inline-block;
  vertical-align: middle;
}
</style>