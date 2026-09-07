<template>
  <section
    class="color-points-editor"
    aria-label="色系点位配置"
    @keydown.esc.stop.prevent="cancelInteraction"
  >
    <div class="editor-heading">
      <h4>色系</h4>
      <label class="boundary-toggle"
        ><input v-model="showBoundaries" type="checkbox" />分区边界</label
      >
    </div>
    <div class="editor-actions">
      <select
        aria-label="色系预设"
        :value="activePreset"
        :disabled="!!drag"
        @change="selectPreset"
      >
        <option value="custom" disabled>自定义</option>
        <option
          v-for="preset in COLOR_FAMILY_PRESETS"
          :key="preset.id"
          :value="preset.id"
        >
          {{ preset.name }}
        </option>
      </select>
      <button
        type="button"
        :aria-pressed="adding"
        :disabled="!!drag"
        @click="toggleAdding"
      >
        {{ adding ? "取消添加" : "添加点位" }}
      </button>
    </div>
    <div
      ref="disk"
      class="color-disk"
      :class="{ adding }"
      role="group"
      aria-label="色相饱和度圆盘"
      :tabindex="adding ? 0 : -1"
      :aria-describedby="hintId"
      @pointerdown="addAtPointer"
      @pointermove="movePointer"
      @pointerup="finishPointer"
      @pointercancel="cancelPointer"
      @lostpointercapture="cancelPointer"
      @keydown.enter.self.prevent="addWithKeyboard"
      @keydown.space.self.prevent="addWithKeyboard"
    >
      <canvas ref="canvas" aria-hidden="true" />
      <svg v-if="showBoundaries" viewBox="-1 -1 2 2" aria-hidden="true">
        <defs>
          <clipPath :id="clipId"><circle r="1" /></clipPath>
        </defs>
        <g :clip-path="`url(#${clipId})`">
          <polygon
            v-for="cell in cells"
            :key="cell.id"
            :points="cell.polygon.map((p) => `${p.x},${p.y}`).join(' ')"
          />
        </g>
      </svg>
      <button
        v-for="(point, index) in draft"
        :key="point.id"
        type="button"
        class="color-point"
        :class="{ selected: selectedId === point.id }"
        :style="pointStyle(point)"
        :aria-label="`选择色系 ${point.name || index + 1}`"
        :aria-pressed="selectedId === point.id"
        :title="`${point.name} · H ${rounded(point.hue)}° / S ${rounded(point.saturation * 100)}%`"
        @pointerdown.stop="startPointer(point.id, $event)"
        @click.stop="onPointClick(point.id, $event)"
      >
        {{ index + 1 }}
      </button>
    </div>
    <p :id="hintId" class="editor-hint">
      {{
        adding
          ? "点击圆盘添加；也可按 Enter 添加后精确输入。Esc 取消。"
          : "拖动点位，松手生效。角度为色相，离圆心越远饱和度越高。"
      }}
    </p>
    <div class="point-list">
      <div
        v-for="(point, index) in draft"
        :key="point.id"
        class="point-row"
        :class="{ selected: selectedId === point.id }"
        @focusin="selectPoint(point.id)"
      >
        <div class="point-name-row">
          <span
            class="point-swatch"
            :style="{ background: displayColor(point) }"
            aria-hidden="true"
            >{{ index + 1 }}</span
          >
          <input
            :ref="(el) => registerNameInput(point.id, el)"
            :value="point.name"
            :aria-label="`色系 ${index + 1} 名称`"
            :disabled="!!drag"
            @input="point.name = inputText($event)"
            @blur="commit"
            @keydown.enter.prevent="commit"
          />
          <button
            type="button"
            class="delete-point"
            :aria-label="`删除色系 ${point.name || index + 1}`"
            :disabled="!!drag"
            @click="removePoint(point.id)"
          >
            删除
          </button>
        </div>
        <div class="point-values">
          <label
            >H
            <input
              type="number"
              min="0"
              max="360"
              step="0.1"
              :value="rounded(point.hue)"
              :aria-label="`色系 ${index + 1} 色相`"
              :disabled="!!drag"
              @input="point.hue = inputNumber($event)"
              @blur="commit"
              @keydown.enter.prevent="commit"
            /><span>°</span></label
          >
          <label
            >S
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              :value="rounded(point.saturation * 100)"
              :aria-label="`色系 ${index + 1} 饱和度`"
              :disabled="!!drag"
              @input="point.saturation = inputNumber($event) / 100"
              @blur="commit"
              @keydown.enter.prevent="commit"
            /><span>%</span></label
          >
        </div>
      </div>
    </div>
    <p v-if="!draft.length" class="editor-hint">
      暂无点位，图片将归入“未分类”。可添加点位或选择预设。
    </p>
    <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  ref,
  useId,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { ElMessageBox } from "element-plus";
import { hslToRgb } from "../composables/useColorConverter";
import {
  COLOR_FAMILY_PRESETS,
  colorCoordinate,
  colorFamilyCells,
  colorPointDisplayColor,
  coordinateToColor,
  createColorFamilyPreset,
  validateColorPoints,
  type ColorFamilyPoint,
  type ColorFamilyPreset,
} from "../colorFamilyPoints";

const props = defineProps<{ modelValue: ColorFamilyPoint[] }>();
const emit = defineEmits<{
  (e: "update:modelValue", points: ColorFamilyPoint[]): void;
}>();
const clone = (points: ColorFamilyPoint[]) =>
  points.map((point) => ({ ...point }));
const draft = ref(clone(props.modelValue));
const error = ref("");
const adding = ref(false);
const selectedId = ref(props.modelValue[0]?.id ?? "");
const showBoundaries = ref(true);
const canvas = ref<HTMLCanvasElement>();
const disk = ref<HTMLDivElement>();
const clipId = `color-disk-${useId()}`;
const hintId = `color-hint-${useId()}`;
const nameInputs = new Map<string, HTMLInputElement>();
const drag = ref<{
  id: string;
  pointerId: number;
  before: ColorFamilyPoint[];
  moved: boolean;
}>();
const rounded = (value: number) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : "";
const inputText = (event: Event) => (event.target as HTMLInputElement).value;
const inputNumber = (event: Event) =>
  inputText(event).trim() === "" ? NaN : Number(inputText(event));
const validPosition = (point: ColorFamilyPoint) =>
  Number.isFinite(point.hue) &&
  Number.isFinite(point.saturation) &&
  point.hue >= 0 &&
  point.hue <= 360 &&
  point.saturation >= 0 &&
  point.saturation <= 1;
const previewPoints = computed(() => draft.value.filter(validPosition));
const cells = computed(() => colorFamilyCells(previewPoints.value));
const displayColor = (point: ColorFamilyPoint) =>
  validPosition(point) ? colorPointDisplayColor(point) : "var(--el-fill-color)";
const activePreset = computed(
  () =>
    COLOR_FAMILY_PRESETS.find(
      (preset) =>
        JSON.stringify(createColorFamilyPreset(preset.id)) ===
        JSON.stringify(draft.value)
    )?.id ?? "custom"
);
watch(
  () => props.modelValue,
  (value) => {
    cancelInteraction();
    draft.value = clone(value);
    if (!value.some((point) => point.id === selectedId.value))
      selectedId.value = value[0]?.id ?? "";
  },
  { deep: true }
);

function registerNameInput(
  id: string,
  el: Element | ComponentPublicInstance | null
) {
  if (el instanceof HTMLInputElement) nameInputs.set(id, el);
  else nameInputs.delete(id);
}
function selectPoint(id: string, focus = false) {
  selectedId.value = id;
  if (focus) nameInputs.get(id)?.focus();
}
function onPointClick(id: string, event: MouseEvent) {
  // Pointer clicks are handled on release; keyboard activation has no pointer.
  if (event.detail === 0) selectPoint(id, true);
}
function pointStyle(point: ColorFamilyPoint) {
  const position = validPosition(point)
    ? colorCoordinate(point.hue, point.saturation)
    : { x: 0, y: 0 };
  return {
    left: `${(position.x + 1) * 50}%`,
    top: `${(position.y + 1) * 50}%`,
    background: displayColor(point),
  };
}
function commit() {
  if (drag.value) return false;
  const result = validateColorPoints(draft.value);
  error.value = result.error ?? "";
  if (!result.points) return false;
  draft.value = clone(result.points);
  if (JSON.stringify(result.points) !== JSON.stringify(props.modelValue))
    emit("update:modelValue", result.points);
  return true;
}
async function selectPreset(event: Event) {
  const select = event.target as HTMLSelectElement;
  const preset = select.value as ColorFamilyPreset;
  select.value = activePreset.value;
  if (activePreset.value === "custom") {
    try {
      await ElMessageBox.confirm(
        "应用预设会替换当前所有色系点位。",
        "替换色系点位",
        {
          lockScroll: false,
          confirmButtonText: "替换",
          cancelButtonText: "取消",
          type: "warning",
        }
      );
    } catch {
      return;
    } // Cancelling the confirmation is not an error.
  }
  cancelInteraction();
  draft.value = createColorFamilyPreset(preset);
  selectedId.value = draft.value[0]?.id ?? "";
  commit();
}
function removePoint(id: string) {
  draft.value = draft.value.filter((point) => point.id !== id);
  if (selectedId.value === id) selectedId.value = draft.value[0]?.id ?? "";
  commit();
}
async function toggleAdding() {
  adding.value = !adding.value;
  if (adding.value) {
    await nextTick();
    disk.value?.focus();
  }
}
function eventPosition(event: PointerEvent) {
  const rect = disk.value!.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
  };
}
async function addPoint(hue: number, saturation: number) {
  let number = 1;
  while (draft.value.some((point) => point.name.trim() === `色系 ${number}`))
    number++;
  const point = {
    id: crypto.randomUUID(),
    name: `色系 ${number}`,
    hue,
    saturation,
  };
  const before = draft.value;
  draft.value = [...before, point];
  if (!commit()) {
    draft.value = before;
    return;
  }
  adding.value = false;
  selectedId.value = point.id;
  await nextTick();
  nameInputs.get(point.id)?.focus();
  nameInputs.get(point.id)?.select();
}
function addAtPointer(event: PointerEvent) {
  if (!adding.value || event.button !== 0) return;
  const position = eventPosition(event);
  if (Math.hypot(position.x, position.y) > 1) return;
  const { hue, saturation } = coordinateToColor(position);
  void addPoint(hue, saturation);
}
function addWithKeyboard() {
  if (!adding.value) return;
  // There are N+1 distinct candidates, so at least one is free for N points.
  for (let i = 0; i <= draft.value.length; i++) {
    const hue = (i * 360) / (draft.value.length + 1);
    const p = colorCoordinate(hue, 0.5);
    if (
      draft.value.every((point) => {
        const other = colorCoordinate(point.hue, point.saturation);
        return Math.hypot(p.x - other.x, p.y - other.y) >= 1e-6;
      })
    ) {
      void addPoint(hue, 0.5);
      break;
    }
  }
}
function startPointer(id: string, event: PointerEvent) {
  if (event.button !== 0 || drag.value) return;
  if (adding.value) {
    addAtPointer(event);
    return;
  }
  event.preventDefault();
  selectedId.value = id;
  disk.value?.focus();
  drag.value = {
    id,
    pointerId: event.pointerId,
    before: clone(draft.value),
    moved: false,
  };
  disk.value?.setPointerCapture(event.pointerId);
}
function movePointer(event: PointerEvent) {
  if (!drag.value || event.pointerId !== drag.value.pointerId) return;
  const point = draft.value.find((point) => point.id === drag.value!.id)!;
  Object.assign(point, coordinateToColor(eventPosition(event)));
  drag.value.moved = true;
}
function releasePointer(pointerId: number) {
  if (disk.value?.hasPointerCapture(pointerId))
    disk.value.releasePointerCapture(pointerId);
}
function finishPointer(event: PointerEvent) {
  if (!drag.value || event.pointerId !== drag.value.pointerId) return;
  const previous = drag.value;
  drag.value = undefined;
  releasePointer(previous.pointerId);
  if (previous.moved && !commit()) draft.value = previous.before;
  if (!previous.moved) selectPoint(previous.id, true);
}
function cancelPointer(event: PointerEvent) {
  if (drag.value?.pointerId === event.pointerId) cancelInteraction();
}
function cancelInteraction() {
  if (drag.value) {
    const previous = drag.value;
    drag.value = undefined;
    draft.value = previous.before;
    releasePointer(previous.pointerId);
  }
  adding.value = false;
}

onMounted(() => {
  const target = canvas.value;
  const context = target?.getContext("2d");
  if (!target || !context) return;
  const size = 512;
  target.width = target.height = size;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1,
        dy = ((y + 0.5) / size) * 2 - 1;
      if (Math.hypot(dx, dy) > 1) continue;
      const { hue, saturation } = coordinateToColor({ x: dx, y: dy });
      const { r, g, b } = hslToRgb(hue, saturation * 100, 50);
      const offset = (y * size + x) * 4;
      image.data.set([r, g, b, 255], offset);
    }
  context.putImageData(image, 0, 0);
});
</script>

<style scoped>
.color-points-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
  min-width: 0;
  color: var(--text-color);
}
.editor-heading,
.editor-actions,
.point-name-row,
.point-values {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-heading {
  justify-content: space-between;
}
h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.boundary-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
input[type="checkbox"] {
  accent-color: var(--el-color-primary);
}
select,
button,
input:not([type="checkbox"]) {
  box-sizing: border-box;
  font: inherit;
  font-size: 12px;
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
  min-width: 0;
}
button,
select {
  padding: 6px 8px;
  cursor: pointer;
}
button:disabled,
select:disabled,
input:disabled {
  cursor: default;
  opacity: 0.6;
}
button:hover:not(:disabled) {
  border-color: var(--el-color-primary);
}
input:not([type="checkbox"]) {
  padding: 5px 6px;
  width: 100%;
}
:where(button, select, input):focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.editor-actions select {
  flex: 1;
}
.color-disk {
  position: relative;
  aspect-ratio: 1;
  margin: 4px 12px;
  touch-action: none;
  user-select: none;
  flex-shrink: 0;
}
.color-disk:focus {
  outline: none;
}
.color-disk:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 6px;
  border-radius: 50%;
}
.color-disk.adding {
  cursor: crosshair;
}
canvas,
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
canvas {
  border-radius: 50%;
  outline: 1px solid var(--border-color);
}
svg polygon {
  fill: none;
  stroke: var(--text-color);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
  opacity: 0.65;
}
.color-point,
.point-swatch {
  color: var(--el-color-white);
  text-shadow: 0 1px 2px var(--el-color-black);
  font-variant-numeric: tabular-nums;
}
.color-point {
  position: absolute;
  width: 25px;
  height: 25px;
  padding: 0;
  transform: translate(-50%, -50%);
  border: 2px solid var(--el-color-white);
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 0 0 1px var(--el-color-black);
  z-index: 1;
}
.color-point.selected {
  outline: 3px solid var(--text-color);
  outline-offset: 2px;
  z-index: 2;
}
.color-point:active {
  cursor: grabbing;
}
.editor-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.point-list {
  display: flex;
  flex-direction: column;
}
.point-row {
  padding: 10px 6px;
  border-bottom: 1px solid var(--border-color);
  border-left: 2px solid transparent;
}
.point-row.selected {
  border-left-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}
.point-swatch {
  width: 21px;
  height: 21px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 11px;
}
.point-name-row input {
  flex: 1;
}
.delete-point {
  color: var(--el-color-danger);
}
.point-values {
  margin-top: 6px;
  padding-left: 29px;
}
.point-values label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
.point-values input {
  font-variant-numeric: tabular-nums;
}
.editor-error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 1.5;
}
</style>
