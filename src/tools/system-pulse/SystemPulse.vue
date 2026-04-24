<!-- src/tools/system-pulse/SystemPulse.vue -->
<template>
  <div class="system-pulse-root" :class="[`size-${store.uiSize}`]">
    <!-- 顶部工具栏 -->
    <div class="pulse-toolbar">
      <div class="toolbar-left">
        <el-icon class="pulse-icon" :class="{ 'is-active': isActive }"><Activity /></el-icon>
        <span class="toolbar-title">系统脉搏</span>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-actions">
          <el-tooltip content="复制当前状态" placement="bottom">
            <el-button circle @click="copyCurrentStats" :disabled="!store.latest">
              <el-icon><Copy /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="导出历史记录 (JSON)" placement="bottom">
            <el-button circle @click="exportHistory" :disabled="store.fullHistoryArray.length === 0">
              <el-icon><Download /></el-icon>
            </el-button>
          </el-tooltip>

          <el-dropdown trigger="click" @command="store.setUiSize">
            <el-button circle>
              <el-icon><Layout /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="small" :disabled="store.uiSize === 'small'">
                  紧凑 (Small)
                </el-dropdown-item>
                <el-dropdown-item command="medium" :disabled="store.uiSize === 'medium'">
                  标准 (Medium)
                </el-dropdown-item>
                <el-dropdown-item command="large" :disabled="store.uiSize === 'large'">
                  宽大 (Large)
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <el-divider direction="vertical" />

        <span class="status-text">{{ isActive ? "正在监控" : "监控已暂停" }}</span>

        <el-switch
          :model-value="isActive"
          @change="handleToggle"
          inline-prompt
          active-text="开启"
          inactive-text="暂停"
        />
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
        <!-- 状态栏 -->
        <StatusBar :latest="store.latest" />
        <!-- 统一监控网格 -->
        <div class="monitor-grid" :class="{ 'is-paused': !isActive }">
          <CpuCard
            :cpu="store.latest.cpu"
            :cpu-history="store.cpuHistoryArray"
            :uptime="store.latest.uptime"
            class="grid-cpu"
          />
          <MemoryCard :memory="store.latest.memory" :mem-history="store.memHistoryArray" class="grid-mem" />
          <StorageGrid :disks="store.latest.disks" class="grid-disk" />
          <NetworkCard
            :networks="store.latest.networks"
            :network-history="store.networkHistoryArray"
            class="grid-net"
          />
          <!-- GPU 区域集成到网格中 -->
          <GpuCard
            v-for="gpu in store.latest.gpus"
            :key="gpu.index"
            :gpu="gpu"
            :gpu-history="store.gpuHistoryArrays.get(gpu.index) ?? []"
            class="grid-gpu"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Loading } from "@element-plus/icons-vue";
import { Activity, Copy, Download, Layout } from "lucide-vue-next";
import { useSystemPulse } from "./composables/useSystemPulse";
import CpuCard from "./components/CpuCard.vue";
import MemoryCard from "./components/MemoryCard.vue";
import StorageGrid from "./components/StorageGrid.vue";
import NetworkCard from "./components/NetworkCard.vue";
import GpuCard from "./components/GpuCard.vue";
import StatusBar from "./components/StatusBar.vue";

const { store, isActive, start, handleToggle, copyCurrentStats, exportHistory } = useSystemPulse();
</script>

<style scoped>
.system-pulse-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;

  /* 默认变量 (Medium) */
  --pulse-grid-min-width: 340px;
  --pulse-card-padding: 16px;
  --pulse-chart-height: 80px;
  --pulse-font-size-base: 14px;
}

.system-pulse-root.size-small {
  --pulse-grid-min-width: 280px;
  --pulse-card-padding: 12px;
  --pulse-chart-height: 60px;
  --pulse-font-size-base: 13px;
}

.system-pulse-root.size-large {
  --pulse-grid-min-width: 460px;
  --pulse-card-padding: 24px;
  --pulse-chart-height: 120px;
  --pulse-font-size-base: 16px;
}

.pulse-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 4px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pulse-icon {
  font-size: 22px;
  color: var(--el-text-color-secondary);
  transition: color 0.3s;
}

.pulse-icon.is-active {
  color: var(--el-color-primary);
  filter: drop-shadow(0 0 6px var(--el-color-primary-light-3));
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.status-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.pulse-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  grid-template-columns: repeat(auto-fill, minmax(var(--pulse-grid-min-width), 1fr));
  grid-auto-flow: dense;
  gap: 12px;
}

/* 磁盘卡片通常比较长，尝试让它跨行以填补空间 */
.grid-disk {
  grid-row: span 2;
}

/* 只有在 Large 模式下且屏幕足够宽时，才强制一些跨行逻辑，否则让 auto-fill 自由发挥 */
@media (min-width: 1400px) {
  .size-large .grid-disk {
    grid-column: span 2;
  }
}
</style>
