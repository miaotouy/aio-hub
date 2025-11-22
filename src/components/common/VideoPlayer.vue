<template>
  <div
    ref="playerContainer"
    class="video-player"
    :class="{ 'is-fullscreen': isFullscreen, 'controls-visible': isControlsVisible || !isPlaying }"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @click="togglePlay"
  >
    <!-- 视频核心 -->
    <video
      ref="videoRef"
      class="video-element"
      :src="src"
      :poster="poster"
      :loop="loop"
      :muted="muted"
      :autoplay="autoplay"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @ended="handleEnded"
      @play="isPlaying = true"
      @pause="isPlaying = false"
      @volumechange="handleVolumeChange"
      @error="handleError"
    ></video>

    <!-- 加载中状态 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
    </div>

    <!-- 错误状态 -->
    <div v-if="error" class="error-overlay">
      <span class="error-icon">⚠️</span>
      <span class="error-text">无法播放视频</span>
    </div>

    <!-- 播放按钮覆盖层 (暂停时显示) -->
    <div v-if="!isPlaying && !isLoading && !error" class="play-overlay">
      <div class="play-icon-circle">
        <component :is="Play" class="play-icon-large" />
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div class="controls-bar" @click.stop>
      <!-- 进度条 -->
      <div class="progress-bar-container" @click="seek" @mousemove="handleProgressHover">
        <div class="progress-background"></div>
        <div class="progress-buffered" :style="{ width: bufferedPercentage + '%' }"></div>
        <div class="progress-current" :style="{ width: progressPercentage + '%' }">
          <div class="progress-handle"></div>
        </div>
      </div>

      <div class="controls-row">
        <div class="controls-left">
          <!-- 播放/暂停 -->
          <button class="control-btn" @click="togglePlay">
            <component :is="isPlaying ? Pause : Play" />
          </button>

          <!-- 音量 -->
          <div
            class="volume-control"
            @mouseenter="showVolumeSlider = true"
            @mouseleave="showVolumeSlider = false"
          >
            <button class="control-btn" @click="toggleMute">
              <component :is="volumeIcon" />
            </button>
            <div class="volume-slider-container">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="volume"
                @input="setVolume"
                class="volume-slider"
                :style="{ '--volume-percent': volume * 100 + '%' }"
              />
            </div>
          </div>

          <!-- 时间 -->
          <span class="time-display">{{ formattedCurrentTime }} / {{ formattedDuration }}</span>
        </div>

        <div class="controls-right">
          <!-- 倍速 -->
          <div class="playback-rate-control">
            <button class="control-btn text-btn" @click="cyclePlaybackRate">
              {{ playbackRate }}x
            </button>
          </div>

          <!-- 全屏 -->
          <button class="control-btn" @click="toggleFullscreen">
            <component :is="isFullscreen ? Minimize : Maximize" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    src: string;
    poster?: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  }>(),
  {
    autoplay: false,
    loop: false,
    muted: false,
  }
);

// Refs
const videoRef = ref<HTMLVideoElement | null>(null);
const playerContainer = ref<HTMLElement | null>(null);

// State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);
const isMuted = ref(props.muted);
const bufferedPercentage = ref(0);
const isFullscreen = ref(false);
const isControlsVisible = ref(true);
const showVolumeSlider = ref(false);
const playbackRate = ref(1);
const isLoading = ref(true);
const error = ref(false);

// Controls visibility timer
let controlsTimer: number | null = null;

// Computed
const progressPercentage = computed(() => {
  if (duration.value === 0) return 0;
  return (currentTime.value / duration.value) * 100;
});

const volumeIcon = computed(() => {
  if (isMuted.value || volume.value === 0) return VolumeX;
  if (volume.value < 0.5) return Volume1;
  return Volume2;
});

const formattedCurrentTime = computed(() => formatTime(currentTime.value));
const formattedDuration = computed(() => formatTime(duration.value));

// Methods
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function togglePlay() {
  if (!videoRef.value) return;
  if (videoRef.value.paused) {
    videoRef.value.play().catch((e) => {
      console.error("Play failed:", e);
      error.value = true;
    });
  } else {
    videoRef.value.pause();
  }
}

function handleTimeUpdate() {
  if (!videoRef.value) return;
  currentTime.value = videoRef.value.currentTime;
  updateBuffered();
}

function updateBuffered() {
  if (!videoRef.value) return;
  const buffered = videoRef.value.buffered;
  if (buffered.length > 0) {
    // 找到当前播放时间所在的缓冲段
    for (let i = 0; i < buffered.length; i++) {
      if (
        buffered.start(i) <= videoRef.value.currentTime &&
        buffered.end(i) >= videoRef.value.currentTime
      ) {
        bufferedPercentage.value = (buffered.end(i) / videoRef.value.duration) * 100;
        break;
      }
    }
  }
}

function handleLoadedMetadata() {
  if (!videoRef.value) return;
  duration.value = videoRef.value.duration;
  isLoading.value = false;
  volume.value = videoRef.value.volume;
  isMuted.value = videoRef.value.muted;
}

function handleEnded() {
  isPlaying.value = false;
  isControlsVisible.value = true;
}

function handleError() {
  isLoading.value = false;
  error.value = true;
}

function seek(e: MouseEvent) {
  if (!videoRef.value || duration.value === 0) return;
  const container = (e.target as HTMLElement).closest(".progress-bar-container") as HTMLElement;
  const rect = container.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  videoRef.value.currentTime = pos * duration.value;
}

function handleProgressHover(e: MouseEvent) {
  // TODO: Implement hover preview logic here
  // 暂时忽略参数，避免 lint 错误
  void e;
}

function toggleMute() {
  if (!videoRef.value) return;
  videoRef.value.muted = !videoRef.value.muted;
  isMuted.value = videoRef.value.muted;
}

function setVolume(e: Event) {
  if (!videoRef.value) return;
  const val = parseFloat((e.target as HTMLInputElement).value);
  videoRef.value.volume = val;
  volume.value = val;
  if (val > 0 && isMuted.value) {
    videoRef.value.muted = false;
    isMuted.value = false;
  }
}

function handleVolumeChange() {
  if (!videoRef.value) return;
  volume.value = videoRef.value.volume;
  isMuted.value = videoRef.value.muted;
}

function cyclePlaybackRate() {
  if (!videoRef.value) return;
  const rates = [0.5, 1, 1.5, 2];
  const currentIndex = rates.indexOf(playbackRate.value);
  const nextRate = rates[(currentIndex + 1) % rates.length];
  videoRef.value.playbackRate = nextRate;
  playbackRate.value = nextRate;
}

function toggleFullscreen() {
  if (!playerContainer.value) return;

  if (!document.fullscreenElement) {
    playerContainer.value.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

function handleMouseMove() {
  isControlsVisible.value = true;
  resetControlsTimer();
}

function handleMouseLeave() {
  if (isPlaying.value) {
    isControlsVisible.value = false;
  }
}

function resetControlsTimer() {
  if (controlsTimer) clearTimeout(controlsTimer);
  if (isPlaying.value) {
    controlsTimer = window.setTimeout(() => {
      isControlsVisible.value = false;
    }, 3000);
  }
}

// Watchers
watch(isPlaying, (val) => {
  if (val) {
    resetControlsTimer();
  } else {
    isControlsVisible.value = true;
    if (controlsTimer) clearTimeout(controlsTimer);
  }
});

// Lifecycle
onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  if (props.autoplay && videoRef.value) {
    videoRef.value.play().catch(() => {
      // Autoplay blocked, expected behavior in some cases
    });
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  if (controlsTimer) clearTimeout(controlsTimer);
});
</script>

<style scoped>
.video-player {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Overlays */
.loading-overlay,
.error-overlay,
.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  z-index: 10;
}

.play-overlay {
  background: rgba(0, 0, 0, 0.3);
}

.play-icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(var(--ui-blur));
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.2s;
}

.video-player:hover .play-icon-circle {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.3);
}

.play-icon-large {
  width: 32px;
  height: 32px;
  color: white;
  fill: white;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-overlay {
  flex-direction: column;
  gap: 8px;
  color: white;
}

/* Controls Bar */
.controls-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  padding: 20px 16px 16px;
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 0.3s,
    transform 0.3s;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.controls-visible .controls-bar {
  opacity: 1;
  transform: translateY(0);
}

/* Progress Bar */
.progress-bar-container {
  position: relative;
  height: 4px;
  width: 100%;
  cursor: pointer;
  transition: height 0.1s;
}

.progress-bar-container:hover {
  height: 6px;
}

.progress-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.progress-buffered {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 2px;
  pointer-events: none;
}

.progress-current {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  background: var(--el-color-primary, #409eff);
  border-radius: 2px;
  pointer-events: none;
}

.progress-handle {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%) scale(0);
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.1s;
}

.progress-bar-container:hover .progress-handle {
  transform: translateY(-50%) scale(1);
}

/* Controls Row */
.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.2s,
    background 0.2s;
}

.control-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.control-btn svg {
  width: 20px;
  height: 20px;
}

.text-btn {
  font-size: 13px;
  font-weight: 600;
  width: 32px;
}

.time-display {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Volume Slider */
.volume-control {
  display: flex;
  align-items: center;
  position: relative;
}

.volume-slider-container {
  width: 0;
  overflow: hidden;
  transition: width 0.2s;
  display: flex;
  align-items: center;
}

.volume-control:hover .volume-slider-container {
  width: 60px;
  margin-left: 8px;
}

.volume-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  position: relative;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
}

/* Fullscreen override */
.is-fullscreen {
  width: 100vw;
  height: 100vh;
}
</style>
