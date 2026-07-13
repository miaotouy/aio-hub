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
 * 跳转步骤配置：目标步骤 ID
 */
import type { GotoStepParams, FlowStep } from "../../types";

const props = defineProps<{
  params: GotoStepParams;
  steps: FlowStep[];
  selfId: string;
}>();
const emit = defineEmits<{
  (e: "update:params", value: GotoStepParams): void;
}>();

function update(patch: Partial<GotoStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}
</script>

<template>
  <div class="goto-config">
    <div class="row">
      <div class="field grow">
        <label>跳转目标步骤</label>
        <el-select
          :model-value="params.targetStepId"
          placeholder="选择目标步骤"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ targetStepId: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps.filter((x) => x.id !== selfId)"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.goto-config {
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
  min-width: 220px;
}
.field.grow {
  flex: 1;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
