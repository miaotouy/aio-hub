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
