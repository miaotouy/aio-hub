<!-- src/tools/system-pulse/components/StatusBar.vue -->
<template>
  <div class="status-bar">
    <div class="status-item">
      <span class="status-label">CPU</span>
      <span class="status-val" :style="{ color: usageColor(latest.cpu.globalUsage) }">
        {{ latest.cpu.globalUsage.toFixed(0) }}%
      </span>
    </div>
    <div class="status-sep" />
    <div class="status-item">
      <span class="status-label">内存</span>
      <span class="status-val">{{ memPercent.toFixed(0) }}%</span>
    </div>
    <div class="status-sep" />
    <div class="status-item">
      <span class="status-label">↑</span>
      <span class="status-val up">{{ formatBytesPerSec(totalUp) }}</span>
    </div>
    <div class="status-item">
      <span class="status-label">↓</span>
      <span class="status-val down">{{ formatBytesPerSec(totalDown) }}</span>
    </div>
    <template v-if="latest.gpus.length > 0">
      <div class="status-sep" />
      <div class="status-item" v-for="gpu in latest.gpus" :key="gpu.index">
        <span class="status-label">GPU{{ gpu.index }}</span>
        <span class="status-val" :style="{ color: usageColor(gpu.usagePercent) }">
          {{ gpu.usagePercent.toFixed(0) }}%
        </span>
      </div>
    </template>
    <div class="status-time">{{ timeStr }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { formatBytesPerSec, usageColor } from "../utils/formatters";
import type { SystemSnapshot } from "../types/snapshot";

const props = defineProps<{ latest: SystemSnapshot }>();

const memPercent = computed(() =>
  props.latest.memory.totalBytes > 0 ? (props.latest.memory.usedBytes / props.latest.memory.totalBytes) * 100 : 0,
);

const totalUp = computed(() => props.latest.networks.reduce((s, n) => s + n.uploadBytesPerSec, 0));
const totalDown = computed(() => props.latest.networks.reduce((s, n) => s + n.downloadBytesPerSec, 0));

const timeStr = ref(new Date().toLocaleTimeString());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  timer = setInterval(() => {
    timeStr.value = new Date().toLocaleTimeString();
  }, 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  color: var(--el-text-color-secondary);
}

.status-val {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.status-val.up {
  color: #4a9eff;
}
.status-val.down {
  color: #fb923c;
}

.status-sep {
  width: 1px;
  height: 16px;
  background: var(--border-color);
}

.status-time {
  margin-left: auto;
  color: var(--el-text-color-secondary);
}
</style>
