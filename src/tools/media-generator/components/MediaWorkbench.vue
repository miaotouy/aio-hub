<script setup lang="ts">
import { ref } from "vue";
import ParameterPanel from "./ParameterPanel.vue";
import GenerationStream from "./GenerationStream.vue";
import AssetGallery from "./AssetGallery.vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

// 侧边栏折叠状态
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
</script>

<template>
  <div class="media-workbench">
    <!-- 左侧：参数配置面板 -->
    <div class="side-panel left" :class="{ collapsed: leftCollapsed }">
      <div class="panel-container">
        <ParameterPanel />
      </div>
      <div class="collapse-trigger" @click="leftCollapsed = !leftCollapsed">
        <el-icon><ChevronLeft v-if="!leftCollapsed" /><ChevronRight v-else /></el-icon>
      </div>
    </div>

    <!-- 中间：生成流 (核心对话/任务区) -->
    <div class="main-content">
      <GenerationStream />
    </div>

    <!-- 右侧：资产画廊 -->
    <div class="side-panel right" :class="{ collapsed: rightCollapsed }">
      <div class="panel-container">
        <AssetGallery />
      </div>
      <div class="collapse-trigger" @click="rightCollapsed = !rightCollapsed">
        <el-icon><ChevronRight v-if="!rightCollapsed" /><ChevronLeft v-else /></el-icon>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-workbench {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  overflow: hidden;
}

.media-workbench * {
  box-sizing: border-box;
}

.side-panel {
  position: relative;
  height: 100%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.panel-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.side-panel.left {
  width: 320px;
  border-right: 1px solid var(--border-color);
}

.side-panel.right {
  width: 300px;
  border-right: none;
  border-left: 1px solid var(--border-color);
}

.side-panel.collapsed {
  width: 0;
  border: none;
}

.side-panel.collapsed .panel-container {
  display: none;
}

.main-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.collapse-trigger {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 48px;
  background-color: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.2s;
}

.side-panel.left .collapse-trigger {
  right: -16px;
  border-left: none;
  border-radius: 0 4px 4px 0;
}

.side-panel.right .collapse-trigger {
  left: -16px;
  border-right: none;
  border-radius: 4px 0 0 4px;
}

.collapse-trigger:hover {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
</style>
