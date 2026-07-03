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
    <PropertySlider
      label="粗细"
      :model-value="brushSize"
      :min="1"
      :max="100"
      @update:model-value="(v) => emit('update', { size: v })"
    />

    <PropertySlider
      v-if="activeTool !== 'eraser'"
      label="不透明度"
      :model-value="brushOpacity"
      :min="0.1"
      :max="1"
      :step="0.05"
      suffix="%"
      :display-transform="(v) => Math.round(v * 100)"
      :input-transform="(v) => v / 100"
      @update:model-value="(v) => emit('update', { opacity: v })"
    />

    <PropertyColorPicker
      v-if="activeTool !== 'eraser'"
      label="颜色"
      :model-value="brushColor"
      show-alpha
      @update:model-value="(v) => emit('update', { color: v })"
    />
  </div>
</template>

<script setup lang="ts">
import PropertySlider from "./PropertySlider.vue";
import PropertyColorPicker from "./PropertyColorPicker.vue";
import type { ToolType } from "../../constants";

defineProps<{
  activeTool: ToolType;
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
}>();

const emit = defineEmits<{
  (
    e: "update",
    data: { size?: number; color?: string; opacity?: number }
  ): void;
}>();
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
