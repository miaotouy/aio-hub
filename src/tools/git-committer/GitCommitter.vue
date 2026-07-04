<template>
  <div class="git-committer-container">
    <!-- 最左侧 Edge 级可展开垂直仓库栏 -->
    <RepoBar
      :is-pinned="isRepoBarPinned"
      @toggle-pin="isRepoBarPinned = !isRepoBarPinned"
      @open-settings="showSettings = true"
    />

    <!-- 中部操作栏 (Sidebar) -->
    <Sidebar
      v-if="currentRepoPath && currentRepoPath !== '__panorama__'"
      :style="{ width: sidebarWidth + 'px' }"
      @open-settings="showSettings = true"
    />
    <div
      v-if="currentRepoPath && currentRepoPath !== '__panorama__'"
      class="resize-handle"
      :class="{ active: isResizingSidebar }"
      @mousedown="startResizeSidebar"
      @dblclick="resetSidebarWidth"
    />

    <!-- 中间主区域 (MainArea) -->
    <div class="main-content-wrapper">
      <SettingsPanel v-if="showSettings" @close="showSettings = false" />
      <MainArea
        v-else
        :sidebar-width="sidebarWidth"
        :right-sidebar-width="rightSidebarWidth"
        :is-right-sidebar-expanded="isRightSidebarExpanded"
      />
    </div>

    <!-- 右侧图表侧边栏 (RightSidebar) -->
    <template
      v-if="
        currentRepoPath && currentRepoPath !== '__panorama__' && !showSettings
      "
    >
      <div
        v-if="isRightSidebarExpanded"
        class="resize-handle right"
        :class="{ active: isResizingRightSidebar }"
        @mousedown="startResizeRightSidebar"
        @dblclick="resetRightSidebarWidth"
      />
      <RightSidebar
        v-if="isRightSidebarExpanded"
        :style="{ width: rightSidebarWidth + 'px' }"
      />
    </template>

    <!-- 右侧栏折叠/展开悬浮按钮 -->
    <div
      v-if="
        currentRepoPath && currentRepoPath !== '__panorama__' && !showSettings
      "
      class="toggle-right-sidebar-btn"
      :class="{ 'is-expanded': isRightSidebarExpanded }"
      @click="isRightSidebarExpanded = !isRightSidebarExpanded"
    >
      <el-tooltip
        :content="isRightSidebarExpanded ? '收起历史与统计' : '展开历史与统计'"
        placement="left"
      >
        <el-button circle>
          <component
            :is="isRightSidebarExpanded ? PanelRightClose : PanelRight"
            :size="16"
          />
        </el-button>
      </el-tooltip>
    </div>

    <!-- 拖拽遮罩层，防止拖拽时鼠标滑入 iframe 或 Monaco 导致事件丢失 -->
    <div
      v-if="isResizingSidebar || isResizingRightSidebar"
      class="drag-overlay"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { PanelRight, PanelRightClose } from "lucide-vue-next";
import RepoBar from "./components/RepoBar.vue";
import Sidebar from "./components/Sidebar.vue";
import MainArea from "./components/MainArea.vue";
import RightSidebar from "./components/RightSidebar.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import {
  currentRepoPath,
  sidebarWidth,
  rightSidebarWidth,
  isRightSidebarExpanded,
  isRepoBarPinned,
  loadRepositories,
} from "./composables/useGitCommitterState";
import { refreshAllStatuses } from "./composables/useGitCommitterRunner";
import { useResizable } from "./composables/useResizable";

const showSettings = ref(false);

// ===== 侧边栏拖拽调整宽度 =====
const {
  isResizing: isResizingSidebar,
  startResize: startResizeSidebar,
  resetWidth: resetSidebarWidthRef,
} = useResizable({
  initialWidth: sidebarWidth,
  minWidth: 200,
  maxWidth: 480,
  getOffset: () => (isRepoBarPinned.value ? 240 : 64),
});

const resetSidebarWidth = () => {
  resetSidebarWidthRef(260);
};

// ===== 右侧栏拖拽调整宽度 =====
const {
  isResizing: isResizingRightSidebar,
  startResize: startResizeRightSidebar,
  resetWidth: resetRightSidebarWidthRef,
} = useResizable({
  initialWidth: rightSidebarWidth,
  minWidth: 220,
  maxWidth: 500,
  isRight: true,
});

const resetRightSidebarWidth = () => {
  resetRightSidebarWidthRef(280);
};

onMounted(async () => {
  await loadRepositories();
  await refreshAllStatuses();
  // 如果没有仓库，默认打开设置面板
  if (currentRepoPath.value === "") {
    showSettings.value = true;
  }
});
</script>

<style scoped>
.git-committer-container {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
  position: relative;
}

.main-content-wrapper {
  flex: 1;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: transparent;
}

/* 拖拽手柄 */
.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color 0.2s ease;
  z-index: 10;
  position: relative;
  flex-shrink: 0;
}

.resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 1px;
  width: 1px;
  background-color: var(--border-color);
}

.resize-handle:hover::after,
.resize-handle.active::after {
  background-color: var(--el-color-primary);
  width: 2px;
  left: 1px;
}

.resize-handle.right::after {
  left: auto;
  right: 1px;
}

.resize-handle.right:hover::after,
.resize-handle.right.active::after {
  right: 1px;
}

/* 右侧栏折叠/展开悬浮按钮 */
.toggle-right-sidebar-btn {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 40;
  transition: transform 0.3s ease;
}

/* 拖拽遮罩层 */
.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 9999;
  cursor: col-resize;
  background-color: transparent;
}
</style>
