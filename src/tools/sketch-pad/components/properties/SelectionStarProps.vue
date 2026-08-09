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
    <SelectionCommonProps :obj="obj" @update-prop="emitProp" />

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

    <div class="property-item">
      <span class="label">填充</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input
            type="checkbox"
            :checked="obj.fill !== null"
            @change="toggleFill"
          />
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

    <PropertySlider
      label="顶点数"
      :model-value="obj.numPoints"
      :min="3"
      :max="12"
      :step="1"
      @update:model-value="(v) => emitProp('numPoints', Math.round(v))"
    />

    <PropertySlider
      label="外角半径"
      :model-value="obj.outerRadius"
      :min="1"
      :max="300"
      @update:model-value="
        (v) => emitProp('outerRadius', Math.max(v, obj.innerRadius + 1))
      "
    />

    <PropertySlider
      label="内角半径"
      :model-value="obj.innerRadius"
      :min="0"
      :max="200"
      @update:model-value="
        (v) => emitProp('innerRadius', Math.min(v, obj.outerRadius * 0.95))
      "
    />
  </div>
</template>

<script setup lang="ts">
import type { StarObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";

const props = defineProps<{
  obj: StarObject;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
}>();

function emitProp(key: string, value: any) {
  emit("update-prop", key, value);
}

function toggleFill() {
  emitProp("fill", props.obj.fill === null ? "#ffffff" : null);
}

function onFillChange(value: string | null) {
  if (value) emitProp("fill", value);
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
