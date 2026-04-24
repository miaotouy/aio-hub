<!-- src/tools/system-pulse/components/CpuCard.vue -->
<template>
  <div class="pulse-card cpu-card">
    <div class="card-header">
      <span class="card-title">CPU</span>
      <span class="card-value" :style="{ color: usageColor(cpu.globalUsage) }">
        {{ cpu.globalUsage.toFixed(1) }}%
      </span>
    </div>

    <SparklineChart :data="cpuHistory" color="#4a9eff" :height="64" :max-value="100" unit="%" />

    <div class="card-stats">
      <div class="stat-item">
        <span class="stat-label">实时频率</span>
        <span class="stat-val freq-live">{{ formatFrequency(cpu.frequencyMhz) }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">基准频率</span>
        <span class="stat-val">{{ formatFrequency(cpu.baseFrequencyMhz) }}</span>
      </div>
      <div class="stat-item" v-if="cpu.temperatureCelsius !== null">
        <span class="stat-label">温度</span>
        <span class="stat-val" :style="{ color: tempColor(cpu.temperatureCelsius) }">
          {{ cpu.temperatureCelsius?.toFixed(0) }}°C
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">进程</span>
        <span class="stat-val">{{ cpu.processCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">运行时间</span>
        <span class="stat-val uptime-val">{{ formatUptime(uptime) }}</span>
      </div>
    </div>
    <div class="card-brand" v-if="cpu.brand">
      {{ cpu.brand }}
    </div>

    <!-- 多核热力矩阵 -->
    <div class="core-grid" v-if="cpu.perCoreUsage.length > 0">
      <div
        v-for="(usage, i) in cpu.perCoreUsage"
        :key="i"
        class="core-cell"
        :title="`Core ${i}: ${usage.toFixed(1)}%`"
        :style="{ backgroundColor: coreColor(usage) }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SparklineChart from "./SparklineChart.vue";
import { formatFrequency, formatUptime, tempColor, usageColor } from "../utils/formatters";
import type { CpuSnapshot } from "../types/snapshot";

defineProps<{
  cpu: CpuSnapshot;
  cpuHistory: number[];
  uptime: number;
}>();

function coreColor(usage: number): string {
  const alpha = Math.max(0.15, usage / 100);
  if (usage >= 90) return `rgba(239,68,68,${alpha})`;
  if (usage >= 70) return `rgba(251,146,60,${alpha})`;
  return `rgba(74,158,255,${alpha})`;
}
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
}

.card-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.card-stats {
  display: flex;
  gap: 16px;
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

.card-brand {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uptime-val {
  font-variant-numeric: tabular-nums;
}

.core-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.core-cell {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  transition: background-color 0.3s;
}
</style>
