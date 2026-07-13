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
  <div class="plugin-card-content">
    <div class="plugin-header">
      <span class="plugin-name">{{ message.pluginName }}</span>
      <el-tag size="small" :type="statusType" effect="dark">
        {{ statusText }}
      </el-tag>
    </div>

    <div class="step-info">
      <span class="step-name">{{ message.stepName }}</span>
    </div>

    <div class="step-message" v-if="message.message">
      {{ message.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PluginStepStatusMessage } from "../../types/protocol";

const props = defineProps<{
  message: PluginStepStatusMessage;
}>();

const statusType = computed(() => {
  switch (props.message.status) {
    case "completed":
      return "success";
    case "running":
      return "primary";
    case "failed":
      return "danger";
    default:
      return "info";
  }
});

const statusText = computed(() => {
  const texts: Record<string, string> = {
    pending: "等待中",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
  };
  return texts[props.message.status] || props.message.status;
});
</script>

<style scoped lang="css">
.plugin-card-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plugin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plugin-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.step-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-name {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.step-message {
  font-size: 11px;
  color: var(--el-text-color-tertiary);
  padding: 6px 8px;
  background: var(--el-bg-color-page);
  border-radius: 4px;
}
</style>
