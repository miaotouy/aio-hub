<script setup lang="ts">
import { Expand } from "lucide-vue-next";
import { onBeforeUnmount, ref } from "vue";

withDefaults(
  defineProps<{
    src: string;
    title: string;
    immersive?: boolean;
  }>(),
  { immersive: false }
);

const emit = defineEmits<{
  ready: [];
  error: [];
  expand: [];
  "play-state-change": [playing: boolean];
}>();

const videoRef = ref<HTMLVideoElement | null>(null);

async function requestFullscreen() {
  const video = videoRef.value;
  if (!video) return;
  try {
    if (video.requestFullscreen) {
      await video.requestFullscreen();
      return;
    }
  } catch {
    // WebView may reject the API; the host provides an app-level fallback.
  }
  emit("expand");
}

function pause() {
  videoRef.value?.pause();
}

onBeforeUnmount(pause);

defineExpose({ pause, requestFullscreen });
</script>

<template>
  <div class="media-video-player" :class="{ immersive }">
    <video
      ref="videoRef"
      :src="src"
      :aria-label="title"
      controls
      playsinline
      preload="metadata"
      @loadedmetadata="emit('ready')"
      @error="emit('error')"
      @play="emit('play-state-change', true)"
      @pause="emit('play-state-change', false)"
    />
    <button
      v-if="!immersive"
      class="expand-button"
      type="button"
      aria-label="全屏播放视频"
      @click="requestFullscreen"
    >
      <Expand :size="19" />
    </button>
  </div>
</template>

<style scoped>
.media-video-player {
  position: relative;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 164px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #101214;
  box-sizing: border-box;
}

.media-video-player.immersive {
  height: 100%;
  min-height: 0;
}

video {
  width: 100%;
  max-height: 42vh;
  object-fit: contain;
}

.immersive video {
  height: 100%;
  max-height: none;
}

.expand-button {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgb(20 22 24 / 76%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: var(--app-radius-md);
}
</style>
