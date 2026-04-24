<!-- src/tools/system-pulse/components/MemoryCard.vue -->
<template>
  <div class="pulse-card">
    <div class="card-header">
      <span class="card-title">内存</span>
      <span class="card-value" :style="{ color: usageColor(memPercent) }"> {{ memPercent.toFixed(1) }}% </span>
    </div>

    <SparklineChart
      :data="memHistory"
      color="#a78bfa"
      :height="'var(--pulse-chart-height)'"
      :max-value="100"
      unit="%"
    />

    <div class="mem-bars">
      <!-- 物理内存 -->
      <div class="bar-row">
        <span class="bar-label">RAM</span>
        <div class="bar-track">
          <div class="bar-fill ram" :style="{ width: memPercent + '%' }" />
        </div>
        <span class="bar-text"> {{ formatBytes(memory.usedBytes) }} / {{ formatBytes(memory.totalBytes) }} </span>
      </div>
      <!-- Swap -->
      <div class="bar-row" v-if="memory.swapTotalBytes > 0">
        <span class="bar-label">Swap</span>
        <div class="bar-track">
          <div class="bar-fill swap" :style="{ width: swapPercent + '%' }" />
        </div>
        <span class="bar-text">
          {{ formatBytes(memory.swapUsedBytes) }} / {{ formatBytes(memory.swapTotalBytes) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SparklineChart from "./SparklineChart.vue";
import { formatBytes, usageColor } from "../utils/formatters";
import type { MemorySnapshot } from "../types/snapshot";

const props = defineProps<{
  memory: MemorySnapshot;
  memHistory: number[];
}>();

const memPercent = computed(() =>
  props.memory.totalBytes > 0 ? (props.memory.usedBytes / props.memory.totalBytes) * 100 : 0,
);

const swapPercent = computed(() =>
  props.memory.swapTotalBytes > 0 ? (props.memory.swapUsedBytes / props.memory.swapTotalBytes) * 100 : 0,
);
</script>

<style scoped>
.pulse-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  padding: var(--pulse-card-padding);
  display: flex;
  flex-direction: column;
  gap: calc(var(--pulse-card-padding) * 0.75);
  min-width: 0;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: calc(var(--pulse-font-size-base) * 0.85);
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-value {
  font-size: calc(var(--pulse-font-size-base) * 1.6);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mem-bars {
  display: flex;
  flex-direction: column;
  gap: calc(var(--pulse-card-padding) * 0.6);
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.bar-label {
  font-size: calc(var(--pulse-font-size-base) * 0.85);
  color: var(--el-text-color-secondary);
  width: calc(var(--pulse-font-size-base) * 2.5);
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: calc(var(--pulse-font-size-base) * 0.7);
  min-width: 40px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
}

.bar-fill.ram {
  background: linear-gradient(90deg, #a78bfa, #7c3aed);
}

.bar-fill.swap {
  background: linear-gradient(90deg, #fb923c, #ea580c);
}

.bar-text {
  font-size: calc(var(--pulse-font-size-base) * 0.85);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
