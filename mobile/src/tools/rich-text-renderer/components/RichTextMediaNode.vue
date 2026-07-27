<script setup lang="ts">
import MediaPreviewHost from "@/components/media/MediaPreviewHost.vue";
import type { MediaItem } from "@/components/media/types";

defineProps<{
  item: MediaItem;
}>();
</script>

<template>
  <div class="rich-text-managed-media" data-testid="rich-text-managed-media">
    <MediaPreviewHost :model-value="true" :item="item" mode="inline" />
  </div>
</template>

<style scoped>
.rich-text-managed-media {
  max-width: 100%;
  margin: 8px 0;
}
</style>
