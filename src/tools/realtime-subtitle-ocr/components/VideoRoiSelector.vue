<!-- Copyright 2025-2026 miaotouy(Github@miaotouy) -->
<template>
  <div class="roi-selector">
    <div
      ref="stageRef"
      class="roi-stage"
      :style="stageStyle"
      @pointerdown="startDrag"
    >
      <video
        v-if="videoUrl"
        :src="videoUrl"
        class="roi-video"
        playsinline
        muted
        @loadedmetadata="emit('metadata-loaded')"
      />
      <div v-else class="roi-empty">选择视频后，在这里框选字幕区域</div>
      <div
        v-if="videoUrl"
        class="roi-box"
        :style="boxStyle"
        @pointerdown.stop="startDrag"
      >
        <span>字幕区域</span>
      </div>
    </div>
    <div class="roi-help">拖拽选择字幕区域，识别时将只裁剪此区域</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { VideoRoi } from "../types";
import { clampVideoRoi } from "../utils/video";

const props = defineProps<{
  videoUrl: string;
  modelValue: VideoRoi;
  videoWidth?: number;
  videoHeight?: number;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: VideoRoi];
  "metadata-loaded": [];
}>();
const stageRef = ref<HTMLElement | null>(null);
const stageStyle = computed(() =>
  props.videoWidth && props.videoHeight
    ? { aspectRatio: `${props.videoWidth} / ${props.videoHeight}` }
    : undefined
);
const dragging = ref<{
  startX: number;
  startY: number;
  origin: VideoRoi;
} | null>(null);
const boxStyle = computed(() => ({
  left: `${props.modelValue.x * 100}%`,
  top: `${props.modelValue.y * 100}%`,
  width: `${props.modelValue.width * 100}%`,
  height: `${props.modelValue.height * 100}%`,
}));

function startDrag(event: PointerEvent) {
  if (!props.videoUrl || !stageRef.value) return;
  const rect = stageRef.value.getBoundingClientRect();
  const target = event.target as HTMLElement;
  const isExistingBox = Boolean(target.closest(".roi-box"));
  const origin = { ...props.modelValue };
  const startX = (event.clientX - rect.left) / rect.width;
  const startY = (event.clientY - rect.top) / rect.height;
  dragging.value = {
    startX: event.clientX,
    startY: event.clientY,
    origin: isExistingBox
      ? origin
      : { x: startX, y: startY, width: 0.01, height: 0.01 },
  };
  const mode = isExistingBox ? "move" : "draw";
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    if (!dragging.value) return;
    const currentX = Math.min(
      1,
      Math.max(0, (moveEvent.clientX - rect.left) / rect.width)
    );
    const currentY = Math.min(
      1,
      Math.max(0, (moveEvent.clientY - rect.top) / rect.height)
    );
    if (mode === "draw") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      emit(
        "update:modelValue",
        clampVideoRoi({
          x,
          y,
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY),
        })
      );
    } else {
      const dx = (moveEvent.clientX - dragging.value.startX) / rect.width;
      const dy = (moveEvent.clientY - dragging.value.startY) / rect.height;
      emit(
        "update:modelValue",
        clampVideoRoi({
          x: origin.x + dx,
          y: origin.y + dy,
          width: origin.width,
          height: origin.height,
        })
      );
    }
  };
  const up = () => {
    dragging.value = null;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}
</script>

<style scoped>
.roi-selector {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.roi-stage {
  position: relative;
  min-height: 170px;
  height: 100%;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.roi-video {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 260px;
  object-fit: contain;
}
.roi-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 32px;
  text-align: center;
}
.roi-box {
  position: absolute;
  border: 2px solid var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.12);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  cursor: move;
  pointer-events: auto;
}
.roi-box span {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: var(--el-color-primary);
  background: var(--card-bg);
  padding: 1px 4px;
  border-radius: 3px;
}
.roi-help {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
</style>
