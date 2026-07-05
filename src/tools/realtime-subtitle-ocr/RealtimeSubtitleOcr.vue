<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { customMessage } from "@/utils/customMessage";
import { useResizable } from "@/composables/useResizable";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import SidebarToggleIcon from "@/components/icons/SidebarToggleIcon.vue";
import SubtitleTimeline from "./components/SubtitleTimeline.vue";
import MonitorConfig from "./components/MonitorConfig.vue";
import { useScreenMonitor } from "./composables/useScreenMonitor";
import type { DedupSensitivity, MonitorRect } from "./types";

/** 监控框可分离组件 ID（与 registry.ts 中 detachableComponents 的 key 一致） */
const MONITOR_BOX_ID = "realtime-subtitle-ocr:monitor-box";
/** 监控框默认尺寸（逻辑像素） */
const MONITOR_BOX_DEFAULT_WIDTH = 360;
const MONITOR_BOX_DEFAULT_HEIGHT = 200;

// ===== 侧栏拖拽调整宽度 =====
const leftPanelWidth = ref(560);
const rightPanelWidth = ref(360);
const isLeftPanelCollapsed = ref(false);
const isRightPanelCollapsed = ref(false);

const { isResizing: isDraggingLeft, startResize: handleLeftDragStart } =
  useResizable({
    size: leftPanelWidth,
    minSize: 360,
    maxSize: 900,
    direction: "left",
  });
const { isResizing: isDraggingRight, startResize: handleRightDragStart } =
  useResizable({
    size: rightPanelWidth,
    minSize: 280,
    maxSize: 600,
    direction: "right",
  });

const { detachByClick } = useDetachable();
const detachedManager = useDetachedManager();

const {
  subtitles,
  status,
  isRunning,
  monitorRect,
  config,
  start,
  stop,
  setEngineConfig,
  setIntervalMs,
  setDedupSensitivity,
  removeSubtitle,
  updateSubtitleText,
  exportPlainText,
  downloadSrt,
} = useScreenMonitor();

const isMonitorBoxDetached = computed(() =>
  detachedManager.isDetached(MONITOR_BOX_ID)
);

/** 查找监控框分离窗口的 label */
function findMonitorBoxLabel(): string | undefined {
  for (const win of detachedManager.detachedWindows.value.values()) {
    if (win.id === MONITOR_BOX_ID) return win.label;
  }
  return undefined;
}

// ===== 监控框控制 =====
async function openMonitorBox() {
  if (isMonitorBoxDetached.value) {
    // 已分离则聚焦
    const label = findMonitorBoxLabel();
    if (label) await detachedManager.focusWindow(label);
    return;
  }

  // 通过统一分离体系创建监控框（type: "component" → 透明+置顶+无边框+可缩放）
  const success = await detachByClick({
    id: MONITOR_BOX_ID,
    displayName: "屏幕监控框",
    type: "component",
    width: MONITOR_BOX_DEFAULT_WIDTH,
    height: MONITOR_BOX_DEFAULT_HEIGHT,
  });

  if (!success) {
    customMessage.error("打开监控框失败");
    return;
  }

  // detachByClick 默认位置由后端窗口配置恢复决定；首次创建时定位到主窗口右侧
  try {
    const win = getCurrentWindow();
    const [pos, size, scaleFactor] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    const mainX = pos.x / scaleFactor;
    const mainY = pos.y / scaleFactor;
    const mainW = size.width / scaleFactor;
    let x = Math.round(mainX + mainW + 16);
    let y = Math.round(mainY + 80);
    if (x + MONITOR_BOX_DEFAULT_WIDTH > mainX + mainW + 400) {
      x = Math.round(mainX + 40);
      y = Math.round(mainY + 120);
    }
    const label = `detached-${MONITOR_BOX_ID}`;
    await invoke("set_window_position", { label, x, y, center: false });
  } catch {
    // ignore：定位失败不影响功能
  }
}

async function focusMonitorBox() {
  const label = findMonitorBoxLabel();
  if (label) {
    await detachedManager.focusWindow(label);
  } else {
    await openMonitorBox();
  }
}

async function toggleMonitor() {
  if (isRunning.value) {
    stop();
    customMessage.info("已停止监控");
  } else {
    await start();
    if (status.value === "running") customMessage.success("已开始监控");
  }
}

function onCopyAll() {
  const text = exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可复制");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => customMessage.success("已复制全部字幕"))
    .catch(() => customMessage.error("复制失败"));
}

function onExportSrt() {
  if (!subtitles.value.length) {
    customMessage.warning("暂无字幕可导出");
    return;
  }
  downloadSrt(`subtitles-${Date.now()}.srt`);
  customMessage.success("SRT 已导出");
}

onMounted(() => {
  // 监控框几何信息由 useScreenMonitor 通过窗口同步总线接收
});

onBeforeUnmount(() => {
  if (isRunning.value) stop();
  // 关闭监控框（统一分离窗口关闭流程，触发 window-attached 回主窗口）
  detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
});
</script>

<template>
  <div class="rsocr-wrapper">
    <div class="rsocr-container">
      <!-- 左栏：字幕时间轴 -->
      <div
        v-if="!isLeftPanelCollapsed"
        class="panel left-panel"
        :style="{ width: `${leftPanelWidth}px` }"
      >
        <div class="panel-content">
          <SubtitleTimeline
            :subtitles="subtitles"
            @remove="removeSubtitle"
            @update-text="updateSubtitleText"
            @export-srt="onExportSrt"
            @copy-all="onCopyAll"
          />
        </div>

        <div
          class="resize-handle right-handle"
          :class="{ dragging: isDraggingLeft }"
          @mousedown="handleLeftDragStart"
        ></div>

        <div
          class="collapse-button left-collapse"
          @click="isLeftPanelCollapsed = true"
        >
          <SidebarToggleIcon class="collapse-icon trapezoid" />
          <svg
            class="arrow-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 中栏：占位/说明 -->
      <div class="main-content">
        <div
          v-if="isLeftPanelCollapsed"
          class="expand-button left-expand"
          @click="isLeftPanelCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" />
          <svg
            class="arrow-icon expanded"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div class="rsocr-hint">
          <h2>实时字幕 OCR</h2>
          <ol>
            <li>点击右侧“打开监控框”，将悬浮框拖到屏幕字幕区域；</li>
            <li>调整采样频率、去重灵敏度与 OCR 引擎；</li>
            <li>点击“开始监控”，识别结果将实时追加到左侧时间轴；</li>
            <li>双击字幕可编辑，完成后可一键复制或导出 SRT。</li>
          </ol>
          <p class="rsocr-hint__note">
            提示：监控框中间完全透明，仅保留虚线边框与顶部控制栏；截图时会自动避开边框与控制栏。
          </p>
        </div>

        <div
          v-if="isRightPanelCollapsed"
          class="expand-button right-expand"
          @click="isRightPanelCollapsed = false"
        >
          <SidebarToggleIcon class="expand-icon trapezoid" flip />
          <svg
            class="arrow-icon expanded"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline
              points="15 18 9 12 15 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- 右栏：控制面板 -->
      <div
        v-if="!isRightPanelCollapsed"
        class="panel right-panel"
        :style="{ width: `${rightPanelWidth}px` }"
      >
        <div
          class="collapse-button right-collapse"
          @click="isRightPanelCollapsed = true"
        >
          <SidebarToggleIcon class="collapse-icon trapezoid" flip />
          <svg
            class="arrow-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline
              points="9 18 15 12 9 6"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div class="panel-content">
          <MonitorConfig
            :monitor-rect="monitorRect as MonitorRect | null"
            :is-running="isRunning"
            :interval-ms="config.intervalMs"
            :dedup-sensitivity="config.dedupSensitivity"
            :engine-config="config.engineConfig"
            @open-monitor-box="openMonitorBox"
            @focus-monitor-box="focusMonitorBox"
            @toggle-monitor="toggleMonitor"
            @update:interval-ms="(v: number) => setIntervalMs(v)"
            @update:dedup-sensitivity="
              (v: DedupSensitivity) => setDedupSensitivity(v)
            "
            @update:engine-config="setEngineConfig"
          />
        </div>

        <div
          class="resize-handle left-handle"
          :class="{ dragging: isDraggingRight }"
          @mousedown="handleRightDragStart"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rsocr-wrapper {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.rsocr-container {
  display: flex;
  height: 100%;
  width: 100%;
  position: relative;
  background: var(--container-bg);
}

.panel {
  position: relative;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.panel-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.rsocr-hint {
  max-width: 480px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}

.rsocr-hint h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.rsocr-hint ol {
  margin: 0 0 12px;
  padding-left: 20px;
}

.rsocr-hint__note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  transition: background-color 0.2s;
}

.resize-handle.right-handle {
  right: -2px;
}

.resize-handle.left-handle {
  left: -2px;
}

.resize-handle:hover,
.resize-handle.dragging {
  background-color: var(--el-color-primary);
}

.collapse-button {
  position: absolute;
  top: 12px;
  width: 18px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 11;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.collapse-button:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color);
}

.left-collapse {
  right: 6px;
}

.right-collapse {
  left: 6px;
}

.expand-button {
  position: absolute;
  top: 12px;
  width: 18px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 11;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.left-expand {
  left: 6px;
}

.right-expand {
  right: 6px;
}

.expand-button:hover {
  color: var(--el-color-primary);
  background: var(--el-fill-color);
}

.arrow-icon {
  width: 14px;
  height: 14px;
}
</style>

