<script setup lang="ts">
import { watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import ParameterPanel from "./ParameterPanel.vue";
import GenerationStream from "./GenerationStream.vue";
import AssetGallery from "./AssetGallery.vue";
import ModelSelectDialog from "@/components/common/ModelSelectDialog.vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { useLocalStorage } from "@vueuse/core";

const store = useMediaGenStore();

// 使用 localStorage 快速同步 UI 状态，避免异步初始化导致的闪烁
const leftCollapsed = useLocalStorage("media-gen-left-collapsed", false);
const rightCollapsed = useLocalStorage("media-gen-right-collapsed", false);

// 同步到 store (当 store 初始化完成后)
watch(
  () => store.isInitialized,
  (val) => {
    if (val) {
      store.settings.leftCollapsed = leftCollapsed.value;
      store.settings.rightCollapsed = rightCollapsed.value;
    }
  },
  { immediate: true }
);

// 监听 store 变化同步回 localStorage (确保设置页面修改也能同步)
watch(
  () => store.settings.leftCollapsed,
  (val) => {
    leftCollapsed.value = val;
  }
);
watch(
  () => store.settings.rightCollapsed,
  (val) => {
    rightCollapsed.value = val;
  }
);
</script>

<template>
  <div class="media-workbench">
    <!-- 左侧：参数配置面板 -->
    <div class="side-panel left" :class="{ collapsed: leftCollapsed }">
      <div class="panel-container">
        <ParameterPanel />
      </div>
      <div
        class="collapse-trigger"
        @click="
          leftCollapsed = !leftCollapsed;
          store.settings.leftCollapsed = leftCollapsed;
        "
      >
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
      <div
        class="collapse-trigger"
        @click="
          rightCollapsed = !rightCollapsed;
          store.settings.rightCollapsed = rightCollapsed;
        "
      >
        <el-icon><ChevronRight v-if="!rightCollapsed" /><ChevronLeft v-else /></el-icon>
      </div>
    </div>

    <!-- 全局弹窗提供者 -->
    <ModelSelectDialog />
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
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}
</style>
