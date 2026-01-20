<template>
  <div class="ffmpeg-tool-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 工作台 -->
      <el-tab-pane name="workbench">
        <template #label>
          <div class="tab-label">
            <el-icon><LayoutDashboard /></el-icon>
            <span>工作台</span>
          </div>
        </template>
        <FFmpegWorkbench />
      </el-tab-pane>

      <!-- 任务监控 -->
      <el-tab-pane name="tasks">
        <template #label>
          <div class="tab-label">
            <el-icon><Activity /></el-icon>
            <span>任务监控</span>
            <el-badge
              v-if="activeTasksCount > 0"
              :value="activeTasksCount"
              type="primary"
              is-dot
              class="tab-badge"
            />
          </div>
        </template>
        <FFmpegTaskMonitor />
      </el-tab-pane>

      <!-- 设置 -->
      <el-tab-pane name="settings">
        <template #label>
          <div class="tab-label">
            <el-icon><Settings /></el-icon>
            <span>服务配置</span>
          </div>
        </template>
        <FFmpegSettings />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { LayoutDashboard, Activity, Settings } from "lucide-vue-next";
import { useFFmpegStore } from "./ffmpegStore";
import { useFFmpegCore } from "./composables/useFFmpegCore";
import FFmpegWorkbench from "./components/FFmpegWorkbench.vue";
import FFmpegTaskMonitor from "./components/FFmpegTaskMonitor.vue";
import FFmpegSettings from "./components/FFmpegSettings.vue";

const store = useFFmpegStore();
const { setupListeners } = useFFmpegCore();

const activeTab = ref("workbench");
const activeTasksCount = computed(() => store.activeTasks.length);

let unlisten: (() => void) | null = null;

onMounted(async () => {
  await store.init();
  unlisten = await setupListeners();
});

onUnmounted(() => {
  if (unlisten) unlisten();
});
</script>

<style scoped>
.ffmpeg-tool-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
}

.main-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.tab-badge {
  margin-left: -4px;
  margin-top: -8px;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>
