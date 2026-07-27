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
const playing = ref(false);
const currentTime = ref(0);

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

function updateTime() {
  currentTime.value = videoRef.value?.currentTime ?? 0;
}

function setPlaying(value: boolean) {
  playing.value = value;
  emit("play-state-change", value);
}

function pause() {
  videoRef.value?.pause();
}

onBeforeUnmount(pause);

defineExpose({ pause, requestFullscreen });
</script>

<template>
  <div
    class="media-video-player"
    :class="{ immersive }"
    data-testid="media-video-player"
    :data-playing="playing ? 'true' : 'false'"
    :data-current-time="currentTime"
  >
    <video
      ref="videoRef"
      data-testid="media-video-element"
      :src="src"
      :aria-label="title"
      controls
      playsinline
      preload="metadata"
      @loadedmetadata="emit('ready')"
      @timeupdate="updateTime"
      @error="emit('error')"
      @play="setPlaying(true)"
      @pause="setPlaying(false)"
      @ended="setPlaying(false)"
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
