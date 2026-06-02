<template>
  <div class="llm-inspector-container">
    <!-- 顶部工具栏（D1） -->
    <HeaderToolbar
      :state="state"
      :records="records"
      :canStartInspector="canStartInspector"
      :isLoading="isLoading"
      @toggle-global="handleToggleGlobal"
      @toggle-internal="handleToggleInternal"
      @toggle-external="handleToggleExternal"
      @clear-records="handleClearRecords"
      @open-settings="showSettings = true"
    />

    <!-- 错误提示条 -->
    <div v-if="error" class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-text">{{ error }}</span>
      <button @click="clearError" class="error-close">×</button>
    </div>

    <!-- 主区：左右分栏（D4 可拖拽） -->
    <div
      :ref="(el) => (splitContainerRef = el as HTMLElement | null)"
      class="main-split"
      :class="{ 'is-dragging': isDragging }"
      :style="{
        gridTemplateColumns: `${splitRatio * 100}% 6px 1fr`,
      }"
    >
      <div class="pane pane-left">
        <RecordsList
          :records="records"
          :selectedRecord="selectedRecord"
          v-model:searchQuery="filterOptions.searchQuery"
          v-model:filterStatus="filterOptions.filterStatus"
          @select="selectRecord"
        />
      </div>

      <div
        class="split-divider"
        @mousedown="onDividerMouseDown"
        @dblclick="resetSplitRatio"
        title="拖动调整宽度，双击恢复默认"
      >
        <div class="divider-handle"></div>
      </div>

      <div class="pane pane-right">
        <RecordDetail
          :record="selectedRecord"
          :maskApiKeys="maskApiKeys"
          :autoEstimateTokens="autoEstimateTokens"
          @close="selectRecord(null)"
        />
      </div>
    </div>
    <!-- 设置抽屉（D2） -->
    <SettingsDrawer
      v-model:visible="showSettings"
      :config="config"
      :maskApiKeys="maskApiKeys"
      :autoEstimateTokens="autoEstimateTokens"
      :targetUrlHistory="targetUrlHistory"
      :currentTargetUrl="currentTargetUrl"
      :state="state"
      @update:config="handleUpdateConfig"
      @update:maskApiKeys="handleUpdateMaskApiKeys"
      @update:autoEstimateTokens="handleUpdateAutoEstimateTokens"
      @save-header-rules="handleSaveHeaderRules"
      @update-target-url="handleUpdateTargetUrl"
    />
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useInspectorManager } from "./composables/useInspectorManager";
import { useSplitPane } from "./composables/useSplitPane";
import { createModuleLogger } from "@utils/logger";
import RecordsList from "./components/RecordsList.vue";
import RecordDetail from "./components/RecordDetail.vue";
import HeaderToolbar from "./components/HeaderToolbar.vue";
import SettingsDrawer from "./components/SettingsDrawer.vue";
import type { HeaderOverrideRule, InspectorConfig } from "./types";

const logger = createModuleLogger("LlmInspector/View");

const {
  // 状态机
  state,

  // 兼容状态
  currentTargetUrl,
  config,
  maskApiKeys,
  autoEstimateTokens,
  isLoading,
  error,
  targetUrlHistory,
  layout,

  // 计算属性
  canStartInspector,

  // 数据
  records,
  selectedRecord,
  filterOptions,

  // 方法
  startInspector,
  stopInspector,
  updateTargetUrl,
  clearRecords,
  selectRecord,
  clearError,
} = useInspectorManager();

// === Split Pane 拖拽（D4） ===
const {
  ratio: splitRatio,
  containerRef: splitContainerRef,
  isDragging,
  onDividerMouseDown,
  resetRatio: resetSplitRatio,
} = useSplitPane({
  initialRatio: layout.value.splitRatio,
});

// 同步 layout → splitRatio（配置加载后）
watch(
  () => layout.value.splitRatio,
  (next) => {
    if (Math.abs(splitRatio.value - next) > 1e-4) {
      splitRatio.value = next;
    }
  }
);

// 同步 splitRatio → layout（拖拽后持久化）
watch(splitRatio, (next) => {
  if (Math.abs(layout.value.splitRatio - next) > 1e-4) {
    layout.value = { ...layout.value, splitRatio: next };
  }
});

// UI 局部状态
const showSettings = ref(false);

// === HeaderToolbar 事件 ===
function handleToggleGlobal() {
  state.isGlobalEnabled = !state.isGlobalEnabled;
  logger.debug("总开关切换", { isGlobalEnabled: state.isGlobalEnabled });
}

function handleToggleInternal() {
  if (!state.isGlobalEnabled) return;
  state.monitorInternal = !state.monitorInternal;
  logger.debug("内置监控切换", { monitorInternal: state.monitorInternal });
}

async function handleToggleExternal() {
  if (!state.isGlobalEnabled) return;
  try {
    if (state.externalProxyStatus === "running") {
      await stopInspector();
    } else if (
      state.externalProxyStatus === "stopped" ||
      state.externalProxyStatus === "error"
    ) {
      await startInspector();
    }
    // starting/stopping 状态时不响应（HeaderToolbar 已有 disabled 保护）
  } catch (err) {
    logger.error("切换外部代理失败", err as Error);
  }
}

function handleClearRecords() {
  clearRecords();
}

// === SettingsDrawer 事件 ===
function handleUpdateConfig(next: InspectorConfig) {
  config.value = next;
}

function handleUpdateMaskApiKeys(value: boolean) {
  maskApiKeys.value = value;
}

function handleUpdateAutoEstimateTokens(value: boolean) {
  autoEstimateTokens.value = value;
}

function handleSaveHeaderRules(rules: HeaderOverrideRule[]) {
  config.value.header_override_rules = rules;
  // 配置会通过 useInspectorManager 内的 watch 自动保存
}

async function handleUpdateTargetUrl() {
  try {
    await updateTargetUrl();
  } catch (err) {
    logger.error("更新目标地址失败", err as Error);
  }
}
</script>

<style scoped>
.llm-inspector-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--bg-color);
}

/* 错误提示条 */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border-bottom: var(--border-width) solid var(--el-color-danger, #f56c6c);
  color: var(--el-color-danger, #f56c6c);
  font-size: 13px;
}

.error-icon {
  font-size: 14px;
}

.error-text {
  flex: 1;
}

.error-close {
  background: transparent;
  border: none;
  color: var(--el-color-danger, #f56c6c);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.error-close:hover {
  background: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.2));
}

/* 主区：左右分栏（D4 三列：左 / 分割条 / 右） */
.main-split {
  flex: 1;
  display: grid;
  padding-top: 12px;
  min-height: 0;
  overflow: hidden;
  gap: 0;
}

.main-split.is-dragging {
  cursor: col-resize;
  user-select: none;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.pane-left {
  padding-right: 0;
}

.pane-right {
  padding-left: 0;
}

.pane :deep(.records-panel),
.pane :deep(.detail-panel) {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

/* 分割条 */
.split-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: col-resize;
  user-select: none;
  position: relative;
  transition: background-color 0.2s ease;
}

.split-divider::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  background: var(--border-color);
  transition:
    background-color 0.2s ease,
    width 0.2s ease;
}

.split-divider:hover::before,
.main-split.is-dragging .split-divider::before {
  background: var(--primary-color);
  width: 2px;
}

.divider-handle {
  width: 3px;
  height: 32px;
  border-radius: 2px;
  background: var(--border-color);
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background-color 0.2s ease;
  z-index: 1;
}

.split-divider:hover .divider-handle,
.main-split.is-dragging .divider-handle {
  opacity: 1;
  background: var(--primary-color);
}
</style>
