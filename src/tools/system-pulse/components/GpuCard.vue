<!-- src/tools/system-pulse/components/GpuCard.vue -->
<template>
  <div class="pulse-card gpu-card">
    <div class="card-header">
      <span class="gpu-name" :title="gpu.name">{{ gpu.name }}</span>
      <span class="card-value" :style="{ color: usageColor(gpu.usagePercent) }">
        {{ gpu.usagePercent.toFixed(1) }}%
      </span>
    </div>

    <SparklineChart :data="gpuUsageHistory" color="#f87171" :height="64" :max-value="100" unit="%" />

    <div class="card-stats">
      <div class="stat-item" v-if="gpu.temperatureCelsius !== null">
        <span class="stat-label">温度</span>
        <span class="stat-val" :style="{ color: tempColor(gpu.temperatureCelsius) }">
          {{ gpu.temperatureCelsius?.toFixed(0) }}°C
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">显存</span>
        <span class="stat-val"> {{ formatBytes(gpu.memoryUsedBytes) }} / {{ formatBytes(gpu.memoryTotalBytes) }} </span>
      </div>
      <div class="stat-item" v-if="gpu.encoderUsage !== null">
        <span class="stat-label">编码</span>
        <span class="stat-val">{{ gpu.encoderUsage?.toFixed(0) }}%</span>
      </div>
      <div class="stat-item" v-if="gpu.decoderUsage !== null">
        <span class="stat-label">解码</span>
        <span class="stat-val">{{ gpu.decoderUsage?.toFixed(0) }}%</span>
      </div>
    </div>

    <!-- 显存条形图 -->
    <div class="mem-bar-row">
      <div class="bar-track">
        <div class="bar-fill" :style="{ width: memPercent + '%' }" />
      </div>
      <span class="bar-pct">{{ memPercent.toFixed(0) }}%</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SparklineChart from "./SparklineChart.vue";
import { formatBytes, tempColor, usageColor } from "../utils/formatters";
import type { GpuSnapshot } from "../types/snapshot";

const props = defineProps<{
  gpu: GpuSnapshot;
  gpuHistory: { usage: number; temp: number }[];
}>();

const gpuUsageHistory = computed(() => props.gpuHistory.map((h) => h.usage));

const memPercent = computed(() =>
  props.gpu.memoryTotalBytes > 0 ? (props.gpu.memoryUsedBytes / props.gpu.memoryTotalBytes) * 100 : 0,
);
</script>

<style scoped>
.pulse-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.gpu-name {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.card-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.stat-val {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.mem-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bar-track {
  flex: 1;
  height: 5px;
  min-width: 40px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  transition: width 0.5s ease;
}

.bar-pct {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  width: 28px;
  text-align: right;
}
</style>
