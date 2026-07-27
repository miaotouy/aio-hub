<script setup lang="ts">
import {
  Expand,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    title: string;
    expanded?: boolean;
  }>(),
  { expanded: false }
);

const emit = defineEmits<{
  ready: [];
  error: [];
  expand: [];
  "play-state-change": [playing: boolean];
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const muted = ref(false);
const playbackRate = ref(1);
const rates = [0.5, 1, 1.5, 2];

const durationLabel = computed(
  () => `${formatTime(currentTime.value)} / ${formatTime(duration.value)}`
);

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function togglePlayback() {
  const audio = audioRef.value;
  if (!audio) return;
  try {
    if (audio.paused) await audio.play();
    else audio.pause();
  } catch {
    emit("error");
  }
}

function updateMetadata() {
  const audio = audioRef.value;
  if (!audio) return;
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
  emit("ready");
}

function updateTime() {
  currentTime.value = audioRef.value?.currentTime ?? 0;
}

function seek(event: Event) {
  const audio = audioRef.value;
  if (!audio) return;
  audio.currentTime = Number((event.target as HTMLInputElement).value);
  currentTime.value = audio.currentTime;
}

function skip(seconds: number) {
  const audio = audioRef.value;
  if (!audio) return;
  audio.currentTime = Math.min(
    duration.value,
    Math.max(0, audio.currentTime + seconds)
  );
}

function toggleMuted() {
  const audio = audioRef.value;
  if (!audio) return;
  audio.muted = !audio.muted;
  muted.value = audio.muted;
}

function cycleRate() {
  const index = rates.indexOf(playbackRate.value);
  playbackRate.value = rates[(index + 1) % rates.length];
  if (audioRef.value) audioRef.value.playbackRate = playbackRate.value;
}

function setPlaying(value: boolean) {
  playing.value = value;
  emit("play-state-change", value);
}

function pause() {
  audioRef.value?.pause();
}

watch(
  () => props.src,
  () => {
    playing.value = false;
    currentTime.value = 0;
    duration.value = 0;
  }
);

onBeforeUnmount(pause);
defineExpose({ pause });
</script>

<template>
  <div
    class="media-audio-player"
    :class="{ expanded }"
    data-testid="media-audio-player"
    :data-playing="playing ? 'true' : 'false'"
    :data-current-time="currentTime"
    :data-duration="duration"
  >
    <audio
      ref="audioRef"
      :src="src"
      preload="metadata"
      @loadedmetadata="updateMetadata"
      @timeupdate="updateTime"
      @play="setPlaying(true)"
      @pause="setPlaying(false)"
      @ended="setPlaying(false)"
      @error="emit('error')"
    />
    <div class="audio-title" :title="title">{{ title }}</div>
    <div class="audio-controls">
      <button
        v-if="expanded"
        type="button"
        aria-label="后退 10 秒"
        @click="skip(-10)"
      >
        <RotateCcw :size="20" />
      </button>
      <button
        class="play-button"
        type="button"
        data-testid="media-audio-play-toggle"
        :aria-label="playing ? '暂停' : '播放'"
        @click="togglePlayback"
      >
        <Pause v-if="playing" :size="21" />
        <Play v-else :size="21" />
      </button>
      <button
        v-if="expanded"
        type="button"
        aria-label="前进 10 秒"
        @click="skip(10)"
      >
        <RotateCw :size="20" />
      </button>
      <input
        class="progress"
        type="range"
        min="0"
        :max="duration || 0"
        step="0.1"
        :value="currentTime"
        aria-label="播放进度"
        @input="seek"
      />
      <span class="time">{{ durationLabel }}</span>
      <button
        v-if="expanded"
        type="button"
        :aria-label="muted ? '取消静音' : '静音'"
        @click="toggleMuted"
      >
        <VolumeX v-if="muted" :size="20" />
        <Volume2 v-else :size="20" />
      </button>
      <button
        v-if="expanded"
        class="rate-button"
        type="button"
        aria-label="调整播放速度"
        @click="cycleRate"
      >
        {{ playbackRate }}x
      </button>
      <button
        v-else
        type="button"
        aria-label="展开音频播放器"
        @click="emit('expand')"
      >
        <Expand :size="19" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.media-audio-player {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 112px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  color: var(--text-color);
  background: var(--input-bg);
  box-sizing: border-box;
}

.media-audio-player.expanded {
  min-height: 236px;
  padding: 24px 18px calc(24px + env(safe-area-inset-bottom));
  background: var(--overlay-bg);
}

.audio-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

button {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  color: var(--text-color);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
}

.play-button {
  color: #fff;
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.progress {
  width: auto;
  height: 44px;
  min-width: 0;
  flex: 1 1 auto;
  accent-color: var(--primary-color);
}

.time {
  flex: 0 0 auto;
  color: var(--text-color-light);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.rate-button {
  width: 50px;
  font-weight: 600;
}

@media (max-width: 420px) {
  .media-audio-player:not(.expanded) .time {
    display: none;
  }

  .media-audio-player.expanded .audio-controls {
    flex-wrap: wrap;
  }

  .media-audio-player.expanded .progress {
    order: 5;
    flex: 1 1 calc(100% - 72px);
  }

  .media-audio-player.expanded .time {
    order: 6;
  }
}
</style>
