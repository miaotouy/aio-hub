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
    ref="overlayRef"
    class="roi-overlay"
    :class="{ 'roi-overlay--disabled': disabled }"
    @pointerdown="onOverlayPointerDown"
  >
    <!-- 暗化遮罩（ROI 之外） -->
    <div class="roi-mask" :style="maskTopStyle"></div>
    <div class="roi-mask" :style="maskBottomStyle"></div>
    <div class="roi-mask" :style="maskLeftStyle"></div>
    <div class="roi-mask" :style="maskRightStyle"></div>

    <!-- 识别区域 -->
    <div
      class="roi-box"
      data-testid="rsocr-roi-box"
      :style="boxStyle"
      @pointerdown.stop="onBoxPointerDown"
    >
      <span class="roi-box__label" :style="labelStyle">
        识别区域 {{ Math.round(roi.width * 100) }}% ×
        {{ Math.round(roi.height * 100) }}%
      </span>
      <div
        v-for="handle in handles"
        :key="handle.name"
        class="roi-handle"
        :class="`roi-handle--${handle.name}`"
        :style="handleStyle()"
        @pointerdown.stop="onHandlePointerDown($event, handle.name)"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { VideoRoi } from "../../types";
import {
  clampVideoRoi,
  isCornerHandle,
  resizeVideoRoi,
} from "../../utils/video";

const props = withDefaults(
  defineProps<{
    modelValue: VideoRoi;
    contentWidth: number;
    contentHeight: number;
    /** 视口缩放，用于让手柄保持恒定的屏幕尺寸 */
    scale: number;
    disabled?: boolean;
    minSize?: number;
    /** 锁定当前归一化宽高比（仅角点手柄生效） */
    aspectLocked?: boolean;
    /** ROI 外遮罩不透明度 */
    maskOpacity?: number;
  }>(),
  {
    disabled: false,
    minSize: 0.01,
    aspectLocked: false,
    maskOpacity: 0.5,
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: VideoRoi];
}>();

const overlayRef = ref<HTMLElement | null>(null);

const HANDLE_SCREEN_SIZE = 11;
const BORDER_SCREEN_SIZE = 1.5;

type HandleName = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const handles: { name: HandleName }[] = [
  { name: "nw" },
  { name: "n" },
  { name: "ne" },
  { name: "e" },
  { name: "se" },
  { name: "s" },
  { name: "sw" },
  { name: "w" },
];

const roi = computed(() => props.modelValue);

const boxStyle = computed(() => ({
  left: `${roi.value.x * 100}%`,
  top: `${roi.value.y * 100}%`,
  width: `${roi.value.width * 100}%`,
  height: `${roi.value.height * 100}%`,
  borderWidth: `${BORDER_SCREEN_SIZE / props.scale}px`,
}));

const labelStyle = computed(() => ({
  fontSize: `${Math.max(9, 11 / props.scale)}px`,
  padding: `${Math.max(1, 2 / props.scale)}px ${Math.max(3, 5 / props.scale)}px`,
}));

function handleStyle() {
  const size = HANDLE_SCREEN_SIZE / props.scale;
  return { width: `${size}px`, height: `${size}px` };
}

const maskTopStyle = computed(() => ({
  left: "0",
  top: "0",
  width: "100%",
  height: `${roi.value.y * 100}%`,
}));
const maskBottomStyle = computed(() => {
  const bottom = 1 - roi.value.y - roi.value.height;
  return {
    left: "0",
    bottom: "0",
    width: "100%",
    height: `${Math.max(0, bottom) * 100}%`,
  };
});
const maskLeftStyle = computed(() => ({
  left: "0",
  top: `${roi.value.y * 100}%`,
  width: `${roi.value.x * 100}%`,
  height: `${roi.value.height * 100}%`,
}));
const maskRightStyle = computed(() => {
  const right = 1 - roi.value.x - roi.value.width;
  return {
    right: "0",
    top: `${roi.value.y * 100}%`,
    width: `${Math.max(0, right) * 100}%`,
    height: `${roi.value.height * 100}%`,
  };
});

type DragMode = "move" | "draw" | "resize";

interface DragState {
  mode: DragMode;
  handle?: HandleName;
  startClientX: number;
  startClientY: number;
  startRoi: VideoRoi;
  startX: number;
  startY: number;
}

let drag: DragState | null = null;

function toContentPoint(event: PointerEvent): { x: number; y: number } {
  const rect = overlayRef.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function beginDrag(event: PointerEvent, mode: DragMode, handle?: HandleName) {
  if (props.disabled) return;
  event.preventDefault();
  const point = toContentPoint(event);
  drag = {
    mode,
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRoi: { ...props.modelValue },
    startX: point.x,
    startY: point.y,
  };
  window.addEventListener("pointermove", onWindowPointerMove);
  window.addEventListener("pointerup", onWindowPointerUp, { once: true });
}

function onOverlayPointerDown(event: PointerEvent) {
  if (props.disabled) return;
  const target = event.target as HTMLElement;
  if (target.closest(".roi-box")) return;
  const point = toContentPoint(event);
  const next = clampVideoRoi({
    x: point.x,
    y: point.y,
    width: props.minSize,
    height: props.minSize,
  });
  emit("update:modelValue", next);
  beginDrag(event, "draw");
}

function onBoxPointerDown(event: PointerEvent) {
  beginDrag(event, "move");
}

function onHandlePointerDown(event: PointerEvent, handle: HandleName) {
  beginDrag(event, "resize", handle);
}

function onWindowPointerMove(event: PointerEvent) {
  if (!drag) return;
  const rect = overlayRef.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return;
  const dx = (event.clientX - drag.startClientX) / rect.width;
  const dy = (event.clientY - drag.startClientY) / rect.height;
  const origin = drag.startRoi;

  if (drag.mode === "move") {
    emit(
      "update:modelValue",
      clampVideoRoi({ ...origin, x: origin.x + dx, y: origin.y + dy })
    );
    return;
  }

  if (drag.mode === "draw") {
    const point = toContentPoint(event);
    emit(
      "update:modelValue",
      clampVideoRoi({
        x: Math.min(drag.startX, point.x),
        y: Math.min(drag.startY, point.y),
        width: Math.abs(point.x - drag.startX),
        height: Math.abs(point.y - drag.startY),
      })
    );
    return;
  }

  // resize
  const ratio =
    props.aspectLocked && isCornerHandle(drag.handle!)
      ? origin.width / origin.height
      : undefined;
  emit(
    "update:modelValue",
    resizeVideoRoi(origin, drag.handle!, dx, dy, props.minSize, ratio)
  );
}

function onWindowPointerUp() {
  drag = null;
  window.removeEventListener("pointermove", onWindowPointerMove);
}
</script>

<style scoped>
.roi-overlay {
  position: absolute;
  inset: 0;
  cursor: crosshair;
  touch-action: none;
}

.roi-overlay--disabled {
  pointer-events: none;
}

.roi-mask {
  position: absolute;
  background: rgb(0 0 0 / v-bind("props.maskOpacity"));
  pointer-events: none;
}

.roi-box {
  position: absolute;
  border: solid var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.08);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  cursor: move;
  box-sizing: border-box;
  touch-action: none;
}

.roi-box__label {
  position: absolute;
  top: 0;
  left: 0;
  transform: translateY(-100%);
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 3px 3px 0 0;
  white-space: nowrap;
  line-height: 1.4;
  pointer-events: none;
}

.roi-handle {
  position: absolute;
  background: #fff;
  border: 1px solid var(--el-color-primary);
  border-radius: 2px;
  box-sizing: border-box;
}

.roi-handle--nw {
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  cursor: nwse-resize;
}
.roi-handle--n {
  left: 50%;
  top: 0;
  transform: translate(-50%, -50%);
  cursor: ns-resize;
}
.roi-handle--ne {
  right: 0;
  top: 0;
  transform: translate(50%, -50%);
  cursor: nesw-resize;
}
.roi-handle--e {
  right: 0;
  top: 50%;
  transform: translate(50%, -50%);
  cursor: ew-resize;
}
.roi-handle--se {
  right: 0;
  bottom: 0;
  transform: translate(50%, 50%);
  cursor: nwse-resize;
}
.roi-handle--s {
  left: 50%;
  bottom: 0;
  transform: translate(-50%, 50%);
  cursor: ns-resize;
}
.roi-handle--sw {
  left: 0;
  bottom: 0;
  transform: translate(-50%, 50%);
  cursor: nesw-resize;
}
.roi-handle--w {
  left: 0;
  top: 50%;
  transform: translate(-50%, -50%);
  cursor: ew-resize;
}
</style>
