<!-- src/tools/system-pulse/SystemPulse.vue -->
<template>
  <div class="system-pulse-root">
    <!-- 顶部工具栏 -->
    <div class="pulse-toolbar">
      <div class="toolbar-left">
        <el-icon class="pulse-icon" :class="{ 'is-active': isActive }"><Activity /></el-icon>
        <span class="toolbar-title">系统脉搏</span>
      </div>
      <div class="toolbar-right">
        <span class="status-text">{{ isActive ? "正在监控" : "监控已暂停" }}</span>
        <el-switch v-model="isActive" @change="handleToggle" inline-prompt active-text="开启" inactive-text="暂停" />
      </div>
    </div>

    <!-- 状态切换容器 -->
    <div class="pulse-content">
      <!-- 1. 初始状态（从未开启过且当前也没开启） -->
      <div v-if="!isActive && !store.latest" class="paused-state">
        <el-empty description="监控已暂停" :image-size="80">
          <el-button type="primary" @click="start">立即开启</el-button>
        </el-empty>
      </div>

      <!-- 2. 开启中但数据尚未到达 -->
      <div v-else-if="isActive && !store.latest" class="loading-state">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在采集系统数据…</span>
      </div>

      <!-- 3. 正常显示状态（只要有历史数据或当前正在运行就显示） -->
      <template v-else-if="store.latest">
        <!-- 主监控网格 -->
        <div class="monitor-grid" :class="{ 'is-paused': !isActive }">
          <CpuCard :cpu="store.latest.cpu" :cpu-history="store.cpuHistoryArray" class="grid-cpu" />
          <MemoryCard :memory="store.latest.memory" :mem-history="store.memHistoryArray" class="grid-mem" />
          <StorageGrid :disks="store.latest.disks" class="grid-disk" />
          <NetworkCard
            :networks="store.latest.networks"
            :network-history="store.networkHistoryArray"
            class="grid-net"
          />
        </div>

        <!-- GPU 区域 -->
        <GpuMonitor :gpus="store.latest.gpus" :gpu-history-arrays="store.gpuHistoryArrays" />

        <!-- 底部状态栏 -->
        <StatusBar :latest="store.latest" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loading } from "@element-plus/icons-vue";
import { Activity } from "lucide-vue-next";
import { useSystemPulse } from "./composables/useSystemPulse";
import CpuCard from "./components/CpuCard.vue";
import MemoryCard from "./components/MemoryCard.vue";
import StorageGrid from "./components/StorageGrid.vue";
import NetworkCard from "./components/NetworkCard.vue";
import GpuMonitor from "./components/GpuMonitor.vue";
import StatusBar from "./components/StatusBar.vue";

const { store, isActive, start, handleToggle } = useSystemPulse();
</script>

<style scoped>
.system-pulse-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.pulse-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 4px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-icon {
  font-size: 18px;
  color: var(--el-text-color-secondary);
  transition: color 0.3s;
}

.pulse-icon.is-active {
  color: var(--el-color-primary);
  filter: drop-shadow(0 0 4px var(--el-color-primary-light-3));
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.pulse-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.loading-state,
.paused-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.loading-state .el-icon {
  font-size: 32px;
}

.monitor-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr 1fr;
  gap: 8px;
}

@media (max-width: 1200px) {
  .monitor-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 700px) {
  .monitor-grid {
    grid-template-columns: 1fr;
  }
}
</style>
