<!-- src/tools/system-pulse/components/GpuMonitor.vue -->
<template>
  <div v-if="gpus.length > 0" class="gpu-monitor">
    <GpuCard
      v-for="gpu in gpus"
      :key="gpu.index"
      :gpu="gpu"
      :gpu-history="gpuHistoryArrays.get(gpu.index) ?? []"
      :style="{ width: `calc(${100 / gpus.length}% - ${((gpus.length - 1) * 8) / gpus.length}px)` }"
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
  display: flex;
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
