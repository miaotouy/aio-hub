<template>
  <div class="llm-inspector-container">
    <!-- 顶部工具栏（D1） -->
    <HeaderToolbar
      :state="state"
      :records="records"
      v-model:searchQuery="filterOptions.searchQuery"
      v-model:filterStatus="filterOptions.filterStatus"
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

    <!-- 主区：左右分栏 -->
    <div class="main-split">
      <div class="pane pane-left">
        <RecordsList
          :records="records"
          :selectedRecord="selectedRecord"
          v-model:searchQuery="filterOptions.searchQuery"
          v-model:filterStatus="filterOptions.filterStatus"
          @select="selectRecord"
        />
      </div>

      <div class="pane pane-right">
        <RecordDetail
          :record="selectedRecord"
          :maskApiKeys="maskApiKeys"
          @close="selectRecord(null)"
        />
      </div>
    </div>

    <!-- 设置抽屉（D2） -->
    <SettingsDrawer
      v-model:visible="showSettings"
      :config="config"
      :maskApiKeys="maskApiKeys"
      :targetUrlHistory="targetUrlHistory"
      :currentTargetUrl="currentTargetUrl"
      :state="state"
      @update:config="handleUpdateConfig"
      @update:maskApiKeys="handleUpdateMaskApiKeys"
      @save-header-rules="handleSaveHeaderRules"
      @update-target-url="handleUpdateTargetUrl"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useInspectorManager } from "./composables/useProxyManager";
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
  isLoading,
  error,
  targetUrlHistory,

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

/* 主区：左右分栏 */
.main-split {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 3fr;
  gap: 12px;
  padding: 12px;
  min-height: 0;
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.pane :deep(.records-panel),
.pane :deep(.detail-panel) {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}
</style>
