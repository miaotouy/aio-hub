<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

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

    <DropZone
      overlay
      hide-content
      show-overlay-on-drag
      directory-only
      multiple
      :disabled="isImportingRepositories"
      @drop="importRepositories"
    />
    <div v-if="isImportingRepositories" class="repository-scan-overlay">
      <LoaderCircle :size="22" class="spin" />
      <span>正在扫描 Git 仓库...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { LoaderCircle, PanelRight, PanelRightClose } from "lucide-vue-next";
import DropZone from "@/components/common/DropZone.vue";
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
  enableAutoRefresh,
  autoRefreshInterval,
  isRefreshing,
} from "./composables/useGitCommitterState";
import { refreshAllStatuses } from "./composables/useGitCommitterRunner";
import { useResizable } from "@/composables/useResizable";
import {
  importRepositories,
  isImportingRepositories,
} from "./composables/useGitRepositoryImport";

const showSettings = ref(false);

// 监听当前仓库路径变化，自动关闭设置面板
watch(currentRepoPath, () => {
  showSettings.value = false;
});

// ===== 侧边栏拖拽调整宽度 =====
const {
  isResizing: isResizingSidebar,
  startResize: startResizeSidebar,
  resetSize: resetSidebarWidthRef,
} = useResizable({
  size: sidebarWidth,
  minSize: 200,
  maxSize: 480,
  direction: "left",
});

const resetSidebarWidth = () => {
  resetSidebarWidthRef(260);
};

// ===== 右侧栏拖拽调整宽度 =====
const {
  isResizing: isResizingRightSidebar,
  startResize: startResizeRightSidebar,
  resetSize: resetRightSidebarWidthRef,
} = useResizable({
  size: rightSidebarWidth,
  minSize: 220,
  maxSize: 500,
  direction: "right",
});

const resetRightSidebarWidth = () => {
  resetRightSidebarWidthRef(280);
};

// ===== 自动刷新与智能轮询逻辑 =====
let refreshTimer: number | null = null;

const handleWindowFocus = () => {
  // 窗口聚焦时，如果未在刷新且有仓库，则自动刷新
  if (!isRefreshing.value && currentRepoPath.value) {
    refreshAllStatuses();
  }
};

const startPolling = () => {
  stopPolling();
  if (!enableAutoRefresh.value) return;

  const intervalMs = Math.max(3, autoRefreshInterval.value) * 1000; // 最小限制 3 秒，防止高频刷新
  refreshTimer = window.setInterval(() => {
    // 仅在窗口处于前台、未在刷新、且有仓库时轮询
    if (!document.hidden && !isRefreshing.value && currentRepoPath.value) {
      refreshAllStatuses();
    }
  }, intervalMs);
};

const stopPolling = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

// 监听自动刷新配置变化，动态调整轮询
watch([enableAutoRefresh, autoRefreshInterval], () => {
  startPolling();
});

onMounted(async () => {
  await loadRepositories();
  await refreshAllStatuses();

  // 注册窗口聚焦事件
  window.addEventListener("focus", handleWindowFocus);
  // 启动智能轮询
  startPolling();

  // 如果没有仓库，默认打开设置面板
  if (currentRepoPath.value === "") {
    showSettings.value = true;
  }
});

onUnmounted(() => {
  // 注销事件与清除定时器
  window.removeEventListener("focus", handleWindowFocus);
  stopPolling();
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

.repository-scan-overlay {
  position: absolute;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--container-bg) 88%, transparent);
  backdrop-filter: blur(var(--ui-blur));
}

.spin {
  animation: repository-scan-spin 0.9s linear infinite;
}

@keyframes repository-scan-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
