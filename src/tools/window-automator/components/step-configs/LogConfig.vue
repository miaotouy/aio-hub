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
 * 日志步骤配置：文本 + 级别
 * 文本支持 {varName} 变量插值（运行时变量由 OCR 步骤填充）
 */
import type { LogStepParams, LogLevel } from "../../types";

const props = defineProps<{ params: LogStepParams }>();
const emit = defineEmits<{
  (e: "update:params", value: LogStepParams): void;
}>();

function update(patch: Partial<LogStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

const levels: Array<{ value: LogLevel; label: string }> = [
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "debug", label: "Debug" },
];
</script>

<template>
  <div class="log-config">
    <div class="row">
      <div class="field grow">
        <label>消息文本</label>
        <el-input
          :model-value="params.message"
          placeholder="例如：当前血量: {hp}"
          @update:model-value="
            (v: string | number) => update({ message: String(v ?? '') })
          "
        />
      </div>
      <div class="field">
        <label>级别</label>
        <el-select
          :model-value="params.level"
          @update:model-value="(v: LogLevel) => update({ level: v })"
        >
          <el-option
            v-for="l in levels"
            :key="l.value"
            :label="l.label"
            :value="l.value"
          />
        </el-select>
      </div>
    </div>
    <div class="hint">
      支持 {变量名} 插值；变量由 OCR 步骤通过 saveToVariable 写入。
    </div>
  </div>
</template>

<style scoped>
.log-config {
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
  min-width: 110px;
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
