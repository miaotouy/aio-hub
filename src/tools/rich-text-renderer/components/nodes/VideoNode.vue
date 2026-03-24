<template>
  <div class="video-node-container" :class="{ 'is-streaming': isStreaming }">
    <VideoPlayer
      :src="resolvedSrc"
      :title="title"
      :poster="poster"
      :autoplay="autoplay"
      :loop="loop"
      :muted="muted"
      class="rich-text-video-player"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import VideoPlayer from "@/components/common/VideoPlayer.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";

const props = defineProps<{
  nodeId: string;
  src: string;
  title?: string;
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
.video-node-container {
  margin: 12px 0;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background-color: #000;
  /* 初始高度，防止布局抖动 */
  aspect-ratio: 16 / 9;
}

.rich-text-video-player {
  width: 100%;
  height: 100%;
}

.is-streaming {
  /* 流式传输时的微调 */
  opacity: 0.9;
}
</style>
