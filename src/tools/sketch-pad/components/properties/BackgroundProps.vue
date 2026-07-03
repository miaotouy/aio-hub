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
    <div class="property-item">
      <span class="label">填充</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input type="checkbox" :checked="hasFill" @change="toggleFill" />
          <span>启用</span>
        </label>
        <el-color-picker
          :model-value="localFillColor"
          size="small"
          show-alpha
          :disabled="!hasFill"
          @change="onFillColorChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  fillColor: string | null;
}>();

const emit = defineEmits<{
  (e: "update", fillColor: string | null): void;
}>();

const hasFill = ref(props.fillColor !== null);
const localFillColor = ref(props.fillColor || "#ffffff");

watch(
  () => props.fillColor,
  (val) => {
    hasFill.value = val !== null;
    if (val) localFillColor.value = val;
  }
);

function toggleFill() {
  hasFill.value = !hasFill.value;
  emit("update", hasFill.value ? localFillColor.value : null);
}

function onFillColorChange(val: string | null) {
  if (!val) return;
  localFillColor.value = val;
  emit("update", val);
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
