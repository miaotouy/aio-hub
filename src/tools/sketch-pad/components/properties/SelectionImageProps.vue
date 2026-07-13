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

    <!-- 原始尺寸信息 -->
    <div class="property-item">
      <span class="label">原始尺寸</span>
      <div class="info-row">
        <span class="info-value"
          >{{ obj.naturalWidth }} × {{ obj.naturalHeight }}</span
        >
      </div>
    </div>

    <!-- 重置尺寸按钮 -->
    <div class="property-item">
      <button class="action-btn" @click="resetToNaturalSize">
        <Maximize2 :size="13" />
        重置为原始尺寸
      </button>
    </div>

    <!-- 适配按钮 -->
    <div class="property-item">
      <button class="action-btn" @click="fitToHalf">
        <Minimize2 :size="13" />
        缩放至 50%
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Maximize2, Minimize2 } from "lucide-vue-next";
import type { ImageObject } from "../../types";
import SelectionCommonProps from "./SelectionCommonProps.vue";

const props = defineProps<{
  obj: ImageObject;
}>();

const emit = defineEmits<{
  (e: "update-prop", key: string, value: any): void;
  (e: "update-props", data: Record<string, any>): void;
}>();

function emitProp(key: string, value: any) {
  emit("update-prop", key, value);
}

function resetToNaturalSize() {
  emit("update-props", {
    width: props.obj.naturalWidth,
    height: props.obj.naturalHeight,
  });
}

function fitToHalf() {
  emit("update-props", {
    width: Math.round(props.obj.naturalWidth / 2),
    height: Math.round(props.obj.naturalHeight / 2),
  });
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

.info-row {
  display: flex;
  align-items: center;
}

.info-value {
  font-size: 11px;
  color: var(--el-text-color-primary);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
}

.action-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.06);
}
</style>
