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
 * 延时步骤配置：基础时长 + 随机波动
 */
import type { DelayStepParams } from "../../types";

const props = defineProps<{ params: DelayStepParams }>();
const emit = defineEmits<{
  (e: "update:params", value: DelayStepParams): void;
}>();

function update(patch: Partial<DelayStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}
</script>

<template>
  <div class="delay-config">
    <div class="row">
      <div class="field grow">
        <label>基础时长 (ms)</label>
        <el-input-number
          :model-value="params.duration"
          :min="0"
          :step="100"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => update({ duration: Number(v) || 0 })
          "
        />
      </div>
      <div class="field grow">
        <label>随机波动 (±ms，0 表示精确)</label>
        <el-input-number
          :model-value="params.randomRange"
          :min="0"
          :step="50"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => update({ randomRange: Number(v) || 0 })
          "
        />
      </div>
    </div>
    <div class="hint">
      实际等待时长 = duration ± randomRange；用于模拟人手不规律操作。
    </div>
  </div>
</template>

<style scoped>
.delay-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
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
