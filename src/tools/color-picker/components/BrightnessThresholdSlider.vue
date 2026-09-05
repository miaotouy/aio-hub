<template>
  <div class="brightness-threshold-slider">
    <div
      ref="trackRef"
      class="threshold-track"
      :class="{ 'is-disabled': disabled }"
      role="group"
      aria-label="亮度范围与阈值"
      @pointerdown="handleTrackPointerDown"
    >
      <div class="brightness-gradient" aria-hidden="true" />
      <div class="track-highlight" aria-hidden="true" />

      <button
        v-for="(value, index) in values"
        :key="index"
        class="threshold-handle"
        :class="{ 'is-active': activeIndex === index }"
        type="button"
        role="slider"
        :aria-label="`${thresholdLabels[index]}阈值`"
        :aria-valuemin="lowerBound(index)"
        :aria-valuemax="upperBound(index)"
        :aria-valuenow="value"
        :aria-valuetext="`${formatThreshold(value)}，${thresholdLabels[index]}与下一档的分界`"
        :disabled="disabled"
        :style="{ left: `${valueToPercent(value)}%` }"
        @pointerdown.stop="startDragging($event, index)"
        @keydown="handleKeydown($event, index)"
      >
        <span class="handle-dot" aria-hidden="true" />
      </button>
    </div>

    <div class="range-labels" aria-hidden="true">
      <span
        v-for="(label, index) in brightnessLevels"
        :key="label"
        :style="{ width: `${segmentWidth(index)}%` }"
      >
        {{ label }}
      </span>
    </div>

    <div class="threshold-values">
      <div
        v-for="(label, index) in thresholdLabels"
        :key="label"
        class="threshold-value"
      >
        <span class="threshold-value-label">{{ label }}</span>
        <el-input-number
          :model-value="valueAt(index)"
          :min="lowerBound(index)"
          :max="upperBound(index)"
          :step="step"
          :precision="2"
          :controls="false"
          size="small"
          :disabled="disabled"
          :aria-label="`${label}阈值`"
          @update:model-value="updateValue(index, $event)"
        />
      </div>
    </div>

    <div class="threshold-hint">
      <span>黑</span>
      <span>亮度范围</span>
      <span>白</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

type ThresholdTuple = [number, number, number, number];

interface Props {
  modelValue: ThresholdTuple;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  min: 0.01,
  max: 0.99,
  step: 0.01,
  disabled: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: ThresholdTuple): void;
}>();

const trackRef = ref<HTMLElement | null>(null);
const activeIndex = ref<number | null>(null);

const brightnessLevels = ["极暗", "偏暗", "中等", "偏亮", "明亮"];
const thresholdLabels = ["极暗", "偏暗", "中等", "偏亮"];

const values = computed<ThresholdTuple>(() =>
  normalizeValues(props.modelValue)
);

const valueAt = (index: number) => values.value[index] ?? props.min;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const snap = (value: number) => {
  const steps = Math.round((value - props.min) / props.step);
  return Number((props.min + steps * props.step).toFixed(2));
};

const normalizeValues = (input: readonly number[]): ThresholdTuple => {
  const sorted = input
    .slice(0, 4)
    .map((value) => clamp(Number(value), props.min, props.max))
    .sort((left, right) => left - right);
  const result: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const minimum = index === 0 ? props.min : result[index - 1] + props.step;
    const maximum = props.max - (3 - index) * props.step;
    result.push(clamp(snap(sorted[index] ?? minimum), minimum, maximum));
  }

  return result as ThresholdTuple;
};

const lowerBound = (_index: number) => props.min;

const upperBound = (_index: number) => props.max;

const emitValues = (index: number, value: number) => {
  if (!Number.isFinite(value) || props.disabled) return;

  const raw = [...values.value] as ThresholdTuple;
  const target = clamp(snap(value), props.min, props.max);
  raw[index] = target;
  const next = normalizeValues(raw);
  if (next.every((item, valueIndex) => item === values.value[valueIndex]))
    return;

  emit("update:modelValue", next);

  // 排序后，继续拖动时跟随刚刚被拖动的那个位置，而不是固定使用旧索引。
  if (activeIndex.value !== null) {
    activeIndex.value = next.reduce(
      (nearest, current, valueIndex) =>
        Math.abs(current - target) < Math.abs(next[nearest] - target)
          ? valueIndex
          : nearest,
      0
    );
  }
};

const updateValue = (index: number, value: number | undefined) => {
  if (value !== undefined) emitValues(index, value);
};

const valueToPercent = (value: number) =>
  ((value - props.min) / (props.max - props.min)) * 100;

const percentToValue = (percent: number) =>
  snap(props.min + clamp(percent, 0, 100) * ((props.max - props.min) / 100));

const formatThreshold = (value: number) => `${Math.round(value * 100)}%`;

const segmentWidth = (index: number) => {
  const start = index === 0 ? props.min : valueAt(index - 1);
  const end = index < 4 ? valueAt(index) : props.max;
  return ((end - start) / (props.max - props.min)) * 100;
};

const valueFromPointer = (event: PointerEvent) => {
  const track = trackRef.value;
  if (!track) return props.min;
  const rect = track.getBoundingClientRect();
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  return percentToValue(percent);
};

const nearestIndex = (value: number) =>
  values.value.reduce(
    (nearest, current, index) =>
      Math.abs(current - value) < Math.abs(values.value[nearest] - value)
        ? index
        : nearest,
    0
  );

const handleTrackPointerDown = (event: PointerEvent) => {
  if (
    props.disabled ||
    (event.target instanceof HTMLElement &&
      event.target.closest(".threshold-handle"))
  ) {
    return;
  }
  const index = nearestIndex(valueFromPointer(event));
  startDragging(event, index);
};

const handlePointerMove = (event: PointerEvent) => {
  if (activeIndex.value === null) return;
  emitValues(activeIndex.value, valueFromPointer(event));
};

const stopDragging = () => {
  activeIndex.value = null;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopDragging);
  window.removeEventListener("pointercancel", stopDragging);
};

const startDragging = (event: PointerEvent, index: number) => {
  if (props.disabled) return;
  event.preventDefault();
  activeIndex.value = index;
  handlePointerMove(event);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
};

const handleKeydown = (event: KeyboardEvent, index: number) => {
  if (props.disabled) return;

  const current = valueAt(index);
  let next: number | null = null;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown")
    next = current - props.step;
  if (event.key === "ArrowRight" || event.key === "ArrowUp")
    next = current + props.step;
  if (event.key === "Home") next = lowerBound(index);
  if (event.key === "End") next = upperBound(index);
  if (next === null) return;

  event.preventDefault();
  emitValues(index, next);
};

onBeforeUnmount(stopDragging);
</script>

<style scoped>
.brightness-threshold-slider {
  --threshold-track-height: 20px;
  --threshold-handle-size: 16px;
  width: 100%;
  user-select: none;
}

.threshold-track {
  position: relative;
  height: var(--threshold-track-height);
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  border-radius: 6px;
  background: var(--el-fill-color-darker);
  box-shadow:
    inset 0 1px 2px rgb(0 0 0 / 18%),
    0 1px 0 rgb(255 255 255 / 8%);
  cursor: ew-resize;
  touch-action: none;
}

.brightness-gradient,
.track-highlight {
  position: absolute;
  inset: 2px;
  border-radius: 3px;
  pointer-events: none;
}

.brightness-gradient {
  background: linear-gradient(
    90deg,
    #08090b 0%,
    #1b1d21 10%,
    #51555d 28%,
    #a6abb3 52%,
    #e2e4e8 76%,
    #fff 100%
  );
}

.track-highlight {
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 28%),
    transparent 45%,
    rgb(0 0 0 / 12%)
  );
  mix-blend-mode: screen;
}

.threshold-handle {
  position: absolute;
  top: 50%;
  width: var(--threshold-handle-size);
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  transform: translate(-50%, -50%);
  cursor: grab;
  z-index: 1;
}

.threshold-handle:active,
.threshold-handle.is-active {
  cursor: grabbing;
}

.threshold-handle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.handle-dot {
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--threshold-handle-size);
  height: var(--threshold-handle-size);
  border: 2px solid var(--el-color-primary);
  border-radius: 50%;
  background: var(--card-bg);
  box-shadow:
    0 1px 4px rgb(0 0 0 / 40%),
    0 0 0 1px rgb(255 255 255 / 35%);
  transform: translate(-50%, -50%);
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;
}

.threshold-handle:hover .handle-dot,
.threshold-handle.is-active .handle-dot {
  box-shadow:
    0 2px 6px rgb(0 0 0 / 45%),
    0 0 0 3px color-mix(in srgb, var(--el-color-primary) 24%, transparent);
  transform: translate(-50%, -50%) scale(1.12);
}

.range-labels {
  display: flex;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1;
  text-align: center;
}

.range-labels span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.threshold-values {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
  margin-top: 10px;
}

.threshold-value {
  min-width: 0;
  text-align: center;
}

.threshold-value-label {
  display: block;
  margin-bottom: 4px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.threshold-value :deep(.el-input-number) {
  width: 100%;
}

.threshold-value :deep(.el-input__wrapper) {
  padding: 1px 5px;
}

.threshold-value :deep(.el-input__inner) {
  font-size: 11px;
  text-align: center;
}

.threshold-hint {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
}

.threshold-hint span:nth-child(2) {
  opacity: 0.7;
}

.threshold-track.is-disabled,
.brightness-threshold-slider:has(.threshold-track.is-disabled) {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .handle-dot {
    transition: none;
  }
}
</style>
