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

        <!-- 编辑模式：输入框 -->
        <el-input-number
          v-if="editingIndex === index"
          :ref="(el: any) => setInputRef(el, index)"
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
          @blur="finishEditing"
          @keydown.enter="finishEditing"
          @keydown.esc="cancelEditing"
        />

        <!-- 展示模式：可拖拽调整数值块 -->
        <div
          v-else
          class="scrub-value-box"
          :class="{
            'is-scrubbing': scrubbingIndex === index,
            'is-disabled': disabled,
          }"
          role="spinbutton"
          tabindex="0"
          :aria-label="`${label}阈值`"
          :aria-valuemin="lowerBound(index)"
          :aria-valuemax="upperBound(index)"
          :aria-valuenow="valueAt(index)"
          :title="
            disabled
              ? undefined
              : '左右拖拽微调（按住 Shift 超精细），点击直接输入'
          "
          @pointerdown="handleScrubPointerDown($event, index)"
          @keydown="handleScrubKeydown($event, index)"
        >
          <span class="scrub-text">{{
            formatDisplayValue(valueAt(index))
          }}</span>
        </div>
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
                  <b>5 档划分</b>：4
                  个阈值将亮度分为<b>极暗、偏暗、中等、偏亮、明亮</b>。
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

        <!-- 重置默认按钮 -->
        <el-tooltip
          :content="`重置为默认值 (${defaultValues.map(formatDisplayValue).join(', ')})`"
          placement="top"
          :show-after="300"
        >
          <button
            type="button"
            class="action-btn reset-btn"
            :class="{ 'is-disabled': disabled || isDefault }"
            :disabled="disabled || isDefault"
            aria-label="重置为默认阈值"
            @click="resetToDefault"
          >
            <RotateCcw :size="12" />
            <span>重置默认</span>
          </button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import type { ComponentPublicInstance } from "vue";
import { HelpCircle, RotateCcw } from "lucide-vue-next";

type ThresholdTuple = [number, number, number, number];

interface Props {
  modelValue: ThresholdTuple;
  defaultValues?: ThresholdTuple;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultValues: () => [0.2, 0.4, 0.6, 0.8],
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
const editingIndex = ref<number | null>(null);
const scrubbingIndex = ref<number | null>(null);
const inputRefs = ref<Record<number, any>>({});

const setInputRef = (
  el: Element | ComponentPublicInstance | null,
  index: number
) => {
  if (el) {
    inputRefs.value[index] = el;
  } else {
    delete inputRefs.value[index];
  }
};

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
const isDefault = computed(() => {
  const current = values.value;
  const target = normalizeValues(props.defaultValues);
  return current.every((val, idx) => Math.abs(val - target[idx]) < 0.001);
});

const resetToDefault = () => {
  if (props.disabled || isDefault.value) return;
  const target = normalizeValues(props.defaultValues);
  emit("update:modelValue", target);
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

const formatDisplayValue = (val: number) => val.toFixed(2);

// --- 数值拖拽 (Scrub) 与 点击切换输入模式 ---
let scrubStartX = 0;
let scrubStartValue = 0;
let scrubMoved = false;

const startEditing = (index: number) => {
  if (props.disabled) return;
  editingIndex.value = index;
  nextTick(() => {
    const targetComp = inputRefs.value[index];
    if (!targetComp) return;
    const inputEl =
      targetComp.$el?.querySelector?.("input") ||
      (typeof targetComp.focus === "function" ? targetComp : null);
    if (inputEl && typeof inputEl.focus === "function") {
      inputEl.focus();
      inputEl.select?.();
    }
  });
};

const finishEditing = () => {
  editingIndex.value = null;
};

const cancelEditing = () => {
  editingIndex.value = null;
};

const handleScrubPointerDown = (event: PointerEvent, index: number) => {
  if (props.disabled || event.button !== 0) return;

  scrubStartX = event.clientX;
  scrubStartValue = valueAt(index);
  scrubMoved = false;
  scrubbingIndex.value = index;

  const onPointerMove = (e: PointerEvent) => {
    const deltaX = e.clientX - scrubStartX;
    if (!scrubMoved && Math.abs(deltaX) >= 3) {
      scrubMoved = true;
    }

    if (scrubMoved && scrubbingIndex.value !== null) {
      // 灵敏度：按住 Shift 时超精细（每 50px 变化 0.01），否则正常微调（每 8px 变化 0.01）
      const stepRate = e.shiftKey ? 0.0002 : 0.00125;
      const targetVal = scrubStartValue + deltaX * stepRate;
      emitValues(scrubbingIndex.value, targetVal);
    }
  };

  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    const currentIndex = scrubbingIndex.value;
    scrubbingIndex.value = null;

    // 如果未发生明显拖动，则认为是单击，进入输入模式
    if (!scrubMoved && currentIndex !== null) {
      startEditing(currentIndex);
    }
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
};

const handleScrubKeydown = (event: KeyboardEvent, index: number) => {
  if (props.disabled) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    startEditing(index);
    return;
  }

  handleKeydown(event, index);
};

onBeforeUnmount(() => {
  stopDragging();
  scrubbingIndex.value = null;
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
  height: 24px;
}

.threshold-value :deep(.el-input__inner) {
  font-size: 11px;
  text-align: center;
  height: 22px;
  line-height: 22px;
}

.scrub-value-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 24px;
  padding: 0 4px;
  box-sizing: border-box;
  background-color: var(--input-bg, var(--el-fill-color-blank));
  border: 1px solid var(--border-color, var(--el-border-color));
  border-radius: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-color, var(--el-text-color-primary));
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.scrub-value-box:hover {
  border-color: var(--el-color-primary);
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 6%,
    var(--input-bg, var(--el-fill-color-blank))
  );
}

.scrub-value-box:focus-visible,
.scrub-value-box.is-scrubbing {
  border-color: var(--el-color-primary);
  outline: none;
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

.scrub-value-box.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.scrub-text {
  line-height: 1;
  pointer-events: none;
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
