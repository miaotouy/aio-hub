<template>
  <div class="audio-node-container" :class="{ 'is-streaming': isStreaming }" :title="title">
    <AudioPlayer
      :src="resolvedSrc"
      :title="displayTitle"
      :artist="artist"
      :poster="poster"
      :autoplay="autoplay"
      :loop="loop"
      :muted="muted"
      :layout="layout || 'minimal'"
      class="rich-text-audio-player"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import AudioPlayer from "@/components/common/AudioPlayer.vue";
import { RICH_TEXT_CONTEXT_KEY, type RichTextContext } from "../../types";
import { resolveLocalPath } from "../../utils/path-utils";

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
  layout?: "full" | "compact" | "minimal";
}>();

const context = inject<RichTextContext | null>(RICH_TEXT_CONTEXT_KEY, null);
const isStreaming = computed(() => context?.isStreaming?.value ?? false);

// 过滤掉默认的 "audio" 标题，让播放器自己解析元数据或文件名
const displayTitle = computed(() => {
  if (props.title?.toLowerCase() === "audio") return undefined;
  return props.title;
});

// 解析资源链接
const resolvedSrc = computed(() => {
  let src = props.src;

  // 1. 优先处理 Agent 内部资产 (Chat 专用钩子)
  if (context?.resolveAsset) {
    src = context.resolveAsset(props.src);
  }

  // 2. 处理本地路径或特殊协议
  return resolveLocalPath(src);
});
</script>

<style scoped>
.audio-node-container {
  margin: 12px 0;
  max-width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
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
