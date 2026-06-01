<template>
  <div class="header-toolbar">
    <!-- 左侧：总开关 -->
    <div class="toolbar-section toolbar-left">
      <div
        class="global-toggle"
        :class="{
          active: state.isGlobalEnabled,
          'has-active-monitor':
            state.isGlobalEnabled &&
            (state.monitorInternal || state.monitorExternal),
        }"
        @click="$emit('toggle-global')"
        :title="
          state.isGlobalEnabled
            ? '点击关闭检查器总开关'
            : '点击开启检查器总开关'
        "
      >
        <span class="status-dot"></span>
        <span class="brand-text">INSPECTOR</span>
      </div>
    </div>

    <!-- 中间：模式切换 -->
    <div class="toolbar-section toolbar-center">
      <div
        class="mode-toggle"
        :class="{
          active: effectiveInternal,
          disabled: !state.isGlobalEnabled,
        }"
        @click="handleInternalToggle"
        :title="
          !state.isGlobalEnabled
            ? '请先开启总开关'
            : effectiveInternal
              ? '点击关闭内置监控'
              : '点击开启内置监控'
        "
      >
        <span class="mode-icon">🪝</span>
        <span class="mode-label">内置监控</span>
        <span class="mode-state">{{ effectiveInternal ? "ON" : "OFF" }}</span>
      </div>

      <div
        class="mode-toggle"
        :class="{
          active: externalRunning,
          'is-transitioning': externalTransitioning,
          'has-error': state.externalProxyStatus === 'error',
          disabled: !state.isGlobalEnabled || externalTransitioning,
        }"
        @click="handleExternalToggle"
        :title="externalTooltip"
      >
        <span v-if="externalTransitioning" class="mode-icon spinning">⟳</span>
        <span v-else class="mode-icon">🌐</span>
        <span class="mode-label">外部代理</span>
        <span class="mode-state">{{ externalStateLabel }}</span>
      </div>
    </div>

    <!-- 右侧：操作 -->
    <div class="toolbar-section toolbar-right">
      <div class="search-wrapper" :class="{ expanded: searchExpanded }">
        <button
          class="icon-button"
          @click="toggleSearch"
          :title="searchExpanded ? '收起搜索' : '展开搜索'"
        >
          <span>🔍</span>
        </button>
        <input
          v-if="searchExpanded"
          ref="searchInputRef"
          :value="searchQuery"
          @input="
            $emit(
              'update:searchQuery',
              ($event.target as HTMLInputElement).value
            )
          "
          @blur="handleSearchBlur"
          @keydown.esc="closeSearch"
          type="text"
          placeholder="搜索 URL 或内容..."
          class="search-input"
        />
      </div>

      <select
        :value="filterStatus"
        @change="
          $emit(
            'update:filterStatus',
            ($event.target as HTMLSelectElement).value
          )
        "
        class="filter-select"
        title="按状态过滤"
      >
        <option value="">全部</option>
        <option value="2xx">2xx 成功</option>
        <option value="4xx">4xx 客户端错误</option>
        <option value="5xx">5xx 服务器错误</option>
      </select>

      <button
        class="icon-button"
        :disabled="records.length === 0"
        @click="$emit('clear-records')"
        title="清空所有记录"
      >
        <span>🗑️</span>
      </button>

      <button
        class="icon-button settings-button"
        @click="$emit('open-settings')"
        title="设置"
      >
        <span>⚙️</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import type { CombinedRecord } from "../types";
import type { InspectorState } from "../types/hooks";

interface Props {
  state: InspectorState;
  records: CombinedRecord[];
  searchQuery: string;
  filterStatus: string;
  canStartInspector: boolean;
  isLoading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:searchQuery": [value: string];
  "update:filterStatus": [value: string];
  "toggle-global": [];
  "toggle-internal": [];
  "toggle-external": [];
  "clear-records": [];
  "open-settings": [];
}>();

const searchExpanded = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

// 计算属性
const effectiveInternal = computed(
  () => props.state.isGlobalEnabled && props.state.monitorInternal
);

const externalRunning = computed(
  () => props.state.externalProxyStatus === "running"
);

const externalTransitioning = computed(
  () =>
    props.state.externalProxyStatus === "starting" ||
    props.state.externalProxyStatus === "stopping"
);

const externalStateLabel = computed(() => {
  switch (props.state.externalProxyStatus) {
    case "running":
      return "ON";
    case "starting":
      return "启动中";
    case "stopping":
      return "停止中";
    case "error":
      return "错误";
    case "stopped":
    default:
      return "OFF";
  }
});

const externalTooltip = computed(() => {
  if (!props.state.isGlobalEnabled) return "请先开启总开关";
  switch (props.state.externalProxyStatus) {
    case "running":
      return "点击停止外部代理";
    case "starting":
      return "外部代理启动中…";
    case "stopping":
      return "外部代理停止中…";
    case "error":
      return "代理出错，点击重试";
    case "stopped":
    default:
      return "点击启动外部代理";
  }
});

// 事件处理
function handleInternalToggle() {
  if (!props.state.isGlobalEnabled) return;
  emit("toggle-internal");
}

function handleExternalToggle() {
  if (!props.state.isGlobalEnabled) return;
  if (externalTransitioning.value) return;
  emit("toggle-external");
}

async function toggleSearch() {
  searchExpanded.value = !searchExpanded.value;
  if (searchExpanded.value) {
    await nextTick();
    searchInputRef.value?.focus();
  }
}

function closeSearch() {
  searchExpanded.value = false;
}

function handleSearchBlur() {
  // 失焦后如果搜索为空，自动收起
  if (!props.searchQuery) {
    searchExpanded.value = false;
  }
}
</script>

<style scoped>
.header-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: var(--container-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  gap: 16px;
  box-sizing: border-box;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-left {
  flex: 0 0 auto;
}

.toolbar-center {
  flex: 1 1 auto;
  justify-content: center;
  gap: 12px;
}

.toolbar-right {
  flex: 0 0 auto;
}

/* === 左侧：总开关 === */
.global-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s ease;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.global-toggle:hover {
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: var(--primary-color);
}

.global-toggle .status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-color-light);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.global-toggle.active .status-dot {
  background: var(--el-color-success, #67c23a);
}

.global-toggle.has-active-monitor .status-dot {
  background: var(--el-color-success, #67c23a);
  animation: pulse-dot 2s infinite;
}

.global-toggle .brand-text {
  font-size: 13px;
  color: var(--text-color);
}

.global-toggle.active .brand-text {
  color: var(--text-color);
}

@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.6);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}

/* === 中间：模式切换 === */
.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  transition: all 0.2s ease;
  font-size: 13px;
  color: var(--text-color);
}

.mode-toggle:hover:not(.disabled) {
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: var(--primary-color);
}

.mode-toggle.active {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border-color: var(--el-color-success, #67c23a);
  color: var(--el-color-success, #67c23a);
}

.mode-toggle.is-transitioning {
  background: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border-color: var(--el-color-warning, #e6a23c);
  color: var(--el-color-warning, #e6a23c);
}

.mode-toggle.has-error {
  background: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  border-color: var(--el-color-danger, #f56c6c);
  color: var(--el-color-danger, #f56c6c);
}

.mode-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.mode-icon.spinning {
  animation: spin 1.2s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mode-label {
  font-weight: 500;
}

.mode-state {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.08);
  letter-spacing: 0.5px;
}

.mode-toggle.active .mode-state {
  background: var(--el-color-success, #67c23a);
  color: #ffffff;
}

.mode-toggle.is-transitioning .mode-state {
  background: var(--el-color-warning, #e6a23c);
  color: #ffffff;
}

.mode-toggle.has-error .mode-state {
  background: var(--el-color-danger, #f56c6c);
  color: #ffffff;
}

/* === 右侧：操作 === */
.search-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-wrapper.expanded {
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding-right: 8px;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 13px;
  width: 200px;
  height: 30px;
}

.search-input::placeholder {
  color: var(--text-color-light);
}

.filter-select {
  padding: 6px 10px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--text-color);
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  height: 32px;
}

.icon-button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-color);
  font-size: 14px;
  transition: all 0.2s ease;
  padding: 0;
}

.icon-button:hover:not(:disabled) {
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border-color: var(--primary-color);
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.settings-button:hover:not(:disabled) {
  color: var(--primary-color);
}
</style>
