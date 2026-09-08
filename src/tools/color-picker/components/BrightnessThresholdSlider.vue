<template>
  <div ref="root" class="brightness-threshold-slider">
    <div class="brightness-heading">
      <h4>亮度阈值</h4>
      <div class="point-controls">
        <span>{{ values.length }} / 4</span
        ><el-tooltip
          :content="
            values.length >= 4 ? '最多 4 个亮度分界点' : '添加亮度分界点'
          "
          :show-after="300"
          ><span
            ><button
              class="point-action"
              type="button"
              aria-label="添加亮度分界点"
              :disabled="disabled || values.length >= 4"
              @click="addPoint"
            >
              <Plus :size="16" /></button></span
        ></el-tooltip>
      </div>
    </div>
    <slot />
    <div
      ref="trackRef"
      class="threshold-track"
      :class="{ 'is-disabled': disabled }"
      role="group"
      aria-label="亮度范围与阈值"
      @pointerdown="handleTrackPointerDown"
    >
      <div class="brightness-gradient" aria-hidden="true" />

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

        <ScrubNumberInput
          :model-value="valueAt(index)"
          :min="lowerBound(index)"
          :max="upperBound(index)"
          :step="step"
          :precision="2"
          :disabled="disabled"
          :label="`${label}阈值`"
          @update:model-value="updateValue(index, $event)"
        />
        <el-tooltip
          :content="
            values.length <= 1 ? '至少保留 1 个亮度分界点' : '删除此亮度分界点'
          "
          :show-after="300"
          ><span
            ><button
              class="point-action"
              type="button"
              :aria-label="'删除亮度分界点 ' + (index + 1)"
              :disabled="disabled || values.length <= 1"
              @click="removePoint(index)"
            >
              <Trash2 :size="14" /></button></span
        ></el-tooltip>
      </div>
    </div>

    <div class="threshold-footer">
      <div class="threshold-hint">
        <span>黑 (0.0)</span>
        <span>亮度划分</span>
        <span>白 (1.0)</span>
      </div>

      <div class="threshold-actions">
        <!-- 组件使用说明 Tooltip -->
        <el-tooltip placement="top" :show-after="150">
          <template #content>
            <div class="guide-content">
              <div class="guide-title">💡 亮度阈值说明</div>
              <ul class="guide-list">
                <li>
                  <b>{{ values.length + 1 }} 档划分</b>：{{
                    values.length
                  }}
                  个阈值将亮度分为<b>{{ brightnessLevels.join("、") }}</b
                  >。
                </li>
                <li><b>滑动手柄</b>：直接拖动轨道上手柄调节分界点。</li>
                <li>
                  <b>微调拖拽</b>：在数值块上<b>左右拖动</b>可微调，按住
                  <b>Shift</b> 超精细微调。
                </li>
                <li>
                  <b>精确输入</b>：<b>单击</b>数值块即可切换输入框直接键入。
                </li>
              </ul>
            </div>
          </template>
          <button
            type="button"
            class="action-btn"
            :disabled="disabled"
            aria-label="查看亮度阈值使用说明"
          >
            <HelpCircle :size="12" />
            <span>说明</span>
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import ScrubNumberInput from "./ScrubNumberInput.vue";
import { HelpCircle, Plus, Trash2 } from "lucide-vue-next";

import {
  clampThresholds,
  brightnessLevelsFor,
  insertBrightnessThreshold,
} from "../brightnessThresholds";

interface Props {
  modelValue: number[];
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
  (e: "update:modelValue", value: number[]): void;
}>();

const trackRef = ref<HTMLElement | null>(null);
const activeIndex = ref<number | null>(null);
const brightnessLevels = computed(() =>
  brightnessLevelsFor(values.value.length)
);
const thresholdLabels = computed(() => brightnessLevels.value.slice(0, -1));
const root = ref<HTMLElement>();

const values = computed<number[]>(() => normalizeValues(props.modelValue));

const valueAt = (index: number) => values.value[index] ?? props.min;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const snap = (value: number) => {
  const steps = Math.round((value - props.min) / props.step);
  return Number((props.min + steps * props.step).toFixed(2));
};

const normalizeValues = clampThresholds;

const lowerBound = (_index: number) => props.min;

const upperBound = (_index: number) => props.max;

const emitValues = (index: number, value: number) => {
  if (!Number.isFinite(value) || props.disabled) return;

  const raw = [...values.value] as number[];
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
  const end = index < values.value.length ? valueAt(index) : props.max;
  return ((end - start) / (props.max - props.min)) * 100;
};

const valueFromPointer = (event: PointerEvent) => {
  const track = trackRef.value;
  if (!track) return props.min;
  const rect = track.getBoundingClientRect();
  const percent = ((event.clientX - rect.left) / rect.width) * 100;
  return percentToValue(percent);
};
async function focusValue(index: number) {
  await nextTick();
  root.value
    ?.querySelectorAll<HTMLElement>('[role="spinbutton"]')
    [index]?.focus();
}
function addPoint() {
  if (props.disabled || values.value.length >= 4) return;
  stopDragging();
  const next = insertBrightnessThreshold(values.value);
  emit("update:modelValue", next.values);
  void focusValue(next.index);
}
function removePoint(index: number) {
  if (props.disabled || values.value.length <= 1) return;
  stopDragging();
  const next = values.value.filter((_, i) => i !== index);
  emit("update:modelValue", next);
  void focusValue(Math.min(index, next.length - 1));
}
watch(
  () => props.modelValue.length,
  () => stopDragging()
);
defineExpose({ stopDragging });

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

function stopDragging() {
  activeIndex.value = null;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", stopDragging);
  window.removeEventListener("pointercancel", stopDragging);
}

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

onBeforeUnmount(() => {
  stopDragging();
});
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

.brightness-gradient {
  position: absolute;
  inset: 2px;
  border-radius: 3px;
  pointer-events: none;
  background: linear-gradient(90deg, #000 0%, #fff 100%);
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

.threshold-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  gap: 6px;
}

.threshold-hint {
  display: flex;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  line-height: 1;
}

.threshold-hint span:nth-child(2) {
  opacity: 0.7;
}

.threshold-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease;
  user-select: none;
}

.action-btn:hover:not(:disabled) {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
  border-color: var(--border-color);
}

.action-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.action-btn:disabled,
.action-btn.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.guide-content {
  font-size: 11px;
  line-height: 1.5;
  max-width: 230px;
  padding: 2px 0;
}

.guide-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--el-color-primary-light-3, inherit);
}

.guide-list {
  margin: 0;
  padding-left: 14px;
}

.guide-list li {
  margin-bottom: 3px;
}

.guide-list li:last-child {
  margin-bottom: 0;
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

<style scoped>
.brightness-threshold-slider {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.brightness-heading,
.point-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brightness-heading {
  justify-content: space-between;
}
h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.point-controls {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.point-action {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 4px;
  color: var(--text-color);
  background: transparent;
  cursor: pointer;
}
.point-action:hover:not(:disabled) {
  background: var(--el-fill-color);
}
.point-action:focus-visible {
  outline: 2px solid var(--el-color-primary);
}
.point-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.threshold-values {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.threshold-value {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 28px;
  gap: 8px;
  align-items: center;
}
</style>
