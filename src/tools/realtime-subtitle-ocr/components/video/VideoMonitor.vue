<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div
    ref="containerRef"
    class="video-monitor"
    data-testid="rsocr-monitor"
    :class="{ 'is-hand': handMode }"
    tabindex="0"
    @keydown="onKeydown"
    @pointerdown.capture="onViewportPointerDown"
    @wheel.prevent="onWheel"
  >
    <div
      ref="viewportRef"
      class="video-monitor__viewport"
      @mousedown="onViewportMouseDown"
    >
      <div class="video-monitor__content" :style="transform.contentStyle.value">
        <video
          ref="videoRef"
          class="video-monitor__video"
          data-testid="rsocr-video"
          :src="src"
          crossorigin="anonymous"
          playsinline
          preload="auto"
          @loadedmetadata="onLoadedMetadata"
          @timeupdate="onTimeUpdate"
          @play="onPlayState(true)"
          @pause="onPlayState(false)"
          @ended="onPlayState(false)"
          @error="onError"
        ></video>
        <RoiOverlay
          v-model="roiModel"
          :content-width="videoWidth || 1"
          :content-height="videoHeight || 1"
          :scale="transform.scale.value"
          :disabled="!!error || roiLocked"
          :aspect-locked="aspectLocked"
          :mask-opacity="maskOpacity"
        />
      </div>
      <div v-if="error" class="video-monitor__error">无法播放视频</div>
    </div>

    <!-- 控件条 -->
    <div
      class="video-monitor__controls"
      @pointerdown.stop
      @click="onControlsClick"
    >
      <div class="controls-left">
        <button
          class="ctrl-btn"
          data-testid="rsocr-play"
          title="播放/暂停 (Space)"
          @click="togglePlay"
        >
          <Pause v-if="isPlaying" :size="16" />
          <Play v-else :size="16" />
        </button>
        <button
          class="ctrl-btn"
          data-testid="rsocr-stop"
          title="停止"
          @click="stop"
        >
          <Square :size="15" />
        </button>
        <button class="ctrl-btn" title="上一帧 (←)" @click="stepFrame(-1)">
          <ChevronLeft :size="16" />
        </button>
        <button class="ctrl-btn" title="下一帧 (→)" @click="stepFrame(1)">
          <ChevronRight :size="16" />
        </button>
        <button class="ctrl-btn" title="后退 5 秒 (Shift+←)" @click="skip(-5)">
          <Rewind :size="15" />
        </button>
        <button class="ctrl-btn" title="前进 5 秒 (Shift+→)" @click="skip(5)">
          <FastForward :size="15" />
        </button>
        <span class="timecode" data-testid="rsocr-timecode"
          >{{ formattedCurrent }} / {{ formattedDuration }}</span
        >

        <!-- 音量 -->
        <div
          class="ctrl-menu-wrap"
          data-testid="rsocr-volume-menu"
          @mouseenter="showVolumeMenu = true"
          @mouseleave="showVolumeMenu = false"
        >
          <button
            class="ctrl-btn"
            data-testid="rsocr-volume"
            :title="isMuted ? '取消静音' : '静音'"
            @click="toggleMute"
          >
            <VolumeX v-if="isMuted || volume === 0" :size="15" />
            <Volume1 v-else-if="volume < 0.5" :size="15" />
            <Volume2 v-else :size="15" />
          </button>
          <div
            v-if="showVolumeMenu"
            class="ctrl-popup ctrl-popup--volume"
            @pointerdown.stop
          >
            <input
              class="volume-slider"
              data-testid="rsocr-volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="isMuted ? 0 : volume"
              @input="onVolumeInput"
            />
          </div>
        </div>

        <!-- 倍速 -->
        <div
          class="ctrl-menu-wrap"
          data-testid="rsocr-rate-menu"
          @mouseenter="showRateMenu = true"
          @mouseleave="showRateMenu = false"
        >
          <button
            class="ctrl-btn ctrl-btn--text"
            data-testid="rsocr-rate"
            title="播放速度"
            @click="showRateMenu = !showRateMenu"
          >
            {{ playbackRate }}x
          </button>
          <div
            v-if="showRateMenu"
            class="ctrl-popup ctrl-popup--list"
            @pointerdown.stop
          >
            <button
              v-for="rate in playbackRates"
              :key="rate"
              class="ctrl-popup__item"
              :class="{ 'is-active': playbackRate === rate }"
              @click="setPlaybackRate(rate)"
            >
              {{ rate }}x
            </button>
          </div>
        </div>
      </div>

      <div class="controls-right">
        <button
          class="ctrl-btn"
          :class="{ 'is-active': handMode }"
          title="平移工具 (H)"
          @click="handMode = !handMode"
        >
          <Hand :size="15" />
        </button>
        <button class="ctrl-btn" title="缩小 (-)" @click="transform.zoomOut()">
          <ZoomOut :size="15" />
        </button>
        <button
          class="ctrl-btn ctrl-btn--text"
          data-testid="rsocr-fit"
          title="适配 (F)"
          @click="transform.fit()"
        >
          适配
        </button>
        <button class="ctrl-btn" title="放大 (+)" @click="transform.zoomIn()">
          <ZoomIn :size="15" />
        </button>
        <div
          class="ctrl-menu-wrap"
          data-testid="rsocr-zoom-menu-wrap"
          @mouseenter="showZoomMenu = true"
          @mouseleave="showZoomMenu = false"
        >
          <button
            class="ctrl-btn ctrl-btn--text"
            data-testid="rsocr-zoom-menu"
            title="缩放比例"
            @click="showZoomMenu = !showZoomMenu"
          >
            {{ transform.zoomPercent.value }}%
            <ChevronDown :size="12" />
          </button>
          <div
            v-if="showZoomMenu"
            class="ctrl-popup ctrl-popup--list"
            @pointerdown.stop
          >
            <button
              class="ctrl-popup__item"
              :class="{ 'is-active': transform.isFitted.value }"
              @click="applyZoomRatio('fit')"
            >
              适配
            </button>
            <button
              v-for="step in zoomSteps"
              :key="step"
              class="ctrl-popup__item"
              :class="{
                'is-active':
                  !transform.isFitted.value &&
                  transform.zoomPercent.value === Math.round(step * 100),
              }"
              @click="applyZoomRatio(step)"
            >
              {{ Math.round(step * 100) }}%
            </button>
          </div>
        </div>
        <button
          class="ctrl-btn ctrl-btn--text"
          title="原始尺寸"
          @click="transform.actualSize()"
        >
          1:1
        </button>
        <button class="ctrl-btn" title="全屏" @click="toggleFullscreen">
          <Maximize :size="15" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Hand,
  Maximize,
  Pause,
  Play,
  Rewind,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-vue-next";
import RoiOverlay from "./RoiOverlay.vue";
import { useViewportTransform } from "../../composables/useViewportTransform";
import type { VideoRoi } from "../../types";

const props = withDefaults(
  defineProps<{
    src: string;
    roi: VideoRoi;
    videoWidth: number;
    videoHeight: number;
    fps?: number;
    /** 锁定 ROI 宽高比 */
    aspectLocked?: boolean;
    maskOpacity?: number;
    /** 识别进行中锁定 ROI 叠加层，避免改动不影响在途任务 */
    roiLocked?: boolean;
  }>(),
  { fps: 30, aspectLocked: false, maskOpacity: 0.5, roiLocked: false }
);

const emit = defineEmits<{
  "update:roi": [value: VideoRoi];
  timeupdate: [timeMs: number];
  durationchange: [durationMs: number];
  playstatechange: [playing: boolean];
  loadedmetadata: [info: { width: number; height: number; durationMs: number }];
  /** 将当前播放位置设为识别区间起点 (I) */
  "set-range-start": [timeMs: number];
  /** 将当前播放位置设为识别区间终点 (O) */
  "set-range-end": [timeMs: number];
}>();

const containerRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const isPlaying = ref(false);
const currentMs = ref(0);
const durationMs = ref(0);
const error = ref(false);
const handMode = ref(false);

const volume = ref(1);
const isMuted = ref(false);
const playbackRate = ref(1);
const showVolumeMenu = ref(false);
const showRateMenu = ref(false);
const showZoomMenu = ref(false);

const playbackRates = [2, 1.5, 1.25, 1, 0.75, 0.5];
const zoomSteps = [0.25, 0.5, 0.75, 1, 1.5, 2, 4];

const { width: containerWidth, height: containerHeight } =
  useElementSize(viewportRef);

const transform = useViewportTransform({
  containerWidth,
  containerHeight,
  contentWidth: computed(() => props.videoWidth || 1),
  contentHeight: computed(() => props.videoHeight || 1),
});

const roiModel = computed({
  get: () => props.roi,
  set: (value: VideoRoi) => emit("update:roi", value),
});

const formattedCurrent = computed(() => formatTime(currentMs.value));
const formattedDuration = computed(() => formatTime(durationMs.value));

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const frames = Math.floor(((ms % 1000) / 1000) * props.fps);
  const base = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${base}.${String(frames).padStart(2, "0")}`;
}

function onLoadedMetadata() {
  const video = videoRef.value;
  if (!video) return;
  durationMs.value = Number.isFinite(video.duration)
    ? Math.round(video.duration * 1000)
    : 0;
  error.value = false;
  transform.fit();
  video.volume = volume.value;
  video.muted = isMuted.value;
  video.playbackRate = playbackRate.value;
  emit("durationchange", durationMs.value);
  emit("loadedmetadata", {
    width: video.videoWidth,
    height: video.videoHeight,
    durationMs: durationMs.value,
  });
}

function onTimeUpdate() {
  const video = videoRef.value;
  if (!video) return;
  currentMs.value = Math.round(video.currentTime * 1000);
  emit("timeupdate", currentMs.value);
}

function onPlayState(playing: boolean) {
  isPlaying.value = playing;
  emit("playstatechange", playing);
}

function onError() {
  error.value = true;
  isPlaying.value = false;
}

function togglePlay() {
  const video = videoRef.value;
  if (!video) return;
  if (video.paused) void video.play();
  else video.pause();
}

function stop() {
  const video = videoRef.value;
  if (!video) return;
  video.pause();
  video.currentTime = 0;
  currentMs.value = 0;
}

function seek(ms: number) {
  const video = videoRef.value;
  if (!video) return;
  const clamped = Math.max(0, Math.min(durationMs.value, ms));
  video.currentTime = clamped / 1000;
  currentMs.value = clamped;
  emit("timeupdate", clamped);
}

function skip(seconds: number) {
  seek(currentMs.value + seconds * 1000);
}

function stepFrame(direction: number) {
  const frameMs = 1000 / (props.fps || 30);
  seek(currentMs.value + direction * frameMs);
}

function toggleMute() {
  isMuted.value = !isMuted.value;
  if (videoRef.value) videoRef.value.muted = isMuted.value;
}

function onVolumeInput(event: Event) {
  const next = Number((event.target as HTMLInputElement).value);
  const clamped = Math.min(1, Math.max(0, next));
  volume.value = clamped;
  const video = videoRef.value;
  if (video) video.volume = clamped;
  if (clamped > 0 && isMuted.value) {
    isMuted.value = false;
    if (video) video.muted = false;
  }
}

function setPlaybackRate(rate: number) {
  playbackRate.value = rate;
  if (videoRef.value) videoRef.value.playbackRate = rate;
  showRateMenu.value = false;
}

function applyZoomRatio(ratio: number | "fit") {
  if (ratio === "fit") transform.fit();
  else transform.setScale(ratio);
  showZoomMenu.value = false;
}

function onViewportDblClick() {
  if (transform.isFitted.value) transform.actualSize();
  else transform.fit();
}

/** 控制条交互后把键盘焦点交还监视器，避免按钮聚焦后空格同时触发按钮与快捷键。 */
function onControlsClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest("input")) return;
  containerRef.value?.focus({ preventScroll: true });
}

/**
 * 等待视频在 seek 后真正呈现目标帧；稳定帧直接返回。
 * 截图链路借此避免抓到 seek 前的旧帧。
 */
function waitForFrame(): Promise<void> {
  const video = videoRef.value;
  if (!video) return Promise.resolve();
  if (
    !video.seeking &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      if (typeof video.requestVideoFrameCallback === "function") {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        video.requestVideoFrameCallback(finish);
        window.setTimeout(finish, 200);
      } else {
        resolve();
      }
    };
    if (video.seeking) video.addEventListener("seeked", onSeeked);
    else onSeeked();
  });
}

function onWheel(event: WheelEvent) {
  const rect = viewportRef.value?.getBoundingClientRect();
  const anchorX = rect ? event.clientX - rect.left : undefined;
  const anchorY = rect ? event.clientY - rect.top : undefined;
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  transform.zoomBy(factor, anchorX, anchorY);
}

// 中键 / Alt+左键 / 手型模式拖拽平移
let panning: { x: number; y: number } | null = null;
function onViewportPointerDown(event: PointerEvent) {
  // 普通 div 不会因鼠标点击自动获得键盘焦点，主动聚焦以启用快捷键。
  containerRef.value?.focus({ preventScroll: true });
  const isPan =
    event.button === 1 ||
    (event.button === 0 && (handMode.value || event.altKey));
  if (!isPan) return;
  event.preventDefault();
  event.stopPropagation();
  panning = { x: event.clientX, y: event.clientY };
  window.addEventListener("pointermove", onPanMove);
  window.addEventListener("pointerup", onPanUp, { once: true });
}

// ROI 叠加层的 pointerdown 会 preventDefault，浏览器不再派发 dblclick，
// 因此用 mousedown 时间自行识别双击。mousedown 同时接管默认焦点，避免焦点回到 body。
let lastMouseDownAt = 0;
let lastMouseDownX = 0;
let lastMouseDownY = 0;
function onViewportMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  containerRef.value?.focus({ preventScroll: true });
  const now = performance.now();
  const isDouble =
    now - lastMouseDownAt < 350 &&
    Math.abs(event.clientX - lastMouseDownX) < 8 &&
    Math.abs(event.clientY - lastMouseDownY) < 8;
  lastMouseDownX = event.clientX;
  lastMouseDownY = event.clientY;
  lastMouseDownAt = isDouble ? 0 : now;
  if (isDouble) onViewportDblClick();
}
function onPanMove(event: PointerEvent) {
  if (!panning) return;
  transform.panBy(event.clientX - panning.x, event.clientY - panning.y);
  panning = { x: event.clientX, y: event.clientY };
}
function onPanUp() {
  panning = null;
  window.removeEventListener("pointermove", onPanMove);
}

async function toggleFullscreen() {
  const el = containerRef.value;
  if (!el) return;
  if (document.fullscreenElement) await document.exitFullscreen();
  else await el.requestFullscreen().catch(() => {});
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  ) {
    return;
  }
  switch (event.key) {
    case " ":
      event.preventDefault();
      togglePlay();
      break;
    case "ArrowLeft":
      event.preventDefault();
      if (event.shiftKey) skip(-1);
      else stepFrame(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      if (event.shiftKey) skip(1);
      else stepFrame(1);
      break;
    case "Home":
      seek(0);
      break;
    case "End":
      seek(durationMs.value);
      break;
    case "f":
    case "F":
      transform.fit();
      break;
    case "h":
    case "H":
      handMode.value = !handMode.value;
      break;
    case "i":
    case "I":
      emit("set-range-start", currentMs.value);
      break;
    case "o":
    case "O":
      emit("set-range-end", currentMs.value);
      break;
    case "+":
    case "=":
      transform.zoomIn();
      break;
    case "-":
      transform.zoomOut();
      break;
    default:
      break;
  }
}

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPanMove);
});

// 换源时重置
watch(
  () => props.src,
  () => {
    error.value = false;
    currentMs.value = 0;
    durationMs.value = 0;
    isPlaying.value = false;
    transform.fit();
  }
);

// 容器尺寸变化时，若当前处于适配状态则重新适配
watch([containerWidth, containerHeight], () => {
  if (transform.isFitted.value) transform.fit();
});

defineExpose({
  videoRef,
  currentTimeMs: currentMs,
  durationMs,
  isPlaying,
  seek,
  togglePlay,
  stepFrame,
  skip,
  waitForFrame,
  focus: () => containerRef.value?.focus({ preventScroll: true }),
  getVideoElement: () => videoRef.value,
});
</script>

<style scoped>
.video-monitor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  outline: none;
}
.video-monitor.is-hand .video-monitor__viewport {
  cursor: grab;
}
.video-monitor__viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #000;
  touch-action: none;
}
.video-monitor__content {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}
.video-monitor__video {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.video-monitor__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
}
.video-monitor__controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: var(--sidebar-bg);
  border-top: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.ctrl-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.ctrl-btn.is-active {
  background: rgba(var(--el-color-primary-rgb), 0.15);
  color: var(--el-color-primary);
}
.ctrl-btn--text {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 12px;
}
.ctrl-menu-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.ctrl-popup {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.ctrl-popup--volume {
  width: 132px;
  padding: 8px 10px;
}
.ctrl-popup--list {
  min-width: 84px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ctrl-popup__item {
  padding: 5px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}
.ctrl-popup__item:hover {
  background: var(--el-fill-color);
}
.ctrl-popup__item.is-active {
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.15);
}
.volume-slider {
  width: 100%;
  accent-color: var(--el-color-primary);
  cursor: pointer;
}
.timecode {
  margin-left: 8px;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
