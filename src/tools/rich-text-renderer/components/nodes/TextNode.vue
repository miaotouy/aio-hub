<template>
  <span>{{ content }}</span>
</template>

<script setup lang="ts">
defineProps<{
  nodeId: string;
  content: string;
}>();
</script>