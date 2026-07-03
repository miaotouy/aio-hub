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
  <div class="property-item">
    <div class="slider-header">
      <span class="label">{{ label }}</span>
      <span v-if="!isEditing" class="value clickable" @click="startEdit">{{
        displayValue
      }}</span>
      <input
        v-else
        ref="inputRef"
        type="number"
        class="value-input"
        :value="editValue"
        :min="min"
        :max="max"
        :step="step"
        @input="onInput"
        @blur="commitEdit"
        @keydown.enter="commitEdit"
        @keydown.escape="cancelEdit"
      />
    </div>
    <input
      type="range"
      class="custom-slider"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      @input="onSliderInput"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    suffix?: string;
    /** 显示小数位数（默认 0 = 整数） */
    decimals?: number;
    /** 显示值的转换函数（如 opacity 需要 *100 显示为百分比） */
    displayTransform?: (val: number) => number;
    /** 输入值的逆转换函数（如百分比输入需要 /100 转回实际值） */
    inputTransform?: (val: number) => number;
  }>(),
  {
    step: 1,
    suffix: "px",
    decimals: 0,
    displayTransform: undefined,
    inputTransform: undefined,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
}>();

const isEditing = ref(false);
const editValue = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const displayValue = computed(() => {
  const val = props.displayTransform
    ? props.displayTransform(props.modelValue)
    : props.modelValue;
  const formatted =
    props.decimals > 0 ? val.toFixed(props.decimals) : String(Math.round(val));
  return `${formatted}${props.suffix}`;
});

function startEdit() {
  const val = props.displayTransform
    ? props.displayTransform(props.modelValue)
    : props.modelValue;
  editValue.value =
    props.decimals > 0
      ? parseFloat(val.toFixed(props.decimals))
      : Math.round(val);
  isEditing.value = true;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function onInput(e: Event) {
  editValue.value = Number((e.target as HTMLInputElement).value);
}

function commitEdit() {
  isEditing.value = false;
  let val = editValue.value;

  // 逆转换
  if (props.inputTransform) {
    val = props.inputTransform(val);
  }

  // 钳位
  val = Math.max(props.min, Math.min(props.max, val));
  emit("update:modelValue", val);
}

function cancelEdit() {
  isEditing.value = false;
}

function onSliderInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  emit("update:modelValue", val);
}
</script>

<style scoped>
.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 18px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.value {
  font-size: 11px;
  color: var(--el-text-color-primary);
  font-weight: 500;
  line-height: 18px;
}

.value.clickable {
  cursor: pointer;
  padding: 0 5px;
  border-radius: 4px;
  transition: all 0.12s ease;
  user-select: none;
  height: 18px;
  line-height: 18px;
}

.value.clickable:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

.value-input {
  width: 48px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--el-text-color-primary);
  font-size: 11px;
  font-weight: 500;
  text-align: right;
  outline: none;
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.15);
  box-sizing: border-box;
  line-height: 16px;
}

.value-input::-webkit-inner-spin-button,
.value-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.custom-slider {
  width: 100%;
  height: 18px;
  margin: 2px 0;
  padding: 0 2px;
  box-sizing: border-box;
  accent-color: var(--primary-color);
  cursor: pointer;
  outline: none;
}
</style>
