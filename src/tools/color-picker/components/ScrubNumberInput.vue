<template>
  <input
    v-if="editing"
    ref="input"
    v-model="text"
    class="scrub-input"
    type="number"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    @blur="finishEditing"
    @keydown.enter.prevent="finishEditing"
    @keydown.esc.stop.prevent="cancelEditing"
  />
  <div
    v-else
    class="scrub-value-box"
    :class="{ 'is-scrubbing': scrubbing, 'is-disabled': disabled }"
    role="spinbutton"
    :tabindex="disabled ? -1 : 0"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    :aria-disabled="disabled"
    :title="
      disabled ? undefined : '左右拖拽微调（按住 Shift 超精细），点击直接输入'
    "
    @pointerdown="startScrub"
    @keydown="handleKeydown"
  >
    <span class="scrub-text"
      >{{ modelValue.toFixed(precision) }}{{ suffix }}</span
    >
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    precision?: number;
    label: string;
    suffix?: string;
    disabled?: boolean;
  }>(),
  { step: 1, precision: 0, suffix: "", disabled: false }
);
const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "change", value: number): void;
}>();
const editing = ref(false);
const scrubbing = ref(false);
const text = ref("");
const input = ref<HTMLInputElement>();
let startX = 0;
let startValue = 0;
let pending = 0;
let pointerId: number | undefined;
let moved = false;

function normalize(value: number) {
  return Math.min(
    props.max,
    Math.max(
      props.min,
      Number(
        (Math.round(value / props.step) * props.step).toFixed(props.precision)
      )
    )
  );
}
function publish(value: number) {
  if (value !== props.modelValue) emit("update:modelValue", value);
}
async function startEditing() {
  if (props.disabled) return;
  text.value = String(props.modelValue);
  editing.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}
function finishEditing() {
  if (!editing.value) return;
  editing.value = false;
  const value = Number(text.value);
  if (props.disabled || !String(text.value).trim() || !Number.isFinite(value))
    return;
  const normalized = normalize(value);
  publish(normalized);
  emit("change", normalized);
}
function cancelEditing() {
  editing.value = false;
}
function cleanup() {
  window.removeEventListener("pointermove", moveScrub);
  window.removeEventListener("pointerup", finishScrub);
  window.removeEventListener("pointercancel", cancelScrub);
  window.removeEventListener("keydown", cancelWithEscape, true);
  window.removeEventListener("blur", cancelScrub);
  scrubbing.value = false;
  pointerId = undefined;
}
function startScrub(event: PointerEvent) {
  if (props.disabled || event.button !== 0 || pointerId !== undefined) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).focus();
  startX = event.clientX;
  startValue = pending = props.modelValue;
  pointerId = event.pointerId;
  moved = false;
  scrubbing.value = true;
  window.addEventListener("pointermove", moveScrub);
  window.addEventListener("pointerup", finishScrub);
  window.addEventListener("pointercancel", cancelScrub);
  window.addEventListener("keydown", cancelWithEscape, true);
  window.addEventListener("blur", cancelScrub);
}
function moveScrub(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (props.disabled) {
    cancelScrub();
    return;
  }
  const delta = event.clientX - startX;
  moved ||= Math.abs(delta) >= 3;
  if (!moved) return;
  pending = normalize(
    startValue + (delta * props.step) / (event.shiftKey ? 50 : 8)
  );
  publish(pending);
}
function finishScrub(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  if (props.disabled) {
    cancelScrub();
    return;
  }
  cleanup();
  if (moved) emit("change", pending);
  else void startEditing();
}
function cancelScrub(event?: Event) {
  if (
    event?.type === "pointercancel" &&
    (event as PointerEvent).pointerId !== pointerId
  )
    return;
  publish(startValue);
  cleanup();
}
function cancelWithEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  cancelScrub();
}
function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void startEditing();
    return;
  }
  let next: number;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowDown":
      next = props.modelValue - props.step;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next = props.modelValue + props.step;
      break;
    case "Home":
      next = props.min;
      break;
    case "End":
      next = props.max;
      break;
    default:
      return;
  }
  event.preventDefault();
  next = normalize(next);
  publish(next);
  emit("change", next);
}
onBeforeUnmount(cleanup);
</script>

<style scoped>
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

.scrub-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 24px;
  padding: 0 4px;
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  outline: none;
  background: var(--input-bg, var(--el-fill-color-blank));
  color: var(--text-color);
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  appearance: textfield;
}
.scrub-input::-webkit-inner-spin-button,
.scrub-input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
