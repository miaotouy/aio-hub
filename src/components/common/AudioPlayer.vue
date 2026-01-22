<template>
  <div
    class="audio-player"
    :class="{ 'is-playing': isPlaying }"
    @keydown="handleKeydown"
    tabindex="0"
  >
    <!-- 音频元素 (隐藏) -->
    <audio
      ref="audioRef"
      :src="currentAudio.src"
      :loop="isLoop"
      :muted="isMuted"
      :autoplay="autoplay"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @ended="handleEnded"
      @play="onPlay"
      @pause="onPause"
      @volumechange="handleVolumeChange"
      @error="handleError"
    ></audio>

    <!-- 顶部信息区 -->
    <div class="audio-header">
      <div class="header-actions-top">
        <slot name="actions"></slot>
      </div>
      <div
        class="cover-wrapper"
        :style="{ '--ripple-color': posterColor || 'var(--el-color-primary)' }"
      >
        <div v-if="isPlaying" class="ripples">
          <div class="ripple"></div>
          <div class="ripple"></div>
          <div class="ripple"></div>
        </div>
        <div class="cover-container" :class="{ rotating: isPlaying }">
          <img
            v-if="currentAudio.poster"
            :src="currentAudio.poster"
            class="cover-image"
            alt="poster"
          />
          <div v-else class="cover-placeholder">
            <Music :size="48" />
          </div>
        </div>
      </div>
      <div class="audio-info">
        <h3 class="audio-title">{{ audioName }}</h3>
        <p class="audio-artist">
          {{ currentAudio.artist || "未知艺术家" }}
          <span v-if="effectivePlaylist.length > 1" style="opacity: 0.5; font-size: 12px">
            ({{ currentIndex + 1 }}/{{ effectivePlaylist.length }})
          </span>
        </p>
      </div>
    </div>

    <!-- 波形图/进度条区域 -->
    <div class="waveform-section">
      <div
        class="waveform-container"
        ref="waveformRef"
        @mousedown="startDragging"
        @mousemove="handleProgressHover"
        @mouseleave="showHoverPreview = false"
      >
        <!-- Canvas 波形 -->
        <canvas ref="waveformCanvasRef" class="waveform-canvas"></canvas>

        <!-- 播放头指示器 -->
        <div class="playhead" :style="{ left: progressPercentage + '%' }"></div>

        <!-- 悬停预览线 -->
        <div v-if="showHoverPreview" class="hover-line" :style="{ left: hoverPosition + '%' }">
          <span class="hover-time">{{ formattedHoverTime }}</span>
        </div>

        <!-- 缓冲进度 -->
        <div class="buffer-bar" :style="{ width: bufferedPercentage + '%' }"></div>
      </div>

      <!-- 时间显示 -->
      <div class="time-info">
        <span>{{ formattedCurrentTime }}</span>
        <span>{{ formattedDuration }}</span>
      </div>
    </div>

    <!-- 控制栏 -->
    <div class="controls-bar">
      <div class="controls-left">
        <!-- 倍速控制 -->
        <div class="menu-container" @mouseleave="showPlaybackRateMenu = false">
          <button
            class="control-btn text-btn"
            @click="showPlaybackRateMenu = !showPlaybackRateMenu"
            @mouseenter="showPlaybackRateMenu = true"
          >
            {{ playbackRate }}x
          </button>
          <div v-if="showPlaybackRateMenu" class="popup-menu rate-menu">
            <div
              v-for="rate in [2.0, 1.5, 1.25, 1.0, 0.75, 0.5]"
              :key="rate"
              class="menu-item"
              :class="{ active: playbackRate === rate }"
              @click="setPlaybackRate(rate)"
            >
              {{ rate }}x
            </div>
          </div>
        </div>
      </div>

      <div class="controls-center">
        <button
          v-if="effectivePlaylist.length > 1"
          class="control-btn"
          @click="prev"
          title="上一曲"
        >
          <SkipBack :size="20" fill="currentColor" />
        </button>
        <button class="control-btn" @click="skip(-5)" title="快退 5s (←)">
          <Rewind :size="20" />
        </button>
        <button
          class="control-btn main-btn"
          @click="togglePlay"
          :title="isPlaying ? '暂停 (Space)' : '播放 (Space)'"
        >
          <component :is="isPlaying ? Pause : Play" :size="28" fill="currentColor" />
        </button>
        <button class="control-btn" @click="skip(5)" title="快进 5s (→)">
          <FastForward :size="20" />
        </button>
        <button
          v-if="effectivePlaylist.length > 1"
          class="control-btn"
          @click="next"
          title="下一曲"
        >
          <SkipForward :size="20" fill="currentColor" />
        </button>
      </div>

      <div class="controls-right">
        <!-- 音量控制 -->
        <div class="volume-control">
          <button class="control-btn" @click="toggleMute">
            <component :is="volumeIcon" :size="20" />
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
            <span class="volume-value">{{ volumePercentage }}%</span>
          </div>
        </div>

        <!-- 循环模式 -->
        <button
          class="control-btn"
          :class="{ 'is-active': isLoop }"
          @click="toggleLoop"
          :title="isLoop ? '单曲循环' : '列表播放'"
        >
          <Repeat :size="20" />
        </button>

        <!-- 播放列表 -->
        <button
          v-if="effectivePlaylist.length > 1"
          class="control-btn"
          :class="{ 'is-active': showPlaylist }"
          @click="showPlaylist = !showPlaylist"
          title="播放列表"
        >
          <ListMusic :size="20" />
        </button>
      </div>
    </div>

    <!-- 加载/错误状态 -->
    <div v-if="isLoading" class="status-overlay">
      <div class="spinner"></div>
    </div>
    <div v-if="error" class="status-overlay error">
      <AlertCircle :size="24" />
      <span>播放失败</span>
    </div>

    <!-- 播放列表抽屉/浮层 -->
    <Transition name="slide-up">
      <div v-if="showPlaylist" class="playlist-overlay">
        <div class="playlist-header">
          <span>播放列表 ({{ effectivePlaylist.length }})</span>
          <button class="close-btn" @click="showPlaylist = false">×</button>
        </div>
        <div class="playlist-items">
          <div
            v-for="(item, index) in effectivePlaylist"
            :key="index"
            class="playlist-item"
            :class="{ active: currentIndex === index }"
            @click="selectTrack(index)"
          >
            <div class="item-left">
              <div class="item-poster">
                <img v-if="item.poster" :src="item.poster" alt="poster" />
                <Music v-else :size="16" />
              </div>
              <div class="item-info">
                <span class="item-title">{{ item.title || "未知音频" }}</span>
                <span class="item-artist">{{ item.artist || "未知艺术家" }}</span>
              </div>
            </div>
            <div v-if="currentIndex === index && isPlaying" class="playing-icon">
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import ColorThief from "color-thief-ts";
import {
  Play,
  Pause,
  Music,
  Volume2,
  Volume1,
  VolumeX,
  Repeat,
  Rewind,
  FastForward,
  AlertCircle,
  SkipBack,
  SkipForward,
  ListMusic,
} from "lucide-vue-next";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("AudioPlayer");

export interface AudioItem {
  src: string;
  title?: string;
  artist?: string;
  poster?: string;
}

const props = withDefaults(
  defineProps<{
    src?: string;
    title?: string;
    artist?: string;
    poster?: string;
    playlist?: AudioItem[];
    initialIndex?: number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    showWaveform?: boolean;
  }>(),
  {
    src: "",
    autoplay: false,
    loop: false,
    muted: false,
    showWaveform: true,
    playlist: () => [],
    initialIndex: 0,
  }
);

const emit = defineEmits<{
  (e: "play"): void;
  (e: "pause"): void;
  (e: "ended"): void;
  (e: "error", err: any): void;
  (e: "change", index: number, item: AudioItem): void;
}>();

// 引用
const audioRef = ref<HTMLAudioElement | null>(null);
const waveformRef = ref<HTMLElement | null>(null);
const waveformCanvasRef = ref<HTMLCanvasElement | null>(null);

// 状态
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const isLoading = ref(true);
const error = ref(false);

const STORAGE_KEY_VOLUME = "audio-player-volume";
const STORAGE_KEY_MUTED = "audio-player-muted";

const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);

const volume = ref(savedVolume !== null ? parseFloat(savedVolume) : 1);
const isMuted = ref(savedMuted !== null ? savedMuted === "true" : props.muted);
const isLoop = ref(props.loop);
const currentIndex = ref(props.initialIndex);
const showPlaylist = ref(false);
const playbackRate = ref(1);
const bufferedPercentage = ref(0);
const posterColor = ref<string | null>(null);

// 取色器
const colorThief = new ColorThief();

// 波形数据
const waveformData = ref<number[]>([]);
const samples = 300;

// 交互状态
const isDragging = ref(false);
const showHoverPreview = ref(false);
const hoverTime = ref(0);
const hoverPosition = ref(0);
const showPlaybackRateMenu = ref(false);

// 计算属性
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
const formattedHoverTime = computed(() => formatTime(hoverTime.value));
const volumePercentage = computed(() => Math.round(volume.value * 100));

const currentAudio = computed<AudioItem>(() => {
  const list = effectivePlaylist.value;
  return list[currentIndex.value] || list[0] || { src: props.src };
});

const effectivePlaylist = computed(() => {
  if (props.playlist && props.playlist.length > 0) {
    return props.playlist;
  }
  return [
    {
      src: props.src,
      title: props.title,
      artist: props.artist,
      poster: props.poster,
    },
  ];
});

const audioName = computed(() => {
  if (currentAudio.value.title) return currentAudio.value.title;
  if (!currentAudio.value.src) return "未知音频";
  try {
    const urlParts = currentAudio.value.src.split(/[/\\]/);
    let name = urlParts.pop() || "";
    name = name.split("?")[0];
    return decodeURIComponent(name);
  } catch {
    return "未知音频";
  }
});

// 方法
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function togglePlay() {
  if (!audioRef.value) return;
  if (audioRef.value.paused) {
    audioRef.value.play().catch((e) => {
      logger.error("播放失败", e);
      error.value = true;
      emit("error", e);
    });
  } else {
    audioRef.value.pause();
  }
}

function onPlay() {
  isPlaying.value = true;
  isLoading.value = false;
  emit("play");
}

function onPause() {
  isPlaying.value = false;
  emit("pause");
}

function handleTimeUpdate() {
  if (!audioRef.value || isDragging.value) return;
  currentTime.value = audioRef.value.currentTime;
  updateBuffered();
}

function updateBuffered() {
  if (!audioRef.value) return;
  const buffered = audioRef.value.buffered;
  if (buffered.length > 0) {
    for (let i = 0; i < buffered.length; i++) {
      if (
        buffered.start(i) <= audioRef.value.currentTime &&
        buffered.end(i) >= audioRef.value.currentTime
      ) {
        bufferedPercentage.value = (buffered.end(i) / audioRef.value.duration) * 100;
        break;
      }
    }
  }
}

function handleLoadedMetadata() {
  if (!audioRef.value) return;
  duration.value = audioRef.value.duration;
  isLoading.value = false;
  audioRef.value.volume = volume.value;
  audioRef.value.muted = isMuted.value;
}

function handleEnded() {
  if (isLoop.value) {
    audioRef.value?.play();
    return;
  }

  const list = effectivePlaylist.value;
  if (list.length > 1) {
    next();
  } else {
    isPlaying.value = false;
    emit("ended");
  }
}

function next() {
  const list = effectivePlaylist.value;
  if (list.length > 0) {
    currentIndex.value = (currentIndex.value + 1) % list.length;
    emit("change", currentIndex.value, currentAudio.value);
    playAfterChange();
  }
}

function prev() {
  const list = effectivePlaylist.value;
  if (list.length > 0) {
    currentIndex.value = (currentIndex.value - 1 + list.length) % list.length;
    emit("change", currentIndex.value, currentAudio.value);
    playAfterChange();
  }
}

function selectTrack(index: number) {
  currentIndex.value = index;
  emit("change", currentIndex.value, currentAudio.value);
  playAfterChange();
  showPlaylist.value = false;
}

function playAfterChange() {
  isLoading.value = true;
  error.value = false;
  // 给一丢丢延迟让 src 切换生效
  setTimeout(() => {
    audioRef.value?.play().catch((e) => {
      logger.error("切歌播放失败", e);
    });
  }, 50);
}

function handleError(e: any) {
  isLoading.value = false;
  error.value = true;
  emit("error", e);
}

// 波形解析
async function initWaveform() {
  if (!props.src || !props.showWaveform) {
    // 填充默认数据
    waveformData.value = Array(samples).fill(0.1);
    drawWaveform();
    return;
  }

  try {
    const response = await fetch(props.src);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / samples);
    const rawData: number[] = [];

    for (let i = 0; i < samples; i++) {
      const start = i * blockSize;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[start + j]);
      }
      rawData.push(sum / blockSize);
    }

    const max = Math.max(...rawData);
    waveformData.value = rawData.map((v) => Math.max(0.05, v / max));
    await audioCtx.close();
    drawWaveform();
  } catch (err) {
    logger.warn("波形解析失败", err);
    waveformData.value = Array(samples).fill(0.2);
    drawWaveform();
  }
}

// 绘制连续波形
function drawWaveform() {
  const canvas = waveformCanvasRef.value;
  if (!canvas) return;

  const container = waveformRef.value;
  if (!container) return;

  // 设置 canvas 尺寸（考虑设备像素比）
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const data = waveformData.value;
  const progress = progressPercentage.value / 100;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 获取主题色
  const computedStyle = getComputedStyle(document.documentElement);
  const primaryColor = computedStyle.getPropertyValue("--el-color-primary").trim() || "#409eff";

  // 绘制背景波形（未播放部分）
  drawWaveformPath(ctx, data, width, height, "rgba(255, 255, 255, 0.15)", 0, 1);

  // 绘制进度波形（已播放部分）- 使用渐变
  if (progress > 0) {
    const gradient = ctx.createLinearGradient(0, 0, width * progress, 0);
    gradient.addColorStop(0, primaryColor);
    gradient.addColorStop(1, primaryColor);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width * progress, height);
    ctx.clip();
    drawWaveformPath(ctx, data, width, height, gradient, 0, 1);
    ctx.restore();
  }
}

// 绘制波形路径（使用贝塞尔曲线平滑）
function drawWaveformPath(
  ctx: CanvasRenderingContext2D,
  data: number[],
  width: number,
  height: number,
  fillStyle: string | CanvasGradient,
  startRatio: number,
  endRatio: number
) {
  if (data.length === 0) return;

  const padding = 8; // 上下留白
  const availableHeight = (height - padding * 2) / 2;
  const centerY = height / 2;
  const stepX = width / (data.length - 1);

  ctx.fillStyle = fillStyle;
  ctx.beginPath();

  // 上半部分波形
  const startIndex = Math.floor(data.length * startRatio);
  const endIndex = Math.ceil(data.length * endRatio);

  // 移动到起点
  ctx.moveTo(startIndex * stepX, centerY);

  // 绘制上半部分（使用二次贝塞尔曲线平滑）
  for (let i = startIndex; i < endIndex; i++) {
    const x = i * stepX;
    const y = centerY - data[i] * availableHeight;
    if (i === startIndex) {
      ctx.lineTo(x, y);
    } else {
      const prevX = (i - 1) * stepX;
      const prevY = centerY - data[i - 1] * availableHeight;
      const cpX = (prevX + x) / 2;
      ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);
    }
  }

  // 连接到最后一个点
  if (endIndex > startIndex) {
    const lastX = (endIndex - 1) * stepX;
    const lastY = centerY - data[endIndex - 1] * availableHeight;
    ctx.lineTo(lastX, lastY);
  }

  // 绘制下半部分（镜像）
  for (let i = endIndex - 1; i >= startIndex; i--) {
    const x = i * stepX;
    const y = centerY + data[i] * availableHeight;

    if (i === endIndex - 1) {
      ctx.lineTo(x, y);
    } else {
      const nextX = (i + 1) * stepX;
      const nextY = centerY + data[i + 1] * availableHeight;
      const cpX = (nextX + x) / 2;
      ctx.quadraticCurveTo(nextX, nextY, cpX, (nextY + y) / 2);
    }
  }

  // 连接回起点
  if (startIndex < data.length) {
    const firstX = startIndex * stepX;
    const firstY = centerY + data[startIndex] * availableHeight;
    ctx.lineTo(firstX, firstY);
  }

  ctx.closePath();
  ctx.fill();
}

// 监听进度变化重绘波形
watch(progressPercentage, () => {
  drawWaveform();
});

// 监听窗口大小变化
let resizeObserver: ResizeObserver | null = null;

// 交互逻辑
function calculateTimeFromEvent(e: MouseEvent): number {
  if (!waveformRef.value || duration.value === 0) return 0;
  const rect = waveformRef.value.getBoundingClientRect();
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  return (offsetX / rect.width) * duration.value;
}

function startDragging(e: MouseEvent) {
  if (duration.value === 0) return;
  isDragging.value = true;
  handleDrag(e);
  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", stopDragging);
}

function handleDrag(e: MouseEvent) {
  if (!isDragging.value) return;
  const time = calculateTimeFromEvent(e);
  currentTime.value = time;
}

function stopDragging(e: MouseEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDragging);

  const time = calculateTimeFromEvent(e);
  currentTime.value = time;
  if (audioRef.value) {
    audioRef.value.currentTime = time;
  }
}

function handleProgressHover(e: MouseEvent) {
  if (!waveformRef.value) return;
  const rect = waveformRef.value.getBoundingClientRect();
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

  hoverPosition.value = (offsetX / rect.width) * 100;
  hoverTime.value = (offsetX / rect.width) * duration.value;
  showHoverPreview.value = true;
}

function toggleMute() {
  if (!audioRef.value) return;
  isMuted.value = !isMuted.value;
  audioRef.value.muted = isMuted.value;
}

function setVolume(e: Event) {
  if (!audioRef.value) return;
  const val = parseFloat((e.target as HTMLInputElement).value);
  volume.value = val;
  audioRef.value.volume = val;
  if (val > 0 && isMuted.value) {
    isMuted.value = false;
    audioRef.value.muted = false;
  }
}

function handleVolumeChange() {
  if (!audioRef.value) return;
  volume.value = audioRef.value.volume;
  isMuted.value = audioRef.value.muted;
  localStorage.setItem(STORAGE_KEY_VOLUME, volume.value.toString());
  localStorage.setItem(STORAGE_KEY_MUTED, isMuted.value.toString());
}

function setPlaybackRate(rate: number) {
  if (!audioRef.value) return;
  playbackRate.value = rate;
  audioRef.value.playbackRate = rate;
  showPlaybackRateMenu.value = false;
}

function toggleLoop() {
  isLoop.value = !isLoop.value;
}

function skip(seconds: number) {
  if (!audioRef.value) return;
  audioRef.value.currentTime = Math.min(
    Math.max(audioRef.value.currentTime + seconds, 0),
    duration.value
  );
}

function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowLeft":
      e.preventDefault();
      skip(-5);
      break;
    case "ArrowRight":
      e.preventDefault();
      skip(5);
      break;
    case "ArrowUp":
      e.preventDefault();
      const volUp = Math.min(volume.value + 0.1, 1);
      volume.value = volUp;
      if (audioRef.value) audioRef.value.volume = volUp;
      break;
    case "ArrowDown":
      e.preventDefault();
      const volDown = Math.max(volume.value - 0.1, 0);
      volume.value = volDown;
      if (audioRef.value) audioRef.value.volume = volDown;
      break;
  }
}

// 提取封面颜色
async function extractPosterColor() {
  if (!props.poster) {
    posterColor.value = null;
    return;
  }

  try {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = props.poster;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
    });

    const color = colorThief.getColor(img) as string | number[];
    if (color) {
      // color-thief-ts 可能返回 HEX 字符串或 RGB 数组
      if (typeof color === "string") {
        posterColor.value = (color as string).startsWith("#") ? color : `#${color}`;
      } else if (Array.isArray(color)) {
        posterColor.value = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      }
    }
  } catch (err) {
    logger.warn("提取封面颜色失败", err);
    posterColor.value = null;
  }
}

// 监听源变化
watch(
  () => currentAudio.value.src,
  () => {
    error.value = false;
    isLoading.value = true;
    initWaveform();
  }
);

// 监听封面变化
watch(() => currentAudio.value.poster, extractPosterColor, { immediate: true });

onMounted(() => {
  logger.debug("AudioPlayer mounted", {
    playlistLength: props.playlist?.length,
    src: props.src,
    currentIndex: currentIndex.value,
  });
  initWaveform(); // 监听容器大小变化
  if (waveformRef.value) {
    resizeObserver = new ResizeObserver(() => {
      drawWaveform();
    });
    resizeObserver.observe(waveformRef.value);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDragging);

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<style scoped>
.audio-player {
  width: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--el-text-color-primary);
  outline: none;
  position: relative;
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
}

.audio-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  position: relative;
}

.header-actions-top {
  position: absolute;
  top: 0;
  right: 0;
}

.cover-wrapper {
  padding: 32px 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ripples {
  position: absolute;
  width: 240px;
  height: 240px;
  pointer-events: none;
  z-index: 0;
}

.ripple {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  background: var(--ripple-color);
  opacity: 0;
  animation: ripple-out 4s cubic-bezier(0, 0.2, 0.8, 1) infinite;
}

.ripple:nth-child(2) {
  animation-delay: 1.3s;
}

.ripple:nth-child(3) {
  animation-delay: 2.6s;
}

@keyframes ripple-out {
  0% {
    transform: scale(1);
    opacity: 0.25;
  }
  100% {
    transform: scale(1.36);
    opacity: 0;
  }
}

.cover-container {
  position: relative;
  z-index: 1;
  width: 240px;
  height: 240px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.cover-container.rotating {
  animation: rotate 20s linear infinite;
  border-radius: 50%;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  color: var(--el-text-color-secondary);
}

.audio-info {
  width: 100%;
  text-align: center;
  min-width: 0;
}

.audio-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audio-artist {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

/* 波形图区域 */
.waveform-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.waveform-container {
  position: relative;
  height: 64px;
  cursor: pointer;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  overflow: hidden;
}

.waveform-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.playhead {
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--el-color-primary);
  border-radius: 1px;
  box-shadow: 0 0 8px var(--el-color-primary);
  pointer-events: none;
  z-index: 5;
  transition: left 0.1s linear;
}

.time-info {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
}

.buffer-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.hover-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.6);
  pointer-events: none;
  z-index: 10;
}

.hover-time {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: white;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
/* 控制栏 */
.controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left,
.controls-right {
  flex: 1;
  display: flex;
  align-items: center;
}

.controls-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.controls-right {
  justify-content: flex-end;
  gap: 12px;
}

.control-btn {
  background: none;
  border: none;
  color: var(--el-text-color-regular);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.control-btn:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.control-btn.main-btn {
  background: var(--el-color-primary);
  color: white;
  padding: 10px;
  border-radius: 50%;
}

.control-btn.main-btn:hover {
  transform: scale(1.05);
  filter: brightness(1.1);
}

.control-btn.is-active {
  color: var(--el-color-primary);
}

.text-btn {
  font-size: 12px;
  font-weight: 600;
  min-width: 36px;
}

/* 音量控制 */
.volume-control {
  display: flex;
  align-items: center;
}

.volume-slider-container {
  width: 120px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-value {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-secondary);
  min-width: 32px;
}

.volume-slider {
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  background: white;
  border-radius: 50%;
}

/* 菜单 */
.menu-container {
  position: relative;
}

.popup-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 8px;
  border: 1px solid var(--border-color);
  z-index: 100;
  min-width: 80px;
}

.menu-item {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.menu-item:hover {
  background: var(--el-fill-color-light);
}

.menu-item.active {
  color: var(--el-color-primary);
}

/* 状态遮罩 */
.status-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--el-mask-color-extra-light);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 10;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.status-overlay.error {
  color: var(--el-color-danger);
}

/* 播放列表样式 */
.playlist-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 70%;
  background: var(--container-bg);
  z-index: 100;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
  border-radius: 16px 16px 0 0;
}

.playlist-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: var(--el-text-color-secondary);
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.playlist-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.playlist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.playlist-item:hover {
  background: var(--el-fill-color-light);
}

.playlist-item.active {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.item-poster {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.item-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-artist {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 播放中动画 */
.playing-icon {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.playing-icon .bar {
  width: 2px;
  background: var(--el-color-primary);
  animation: bar-dance 0.8s ease-in-out infinite alternate;
}

.playing-icon .bar:nth-child(2) {
  animation-delay: 0.2s;
}

.playing-icon .bar:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bar-dance {
  from {
    height: 4px;
  }
  to {
    height: 12px;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
