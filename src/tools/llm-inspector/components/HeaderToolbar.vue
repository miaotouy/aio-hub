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
        <Webhook class="mode-icon" :size="14" />
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
        <LoaderCircle
          v-if="externalTransitioning"
          class="mode-icon spinning"
          :size="14"
        />
        <Globe v-else class="mode-icon" :size="14" />
        <span class="mode-label">外部代理</span>
        <span class="mode-state">{{ externalStateLabel }}</span>
      </div>

      <!-- 监听地址展示（仅在运行时） -->
      <div v-if="externalRunning && listenUrl" class="listen-address">
        <span class="listen-address-label">监听</span>
        <span class="listen-address-value">{{ listenUrl }}</span>
        <button
          class="copy-button"
          @click="handleCopyListenUrl"
          :title="'复制监听地址'"
        >
          <Copy v-if="!copied" :size="13" />
          <Check v-else :size="13" class="copy-check" />
        </button>
      </div>
    </div>

    <!-- 右侧：操作 -->
    <div class="toolbar-section toolbar-right">
      <button
        class="icon-button"
        :disabled="records.length === 0"
        @click="$emit('clear-records')"
        title="清空所有记录"
      >
        <Trash2 :size="16" />
      </button>

      <button
        class="icon-button settings-button"
        @click="$emit('open-settings')"
        title="设置"
      >
        <Settings :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useClipboard } from "@vueuse/core";
import {
  Webhook,
  Globe,
  LoaderCircle,
  Trash2,
  Settings,
  Copy,
  Check,
} from "lucide-vue-next";
import type { CombinedRecord } from "../types";
import type { InspectorState } from "../types/hooks";

interface Props {
  state: InspectorState;
  records: CombinedRecord[];
  canStartInspector: boolean;
  isLoading: boolean;
  listenUrl: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "toggle-global": [];
  "toggle-internal": [];
  "toggle-external": [];
  "clear-records": [];
  "open-settings": [];
}>();

const { copy, copied } = useClipboard();

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

function handleCopyListenUrl() {
  copy(props.listenUrl);
}
</script>

<style scoped>
.header-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  border-radius: 8px;
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

/* === 监听地址展示 === */
.listen-address {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border: var(--border-width) solid rgba(var(--el-color-success-rgb), 0.3);
  font-size: 12px;
  color: var(--el-color-success, #67c23a);
  white-space: nowrap;
}

.listen-address-label {
  font-weight: 500;
  opacity: 0.7;
}

.listen-address-value {
  font-family: var(--font-mono, "SF Mono", "Fira Code", monospace);
  font-size: 12px;
  font-weight: 600;
}

.copy-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--el-color-success, #67c23a);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: background 0.2s;
  flex-shrink: 0;
}

.copy-button:hover {
  background: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.2)
  );
}

.copy-button:active {
  transform: scale(0.9);
}

.copy-check {
  color: var(--el-color-success, #67c23a);
}
</style>
