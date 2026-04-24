<!-- src/tools/system-pulse/components/NetworkCard.vue -->
<template>
  <div class="pulse-card">
    <div class="card-header">
      <span class="card-title">网络</span>
      <div class="net-total">
        <span class="up-label">↑ {{ formatBytesPerSec(totalUp) }}</span>
        <span class="down-label">↓ {{ formatBytesPerSec(totalDown) }}</span>
      </div>
    </div>

    <div class="net-charts">
      <div class="chart-row">
        <span class="chart-label">↑</span>
        <SparklineChart :data="upHistory" color="#4a9eff" :height="36" :fill-area="true" />
      </div>
      <div class="chart-row">
        <span class="chart-label">↓</span>
        <SparklineChart :data="downHistory" color="#fb923c" :height="36" :fill-area="true" />
      </div>
    </div>

    <div class="net-interfaces">
      <div v-for="iface in networks" :key="iface.name" class="iface-row">
        <span class="iface-name">{{ iface.name }}</span>
        <span class="iface-up">↑ {{ formatBytesPerSec(iface.uploadBytesPerSec) }}</span>
        <span class="iface-down">↓ {{ formatBytesPerSec(iface.downloadBytesPerSec) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SparklineChart from "./SparklineChart.vue";
import { formatBytesPerSec } from "../utils/formatters";
import type { NetworkInterfaceSnapshot } from "../types/snapshot";

const props = defineProps<{
  networks: NetworkInterfaceSnapshot[];
  networkHistory: { up: number; down: number }[];
}>();

const totalUp = computed(() => props.networks.reduce((s, n) => s + n.uploadBytesPerSec, 0));
const totalDown = computed(() => props.networks.reduce((s, n) => s + n.downloadBytesPerSec, 0));
const upHistory = computed(() => props.networkHistory.map((h) => h.up));
const downHistory = computed(() => props.networkHistory.map((h) => h.down));
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

.net-total {
  display: flex;
  gap: 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.up-label {
  color: #4a9eff;
}
.down-label {
  color: #fb923c;
}

.net-charts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chart-label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  width: 10px;
  flex-shrink: 0;
}

.net-interfaces {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.iface-row {
  display: flex;
  gap: 8px;
  font-size: 10px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.iface-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.iface-up {
  color: #4a9eff;
}
.iface-down {
  color: #fb923c;
}
</style>
