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
  <div class="roi-number-panel">
    <div class="roi-number-panel__header">
      <span class="roi-number-panel__title">识别区域（精确）</span>
      <label class="roi-lock">
        <el-switch
          :model-value="aspectLocked"
          size="small"
          data-testid="rsocr-roi-lock"
          @update:model-value="$emit('update:aspectLocked', $event as boolean)"
        />
        <span>锁定比例</span>
      </label>
    </div>

    <div class="roi-grid">
      <label>X</label>
      <el-input-number
        :model-value="px.x"
        :min="0"
        :max="Math.max(0, videoWidth - px.width)"
        :step="2"
        size="small"
        controls-position="right"
        data-testid="rsocr-roi-x"
        @update:model-value="setPx({ x: $event as number })"
      />
      <span class="pct">{{ pct.x }}%</span>

      <label>Y</label>
      <el-input-number
        :model-value="px.y"
        :min="0"
        :max="Math.max(0, videoHeight - px.height)"
        :step="2"
        size="small"
        controls-position="right"
        data-testid="rsocr-roi-y"
        @update:model-value="setPx({ y: $event as number })"
      />
      <span class="pct">{{ pct.y }}%</span>

      <label>宽</label>
      <el-input-number
        :model-value="px.width"
        :min="1"
        :max="videoWidth"
        :step="2"
        size="small"
        controls-position="right"
        data-testid="rsocr-roi-width"
        @update:model-value="setPx({ width: $event as number })"
      />
      <span class="pct">{{ pct.width }}%</span>

      <label>高</label>
      <el-input-number
        :model-value="px.height"
        :min="1"
        :max="videoHeight"
        :step="2"
        size="small"
        controls-position="right"
        data-testid="rsocr-roi-height"
        @update:model-value="setPx({ height: $event as number })"
      />
      <span class="pct">{{ pct.height }}%</span>
    </div>

    <div class="roi-presets">
      <el-button
        size="small"
        data-testid="rsocr-roi-preset-bottom-line"
        @click="applyPreset('bottom-line')"
        >底部单行</el-button
      >
      <el-button
        size="small"
        data-testid="rsocr-roi-preset-bottom-two"
        @click="applyPreset('bottom-two')"
        >底部双行</el-button
      >
      <el-button
        size="small"
        data-testid="rsocr-roi-preset-full"
        @click="applyPreset('full')"
        >全屏</el-button
      >
      <el-button
        size="small"
        data-testid="rsocr-roi-preset-reset"
        @click="applyPreset('reset')"
        >重置</el-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElButton, ElInputNumber, ElSwitch } from "element-plus";
import { clampVideoRoi, videoRoiToPixels } from "../../utils/video";
import type { VideoRoi } from "../../types";

const props = withDefaults(
  defineProps<{
    modelValue: VideoRoi;
    videoWidth: number;
    videoHeight: number;
    aspectLocked?: boolean;
  }>(),
  { aspectLocked: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: VideoRoi];
  "update:aspectLocked": [value: boolean];
}>();

const px = computed(() =>
  videoRoiToPixels(props.modelValue, props.videoWidth, props.videoHeight)
);
const pct = computed(() => ({
  x: (props.modelValue.x * 100).toFixed(1),
  y: (props.modelValue.y * 100).toFixed(1),
  width: (props.modelValue.width * 100).toFixed(1),
  height: (props.modelValue.height * 100).toFixed(1),
}));

function setPx(patch: Partial<{ x: number; y: number; width: number; height: number }>) {
  const next = { ...px.value, ...patch };
  if (
    !Number.isFinite(next.x) ||
    !Number.isFinite(next.y) ||
    !Number.isFinite(next.width) ||
    !Number.isFinite(next.height) ||
    props.videoWidth <= 0 ||
    props.videoHeight <= 0
  ) {
    return;
  }
  let width = next.width / props.videoWidth;
  let height = next.height / props.videoHeight;
  if (props.aspectLocked) {
    const ratio = props.modelValue.width / props.modelValue.height;
    if (ratio > 0) {
      if (patch.width !== undefined && patch.height === undefined) {
        height = width / ratio;
      } else if (patch.height !== undefined && patch.width === undefined) {
        width = height * ratio;
      }
    }
  }
  emit(
    "update:modelValue",
    clampVideoRoi({
      x: next.x / props.videoWidth,
      y: next.y / props.videoHeight,
      width,
      height,
    })
  );
}

function applyPreset(preset: "bottom-line" | "bottom-two" | "full" | "reset") {
  switch (preset) {
    case "bottom-line":
      emit("update:modelValue", { x: 0.08, y: 0.78, width: 0.84, height: 0.14 });
      break;
    case "bottom-two":
      emit("update:modelValue", { x: 0.05, y: 0.68, width: 0.9, height: 0.25 });
      break;
    case "full":
      emit("update:modelValue", { x: 0, y: 0, width: 1, height: 1 });
      break;
    case "reset":
      emit("update:modelValue", { x: 0.05, y: 0.68, width: 0.9, height: 0.25 });
      break;
  }
}
</script>

<style scoped>
.roi-number-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  margin-top: 8px;
  border-top: 1px dashed var(--border-color);
}
.roi-number-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.roi-number-panel__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.roi-lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.roi-grid {
  display: grid;
  grid-template-columns: 28px 1fr 44px;
  align-items: center;
  gap: 6px 8px;
}
.roi-grid label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.roi-grid :deep(.el-input-number) {
  width: 100%;
}
.pct {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  text-align: right;
}
.roi-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
