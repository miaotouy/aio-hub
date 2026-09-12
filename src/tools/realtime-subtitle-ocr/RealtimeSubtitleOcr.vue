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
import { ElButtonGroup, ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useResizable } from "@/composables/useResizable";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useSendToChat } from "@/composables/useSendToChat";
import SubtitleTimeline from "./components/SubtitleTimeline.vue";
import LivePreview from "./components/LivePreview.vue";
import MonitorConfig from "./components/MonitorConfig.vue";
import ActiveSubtitleEditor from "./components/ActiveSubtitleEditor.vue";
import RegionFilterPreview from "./components/common/RegionFilterPreview.vue";
import VideoWorkbench from "./components/video/VideoWorkbench.vue";
import { blobToCaptureSource, type CaptureSource } from "./utils/frameCapture";
import { useVideoSubtitleOcr } from "./composables/useVideoSubtitleOcr";
import { useScreenMonitor } from "./composables/useScreenMonitor";

/** 监控框可分离组件 ID（与 registry.ts 中 detachableComponents 的 key 一致） */
const MONITOR_BOX_ID = "realtime-subtitle-ocr:monitor-box";
/** 监控框默认尺寸（逻辑像素） */
const MONITOR_BOX_DEFAULT_WIDTH = 360;
const MONITOR_BOX_DEFAULT_HEIGHT = 200;

const { detachByClick } = useDetachable();
const detachedManager = useDetachedManager();

// ===== 上方区域高度拖拽调整 =====
const topSectionHeight = ref(260);
const { isResizing: isDraggingHeight, startResize: handleHeightDragStart } =
  useResizable({
    size: topSectionHeight,
    minSize: 180,
    maxSize: 600,
    direction: "top",
  });

const {
  subtitles,
  status,
  isRunning,
  monitorRect,
  lastHash,
  lastFrameUrl,
  latency,
  filterLatency,
  isOcrPreparing,
  ensureOcrReady,
  start,
  stop,
  captureOnce,
  removeSubtitle,
  clearSubtitles,
  updateSubtitleText,
  exportPlainText,
  exportTextWithTime,
  downloadSrt,
} = useScreenMonitor();
const videoOcr = useVideoSubtitleOcr();
const ocrMode = ref<"screen" | "video">("screen");
const showScreenPreview = ref(false);

const { sendToChat } = useSendToChat();

const isMonitorBoxDetached = computed(() =>
  detachedManager.isDetached(MONITOR_BOX_ID)
);

const statusText = computed(() => {
  if (ocrMode.value === "video") {
    switch (videoOcr.status.value) {
      case "preparing":
      case "running":
        return videoOcr.progress.value.phase === "ocr" ? "识别中" : "抽帧中";
      case "cancelling":
        return "取消中";
      case "completed":
        return "已完成";
      case "cancelled":
        return "已取消";
      case "error":
        return "失败";
      default:
        return "空闲";
    }
  }
  if (isOcrPreparing.value) return "OCR 准备中";
  switch (status.value) {
    case "running":
      return "监控中";
    case "stopped":
      return "已停止";
    default:
      return "空闲";
  }
});
const selectedId = ref<string | null>(null);

const activeSubtitleIndex = computed(() => {
  if (!subtitles.value.length) return -1;
  if (!selectedId.value) return subtitles.value.length - 1;
  const idx = subtitles.value.findIndex((s) => s.id === selectedId.value);
  return idx !== -1 ? idx : subtitles.value.length - 1;
});

const activeSubtitle = computed(() => {
  const idx = activeSubtitleIndex.value;
  if (idx === -1) return null;
  return subtitles.value[idx];
});

function handleSelectSubtitle(id: string) {
  selectedId.value = id;
}

function switchMode(nextMode: "screen" | "video") {
  if (nextMode === ocrMode.value) return;
  if (isRunning.value) stop();
  if (
    nextMode === "screen" &&
    ["preparing", "running", "cancelling"].includes(videoOcr.status.value)
  ) {
    void videoOcr.cancel();
  }
  ocrMode.value = nextMode;
}

/** 屏幕模式：抓取监控框区域一次，供滤镜预览共用组件使用。 */
async function captureScreenSource(): Promise<CaptureSource | null> {
  const blob = await captureOnce();
  if (!blob) return null;
  return blobToCaptureSource(blob);
}

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

  // 检查是否有保存的窗口配置，如果有则完全依赖后端恢复，不进行手动定位
  try {
    const label = `detached-${MONITOR_BOX_ID}`;
    const savedLabels = await invoke<string[]>("get_saved_window_labels");
    if (savedLabels.includes(label)) {
      return;
    }

    // 首次创建时定位到主窗口右侧
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
    await invoke("set_window_position", { label, x, y, center: false });
  } catch {
    // ignore：定位失败不影响功能
  }
}

async function closeMonitorBox() {
  await detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
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

function onCopyAll(withTime = false) {
  const text = withTime ? exportTextWithTime() : exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可复制");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() =>
      customMessage.success(
        withTime ? "已复制全部字幕(带时间)" : "已复制全部字幕"
      )
    )
    .catch(() => customMessage.error("复制失败"));
}

function onSendToChat(withTime = false) {
  const text = withTime ? exportTextWithTime() : exportPlainText();
  if (!text) {
    customMessage.warning("暂无字幕可发送");
    return;
  }
  sendToChat(text, {
    successMessage: withTime
      ? "已发送带时间字幕到聊天输入框"
      : "已发送纯文本字幕到聊天输入框",
  });
}

function onExportSrt() {
  if (!subtitles.value.length) {
    customMessage.warning("暂无字幕可导出");
    return;
  }
  downloadSrt(`subtitles-${Date.now()}.srt`);
  customMessage.success("SRT 已导出");
}

async function clearAll() {
  try {
    await ElMessageBox.confirm(
      "确定要清空所有字幕吗？此操作不可撤销。",
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    clearSubtitles();
    selectedId.value = null;
    customMessage.success("已清空所有字幕");
  } catch {
    // 取消
  }
}

onMounted(() => {
  // 监控框几何信息由 useScreenMonitor 通过窗口同步总线接收。
  // 同时后台执行当前 OCR 引擎的健康检查/预热，确保用户直接开始识别时
  // 不会把首次运行时握手和模型检查堆积到实时帧队列中。
  void ensureOcrReady().catch(() => {
    // 启动按钮会再次检查并展示明确错误，这里仅做静默预热。
  });
});

onBeforeUnmount(() => {
  if (isRunning.value) stop();
  // 关闭监控框（统一分离窗口关闭流程，触发 window-attached 回主窗口）
  detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
});
</script>

<template>
  <div class="rsocr-wrapper">
    <!-- 顶部工具栏 -->
    <div class="rsocr-toolbar">
      <div class="toolbar-left">
        <el-button-group size="small">
          <el-button
            data-testid="rsocr-mode-screen"
            :type="ocrMode === 'screen' ? 'primary' : 'default'"
            @click="switchMode('screen')"
            >屏幕实时 OCR</el-button
          >
          <el-button
            data-testid="rsocr-mode-video"
            :type="ocrMode === 'video' ? 'primary' : 'default'"
            @click="switchMode('video')"
            >本地视频 OCR</el-button
          >
        </el-button-group>
        <span
          class="status-badge"
          :class="ocrMode === 'video' ? videoOcr.status : status"
        >
          {{ statusText }}
        </span>
      </div>
      <div class="toolbar-right">
        <el-button
          v-if="ocrMode === 'screen'"
          size="small"
          :type="showScreenPreview ? 'primary' : 'default'"
          @click="showScreenPreview = !showScreenPreview"
          >区域滤镜预览</el-button
        >
        <MonitorConfig v-if="ocrMode === 'screen'" />
      </div>
    </div>

    <!-- 视频模式：独立全幅工作台 -->
    <VideoWorkbench
      v-if="ocrMode === 'video'"
      class="rsocr-video-workbench"
    />

    <!-- 屏幕模式：保留原有上下分栏布局 -->
    <div v-else class="rsocr-main">
      <!-- 上方：左右分栏 (7:3 比例) -->
      <div
        class="rsocr-top-section"
        :style="{ height: topSectionHeight + 'px' }"
      >
        <!-- 左上：实时截图预览 + 区域滤镜预览 -->
        <div class="preview-panel preview-panel--screen">
          <LivePreview
            :last-frame-url="lastFrameUrl"
            :last-hash="lastHash"
            :latency="latency"
            :filter-latency="filterLatency"
            :is-running="isRunning"
            :is-ocr-preparing="isOcrPreparing"
            :is-monitor-box-detached="isMonitorBoxDetached"
            :monitor-rect="monitorRect"
            @open-monitor-box="openMonitorBox"
            @close-monitor-box="closeMonitorBox"
            @focus-monitor-box="focusMonitorBox"
            @toggle-monitor="toggleMonitor"
          />
          <RegionFilterPreview
            v-if="showScreenPreview"
            class="preview-panel__filter"
            :capture="captureScreenSource"
            hint="打开监控框后点击「截图预览」，实时查看区域滤镜效果"
          />
        </div>

        <!-- 右上：当前字幕大字编辑框 (30% 宽度) -->
        <ActiveSubtitleEditor
          class="editor-panel"
          :active-subtitle="activeSubtitle"
          :active-subtitle-index="activeSubtitleIndex"
          @update-text="updateSubtitleText"
        />
      </div>

      <!-- 拖拽条 -->
      <div
        class="resize-trigger-y"
        :class="{ 'is-resizing': isDraggingHeight }"
        @mousedown="handleHeightDragStart"
      >
        <div class="resize-handle-line"></div>
      </div>

      <!-- 下方：字幕时间轴列表 -->
      <div class="rsocr-bottom-section">
        <SubtitleTimeline
          :subtitles="subtitles"
          @remove="removeSubtitle"
          @update-text="updateSubtitleText"
          @export-srt="onExportSrt"
          @copy-all="onCopyAll"
          @send-to-chat="onSendToChat"
          @select="handleSelectSubtitle"
          @clear-all="clearAll"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rsocr-wrapper {
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  border-radius: 8px;
  flex-direction: column;
  background: var(--container-bg);
}

.rsocr-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  background: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
}

.status-badge.running {
  background: rgba(var(--el-color-success-rgb), 0.15);
  color: var(--el-color-success);
}

.status-badge.stopped {
  background: rgba(var(--el-color-danger-rgb), 0.15);
  color: var(--el-color-danger);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.rsocr-video-workbench {
  flex: 1;
  min-height: 0;
}

.rsocr-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  gap: 12px;
}

.rsocr-top-section {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  min-height: 180px;
}

.preview-panel {
  flex: 7;
  min-height: 0;
  min-width: 320px;
  height: 100%;
}

.preview-panel--screen {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-panel--screen > :first-child {
  flex: 1;
  min-height: 0;
}

.preview-panel__filter {
  flex-shrink: 0;
}

.editor-panel {
  flex: 3;
  min-width: 200px;
  height: 100%;
}

.resize-trigger-y {
  height: 8px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
  margin: -4px 0;
  z-index: 10;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resize-handle-line {
  width: 36px;
  height: 3px;
  border-radius: 1.5px;
  background: rgba(128, 128, 128, 0.4);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition:
    background 0.2s,
    width 0.2s;
}

.resize-trigger-y:hover,
.resize-trigger-y.is-resizing {
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.resize-trigger-y:hover .resize-handle-line,
.resize-trigger-y.is-resizing .resize-handle-line {
  background: var(--el-color-primary);
  width: 48px;
}

.rsocr-bottom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
