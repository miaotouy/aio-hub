<!-- src/tools/system-pulse/components/StorageGrid.vue -->
<template>
  <div class="pulse-card">
    <div class="card-header">
      <span class="card-title">磁盘</span>
    </div>
    <div class="disk-grid">
      <div v-for="disk in disks" :key="disk.mountPoint" class="disk-item">
        <div class="disk-info-row">
          <div class="disk-main-info">
            <span class="disk-name" :title="disk.mountPoint">{{ disk.name || disk.mountPoint }}</span>
            <span class="disk-detail">{{ formatBytes(disk.usedBytes) }} / {{ formatBytes(disk.totalBytes) }}</span>
          </div>
          <span class="disk-usage-pct">{{ diskPercent(disk).toFixed(0) }}%</span>
        </div>

        <div class="bar-track">
          <div class="bar-fill" :style="{ width: diskPercent(disk) + '%', backgroundColor: diskColor(disk) }" />
        </div>

        <!-- 读写速率与趋势图 -->
        <div class="disk-io-row">
          <div class="io-stats">
            <div class="io-item read">
              <span class="io-label">读</span>
              <span class="io-value">{{ formatBytesPerSec(disk.readBytesPerSec) }}</span>
            </div>
            <div class="io-item write">
              <span class="io-label">写</span>
              <span class="io-value">{{ formatBytesPerSec(disk.writeBytesPerSec) }}</span>
            </div>
          </div>
          <div class="io-chart">
            <SparklineChart :data="getDiskHistory(disk.mountPoint)" :height="32" area />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatBytes, formatBytesPerSec } from "../utils/formatters";
import type { DiskSnapshot } from "../types/snapshot";
import { useSystemPulseStore } from "../store/useSystemPulseStore";
import SparklineChart from "./SparklineChart.vue";

defineProps<{
  disks: DiskSnapshot[];
}>();

const store = useSystemPulseStore();

function getDiskHistory(mountPoint: string) {
  const history = store.diskHistoryArrays.get(mountPoint) || [];
  return [
    {
      name: "读取",
      data: history.map((h: any) => h.read),
      color: "#4ade80",
    },
    {
      name: "写入",
      data: history.map((h: any) => h.write),
      color: "#fb923c",
    },
  ];
}

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
}

.card-title {
  font-size: calc(var(--pulse-font-size-base) * 0.85);
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.disk-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.disk-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.disk-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.disk-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.disk-main-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.disk-name {
  font-size: calc(var(--pulse-font-size-base) * 1);
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disk-detail {
  font-size: calc(var(--pulse-font-size-base) * 0.75);
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.disk-usage-group {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  width: 100px;
}

.disk-usage-pct {
  font-size: calc(var(--pulse-font-size-base) * 0.85);
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.bar-track {
  height: 4px;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 2px;
  transition:
    width 0.5s ease,
    background-color 0.3s;
}

.disk-io-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.io-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 85px;
}

.io-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: calc(var(--pulse-font-size-base) * 0.75);
}

.io-label {
  color: var(--el-text-color-secondary);
  width: 12px;
}

.io-value {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.io-item.read .io-label {
  color: #4ade80;
}
.io-item.write .io-label {
  color: #fb923c;
}

.io-chart {
  flex: 1;
  height: 32px;
  min-width: 0;
  opacity: 0.8;
}
</style>
