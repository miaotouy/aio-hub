<template>
  <div class="property-group">
    <SelectionCommonProps :obj="obj" @update-prop="emitProp" />

    <div class="section-divider" />

    <PropertySlider
      label="线条粗细"
      :model-value="obj.strokeWidth"
      :min="1"
      :max="20"
      @update:model-value="(v) => emitProp('strokeWidth', v)"
    />

    <PropertyColorPicker
      label="线条颜色"
      :model-value="obj.stroke"
      @update:model-value="(v) => emitProp('stroke', v)"
    />

    <!-- 虚线样式 -->
    <div class="property-item">
      <span class="label">线条样式</span>
      <div class="dash-presets">
        <button
          v-for="preset in DASH_PRESETS"
          :key="preset.label"
          class="dash-btn"
          :class="{ active: isDashActive(preset.value) }"
          :title="preset.label"
          @click="emitProp('dash', preset.value)"
        >
          <svg width="32" height="8" viewBox="0 0 32 8">
            <line
              x1="0"
              y1="4"
              x2="32"
              y2="4"
              stroke="currentColor"
              stroke-width="2"
              :stroke-dasharray="preset.value ? preset.value.join(',') : 'none'"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- 线帽样式 -->
    <div class="property-item">
      <span class="label">线帽</span>
      <div class="linecap-presets">
        <button
          v-for="opt in LINE_CAP_OPTIONS"
          :key="opt.value"
          class="cap-btn"
          :class="{ active: (obj.lineCap || 'butt') === opt.value }"
          :title="opt.label"
          @click="emitProp('lineCap', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DASH_PRESETS, LINE_CAP_OPTIONS } from "../../constants";
import type { LineObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";

const props = defineProps<{
  obj: LineObject;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
}>();

function emitProp(key: string, value: any) {
  emit("update-prop", key, value);
}

function isDashActive(dashValue: number[] | null): boolean {
  const current = props.obj.dash;
  if (!dashValue && (!current || current.length === 0)) return true;
  if (!dashValue || !current) return false;
  return JSON.stringify(dashValue) === JSON.stringify(current);
}
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-divider {
  height: 1px;
  background: var(--border-color);
  margin: 2px 0;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.dash-presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.dash-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.12s;
}

.dash-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.dash-btn.active {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.linecap-presets {
  display: flex;
  gap: 4px;
}

.cap-btn {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.12s;
}

.cap-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.cap-btn.active {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}
</style>
