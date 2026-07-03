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

<!-- src/tools/system-pulse/components/GpuMonitor.vue -->
<template>
  <div v-if="gpus.length > 0" class="gpu-monitor">
    <GpuCard
      v-for="gpu in gpus"
      :key="gpu.index"
      :gpu="gpu"
      :gpu-history="gpuHistoryArrays.get(gpu.index) ?? []"
    />
  </div>
  <div v-else class="gpu-empty pulse-card">
    <span class="empty-text">未检测到 GPU（或 NVML 不可用）</span>
  </div>
</template>

<script setup lang="ts">
import GpuCard from "./GpuCard.vue";
import type { GpuSnapshot } from "../types/snapshot";

defineProps<{
  gpus: GpuSnapshot[];
  gpuHistoryArrays: Map<number, { usage: number; temp: number }[]>;
}>();
</script>

<style scoped>
.gpu-monitor {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}

.gpu-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
}

.pulse-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  flex: 1;
}

.empty-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
