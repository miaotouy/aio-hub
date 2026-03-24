<template>
  <div class="audio-node-container" :class="{ 'is-streaming': isStreaming }">
    <AudioPlayer
      :src="resolvedSrc"
      :title="title"
      :artist="artist"
      :poster="poster"
      :autoplay="autoplay"
      :loop="loop"
      :muted="muted"
      class="rich-text-audio-player"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

const props = defineProps<{
  nodeId: string;
  src: string;
  title?: string;
  artist?: string;
  poster?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}>();

const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);
const isStreaming = computed(() => context?.isStreaming?.value ?? false);

// 解析资源链接
const resolvedSrc = computed(() => {
  if (context?.resolveAsset) {
    return context.resolveAsset(props.src);
  }
  return props.src;
});
</script>

<style scoped>
.audio-node-container {
  margin: 12px 0;
  max-width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.rich-text-audio-player {
  width: 100%;
}

.is-streaming {
  opacity: 0.9;
}
</style>
