<template>
  <br :data-node-id="nodeId" :data-node-status="$attrs['data-node-status']" />
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
}>();
</script>