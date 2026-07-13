<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="property-group">
    <SelectionCommonProps :obj="obj" show-size @update-prop="emitProp" />

    <div class="section-divider" />

    <PropertySlider
      label="描边粗细"
      :model-value="obj.strokeWidth"
      :min="1"
      :max="20"
      @update:model-value="(v) => emitProp('strokeWidth', v)"
    />

    <PropertyColorPicker
      label="描边颜色"
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

    <!-- 填充 -->
    <div class="property-item">
      <span class="label">填充</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input
            type="checkbox"
            :checked="obj.fill !== null"
            @change="toggleFill"
          />
          <span class="checkmark" />
          <span>启用</span>
        </label>
        <el-color-picker
          :model-value="obj.fill || '#ffffff'"
          size="small"
          :disabled="obj.fill === null"
          @change="onFillChange"
        />
      </div>
    </div>

    <!-- 圆角 -->
    <PropertySlider
      label="圆角"
      :model-value="obj.cornerRadius"
      :min="0"
      :max="50"
      @update:model-value="(v) => emitProp('cornerRadius', v)"
    />
  </div>
</template>

<script setup lang="ts">
import { DASH_PRESETS } from "../../constants";
import type { RectObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";

const props = defineProps<{
  obj: RectObject;
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

function toggleFill() {
  if (props.obj.fill !== null) {
    emitProp("fill", null);
  } else {
    emitProp("fill", "#ffffff");
  }
}

function onFillChange(val: string | null) {
  if (val) emitProp("fill", val);
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
