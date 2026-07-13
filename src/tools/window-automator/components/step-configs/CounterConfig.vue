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

<script setup lang="ts">
/**
 * 循环计数步骤配置：上限次数 + 未达/达到跳转
 */
import type { CounterStepParams, FlowStep } from "../../types";

const props = defineProps<{
  params: CounterStepParams;
  steps: FlowStep[];
}>();
const emit = defineEmits<{
  (e: "update:params", value: CounterStepParams): void;
}>();

function update(patch: Partial<CounterStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}
</script>

<template>
  <div class="counter-config">
    <div class="row">
      <div class="field grow">
        <label>最大次数</label>
        <el-input-number
          :model-value="params.maxCount"
          :min="1"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => update({ maxCount: Number(v) || 1 })
          "
        />
      </div>
    </div>
    <div class="row">
      <div class="field grow">
        <label>未达上限时跳转</label>
        <el-select
          :model-value="params.notReachedGotoId"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ notReachedGotoId: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
      <div class="field grow">
        <label>达到上限时跳转</label>
        <el-select
          :model-value="params.reachedGotoId"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ reachedGotoId: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
    </div>
    <div class="hint">
      每次执行该步骤，自身计数器 +1；未达 maxCount 跳转到
      notReachedGoto，达到后跳转到 reachedGoto（留空则顺延下一步）。
    </div>
  </div>
</template>

<style scoped>
.counter-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}
.field.grow {
  flex: 1;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
