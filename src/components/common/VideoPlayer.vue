<template>
  <div class="video-player-host" :class="{ 'is-web-fullscreen': isWebFullscreen }">
    <Teleport to="body" :disabled="!isWebFullscreen">
      <div
        ref="playerContainer"
        class="video-player"
        :class="{
          'is-fullscreen': isFullscreen,
          'is-web-fullscreen': isWebFullscreen,
          'controls-visible': isControlsVisible || !isPlaying,
          'is-narrow': isNarrow,
          'is-ultra-narrow': isUltraNarrow,
        }"
        tabindex="0"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
        @click="handleContainerClick"
        @dblclick="toggleFullscreen"
        @keydown="!globalHotkey ? handleKeydown($event) : undefined"
      >
        <!-- 视频元素 -->
        <video
          ref="videoRef"
          class="video-element"
          crossorigin="anonymous"
          :src="src"
          :poster="poster"
          :loop="isLoop"
          :muted="isMuted"
          :autoplay="autoplay"
          :style="{
            objectFit: objectFit,
            transform: isMirrored ? 'scaleX(-1)' : 'none',
          }"
          @timeupdate="handleTimeUpdate"
          @loadedmetadata="handleLoadedMetadata"
          @ended="handleEnded"
          @play="onPlay"
          @pause="onPause"
          @waiting="isLoading = true"
          @canplay="isLoading = false"
          @volumechange="handleVolumeChange"
          @error="handleError"
          @enterpictureinpicture="handlePiPChange"
          @leavepictureinpicture="handlePiPChange"
        ></video>

        <!-- 加载状态 -->
        <div v-if="isLoading" class="loading-overlay">
          <div class="spinner"></div>
        </div>

        <!-- 错误提示 -->
        <div v-if="error" class="error-overlay">
          <span class="error-icon">⚠️</span>
          <span class="error-text">无法播放视频</span>
        </div>

        <!-- 播放按钮覆盖层 (暂停时显示) -->
        <div v-if="!isPlaying && !isLoading && !error && showPlayIconOnPause" class="play-overlay">
          <div class="play-icon-circle">
            <component :is="Play" class="play-icon-large" />
          </div>
        </div>

        <!-- 顶部标题栏 -->
        <div class="top-bar">
          <span class="video-title">{{ videoName }}</span>
        </div>

        <!-- 底部控制栏 -->
        <div class="controls-bar" @click.stop @dblclick.stop>
          <!-- 进度条 -->
          <div
            class="progress-bar-container"
            ref="progressBarRef"
            @mousedown="startDragging"
            @mousemove="handleProgressHover"
            @mouseleave="showHoverPreview = false"
          >
            <!-- 悬停时间预览 -->
            <div
              v-if="showHoverPreview"
              class="hover-time-tooltip"
              :style="{ left: hoverPosition + '%' }"
            >
              {{ formattedHoverTime }}
            </div>

            <!-- 悬停指示器 (上下三角) -->
            <div
              v-if="showHoverPreview"
              class="hover-indicator"
              :style="{ left: hoverPosition + '%' }"
            >
              <div class="indicator-top"></div>
              <div class="indicator-bottom"></div>
            </div>

            <div class="progress-background"></div>
            <div class="progress-buffered" :style="{ width: bufferedPercentage + '%' }"></div>
            <div class="progress-current" :style="{ width: progressPercentage + '%' }">
              <div class="progress-handle"></div>
            </div>
          </div>

          <div class="controls-row">
            <!-- 左侧：播放控制与时间 -->
            <div class="controls-left">
              <button class="control-btn" @click="togglePlay" title="播放/暂停 (Space)">
                <component :is="isPlaying ? Pause : Play" />
              </button>

              <span v-if="!isUltraNarrow" class="time-display">
                {{ formattedCurrentTime }} / {{ formattedDuration }}
              </span>
              <span v-else class="time-display">{{ formattedCurrentTime }}</span>
            </div>

            <!-- 中间：帧控制与截图 -->
            <div v-if="!isNarrow" class="controls-center">
              <button class="control-btn" @click="captureSnapshot" title="截图">
                <Camera :size="20" />
              </button>
              <div class="divider-vertical"></div>
              <button class="control-btn" @click="skip(-5)" title="快退 5s (←)">
                <Rewind :size="20" />
              </button>
              <button class="control-btn" @click="stepFrame(-1)" title="上一帧">
                <div class="icon-with-dot left">
                  <ChevronLeft :size="20" />
                  <div class="dot"></div>
                </div>
              </button>
              <button class="control-btn" @click="stepFrame(1)" title="下一帧">
                <div class="icon-with-dot right">
                  <div class="dot"></div>
                  <ChevronRight :size="20" />
                </div>
              </button>
              <button class="control-btn" @click="skip(5)" title="快进 5s (→)">
                <FastForward :size="20" />
              </button>
            </div>

            <!-- 右侧：高级功能 -->
            <div class="controls-right">
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

              <!-- 音量控制 -->
              <div class="menu-container" @mouseleave="showVolumeSlider = false">
                <button
                  class="control-btn"
                  @click="toggleMute"
                  @mouseenter="showVolumeSlider = true"
                >
                  <component :is="volumeIcon" />
                </button>
                <div v-if="showVolumeSlider" class="popup-menu volume-menu">
                  <div class="volume-slider-wrapper">
                    <span class="volume-percentage">{{ Math.round(volume * 100) }}%</span>
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
              </div>

              <!-- 设置菜单 -->
              <div class="menu-container" @mouseleave="showSettingsMenu = false">
                <button
                  class="control-btn"
                  @click="showSettingsMenu = !showSettingsMenu"
                  @mouseenter="showSettingsMenu = true"
                >
                  <Settings :size="20" />
                </button>
                <div v-if="showSettingsMenu" class="popup-menu settings-menu">
                  <div class="menu-item" @click="toggleLoop">
                    <Repeat :size="16" />
                    <span>循环播放</span>
                    <Check v-if="isLoop" :size="16" class="check-icon" />
                  </div>
                  <div class="menu-item" @click="toggleMirror">
                    <FlipHorizontal :size="16" />
                    <span>镜像翻转</span>
                    <Check v-if="isMirrored" :size="16" class="check-icon" />
                  </div>
                  <div class="menu-item" @click="cycleObjectFit">
                    <Monitor :size="16" />
                    <span
                      >画面:
                      {{
                        objectFit === "contain" ? "适应" : objectFit === "cover" ? "填充" : "拉伸"
                      }}</span
                    >
                  </div>
                  <div class="menu-item" @click="toggleShowPlayIconOnPause">
                    <PlayCircle :size="16" />
                    <span>暂停显示图标</span>
                    <Check v-if="showPlayIconOnPause" :size="16" class="check-icon" />
                  </div>
                </div>
              </div>

              <!-- 网页全屏 -->
              <button
                v-if="!isUltraNarrow"
                class="control-btn"
                @click="toggleWebFullscreen"
                title="网页全屏"
              >
                <component :is="isWebFullscreen ? Shrink : Expand" :size="20" />
              </button>

              <!-- 画中画模式 -->
              <button v-if="!isUltraNarrow" class="control-btn" @click="togglePiP" title="画中画">
                <PictureInPicture2 :size="20" />
              </button>

              <!-- 全屏模式 -->
              <button class="control-btn" @click="toggleFullscreen" title="全屏 (F)">
                <component :is="isFullscreen ? Minimize : Maximize" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, onActivated, onDeactivated } from "vue";
import { useElementSize } from "@vueuse/core";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Camera,
  Settings,
  ChevronLeft,
  ChevronRight,
  Check,
  Repeat,
  Monitor,
  FlipHorizontal,
  PictureInPicture2,
  PlayCircle,
  Rewind,
  FastForward,
  Expand,
  Shrink,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

const props = withDefaults(
  defineProps<{
    src: string;
    title?: string;
    poster?: string;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    globalHotkey?: boolean;
  }>(),
  {
    autoplay: false,
    loop: false,
    muted: false,
    globalHotkey: false,
  }
);

// 引用
const videoRef = ref<HTMLVideoElement | null>(null);
const playerContainer = ref<HTMLElement | null>(null);
const progressBarRef = ref<HTMLElement | null>(null);

const { width: containerWidth } = useElementSize(playerContainer);

// 状态
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);

const STORAGE_KEY_VOLUME = "video-player-volume";
const STORAGE_KEY_MUTED = "video-player-muted";
const STORAGE_KEY_SHOW_PLAY_ICON = "video-player-show-play-icon";

const savedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
const savedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
const savedShowPlayIcon = localStorage.getItem(STORAGE_KEY_SHOW_PLAY_ICON);

const volume = ref(savedVolume !== null ? parseFloat(savedVolume) : 1);
const isMuted = ref(savedMuted !== null ? savedMuted === "true" : props.muted);
const isLoop = ref(props.loop);
const bufferedPercentage = ref(0);
const isFullscreen = ref(false);
const isWebFullscreen = ref(false);
const isControlsVisible = ref(true);
const showVolumeSlider = ref(false);
const showPlaybackRateMenu = ref(false);
const showSettingsMenu = ref(false);
const playbackRate = ref(1);
const isLoading = ref(true);
const error = ref(false);
const isPiP = ref(false);
const isMirrored = ref(false);
const objectFit = ref<"contain" | "cover" | "fill">("contain");
const showPlayIconOnPause = ref(savedShowPlayIcon !== null ? savedShowPlayIcon === "true" : true);
const isActive = ref(true);

// 拖拽状态
const isDragging = ref(false);
const hoverTime = ref(0);
const hoverPosition = ref(0);
const showHoverPreview = ref(false);

// 控制栏可见性定时器
let controlsTimer: number | null = null;

// 计算属性
const isNarrow = computed(() => containerWidth.value > 0 && containerWidth.value < 650);
const isUltraNarrow = computed(() => containerWidth.value > 0 && containerWidth.value < 450);

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

const videoName = computed(() => {
  if (props.title) return props.title;
  if (!props.src) return "video";
  try {
    // 尝试从 URL/路径中提取文件名
    const urlParts = props.src.split(/[/\\]/);
    let name = urlParts.pop() || "";
    // 去除 query string
    name = name.split("?")[0];
    return decodeURIComponent(name);
  } catch {
    return "video";
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

function onPlay() {
  isPlaying.value = true;
  isLoading.value = false;
}

function onPause() {
  isPlaying.value = false;
}

function handleContainerClick(e: MouseEvent) {
  // 防止在交互控制栏时触发点击（控制栏已使用.stop修饰符，但为了安全起见）
  if ((e.target as HTMLElement).closest(".controls-bar")) return;
  togglePlay();
}

function handleTimeUpdate() {
  if (!videoRef.value || isDragging.value) return; // 拖拽时不更新时间
  currentTime.value = videoRef.value.currentTime;
  updateBuffered();
}

function updateBuffered() {
  if (!videoRef.value) return;
  const buffered = videoRef.value.buffered;
  if (buffered.length > 0) {
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

// 跳转与拖拽
function calculateTimeFromEvent(e: MouseEvent): number {
  if (!progressBarRef.value || duration.value === 0) return 0;
  const rect = progressBarRef.value.getBoundingClientRect();
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
  currentTime.value = time; // 立即视觉反馈
  // 可选：拖拽时跳转视频（可能消耗较多资源）
  // if (videoRef.value) videoRef.value.currentTime = time;
}

function stopDragging(e: MouseEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDragging);

  // 最终跳转
  const time = calculateTimeFromEvent(e);
  currentTime.value = time;
  if (videoRef.value) {
    videoRef.value.currentTime = time;
  }
}

function handleProgressHover(e: MouseEvent) {
  if (!progressBarRef.value) return;
  const rect = progressBarRef.value.getBoundingClientRect();
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

  hoverPosition.value = (offsetX / rect.width) * 100;
  hoverTime.value = (offsetX / rect.width) * duration.value;
  showHoverPreview.value = true;
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

  localStorage.setItem(STORAGE_KEY_VOLUME, volume.value.toString());
  localStorage.setItem(STORAGE_KEY_MUTED, isMuted.value.toString());
}

function setPlaybackRate(rate: number) {
  if (!videoRef.value) return;
  videoRef.value.playbackRate = rate;
  playbackRate.value = rate;
  showPlaybackRateMenu.value = false;
}

function toggleFullscreen() {
  if (!playerContainer.value) return;

  // 如果在网页全屏模式下请求系统全屏，先退出网页全屏（可选，取决于交互偏好，这里保持独立）
  if (!document.fullscreenElement) {
    playerContainer.value.requestFullscreen().catch((err) => {
      console.error(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

function toggleWebFullscreen() {
  // 如果当前是系统全屏，先退出系统全屏
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
  isWebFullscreen.value = !isWebFullscreen.value;
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
  // 如果进入系统全屏，自动退出网页全屏，避免样式冲突
  if (isFullscreen.value) {
    isWebFullscreen.value = false;
  }
}

async function togglePiP() {
  if (!videoRef.value) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoRef.value.requestPictureInPicture();
    }
  } catch (err) {
    console.error("PiP failed:", err);
  }
}

function handlePiPChange() {
  isPiP.value = !!document.pictureInPictureElement;
}

function stepFrame(frames: number) {
  if (!videoRef.value) return;
  // 假设30fps，即每帧0.0333秒
  const frameDuration = 1 / 30;
  videoRef.value.currentTime = Math.min(
    Math.max(videoRef.value.currentTime + frames * frameDuration, 0),
    duration.value
  );
}

function captureSnapshot() {
  if (!videoRef.value) return;

  const canvas = document.createElement("canvas");
  canvas.width = videoRef.value.videoWidth;
  canvas.height = videoRef.value.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 如果启用了镜像则应用翻转
  if (isMirrored.value) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);

  try {
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    // 处理文件名，移除非法字符
    const safeName = videoName.value.replace(/[<>:"/\\|?*]/g, "_");
    link.download = `${safeName}-snapshot-${formatTime(currentTime.value).replace(":", "-")}.png`;
    link.href = dataUrl;
    link.click();
    customMessage.success("截图已保存");
  } catch (err) {
    console.error("Snapshot failed:", err);
    if (err instanceof DOMException && err.name === "SecurityError") {
      customMessage.error("截图失败: 无法截取跨域视频");
    } else {
      customMessage.error("截图失败");
    }
  }
}

function toggleLoop() {
  isLoop.value = !isLoop.value;
  if (videoRef.value) {
    videoRef.value.loop = isLoop.value;
  }
}

function toggleMirror() {
  isMirrored.value = !isMirrored.value;
}

function toggleShowPlayIconOnPause() {
  showPlayIconOnPause.value = !showPlayIconOnPause.value;
  localStorage.setItem(STORAGE_KEY_SHOW_PLAY_ICON, showPlayIconOnPause.value.toString());
}

function cycleObjectFit() {
  const modes: ("contain" | "cover" | "fill")[] = ["contain", "cover", "fill"];
  const idx = modes.indexOf(objectFit.value);
  objectFit.value = modes[(idx + 1) % modes.length];
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

// 全局键盘快捷键
function handleKeydown(e: KeyboardEvent) {
  // 如果组件处于非激活状态（被 keep-alive 缓存），则不响应
  if (!isActive.value) return;

  // 如果用户正在输入，则忽略
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  // 检查播放器是否可见且在文档中
  // 如果 offsetParent 为 null，说明元素或其祖先被设置为 display: none (通常是标签页切换)
  if (!playerContainer.value || playerContainer.value.offsetParent === null) {
    // 如果是全屏模式，即使 offsetParent 为 null (Teleport 到了 body)，也应该响应
    if (!isFullscreen.value && !isWebFullscreen.value) {
      return;
    }
  }

  switch (e.code) {
    case "Space":
    case "KeyK": // YouTube风格快捷键
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
      adjustVolume(0.1);
      break;
    case "ArrowDown":
      e.preventDefault();
      adjustVolume(-0.1);
      break;
    case "KeyF":
      e.preventDefault();
      toggleFullscreen();
      break;
    case "KeyM":
      e.preventDefault();
      toggleMute();
      break;
    case "Escape":
      if (isWebFullscreen.value) {
        e.preventDefault();
        toggleWebFullscreen();
      }
      break;
  }
}

function skip(seconds: number) {
  if (!videoRef.value) return;
  videoRef.value.currentTime = Math.min(
    Math.max(videoRef.value.currentTime + seconds, 0),
    duration.value
  );
}

function adjustVolume(delta: number) {
  if (!videoRef.value) return;
  const newVol = Math.min(Math.max(videoRef.value.volume + delta, 0), 1);
  videoRef.value.volume = newVol;
  volume.value = newVol;
}

// 监听器
watch(isPlaying, (val) => {
  if (val) {
    resetControlsTimer();
  } else {
    isControlsVisible.value = true;
    if (controlsTimer) clearTimeout(controlsTimer);
  }
});

watch(isWebFullscreen, (val) => {
  if (val) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
});

// 生命周期
onActivated(() => {
  isActive.value = true;
  // 重新激活时如果视频在播放，确保控制栏状态同步
  if (isPlaying.value) {
    resetControlsTimer();
  }
});

onDeactivated(() => {
  isActive.value = false;
  // 切换标签页时建议暂停视频，防止后台偷跑流量/性能消耗（可选）
  // if (isPlaying.value) videoRef.value?.pause();
});

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  if (props.globalHotkey) {
    document.addEventListener("keydown", handleKeydown);
  }

  if (videoRef.value) {
    // 应用保存的音量
    videoRef.value.volume = volume.value;
    // 静音状态由模板中的 :muted 绑定处理

    if (props.autoplay) {
      videoRef.value.play().catch(() => {
        // 自动播放被阻止
      });
    }
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  if (props.globalHotkey) {
    document.removeEventListener("keydown", handleKeydown);
  }
  if (controlsTimer) clearTimeout(controlsTimer);
  document.removeEventListener("mousemove", handleDrag);
  document.removeEventListener("mouseup", stopDragging);
});
</script>

<style scoped>
.video-player-host {
  width: 100%;
  height: 100%;
  display: flex;
}

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
  outline: none;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 覆盖层样式 */
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
  background: rgba(255, 255, 255, 0.1);
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

/* 顶部标题栏 */
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
  padding: 16px 20px 24px;
  opacity: 0;
  transform: translateY(-10px);
  transition:
    opacity 0.3s,
    transform 0.3s;
  z-index: 20;
  pointer-events: none; /* 让点击穿透，除非以后加按钮 */
}

.controls-visible .top-bar {
  opacity: 1;
  transform: translateY(0);
}

.video-title {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* 控制栏 */
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

/* 进度条 */
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

/* 控制按钮行 */
.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
}

.controls-left,
.controls-center,
.controls-right {
  display: flex;
  align-items: center;
}

.controls-left {
  gap: 12px;
  flex: 1;
}

.controls-center {
  gap: 8px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.controls-right {
  gap: 8px;
  flex: 1;
  justify-content: flex-end;
}

.divider-vertical {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 4px;
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
  min-width: 32px;
  padding: 0 8px;
}

.time-display {
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 音量滑块 */
.volume-menu {
  min-width: 32px !important; /* 覆盖全局 popup-menu 的 120px */
  width: 32px;
  padding: 12px 0;
}

.volume-slider-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 140px;
  width: 100%;
  position: relative;
}

.volume-percentage {
  color: white;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  margin-bottom: 10px;
  font-weight: 600;
}

.volume-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 100px; /* 旋转后的高度 */
  height: 4px;
  background: linear-gradient(
    to right,
    var(--el-color-primary, #409eff) 0%,
    var(--el-color-primary, #409eff) var(--volume-percent),
    rgba(255, 255, 255, 0.2) var(--volume-percent),
    rgba(255, 255, 255, 0.2) 100%
  );
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  transform: rotate(-90deg);
  transform-origin: center;
  margin: 45px 0; /* 给旋转后的滑块留出空间 */
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
}

/* 全屏样式覆盖 */
.is-fullscreen {
  width: 100vw;
  height: 100vh;
}

.is-web-fullscreen {
  position: fixed !important;
  top: 0;
  left: 0;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 9999;
  background: #000;
}

.hover-time-tooltip {
  position: absolute;
  top: -48px; /* 强制显示在进度条和指示器上方 */
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
  z-index: 100;
  backdrop-filter: blur(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.hover-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  pointer-events: none;
  z-index: 15;
}

.indicator-top {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid white;
  margin-bottom: 6px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

.indicator-bottom {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 6px solid white;
  margin-top: 6px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
}

/* 菜单样式 */
.menu-container {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.popup-menu {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(28, 28, 30, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 100;
  min-width: 120px;
  animation: slideUp 0.2s cubic-bezier(0.2, 0, 0.2, 1);
}

/* 修复悬停间隙问题：添加透明桥接层 */
.popup-menu::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 20px; /* 覆盖 margin-bottom 的区域 */
  background: transparent;
}

.rate-menu {
  min-width: 80px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  white-space: nowrap;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.menu-item.active {
  color: var(--el-color-primary);
  background: rgba(64, 158, 255, 0.1);
}

.check-icon {
  margin-left: auto;
  color: var(--el-color-primary);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate(-50%, 10px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

/* 带点的图标 */
.icon-with-dot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-with-dot .dot {
  width: 3px;
  height: 3px;
  background: currentColor;
  border-radius: 50%;
  position: absolute;
}

.icon-with-dot.left .dot {
  left: 2px;
}

.icon-with-dot.right .dot {
  right: 2px;
}
</style>
