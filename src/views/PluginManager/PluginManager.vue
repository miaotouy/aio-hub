<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import InstalledPlugins from './InstalledPlugins.vue';
import PluginMarket from './PluginMarket.vue';
import PluginSettingsPanel from './components/PluginSettingsPanel.vue';
import SidebarToggleIcon from '@/components/icons/SidebarToggleIcon.vue';
import type { PluginProxy } from '@/services/plugin-types';

// 当前激活的标签页
const activeTab = ref<'installed' | 'market'>('installed');

// 右侧配置面板状态
const isSettingsPanelCollapsed = ref(true);
const settingsPanelWidth = ref(400);
const selectedPlugin = ref<PluginProxy | null>(null);

// 拖拽状态
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartWidth = ref(0);

// 拖拽处理
const handleDragStart = (e: MouseEvent) => {
  isDragging.value = true;
  dragStartX.value = e.clientX;
  dragStartWidth.value = settingsPanelWidth.value;
  e.preventDefault();
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    const delta = e.clientX - dragStartX.value;
    const newWidth = dragStartWidth.value - delta; // 右侧边栏向左移动时宽度增加
    if (newWidth >= 300 && newWidth <= 800) {
      settingsPanelWidth.value = newWidth;
    }
  }
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

// 处理插件选择
const handlePluginSelect = (plugin: PluginProxy) => {
  selectedPlugin.value = plugin;
  // 如果插件有配置，自动展开配置面板
  if (plugin.manifest.settingsSchema) {
    isSettingsPanelCollapsed.value = false;
  }
};
</script>

<template>
  <div class="plugin-manager">
    <div class="plugin-manager-container">
      <!-- 主内容区域 -->
      <div class="main-content">
        <div class="plugin-manager-header">
          <h1 class="page-title">扩展中心</h1>
          <p class="page-description">管理和安装插件以扩展应用功能</p>
        </div>

        <el-tabs v-model="activeTab" class="plugin-tabs">
          <el-tab-pane label="已安装" name="installed">
            <InstalledPlugins @select-plugin="handlePluginSelect" />
          </el-tab-pane>
          
          <el-tab-pane label="发现" name="market">
            <PluginMarket />
          </el-tab-pane>
        </el-tabs>

        <!-- 配置面板折叠时的展开按钮 -->
        <div
          v-if="isSettingsPanelCollapsed && selectedPlugin?.manifest.settingsSchema"
          class="expand-button"
          @click="isSettingsPanelCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" flip />
          <svg class="arrow-icon expanded" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 右侧配置面板 -->
      <div
        v-if="!isSettingsPanelCollapsed"
        class="settings-panel"
        :style="{ width: `${settingsPanelWidth}px` }"
      >
        <!-- 折叠按钮 -->
        <div class="collapse-button" @click="isSettingsPanelCollapsed = true">
          <SidebarToggleIcon class="collapse-icon trapezoid" flip />
          <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <!-- 拖拽分隔条 -->
        <div
          class="resize-handle"
          @mousedown="handleDragStart"
          :class="{ dragging: isDragging }"
        ></div>

        <div class="panel-content">
          <PluginSettingsPanel :plugin="selectedPlugin" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.plugin-manager-container {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  position: relative;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.plugin-manager-header {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.page-description {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0;
}

.plugin-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 让标签页内容可滚动 */
.plugin-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.plugin-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
}

/* 右侧配置面板 */
.settings-panel {
  height: 100%;
  flex-shrink: 0;
  position: relative;
  display: flex;
  margin-left: 20px;
}

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 拖拽分隔条 */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  background-color: transparent;
  transition: background-color 0.2s;
  z-index: 10;
}

.resize-handle:hover,
.resize-handle.dragging {
  background-color: var(--primary-color);
}

/* 折叠按钮 */
.collapse-button {
  position: absolute;
  top: 50%;
  left: -20px;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 100;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.collapse-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}

.arrow-icon {
  width: 12px;
  height: 12px;
  position: absolute;
  z-index: 1;
  transition: transform 0.3s;
  color: var(--text-color-light);
  stroke: var(--text-color-light);
}

/* 展开按钮 */
.expand-button {
  position: absolute;
  top: 50%;
  right: -12px;
  width: 32px;
  height: 100px;
  cursor: pointer;
  z-index: 100;
  color: var(--border-color);
  transition: color 0.3s;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-button:hover {
  color: color-mix(in srgb, var(--primary-color) 40%, transparent);
}

.expand-icon {
  width: 40px;
  height: 40px;
  display: block;
  position: absolute;
}
</style>