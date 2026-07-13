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
  <div class="aio-file-operator-container">
    <!-- 头部区域（包裹在精致的 card-glass 容器中） -->
    <div class="header-section card-glass">
      <div class="title-area">
        <div class="text-info">
          <h2>本地文件操作器</h2>
          <p>为 AI 智能体提供安全、受控的本地物理文件读写与目录管理能力</p>
        </div>
      </div>
      <div class="status-badge" :class="{ active: isDistributedExposed }">
        <span class="dot"></span>
        {{ distributedStatusText }}
      </div>
    </div>

    <!-- 主体内容 -->
    <div class="main-content">
      <!-- 左侧配置面板 -->
      <div class="left-panel">
        <SecurityConfigPanel
          :config="config"
          :max-file-size-m-b="maxFileSizeMB"
          v-model:new-directory-path="newDirectoryPath"
          v-model:new-rule-path="newRulePath"
          v-model:new-rule-type="newRuleType"
          @save-config="saveConfig"
          @update-max-file-size="updateMaxFileSize"
          @handle-path-drop="handlePathDrop"
          @select-directory="selectDirectory"
          @add-new-directory="addNewDirectory"
          @remove-directory="removeDirectory"
          @reset-to-default="resetToDefault"
          @select-rule-path="selectRulePath"
          @handle-rule-path-drop="handleRulePathDrop"
          @add-new-rule="addNewRule"
          @remove-rule="removeRule"
        />
      </div>

      <!-- 拖拽分割线 -->
      <div
        v-show="!config.isLogCollapsed"
        class="resizer"
        :class="{ 'is-dragging': isDragging }"
        @mousedown="startResize"
      >
        <div class="resizer-line"></div>
      </div>

      <!-- 右侧审计日志面板 -->
      <div
        class="right-panel"
        :style="{
          width: config.isLogCollapsed
            ? '40px'
            : `${config.logPanelWidth || 350}px`,
        }"
      >
        <AuditLogPanel
          :logs="logs"
          :sorted-logs="sortedLogs"
          :is-collapsed="!!config.isLogCollapsed"
          @update:is-collapsed="handleCollapsedChange"
          @clear-logs="clearLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useFileOperator } from "./composables/useFileOperator";
import { useResizable } from "@/composables/useResizable";
import SecurityConfigPanel from "./components/SecurityConfigPanel.vue";
import AuditLogPanel from "./components/AuditLogPanel.vue";

const {
  config,
  maxFileSizeMB,
  logs,
  newDirectoryPath,
  newRulePath,
  newRuleType,
  isDistributedExposed,
  distributedStatusText,
  sortedLogs,
  loadConfig,
  saveConfig,
  updateMaxFileSize,
  handlePathDrop,
  selectDirectory,
  addNewDirectory,
  removeDirectory,
  resetToDefault,
  selectRulePath,
  handleRulePathDrop,
  addNewRule,
  removeRule,
  refreshLogs,
  clearLogs,
} = useFileOperator();
// 拖拽调整大小
const logPanelWidthRef = ref(config.value.logPanelWidth || 350);

// 监听 config.logPanelWidth 的变化，同步到本地 ref
watch(
  () => config.value.logPanelWidth,
  (newVal) => {
    if (newVal) {
      logPanelWidthRef.value = newVal;
    }
  }
);

const { isResizing: isDragging, startResize } = useResizable({
  size: logPanelWidthRef,
  minSize: 250,
  maxSize: 600,
  direction: "right", // 右侧面板，往左拖拽变大
});

// 监听拖拽状态，结束时保存配置
watch(isDragging, (newVal) => {
  if (!newVal) {
    config.value.logPanelWidth = logPanelWidthRef.value;
    saveConfig();
  }
});

// 初始化
onMounted(async () => {
  await loadConfig();
  await refreshLogs();
  if (config.value.logPanelWidth) {
    logPanelWidthRef.value = config.value.logPanelWidth;
  }
});

// 处理折叠状态变化
const handleCollapsedChange = (val: boolean) => {
  config.value.isLogCollapsed = val;
  saveConfig();
};
</script>

<style scoped>
.aio-file-operator-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
  background-color: transparent;
  overflow: hidden;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-radius: 12px;
}

.title-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-info h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.text-info p {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background-color: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-text-color-regular);
  border: 1px solid var(--border-color);
}

.status-badge.active {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
}

.status-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-text-color-secondary);
}

.status-badge.active .dot {
  background-color: var(--el-color-success);
  box-shadow: 0 0 8px var(--el-color-success);
}

.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
  overflow: hidden;
}

.left-panel {
  flex: 1;
  min-width: 0;
  height: 100%;
}

.right-panel {
  height: 100%;
  flex-shrink: 0;
}

/* 拖拽分割线 */
.resizer {
  width: 12px;
  cursor: col-resize;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 10;
  user-select: none;
  height: 100%;
}

.resizer-line {
  width: 2px;
  height: 40px;
  background-color: var(--border-color);
  border-radius: 1px;
  transition:
    background-color 0.2s,
    height 0.2s;
}

.resizer:hover .resizer-line,
.resizer.is-dragging .resizer-line {
  background-color: var(--el-color-primary);
  height: 100%;
}

.card-glass {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
}
</style>
