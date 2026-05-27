<template>
  <div class="property-item">
    <span class="label">{{ label }}</span>
    <div class="preset-colors">
      <div
        v-for="color in PRESET_COLORS"
        :key="color"
        class="color-swatch"
        :style="{ backgroundColor: color }"
        :class="{ active: modelValue === color }"
        @click="selectColor(color)"
      />
    </div>
    <el-color-picker
      :model-value="modelValue"
      size="small"
      :show-alpha="showAlpha"
      :disabled="disabled"
      @change="onPickerChange"
    />
  </div>
</template>

<script setup lang="ts">
import { PRESET_COLORS } from "../../constants";

withDefaults(
  defineProps<{
    label: string;
    modelValue: string;
    showAlpha?: boolean;
    disabled?: boolean;
  }>(),
  {
    showAlpha: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

function selectColor(color: string) {
  emit("update:modelValue", color);
}

function onPickerChange(val: string | null) {
  if (val) emit("update:modelValue", val);
}
</script>

<style scoped>
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

.preset-colors {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.color-swatch {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  box-sizing: border-box;
  transition: all 0.12s ease;
}

.color-swatch:hover {
  transform: scale(1.15);
}

.color-swatch.active {
  border-color: var(--el-text-color-primary);
  box-shadow: 0 0 0 1px var(--primary-color);
}
</style>
