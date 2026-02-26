<script setup lang="ts">
import { ref } from "vue";
import { LayoutDashboard, Cookie, Network } from "lucide-vue-next";

// 组件导入
import DistilleryWorkbench from "./components/DistilleryWorkbench.vue";
import ApiSniffer from "./components/ApiSniffer.vue";
import CookieLab from "./components/CookieLab.vue";

const activeTab = ref("workbench");
</script>

<template>
  <div class="web-distillery-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 蒸馏工作台 -->
      <el-tab-pane name="workbench">
        <template #label>
          <div class="tab-label">
            <el-icon><LayoutDashboard /></el-icon>
            <span>蒸馏工作台</span>
          </div>
        </template>
        <DistilleryWorkbench />
      </el-tab-pane>

      <!-- Cookie 实验室 -->
      <el-tab-pane name="cookies">
        <template #label>
          <div class="tab-label">
            <el-icon><Cookie /></el-icon>
            <span>身份卡片</span>
          </div>
        </template>
        <div class="tab-content-padded">
          <CookieLab />
        </div>
      </el-tab-pane>

      <!-- API 嗅探 -->
      <el-tab-pane name="sniffer">
        <template #label>
          <div class="tab-label">
            <el-icon><Network /></el-icon>
            <span>API 嗅探</span>
          </div>
        </template>
        <div class="tab-content-padded">
          <ApiSniffer />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.web-distillery-container {
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

.tab-content-padded {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>
