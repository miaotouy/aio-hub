<script setup lang="ts">
import { RotateCw, ZoomIn, ZoomOut } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    alt: string;
    immersive?: boolean;
  }>(),
  { immersive: false }
);

const emit = defineEmits<{
  ready: [];
  error: [];
  open: [];
  close: [];
}>();

const viewerRef = ref<HTMLDivElement | null>(null);
const scale = ref(1);
const rotation = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const activePointers = new Map<number, { x: number; y: number }>();
let pinchDistance = 0;
let pinchScale = 1;
let panOrigin: {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
} | null = null;
let gestureStart: {
  pointerId: number;
  x: number;
  y: number;
  startedAt: number;
} | null = null;

const imageTransform = computed(
  () =>
    `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value}) rotate(${rotation.value}deg)`
);

function clampScale(value: number) {
  return Math.min(4, Math.max(1, value));
}

function setScale(value: number) {
  scale.value = clampScale(value);
  if (scale.value === 1) {
    offsetX.value = 0;
    offsetY.value = 0;
  } else {
    clampOffsets();
  }
}

function clampOffsets() {
  const viewer = viewerRef.value;
  if (!viewer || scale.value <= 1) return;
  const maxX = (viewer.clientWidth * (scale.value - 1)) / 2;
  const maxY = (viewer.clientHeight * (scale.value - 1)) / 2;
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value));
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value));
}

function pointerDistance() {
  const points = [...activePointers.values()];
  return points.length < 2
    ? 0
    : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function onPointerDown(event: PointerEvent) {
  if (!props.immersive) return;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    gestureStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: event.timeStamp,
    };
  }
  if (activePointers.size === 2) {
    pinchDistance = pointerDistance();
    pinchScale = scale.value;
    panOrigin = null;
  } else if (scale.value > 1) {
    panOrigin = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
    };
  }
}

function onPointerMove(event: PointerEvent) {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2 && pinchDistance > 0) {
    setScale(pinchScale * (pointerDistance() / pinchDistance));
  } else if (panOrigin && scale.value > 1) {
    offsetX.value = panOrigin.offsetX + event.clientX - panOrigin.x;
    offsetY.value = panOrigin.offsetY + event.clientY - panOrigin.y;
    clampOffsets();
  }
}

function onPointerUp(event: PointerEvent) {
  if (
    scale.value === 1 &&
    gestureStart?.pointerId === event.pointerId &&
    event.clientY - gestureStart.y >
      (viewerRef.value?.clientHeight || 500) * 0.2 &&
    Math.abs(event.clientX - gestureStart.x) < event.clientY - gestureStart.y &&
    event.timeStamp - gestureStart.startedAt < 800
  ) {
    emit("close");
  }
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinchDistance = 0;
  if (activePointers.size === 0) panOrigin = null;
  if (gestureStart?.pointerId === event.pointerId) gestureStart = null;
}

function toggleZoom(event: MouseEvent) {
  if (!props.immersive) {
    emit("open");
    return;
  }
  event.preventDefault();
  if (scale.value > 1) {
    setScale(1);
    return;
  }
  const rect = viewerRef.value?.getBoundingClientRect();
  scale.value = 2;
  if (rect) {
    offsetX.value =
      (rect.left + rect.width / 2 - event.clientX) * (scale.value - 1);
    offsetY.value =
      (rect.top + rect.height / 2 - event.clientY) * (scale.value - 1);
    clampOffsets();
  }
}

function onWheel(event: WheelEvent) {
  if (!props.immersive) return;
  event.preventDefault();
  setScale(scale.value + (event.deltaY < 0 ? 0.25 : -0.25));
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360;
}

watch(
  () => props.src,
  () => {
    scale.value = 1;
    rotation.value = 0;
    offsetX.value = 0;
    offsetY.value = 0;
  }
);
</script>

<template>
  <div
    ref="viewerRef"
    class="media-image-viewer"
    :class="{ immersive }"
    :data-scale="scale"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
    @dblclick="toggleZoom"
  >
    <img
      :src="src"
      :alt="alt"
      draggable="false"
      :style="{ transform: imageTransform }"
      @load="emit('ready')"
      @error="emit('error')"
      @click="!immersive && emit('open')"
    />
    <div
      v-if="immersive"
      class="image-tools"
      role="toolbar"
      aria-label="图片工具"
    >
      <button type="button" aria-label="缩小" @click="setScale(scale - 0.5)">
        <ZoomOut :size="20" />
      </button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button type="button" aria-label="放大" @click="setScale(scale + 0.5)">
        <ZoomIn :size="20" />
      </button>
      <button type="button" aria-label="顺时针旋转" @click="rotate">
        <RotateCw :size="20" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.media-image-viewer {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 164px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #101214;
  touch-action: pan-y;
  box-sizing: border-box;
}

.media-image-viewer.immersive {
  height: 100%;
  min-height: 0;
  touch-action: none;
}

img {
  width: 100%;
  height: 100%;
  max-height: 42vh;
  object-fit: contain;
  user-select: none;
  transition: transform 160ms ease;
}

.immersive img {
  max-height: none;
  cursor: grab;
}

.image-tools {
  position: absolute;
  right: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  left: 12px;
  min-height: 48px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  background: rgb(20 22 24 / 78%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: var(--app-radius-md);
  backdrop-filter: blur(var(--ui-blur));
}

.image-tools button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--app-radius-sm);
}

.image-tools span {
  min-width: 52px;
  text-align: center;
}
</style>
