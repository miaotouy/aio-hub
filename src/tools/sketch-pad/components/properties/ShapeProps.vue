<template>
  <div class="property-group">
    <PropertySlider
      label="描边"
      :model-value="strokeWidth"
      :min="1"
      :max="20"
      @update:model-value="(v) => emitUpdate({ strokeWidth: v })"
    />

    <PropertyColorPicker
      label="描边颜色"
      :model-value="strokeColor"
      @update:model-value="(v) => emitUpdate({ strokeColor: v })"
    />

    <div v-if="activeTool === 'rect' || activeTool === 'ellipse'" class="property-item">
      <span class="label">填充</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input type="checkbox" :checked="hasFill" @change="toggleFill" />
          <span class="checkmark" />
          <span>启用</span>
        </label>
        <el-color-picker :model-value="localFillColor" size="small" :disabled="!hasFill" @change="onFillColorChange" />
      </div>
    </div>

    <PropertySlider
      v-if="activeTool === 'rect'"
      label="圆角"
      :model-value="cornerRadius"
      :min="0"
      :max="50"
      @update:model-value="(v) => emitUpdate({ cornerRadius: v })"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";
import type { ToolType } from "../../constants";

const props = defineProps<{
  activeTool: ToolType;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string | null;
  cornerRadius: number;
}>();

const emit = defineEmits<{
  (
    e: "update",
    data: { strokeWidth?: number; strokeColor?: string; fillColor?: string | null; cornerRadius?: number },
  ): void;
}>();

const hasFill = ref(props.fillColor !== null);
const localFillColor = ref(props.fillColor || "#ffffff");

watch(
  () => props.fillColor,
  (val) => {
    hasFill.value = val !== null;
    if (val) localFillColor.value = val;
  },
);

function emitUpdate(data: {
  strokeWidth?: number;
  strokeColor?: string;
  fillColor?: string | null;
  cornerRadius?: number;
}) {
  emit("update", data);
}

function toggleFill() {
  hasFill.value = !hasFill.value;
  emit("update", { fillColor: hasFill.value ? localFillColor.value : null });
}

function onFillColorChange(val: string | null) {
  if (val) {
    localFillColor.value = val;
    emit("update", { fillColor: val });
  }
}
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.fill-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.custom-checkbox input {
  accent-color: var(--primary-color);
}
</style>
