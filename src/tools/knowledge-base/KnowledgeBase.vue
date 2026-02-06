<script setup lang="ts">
import { ref } from "vue";
import { LayoutDashboard, Settings, Activity, FlaskConical, BarChart3 } from "lucide-vue-next";
import WorkspaceView from "./views/WorkspaceView.vue";
import SettingsView from "./views/SettingsView.vue";
import StatisticsView from "./views/StatisticsView.vue";
import MonitorView from "./views/MonitorView.vue";
import PlaygroundView from "./views/PlaygroundView.vue";

const activeTab = ref("workspace");

const tabs = [
  { id: "workspace", label: "工作区", icon: LayoutDashboard, component: WorkspaceView },
  { id: "statistics", label: "统计", icon: BarChart3, component: StatisticsView },
  { id: "monitor", label: "监控", icon: Activity, component: MonitorView },
  { id: "playground", label: "实验室", icon: FlaskConical, component: PlaygroundView },
  { id: "settings", label: "设置", icon: Settings, component: SettingsView },
];
</script>

<template>
  <div class="knowledge-base-container">
    <el-tabs v-model="activeTab" class="kb-tabs">
      <el-tab-pane v-for="tab in tabs" :key="tab.id" :name="tab.id">
        <template #label>
          <div class="tab-label">
            <component :is="tab.icon" :size="16" />
            <span>{{ tab.label }}</span>
          </div>
        </template>

        <div class="tab-content">
          <keep-alive>
            <component :is="tab.component" v-if="activeTab === tab.id" />
          </keep-alive>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.knowledge-base-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.kb-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
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

.tab-content {
  height: 100%;
  width: 100%;
}

/* 调整 Element Plus Tabs 样式以适应无边框设计 */
:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>
