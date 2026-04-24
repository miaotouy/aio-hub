<!-- src/tools/system-pulse/components/StorageGrid.vue -->
<template>
  <div class="pulse-card">
    <div class="card-header">
      <span class="card-title">磁盘</span>
    </div>
    <div class="disk-grid">
      <div v-for="disk in disks" :key="disk.name" class="disk-item">
        <div class="disk-top">
          <span class="disk-name">{{ disk.name }}</span>
          <span class="disk-usage">{{ diskPercent(disk).toFixed(0) }}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: diskPercent(disk) + '%', backgroundColor: diskColor(disk) }" />
        </div>
        <div class="disk-detail">
          <span>{{ formatBytes(disk.usedBytes) }} / {{ formatBytes(disk.totalBytes) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatBytes } from "../utils/formatters";
import type { DiskSnapshot } from "../types/snapshot";

defineProps<{
  disks: DiskSnapshot[];
}>();

function diskPercent(disk: DiskSnapshot): number {
  return disk.totalBytes > 0 ? (disk.usedBytes / disk.totalBytes) * 100 : 0;
}

function diskColor(disk: DiskSnapshot): string {
  const p = diskPercent(disk);
  if (p >= 90) return "var(--el-color-danger)";
  if (p >= 75) return "#fb923c";
  return "#4ade80";
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
}

.card-header {
  display: flex;
  justify-content: space-between;
}

.card-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.disk-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.disk-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.disk-top {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-primary);
}

.disk-name {
  font-weight: 500;
}

.disk-usage {
  font-variant-numeric: tabular-nums;
}

.bar-track {
  height: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition:
    width 0.5s ease,
    background-color 0.3s;
}

.disk-detail {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
